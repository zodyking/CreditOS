import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { OUTBOUND_STATUSES } from '#shared/state-machines'
import { getDb, schema } from '../../../../db'
import { requireUser } from '../../../../utils/auth'
import { readValidatedJson, requireParam } from '../../../../utils/http'
import { audit } from '../../../../utils/audit'
import { randomToken } from '../../../../utils/crypto'
import { signSandboxPayload } from '../../../../domains/correspondence/outbound/sandbox'
import { applyProviderEvents } from '../../../../domains/correspondence/mail'
import { getOutboundProvider } from '../../../../domains/correspondence/outbound'

const bodySchema = z.object({
  status: z.enum(OUTBOUND_STATUSES),
  trackingNumber: z.string().max(60).optional(),
  /** Replay the exact same event id to demonstrate idempotency. */
  eventId: z.string().max(80).optional(),
})

/**
 * Sandbox-only: post a signed simulated provider webhook for one of the
 * user's own sandbox orders. Refuses for any live-provider order.
 */
export default defineEventHandler(async event => {
  const user = await requireUser(event)
  const id = requireParam(event, 'id')
  const body = await readValidatedJson(event, bodySchema)
  const db = getDb()
  const order = await db.query.mailOrders.findFirst({ where: and(eq(schema.mailOrders.id, id), eq(schema.mailOrders.userId, user.id)) })
  if (!order) throw createError({ statusCode: 404, statusMessage: 'Mail order not found' })
  if (order.provider !== 'sandbox' || order.mode === 'live') throw createError({ statusCode: 403, statusMessage: 'Simulated events are only allowed for sandbox orders.' })
  if (!order.providerOrderId) throw createError({ statusCode: 409, statusMessage: 'Order has not been dispatched yet.' })

  const payload = { id: body.eventId ?? `sim_${randomToken(8)}`, orderId: order.providerOrderId, status: body.status, occurredAt: new Date().toISOString(), trackingNumber: body.trackingNumber }
  const raw = JSON.stringify(payload)
  const signature = signSandboxPayload(raw)
  const provider = getOutboundProvider('sandbox')
  const verified = await provider.verifyWebhook(raw, { 'x-creditos-signature': signature })
  if (!verified.valid) throw createError({ statusCode: 500, statusMessage: verified.error ?? 'Sandbox signature verification failed' })
  const result = await applyProviderEvents('sandbox', verified.events, true)
  await audit({ userId: user.id, actor: 'user', action: 'mail.simulate_event', targetType: 'mail_order', targetId: id, meta: { status: body.status, eventId: payload.id, ...result }, event })
  return { eventId: payload.id, ...result }
})
