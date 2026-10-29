import { z } from 'zod'
import { requireUser } from '../../../../utils/auth'
import { readValidatedJson, requireParam } from '../../../../utils/http'
import { assignInbound } from '../../../../domains/mailroom/service'
import { runOnce } from '../../../../domains/jobs/queue'

export default defineEventHandler(async event => {
  const user = await requireUser(event)
  const id = requireParam(event, 'id')
  const body = await readValidatedJson(event, z.object({ caseId: z.string().uuid() }))
  const mail = await assignInbound(user.id, id, body.caseId)
  await runOnce().catch(() => false)
  return { mail }
})
