import { z } from 'zod'
import { BUREAUS, ISSUE_CATEGORIES } from '#shared/constants'
import { requireUser } from '../../utils/auth'
import { readValidatedJson } from '../../utils/http'
import { env } from '../../utils/env'
import { createManualCase } from '../../domains/cases/service'
import { enqueueJob } from '../../domains/jobs/queue'

const bodySchema = z.object({
  title: z.string().min(3).max(200),
  category: z.enum(ISSUE_CATEGORIES),
  summary: z.string().min(10).max(4000),
  bureaus: z.array(z.enum(BUREAUS)).min(1),
  creditorName: z.string().max(200).optional(),
  statement: z.string().max(4000).optional(),
})

export default defineEventHandler(async event => {
  const user = await requireUser(event)
  const body = await readValidatedJson(event, bodySchema)
  const c = await createManualCase(user.id, { ...body, mode: env.appMode === 'demo' ? 'demo' : 'live' })
  if (c.status === 'AGENT_REVIEW') await enqueueJob('council.run', { caseId: c.id, trigger: 'initial', actor: 'user' }, { idempotencyKey: `council:initial:${c.id}` })
  return { case: c }
})
