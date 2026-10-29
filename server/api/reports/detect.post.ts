import { requireUser } from '../../utils/auth'
import { runDiscrepancyDetection } from '../../domains/reports/service'
import { audit } from '../../utils/audit'

export default defineEventHandler(async event => {
  const user = await requireUser(event)
  const result = await runDiscrepancyDetection(user.id)
  await audit({ userId: user.id, actor: 'user', action: 'reports.detect', meta: { created: result.created.length, existing: result.existing }, event })
  return { created: result.created, existing: result.existing }
})
