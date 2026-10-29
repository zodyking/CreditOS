import { z } from 'zod'
import { requireUser } from '../../utils/auth'
import { readValidatedJson, requireParam } from '../../utils/http'
import { setMonitoringEventStatus } from '../../domains/monitoring/service'

export default defineEventHandler(async event => {
  const user = await requireUser(event)
  const id = requireParam(event, 'id')
  const body = await readValidatedJson(event, z.object({ status: z.enum(['reviewed', 'dismissed', 'suppressed', 'new']) }))
  const row = await setMonitoringEventStatus(user.id, id, body.status)
  return { event: row }
})
