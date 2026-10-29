import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import { getDb, schema } from '../../db'
import { requireUser } from '../../utils/auth'

export default defineEventHandler(async event => {
  const user = await requireUser(event)
  const db = getDb()
  const [items, [unreadRow]] = await Promise.all([
    db.select().from(schema.notifications).where(eq(schema.notifications.userId, user.id)).orderBy(desc(schema.notifications.createdAt)).limit(50),
    db.select({ unread: sql<number>`count(*)::int` }).from(schema.notifications).where(and(eq(schema.notifications.userId, user.id), isNull(schema.notifications.readAt))),
  ])
  return { notifications: items, unread: unreadRow?.unread ?? 0 }
})
