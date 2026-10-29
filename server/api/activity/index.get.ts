import { desc, eq, inArray } from 'drizzle-orm'
import { getDb, schema } from '../../db'
import { requireUser } from '../../utils/auth'

/** Unified activity feed: audit events + case events, newest first. */
export default defineEventHandler(async event => {
  const user = await requireUser(event)
  const q = getQuery(event)
  const limit = Math.min(Number(q.limit ?? 200) || 200, 500)
  const db = getDb()
  const [auditRows, caseRows] = await Promise.all([
    db.select().from(schema.auditEvents).where(eq(schema.auditEvents.userId, user.id)).orderBy(desc(schema.auditEvents.createdAt)).limit(limit),
    db.select({ id: schema.cases.id, code: schema.cases.code, title: schema.cases.title }).from(schema.cases).where(eq(schema.cases.userId, user.id)),
  ])
  const caseIds = caseRows.map(c => c.id)
  const caseEvents = caseIds.length ? await db.select().from(schema.caseEvents).where(inArray(schema.caseEvents.caseId, caseIds)).orderBy(desc(schema.caseEvents.occurredAt)).limit(limit) : []
  const codeFor = (id: string) => caseRows.find(c => c.id === id)
  const feed = [
    ...auditRows.map(a => ({ id: a.id, source: 'audit' as const, at: a.createdAt, actor: a.actor, title: a.action, detail: a.targetType ? `${a.targetType}${a.targetId ? ` ${a.targetId.slice(0, 8)}` : ''}` : null, meta: a.meta, ip: a.ip, caseId: null as string | null, caseCode: null as string | null, factual: true })),
    ...caseEvents.map(e => ({ id: e.id, source: 'case' as const, at: e.occurredAt, actor: e.actor, title: e.title, detail: e.detail, meta: e.meta, ip: null as string | null, caseId: e.caseId, caseCode: codeFor(e.caseId)?.code ?? null, factual: e.factual })),
  ]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, limit)
  return { feed }
})
