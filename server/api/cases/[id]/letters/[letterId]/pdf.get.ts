import { and, eq } from 'drizzle-orm'
import { getDb, schema } from '../../../../../db'
import { requireUser } from '../../../../../utils/auth'
import { requireParam } from '../../../../../utils/http'
import { renderLetterPdf } from '../../../../../domains/correspondence/letters'
import { readDocument } from '../../../../../domains/documents/storage'

/** Stream the rendered letter PDF (renders on demand if not yet rendered or if the letter changed). */
export default defineEventHandler(async event => {
  const user = await requireUser(event)
  const caseId = requireParam(event, 'id')
  const letterId = requireParam(event, 'letterId')
  const db = getDb()
  const c = await db.query.cases.findFirst({ where: and(eq(schema.cases.id, caseId), eq(schema.cases.userId, user.id)) })
  if (!c) throw createError({ statusCode: 404, statusMessage: 'Case not found' })
  const letter = await db.query.letters.findFirst({ where: and(eq(schema.letters.id, letterId), eq(schema.letters.caseId, caseId)) })
  if (!letter) throw createError({ statusCode: 404, statusMessage: 'Letter not found' })

  let bytes: Uint8Array
  if (letter.pdfDocumentId) {
    const doc = await db.query.documents.findFirst({ where: eq(schema.documents.id, letter.pdfDocumentId) })
    bytes = doc ? await readDocument(doc) : (await renderLetterPdf(caseId, letterId)).bytes
  } else {
    bytes = (await renderLetterPdf(caseId, letterId)).bytes
  }
  setHeader(event, 'content-type', 'application/pdf')
  setHeader(event, 'content-disposition', `inline; filename="${c.code}-letter-v${letter.version}.pdf"`)
  setHeader(event, 'cache-control', 'private, no-store')
  return Buffer.from(bytes)
})
