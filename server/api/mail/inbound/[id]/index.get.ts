import { and, eq } from 'drizzle-orm'
import { getDb, schema } from '../../../../db'
import { requireUser } from '../../../../utils/auth'
import { requireParam } from '../../../../utils/http'
import { matchCandidates, markInboundRead } from '../../../../domains/mailroom/service'

export default defineEventHandler(async event => {
  const user = await requireUser(event)
  const id = requireParam(event, 'id')
  const db = getDb()
  const mail = await db.query.inboundMail.findFirst({ where: and(eq(schema.inboundMail.id, id), eq(schema.inboundMail.userId, user.id)) })
  if (!mail) throw createError({ statusCode: 404, statusMessage: 'Inbound mail not found' })
  const [doc, analysis, candidates, matchedCase] = await Promise.all([
    mail.contentDocumentId ? db.query.documents.findFirst({ where: eq(schema.documents.id, mail.contentDocumentId) }) : null,
    db.query.responseAnalyses.findFirst({ where: eq(schema.responseAnalyses.inboundMailId, id) }),
    matchCandidates(user.id, mail.extraction, mail.senderName),
    mail.matchedCaseId ? db.query.cases.findFirst({ where: eq(schema.cases.id, mail.matchedCaseId), columns: { id: true, code: true, title: true, status: true } }) : null,
  ])
  if (mail.unread) await markInboundRead(user.id, id)
  return {
    mail: { ...mail, unread: false },
    document: doc ? { id: doc.id, filename: doc.filename, mimeType: doc.mimeType, pageCount: doc.pageCount, sizeBytes: doc.sizeBytes, sha256: doc.sha256 } : null,
    text: doc?.textExtracted ?? null,
    analysis: analysis ?? null,
    candidates,
    case: matchedCase ?? null,
  }
})
