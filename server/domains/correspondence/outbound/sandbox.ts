import { hmacSha256Hex, safeEqualHex, sha256Hex } from '../../../utils/crypto'
import { env } from '../../../utils/env'
import { isAddressComplete } from '../recipients'
import type { CostEstimate, CreateOrderInput, CreateOrderResult, OutboundMailProvider, StatusResult, WebhookEvent } from './types'

/**
 * Sandbox provider. Accepts orders, never prints or mails anything, and never
 * reports delivery unless a signed simulated webhook is posted. Clearly
 * labelled mode=sandbox everywhere.
 */
const orders = new Map<string, { createdAt: number; status: StatusResult['status'] }>()

export const SANDBOX_WEBHOOK_SECRET_FALLBACK = 'creditos-sandbox-webhook-secret'

export function sandboxSecret(): string {
  return env.mailWebhookSecret ?? SANDBOX_WEBHOOK_SECRET_FALLBACK
}

export function signSandboxPayload(rawBody: string): string {
  return hmacSha256Hex(sandboxSecret(), rawBody)
}

export const sandboxProvider: OutboundMailProvider = {
  slug: 'sandbox',
  label: 'Sandbox (no physical mail)',
  mode: 'sandbox',
  capabilities: { certifiedMail: false, returnReceipt: false, tracking: false, deliveryConfirmation: false, addressValidation: true, webhooks: true, colorPrinting: false },
  implemented: { createOrder: true, getStatus: true, webhooks: true, validateAddress: true, estimateCost: true },
  configured: true,
  configurationHelp: 'No configuration required. Nothing is printed or mailed.',

  async validateAddress(address) {
    const valid = isAddressComplete(address)
    return { valid, normalized: valid ? { ...address, state: address.state.toUpperCase() } : undefined, messages: valid ? [] : ['Address is incomplete: name, street, city, state and 5-digit ZIP are required.'] }
  },

  async estimateCost({ pageCount, mailClass, options }) {
    const base = mailClass === 'certified' ? 999 : 149
    const pages = Math.max(0, pageCount - 1) * 15
    const color = options.color ? 40 : 0
    const breakdown = [
      { label: `Sandbox ${mailClass.replace('_', ' ')} letter`, cents: base },
      { label: `${pageCount} page(s)`, cents: pages },
      ...(color ? [{ label: 'Color printing', cents: color }] : []),
    ]
    const est: CostEstimate = { cents: base + pages + color, currency: 'USD', breakdown, isEstimate: true }
    return est
  },

  async createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
    // Idempotent: the same key always yields the same provider order id.
    const providerOrderId = `sbx_${sha256Hex(input.idempotencyKey).slice(0, 16)}`
    if (!orders.has(providerOrderId)) orders.set(providerOrderId, { createdAt: Date.now(), status: 'PROVIDER_ACCEPTED' })
    return {
      providerOrderId,
      status: 'PROVIDER_ACCEPTED',
      costCents: (await this.estimateCost({ ...input, pageCount: 2 })).cents,
      raw: { sandbox: true, note: 'No physical mail is produced in sandbox mode.' },
    }
  },

  async getStatus(providerOrderId) {
    const o = orders.get(providerOrderId)
    return { status: o?.status ?? 'TRACKING_UNKNOWN', raw: { sandbox: true } }
  },

  async verifyWebhook(rawBody, headers) {
    const sig = headers['x-creditos-signature'] ?? headers['x-sandbox-signature']
    if (!sig) return { valid: false, events: [], error: 'Missing signature header' }
    const expected = signSandboxPayload(rawBody)
    if (!safeEqualHex(sig, expected)) return { valid: false, events: [], error: 'Invalid signature' }
    let parsed: { id?: string; orderId?: string; status?: string; occurredAt?: string; trackingNumber?: string }
    try {
      parsed = JSON.parse(rawBody)
    } catch {
      return { valid: false, events: [], error: 'Malformed JSON' }
    }
    if (!parsed.id || !parsed.orderId || !parsed.status) return { valid: false, events: [], error: 'Missing id/orderId/status' }
    const status = parsed.status as WebhookEvent['status']
    const o = orders.get(parsed.orderId)
    if (o) o.status = status
    return {
      valid: true,
      events: [{ externalEventId: parsed.id, providerOrderId: parsed.orderId, status, occurredAt: parsed.occurredAt ? new Date(parsed.occurredAt) : new Date(), trackingNumber: parsed.trackingNumber, raw: parsed as Record<string, unknown> }],
    }
  },
}
