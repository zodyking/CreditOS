import { eq } from 'drizzle-orm'
import { getDb, schema } from '../../../../db'
import { requireUser } from '../../../../utils/auth'
import { requireParam } from '../../../../utils/http'
import { audit } from '../../../../utils/audit'
import { retryDeadJob, runOnce } from '../../../../domains/jobs/queue'

export default defineEventHandler(async event => {
  const user = await requireUser(event)
  const id = requireParam(event, 'id')
  const db = getDb()
  const job = await db.query.jobs.findFirst({ where: eq(schema.jobs.id, id) })
  if (!job) throw createError({ statusCode: 404, statusMessage: 'Job not found' })
  if (!['dead', 'failed'].includes(job.status)) throw createError({ statusCode: 409, statusMessage: `Only dead or failed jobs can be retried (job is ${job.status})` })
  await retryDeadJob(id)
  await runOnce().catch(() => false)
  await audit({ userId: user.id, actor: 'user', action: 'job.retry', targetType: 'job', targetId: id, meta: { kind: job.kind }, event })
  return { job: await db.query.jobs.findFirst({ where: eq(schema.jobs.id, id) }) }
})
