import { and, desc, eq, inArray, isNull } from 'drizzle-orm'
import { getDb, schema } from '../../db'
import { requireUser } from '../../utils/auth'

export default defineEventHandler(async event => {
  const user = await requireUser(event)
  const q = getQuery(event)
  const db = getDb()
  const where = [eq(schema.documents.userId, user.id), isNull(schema.documents.deletedAt)]
  if (q.kind) where.push(eq(schema.documents.kind, String(q.kind) as 'evidence'))
  if (q.caseId) where.push(eq(schema.documents.caseId, String(q.caseId)))
  const docs = await db
    .select({
      id: schema.documents.id,
      caseId: schema.documents.caseId,
      kind: schema.documents.kind,
      filename: schema.documents.filename,
      mimeType: schema.documents.mimeType,
      sizeBytes: schema.documents.sizeBytes,
      sha256: schema.documents.sha256,
      pageCount: schema.documents.pageCount,
      sensitivity: schema.documents.sensitivity,
      source: schema.documents.source,
      mode: schema.documents.mode,
      title: schema.documents.title,
      createdAt: schema.documents.createdAt,
    })
    .from(schema.documents)
    .where(and(...where))
    .orderBy(desc(schema.documents.createdAt))
  const caseIds = [...new Set(docs.map(d => d.caseId).filter(Boolean))] as string[]
  const cases = caseIds.length ? await db.select({ id: schema.cases.id, code: schema.cases.code, title: schema.cases.title }).from(schema.cases).where(inArray(schema.cases.id, caseIds)) : []
  return { documents: docs.map(d => ({ ...d, case: cases.find(c => c.id === d.caseId) ?? null })) }
})
