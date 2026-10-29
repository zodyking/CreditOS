import { z } from 'zod'
import { requireUser } from '../../../utils/auth'
import { readValidatedJson } from '../../../utils/http'
import { audit } from '../../../utils/audit'
import { env } from '../../../utils/env'
import { maskTail } from '../../../utils/crypto'
import { verifyOpenRouterKey } from '../../../domains/ai/openrouter'
import { resolveOpenRouterKey, setSecret } from '../../../domains/settings/service'

const bodySchema = z.object({
  /** Null/empty removes the stored key. */
  apiKey: z.string().max(400).nullable(),
  verify: z.boolean().default(true),
})

/** Store (encrypted, AES-256-GCM) or remove the OpenRouter API key. The key is never returned. */
export default defineEventHandler(async event => {
  const user = await requireUser(event)
  const body = await readValidatedJson(event, bodySchema)
  const key = body.apiKey?.trim() || null
  if (key && !env.encryptionKey) {
    throw createError({ statusCode: 412, statusMessage: 'APP_ENCRYPTION_KEY is not set, so secrets cannot be stored. Set it in your deployment environment first (or use OPENROUTER_API_KEY as an env var).' })
  }
  let verification: Awaited<ReturnType<typeof verifyOpenRouterKey>> | null = null
  if (key && body.verify) {
    verification = await verifyOpenRouterKey(key)
    if (!verification.ok) throw createError({ statusCode: 422, statusMessage: `OpenRouter rejected the key: ${verification.error ?? 'unknown error'}` })
  }
  await setSecret('openrouter_api_key', key)
  await audit({ userId: user.id, actor: 'user', action: key ? 'settings.ai_key_set' : 'settings.ai_key_removed', meta: { verified: !!verification?.ok }, event })
  const resolved = await resolveOpenRouterKey()
  return { keyConfigured: !!resolved.key, keySource: resolved.source, keyMasked: resolved.key ? maskTail(resolved.key, 4) : null, verification }
})
