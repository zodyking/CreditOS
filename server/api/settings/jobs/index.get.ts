import { sql } from 'drizzle-orm'
import { getDb, schema } from '../../../db'
import { requireUser } from '../../../utils/auth'
import { listJobs } from '../../../domains/jobs/queue'

export default defineEventHandler(async event => {
  await requireUser(event)
  const db = getDb()
  const [jobs, counts] = await Promise.all([
    listJobs(150),
    db.select({ status: schema.jobs.status, n: sql<number>`count(*)::int` }).from(schema.jobs).groupBy(schema.jobs.status),
  ])
  return { jobs, counts: Object.fromEntries(counts.map(c => [c.status, c.n])) }
})
