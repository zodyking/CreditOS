import { createHmac, timingSafeEqual } from 'node:crypto'
import type { OutboundStatus } from '#shared/state-machines'
import { env } from '../../../utils/env'
import { isAddressComplete } from '../recipients'
import type { CostEstimate, CreateOrderInput, CreateOrderResult, OutboundMailProvider, StatusResult, WebhookEvent } from './types'

/**
 * PostGrid Print & Mail adapter (https://docs.postgrid.com/).
 *
 * Implemented against the publicly documented v1 Letters API:
 *   POST  https://api.postgrid.com/print-mail/v1/letters      (multipart; x-api-key)
 *   GET   https://api.postgrid.com/print-mail/v1/letters/{id}
 *   Webhooks: JSON body with a `payload` JWT (HS256) signed with the webhook secret.
 *
 * Test keys (`test_sk_…`) never print or mail. Live keys require a PostGrid
 * account and a signed agreement; CreditOS forces sandbox behaviour unless
 * APP_MODE=live. This adapter has NOT been exercised against a live account
 * inside this repository — see INTEGRATIONS.md.
 */
const BASE = 'https://api.postgrid.com/print-mail/v1'

const STATUS_MAP: Record<string, OutboundStatus> = {
  ready: 'PROVIDER_ACCEPTED',
  printing: 'PRINTED',
  processed_for_delivery: 'MAILED',
  completed: 'MAILED',
  cancelled: 'CANCELLED',
  failed: 'FAILED',
  returned_to_sender: 'RETURNED',
}

function apiKey(): string | undefined {
  return env.postgridApiKey
}

function toContact(a: CreateOrderInput['to']) {
  return {
    firstName: a.name,
    companyName: a.name,
    addressLine1: a.line1,
    addressLine2: a.line2 ?? '',
    city: a.city,
    provinceOrState: a.state,
    postalOrZip: a.postalCode,
    countryCode: a.country ?? 'US',
  }
}

