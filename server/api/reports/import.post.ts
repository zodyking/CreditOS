import { requireUser } from '../../utils/auth'
import { readValidatedJson } from '../../utils/http'
import { audit } from '../../utils/audit'
import { env } from '../../utils/env'
import { importReportSchema } from '../../domains/reports/normalize'
import { importReport, runDiscrepancyDetection } from '../../domains/reports/service'
import { enqueueJob } from '../../domains/jobs/queue'

/** Manual import of a normalized report (JSON). Live data in a live/test deployment, otherwise sandbox. */
export default defineEventHandler(async event => {
  const user = await requireUser(event)
  const body = await readValidatedJson(event, importReportSchema)
  const mode = env.appMode === 'demo' ? 'sandbox' : 'live'
  const snapshot = await importReport(user.id, body, mode)
  const detection = await runDiscrepancyDetection(user.id)
  await enqueueJob('reports.detect_discrepancies', { userId: user.id }, { idempotencyKey: `detect:${user.id}:${snapshot.id}` })
  await audit({ userId: user.id, actor: 'user', action: 'reports.import', targetType: 'report_snapshot', targetId: snapshot.id, meta: { bureau: body.bureau, tradelines: body.tradelines.length, mode }, event })
  return { snapshot, detection: { created: detection.created.length, existing: detection.existing } }
})
