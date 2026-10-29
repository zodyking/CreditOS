import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { signHs256Jwt, verifyHs256Jwt } from '../server/domains/correspondence/outbound/postgrid'
import { sandboxProvider, signSandboxPayload } from '../server/domains/correspondence/outbound/sandbox'

describe('sandbox webhook verification', () => {
  const payload = JSON.stringify({ id: 'evt_1', orderId: 'sbx_abc', status: 'DELIVERED', occurredAt: '2026-03-01T12:00:00Z' })

  it('rejects a missing signature', async () => {
    const res = await sandboxProvider.verifyWebhook!(payload, {})
    expect(res.valid).toBe(false)
    expect(res.events).toHaveLength(0)
    expect(res.error).toMatch(/Missing signature/)
  })

  it('rejects an invalid signature (including wrong length)', async () => {
    const bad = await sandboxProvider.verifyWebhook!(payload, { 'x-creditos-signature': 'deadbeef' })
    expect(bad.valid).toBe(false)
    const wrong = signSandboxPayload(payload + ' ')
    const tampered = await sandboxProvider.verifyWebhook!(payload, { 'x-creditos-signature': wrong })
    expect(tampered.valid).toBe(false)
    expect(tampered.error).toMatch(/Invalid signature/)
  })

  it('accepts a correctly signed payload and yields one event with a stable external id', async () => {
    const res = await sandboxProvider.verifyWebhook!(payload, { 'x-creditos-signature': signSandboxPayload(payload) })
    expect(res.valid).toBe(true)
    expect(res.events).toHaveLength(1)
    const ev = res.events[0]!
    expect(ev.externalEventId).toBe('evt_1')
    expect(ev.providerOrderId).toBe('sbx_abc')
    expect(ev.status).toBe('DELIVERED')
    expect(ev.occurredAt.toISOString()).toBe('2026-03-01T12:00:00.000Z')
  })

  it('rejects signed but malformed or incomplete payloads', async () => {
    const notJson = 'not json'
    const r1 = await sandboxProvider.verifyWebhook!(notJson, { 'x-creditos-signature': signSandboxPayload(notJson) })
    expect(r1.valid).toBe(false)
    expect(r1.error).toMatch(/Malformed JSON/)
    const incomplete = JSON.stringify({ id: 'evt_2' })
    const r2 = await sandboxProvider.verifyWebhook!(incomplete, { 'x-creditos-signature': signSandboxPayload(incomplete) })
    expect(r2.valid).toBe(false)
  })

  it('creates idempotent orders: same key -> same provider order id', async () => {
    const input = {
      idempotencyKey: 'order-123',
      to: { name: 'Equifax', line1: 'PO Box 740256', city: 'Atlanta', state: 'GA', postalCode: '30374', country: 'US' },
      from: { name: 'Demo User', line1: '1 Main St', city: 'Austin', state: 'TX', postalCode: '78701', country: 'US' },
      pdf: new Uint8Array([1, 2, 3]),
      pageCount: 2,
      mailClass: 'first_class' as const,
      options: { color: false, doubleSided: true },
      metadata: {},
    }
    const a = await sandboxProvider.createOrder(input as never)
    const b = await sandboxProvider.createOrder(input as never)
    expect(a.providerOrderId).toBe(b.providerOrderId)
    expect(a.providerOrderId).toMatch(/^sbx_[0-9a-f]{16}$/)
    const c = await sandboxProvider.createOrder({ ...input, idempotencyKey: 'order-124' } as never)
    expect(c.providerOrderId).not.toBe(a.providerOrderId)
  })
})

describe('PostGrid HS256 webhook JWT', () => {
  const secret = 'whsec_test'

  it('round-trips a signed payload', () => {
    const token = signHs256Jwt({ id: 'evt_pg_1', type: 'letter.updated', data: { id: 'letter_1', status: 'completed' } }, secret)
    const claims = verifyHs256Jwt(token, secret)
    expect(claims).not.toBeNull()
    expect(claims?.id).toBe('evt_pg_1')
  })

  it('rejects a wrong secret, tampered payload, or malformed token', () => {
    const token = signHs256Jwt({ id: 'evt_pg_2' }, secret)
    expect(verifyHs256Jwt(token, 'other')).toBeNull()
    const [h, , s] = token.split('.')
    const forged = `${h}.${Buffer.from(JSON.stringify({ id: 'evt_forged' })).toString('base64url')}.${s}`
    expect(verifyHs256Jwt(forged, secret)).toBeNull()
    expect(verifyHs256Jwt('a.b', secret)).toBeNull()
  })

  it('rejects tokens that are not HS256', () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url')
    const body = Buffer.from(JSON.stringify({ id: 'x' })).toString('base64url')
    const sig = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url')
    expect(verifyHs256Jwt(`${header}.${body}.${sig}`, secret)).toBeNull()
  })
})
