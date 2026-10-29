import { getOutboundProvider, listOutboundProviders } from '../../../domains/correspondence/outbound'
import { applyProviderEvents } from '../../../domains/correspondence/mail'
import { audit } from '../../../utils/audit'
import { requireParam } from '../../../utils/http'

/**
 * Provider webhook receiver. Unauthenticated by design (providers call it),
 * so every payload must carry a valid provider signature. Invalid signatures
 * are recorded and rejected; valid events are applied idempotently.
 */
export default defineEventHandler(async event => {
  const slug = requireParam(event, 'provider')
  const provider = listOutboundProviders().find(p => p.slug === slug)
  if (!provider || !provider.implemented.webhooks) throw createError({ statusCode: 404, statusMessage: 'Unknown webhook provider' })
  if (getOutboundProvider().slug !== slug && slug !== 'sandbox') {
    throw createError({ statusCode: 409, statusMessage: `${provider.label} is not the active outbound provider` })
  }
  const raw = (await readRawBody(event, 'utf8')) ?? ''
  if (raw.length > 512 * 1024) throw createError({ statusCode: 413, statusMessage: 'Payload too large' })
  const headers: Record<string, string | undefined> = {}
  for (const [k, v] of Object.entries(getRequestHeaders(event))) headers[k.toLowerCase()] = Array.isArray(v) ? v[0] : v

  const verified = await provider.verifyWebhook(raw, headers)
  if (!verified.valid) {
    await audit({ actor: `provider:${slug}`, action: 'webhook.rejected', meta: { error: verified.error }, event })
    throw createError({ statusCode: 401, statusMessage: verified.error ?? 'Invalid signature' })
  }
  const result = await applyProviderEvents(slug, verified.events, true)
  await audit({ actor: `provider:${slug}`, action: 'webhook.received', meta: { events: verified.events.length, ...result }, event })
  return { ok: true, ...result }
})
