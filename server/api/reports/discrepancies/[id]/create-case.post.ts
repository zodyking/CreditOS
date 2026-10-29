import { requireUser } from '../../../../utils/auth'
import { requireParam } from '../../../../utils/http'
import { createCaseFromDiscrepancy } from '../../../../domains/cases/service'
import { enqueueJob } from '../../../../domains/jobs/queue'

export default defineEventHandler(async event => {
  const user = await requireUser(event)
  const id = requireParam(event, 'id')
  const c = await createCaseFromDiscrepancy(user.id, id, 'user')
  if (c.status === 'AGENT_REVIEW') await enqueueJob('council.run', { caseId: c.id, trigger: 'initial', actor: 'user' }, { idempotencyKey: `council:initial:${c.id}` })
  return { case: c }
})
