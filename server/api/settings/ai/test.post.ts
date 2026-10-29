import { z } from 'zod'
import { requireUser } from '../../../utils/auth'
import { readValidatedJson } from '../../../utils/http'
import { audit } from '../../../utils/audit'
import { openRouterChat } from '../../../domains/ai/openrouter'
import { getAiConfig, resolveOpenRouterKey } from '../../../domains/settings/service'

const bodySchema = z.object({ model: z.string().min(3).max(120).optional() })

/**
 * Connectivity test: sends a fixed, PII-free prompt with a strict JSON schema
 * so the user can confirm the selected model honours structured outputs.
 */
export default defineEventHandler(async event => {
  const user = await requireUser(event)
  const body = await readValidatedJson(event, bodySchema)
  const { key, source } = await resolveOpenRouterKey()
  if (!key) throw createError({ statusCode: 412, statusMessage: 'No OpenRouter API key configured.' })
  const cfg = await getAiConfig()
  const model = body.model ?? cfg.defaultModel
  const started = Date.now()
  try {
    const res = await openRouterChat({
      apiKey: key,
      model,
      temperature: 0,
      maxTokens: 120,
      providerOrder: cfg.providerOrder,
      allowFallbacks: cfg.allowFallbacks,
      requireParameters: cfg.requireParameters,
      timeoutMs: 30_000,
      messages: [
        { role: 'system', content: 'You are a connectivity probe. Reply only with JSON matching the schema.' },
        { role: 'user', content: 'Return ok=true and a one-sentence greeting mentioning CreditOS.' },
      ],
      jsonSchema: { name: 'probe', schema: { type: 'object', additionalProperties: false, required: ['ok', 'message'], properties: { ok: { type: 'boolean' }, message: { type: 'string' } } } },
    })
    let parsed: { ok?: boolean; message?: string } = {}
    try {
      parsed = JSON.parse(res.content)
    } catch {
      /* non-JSON reply is reported below */
    }
    await audit({ userId: user.id, actor: 'user', action: 'settings.ai_test', meta: { model, ok: parsed.ok === true, ms: Date.now() - started }, event })
    return { ok: parsed.ok === true, structuredOutputHonoured: parsed.ok === true, message: parsed.message ?? res.content.slice(0, 300), model: res.model, keySource: source, latencyMs: Date.now() - started, usage: { promptTokens: res.promptTokens, completionTokens: res.completionTokens, estimatedCostUsd: res.estimatedCostUsd } }
  } catch (e) {
    throw createError({ statusCode: 502, statusMessage: e instanceof Error ? e.message : 'OpenRouter request failed' })
  }
})
