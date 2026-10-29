import { and, eq } from 'drizzle-orm'
import { getDb, schema } from '../../db'
import { requireUser } from '../../utils/auth'
import { compareLatest, latestSnapshots, snapshotHistory } from '../../domains/reports/service'

export default defineEventHandler(async event => {
  const user = await requireUser(event)
  const db = getDb()
  const [snapshots, comparison, history, discrepancies] = await Promise.all([
    latestSnapshots(user.id),
    compareLatest(user.id),
    snapshotHistory(user.id),
    db.select().from(schema.discrepancies).where(and(eq(schema.discrepancies.userId, user.id))).orderBy(schema.discrepancies.detectedAt),
  ])
  return { snapshots, comparison, history, discrepancies }
})
