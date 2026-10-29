import { and, eq } from 'drizzle-orm'
import type { Bureau } from '#shared/constants'
import { getDb, schema } from '../../db'
import { requireUser } from '../../utils/auth'
import { listMonitoringEvents } from '../../domains/monitoring/service'

export default defineEventHandler(async event => {
  const user = await requireUser(event)
  const q = getQuery(event)
  const db = getDb()
  const [events, connections] = await Promise.all([
    listMonitoringEvents(user.id, { status: q.status ? String(q.status) : undefined, bureau: q.bureau ? (String(q.bureau) as Bureau) : undefined }),
    db.select().from(schema.providerConnections).where(and(eq(schema.providerConnections.userId, user.id), eq(schema.providerConnections.kind, 'credit_data'))),
  ])
  return { events, connections }
})
