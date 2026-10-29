import { requireUser } from '../../../utils/auth'
import { listOpenRouterModels } from '../../../domains/ai/openrouter'

/**
 * Model catalogue from OpenRouter (public endpoint, cached 10 min). Supports
 * `q` (search), `provider`, `structured=1` (only models with structured
 * output support — recommended for the council) and `refresh=1`.
 */
export default defineEventHandler(async event => {
  await requireUser(event)
  const q = getQuery(event)
  let models
  try {
    models = await listOpenRouterModels(q.refresh === '1')
  } catch (e) {
    throw createError({ statusCode: 502, statusMessage: e instanceof Error ? e.message : 'Could not reach OpenRouter' })
  }
  const search = q.q ? String(q.q).toLowerCase() : ''
  const provider = q.provider ? String(q.provider) : ''
  const structuredOnly = q.structured === '1'
  const filtered = models.filter(m => {
    if (provider && m.provider !== provider) return false
    if (structuredOnly && !m.supportsStructuredOutput) return false
    if (search && !`${m.id} ${m.name} ${m.description ?? ''}`.toLowerCase().includes(search)) return false
    return true
  })
  const providers = [...new Set(models.map(m => m.provider))].sort()
  return { models: filtered.slice(0, 400), total: filtered.length, providers, fetchedAt: new Date().toISOString() }
})
