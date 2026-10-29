import { inArray } from 'drizzle-orm'
import type { InboundStatus } from '#shared/state-machines'
import { getDb, schema } from '../../../db'
import { requireUser } from '../../../utils/auth'
import { listInbound } from '../../../domains/mailroom/service'
import { activeInboundProvider, inboundProviders } from '../../../domains/mailroom/providers'

export default defineEventHandler(async event => {
  const user = await requireUser(event)
  const q = getQuery(event)
  const items = await listInbound(user.id, q.status ? (String(q.status) as InboundStatus) : undefined)
  const db = getDb()
  const caseIds = [...new Set(items.map(i => i.matchedCaseId).filter(Boolean))] as string[]
  const cases = caseIds.length ? await db.select({ id: schema.cases.id, code: schema.cases.code, title: schema.cases.title, status: schema.cases.status }).from(schema.cases).where(inArray(schema.cases.id, caseIds)) : []
  const ids = items.map(i => i.id)
  const analyses = ids.length ? await db.select().from(schema.responseAnalyses).where(inArray(schema.responseAnalyses.inboundMailId, ids)) : []
  return {
    items: items.map(i => ({ ...i, case: cases.find(c => c.id === i.matchedCaseId) ?? null, analysis: analyses.find(a => a.inboundMailId === i.id) ?? null })),
    activeProvider: activeInboundProvider(),
    providers: inboundProviders,
  }
})
