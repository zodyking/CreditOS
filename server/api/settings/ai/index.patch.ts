import { z } from 'zod'
import { AGENT_ROLES } from '#shared/constants'
import { requireUser } from '../../../utils/auth'
import { readValidatedJson } from '../../../utils/http'
import { audit } from '../../../utils/audit'
import { setAiConfig } from '../../../domains/settings/service'

const modelId = z.string().min(3).max(120).regex(/^[\w.:-]+\/[\w.:-]+$/, 'Model ids look like provider/model')

const bodySchema = z.object({
  defaultModel: modelId.optional(),
  roleModels: z.record(z.enum(AGENT_ROLES), modelId.or(z.literal(''))).optional(),
  temperature: z.number().min(0).max(1.5).optional(),
  maxTokensPerMessage: z.number().int().min(200).max(8000).optional(),
  maxCostUsdPerRun: z.number().min(0.01).max(50).optional(),
  piiMinimization: z.boolean().optional(),
  liveEnabled: z.boolean().optional(),
  providerOrder: z.array(z.string().min(1).max(60)).max(10).optional(),
  allowFallbacks: z.boolean().optional(),
  requireParameters: z.boolean().optional(),
})

export default defineEventHandler(async event => {
  const user = await requireUser(event)
  const body = await readValidatedJson(event, bodySchema)
  if (body.piiMinimization === false) {
    // PII minimisation is a hard safeguard; it cannot be disabled from the UI.
    throw createError({ statusCode: 422, statusMessage: 'PII minimisation cannot be disabled.' })
  }
  const roleModels = body.roleModels ? Object.fromEntries(Object.entries(body.roleModels).filter(([, v]) => v)) : undefined
  const next = await setAiConfig({ ...body, ...(roleModels ? { roleModels } : {}) })
  await audit({ userId: user.id, actor: 'user', action: 'settings.ai_update', meta: { keys: Object.keys(body) }, event })
  return { ai: next }
})