export const postgridProvider: OutboundMailProvider = {
  slug: 'postgrid',
  label: 'PostGrid Print & Mail',
  get mode() {
    const k = apiKey()
    return k && k.startsWith('live_') && env.appMode === 'live' ? 'live' : 'sandbox'
  },
  capabilities: { certifiedMail: true, returnReceipt: true, tracking: true, deliveryConfirmation: true, addressValidation: true, webhooks: true, colorPrinting: true },
  implemented: { createOrder: true, getStatus: true, webhooks: true, validateAddress: false, estimateCost: false },
  get configured() {
    return !!apiKey()
  },
  configurationHelp: 'Set POSTGRID_API_KEY (test_sk_… for sandbox, live_sk_… for production) and MAIL_WEBHOOK_SECRET to the webhook signing secret from the PostGrid dashboard. Point the PostGrid webhook at /api/webhooks/mail/postgrid.',

  async validateAddress(address) {
    // PostGrid address verification is a separate product (Address Verification API); not implemented here.
    const valid = isAddressComplete(address)
    return { valid, messages: valid ? ['Local completeness check only; PostGrid address verification not enabled.'] : ['Address incomplete.'] }
  },

  async estimateCost({ pageCount, mailClass }) {
    // PostGrid does not expose a public quote endpoint for letters; this is a conservative local estimate.
    const base = mailClass === 'certified' ? 1099 : 199
    const est: CostEstimate = {
      cents: base + Math.max(0, pageCount - 1) * 20,
      currency: 'USD',
      breakdown: [{ label: 'Local estimate (PostGrid bills actuals)', cents: base + Math.max(0, pageCount - 1) * 20 }],
      isEstimate: true,
    }
    return est
  },

  async createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
    const key = apiKey()
    if (!key) throw new Error('PostGrid is not configured (POSTGRID_API_KEY missing)')
    const form = new FormData()
    form.set('to', JSON.stringify(toContact(input.to)))
    form.set('from', JSON.stringify(toContact(input.from)))
    form.set('description', input.description)
    form.set('addressPlacement', 'insert_blank_page')
    form.set('color', String(!!input.options.color))
    form.set('doubleSided', String(input.options.doubleSided ?? true))
    form.set('mailingClass', input.mailClass === 'standard' ? 'standard_class' : 'first_class')
    if (input.mailClass === 'certified') form.set('extraService', 'certified')
    form.set('pdf', new Blob([Buffer.from(input.pdf)], { type: 'application/pdf' }), 'letter.pdf')
    const res = await fetch(`${BASE}/letters`, {
      method: 'POST',
      headers: { 'x-api-key': key, 'Idempotency-Key': input.idempotencyKey },
      body: form,
      signal: AbortSignal.timeout(60_000),
    })
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok) throw new Error(`PostGrid createOrder failed: HTTP ${res.status} ${JSON.stringify(json).slice(0, 300)}`)
    return {
      providerOrderId: String(json.id),
      status: STATUS_MAP[String(json.status)] ?? 'PROVIDER_ACCEPTED',
      trackingNumber: typeof json.trackingNumber === 'string' ? json.trackingNumber : undefined,
      raw: json,
    }
  },

  async getStatus(providerOrderId): Promise<StatusResult> {
    const key = apiKey()
    if (!key) throw new Error('PostGrid is not configured')
    const res = await fetch(`${BASE}/letters/${encodeURIComponent(providerOrderId)}`, { headers: { 'x-api-key': key }, signal: AbortSignal.timeout(30_000) })
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok) throw new Error(`PostGrid getStatus failed: HTTP ${res.status}`)
    return {
      status: STATUS_MAP[String(json.status)] ?? 'TRACKING_UNKNOWN',
      trackingNumber: typeof json.trackingNumber === 'string' ? json.trackingNumber : undefined,
      raw: json,
    }
  },

  async verifyWebhook(rawBody) {
    const secret = env.mailWebhookSecret
    if (!secret) return { valid: false, events: [], error: 'MAIL_WEBHOOK_SECRET not configured' }
    let body: { payload?: string }
    try {
      body = JSON.parse(rawBody)
    } catch {
      return { valid: false, events: [], error: 'Malformed JSON' }
    }
    if (!body.payload) return { valid: false, events: [], error: 'Missing payload JWT' }
    const claims = verifyHs256Jwt(body.payload, secret)
    if (!claims) return { valid: false, events: [], error: 'JWT signature invalid' }
    const data = (claims.data ?? claims) as Record<string, unknown>
    const type = String(claims.type ?? '')
    const status = STATUS_MAP[String(data.status)] ?? (type.includes('completed') ? 'MAILED' : 'TRACKING_UNKNOWN')
    const evt: WebhookEvent = {
      externalEventId: String(claims.id ?? `${data.id}-${type}-${claims.iat ?? ''}`),
      providerOrderId: String(data.id),
      status,
      occurredAt: typeof claims.iat === 'number' ? new Date(claims.iat * 1000) : new Date(),
      trackingNumber: typeof data.trackingNumber === 'string' ? data.trackingNumber : undefined,
      raw: claims,
    }
    return { valid: true, events: [evt] }
  },
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

export function verifyHs256Jwt(token: string, secret: string): Record<string, unknown> | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [h, p, s] = parts as [string, string, string]
  const expected = b64url(createHmac('sha256', secret).update(`${h}.${p}`).digest())
  const a = Buffer.from(s)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    const header = JSON.parse(Buffer.from(h, 'base64').toString('utf8')) as { alg?: string }
    if (header.alg !== 'HS256') return null
    return JSON.parse(Buffer.from(p, 'base64').toString('utf8')) as Record<string, unknown>
  } catch {
    return null
  }
}

export function signHs256Jwt(payload: Record<string, unknown>, secret: string): string {
  const h = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const p = b64url(JSON.stringify(payload))
  const s = b64url(createHmac('sha256', secret).update(`${h}.${p}`).digest())
  return `${h}.${p}.${s}`
}
