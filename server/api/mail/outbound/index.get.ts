import { asc, desc, eq, inArray } from 'drizzle-orm'
import { getDb, schema } from '../../../db'
import { requireUser } from '../../../utils/auth'
import { describeOutboundProvider, getOutboundProvider, listOutboundProviders } from '../../../domains/correspondence/outbound'

export default defineEventHandler(async event => {
  const user = await requireUser(event)
  const db = getDb()
  const orders = await db.select().from(schema.mailOrders).where(eq(schema.mailOrders.userId, user.id)).orderBy(desc(schema.mailOrders.createdAt))
  const ids = orders.map(o => o.id)
  const events = ids.length ? await db.select().from(schema.mailEvents).where(inArray(schema.mailEvents.mailOrderId, ids)).orderBy(asc(schema.mailEvents.receivedAt)) : []
  const caseIds = [...new Set(orders.map(o => o.caseId))]
  const cases = caseIds.length ? await db.select({ id: schema.cases.id, code: schema.cases.code, title: schema.cases.title }).from(schema.cases).where(inArray(schema.cases.id, caseIds)) : []
  return {
    orders: orders.map(o => ({ ...o, events: events.filter(e => e.mailOrderId === o.id), case: cases.find(c => c.id === o.caseId) ?? null })),
    activeProvider: describeOutboundProvider(getOutboundProvider()),
    providers: listOutboundProviders().map(describeOutboundProvider),
  }
})
