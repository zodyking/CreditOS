import { requireUser } from '../../utils/auth'
import { enqueueJob, runOnce } from '../../domains/jobs/queue'
import { audit } from '../../utils/audit'

/** Manual "check now". Honest: without a licensed provider it records the check and the next eligible time. */
export default defineEventHandler(async event => {
  const user = await requireUser(event)
  await enqueueJob('monitoring.poll', { userId: user.id }, { idempotencyKey: `monitoring:manual:${user.id}:${Date.now()}` })
  await enqueueJob('reports.detect_discrepancies', { userId: user.id }, { idempotencyKey: `detect:manual:${user.id}:${Date.now()}` })
  await runOnce()
  await runOnce()
  await audit({ userId: user.id, actor: 'user', action: 'monitoring.poll', event })
  return { queued: true }
})
