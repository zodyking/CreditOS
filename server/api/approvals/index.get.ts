import { desc, eq, inArray } from 'drizzle-orm'
import { getDb, schema } from '../../db'
import { requireUser } from '../../utils/auth'

export default defineEventHandler(async event => {
  const user = await requireUser(event)
  const db = getDb()
  const rows = await db.select().from(schema.approvals).where(eq(schema.approvals.userId, user.id)).orderBy(desc(schema.approvals.createdAt))
  const caseIds = [...new Set(rows.map(r => r.caseId).filter(Boolean))] as string[]
  const cases = caseIds.length
    ? await db.select({ id: schema.cases.id, code: schema.cases.code, title: schema.cases.title, status: schema.cases.status, mode: schema.cases.mode }).from(schema.cases).where(inArray(schema.cases.id, caseIds))
    : []
  const orderIds = rows.filter(r => r.targetType === 'mail_order').map(r => r.targetId)
  const orders = orderIds.length ? await db.select().from(schema.mailOrders).where(inArray(schema.mailOrders.id, orderIds)) : []
  return {
    approvals: rows.map(r => ({
      ...r,
      case: cases.find(c => c.id === r.caseId) ?? null,
      order: r.targetType === 'mail_order' ? (orders.find(o => o.id === r.targetId) ?? null) : null,
    })),
  }
})
