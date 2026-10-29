import { and, eq, isNull } from 'drizzle-orm'
import { getDb, schema } from '../../../db'
import { requireUser } from '../../../utils/auth'
import { requireParam } from '../../../utils/http'
import { audit } from '../../../utils/audit'
import { readDocument, sanitizeFilename } from '../../../domains/documents/storage'

export default defineEventHandler(async event => {
  const user = await requireUser(event)
  const id = requireParam(event, 'id')
  const db = getDb()
  const doc = await db.query.documents.findFirst({ where: and(eq(schema.documents.id, id), eq(schema.documents.userId, user.id), isNull(schema.documents.deletedAt)) })
  if (!doc) throw createError({ statusCode: 404, statusMessage: 'Document not found' })
  const bytes = await readDocument(doc)
  const inline = getQuery(event).inline === '1'
  setHeader(event, 'content-type', doc.mimeType)
  setHeader(event, 'content-length', bytes.length)
  setHeader(event, 'content-disposition', `${inline ? 'inline' : 'attachment'}; filename="${sanitizeFilename(doc.filename)}"`)
  setHeader(event, 'cache-control', 'private, no-store')
  setHeader(event, 'x-content-type-options', 'nosniff')
  await audit({ userId: user.id, actor: 'user', action: 'document.download', targetType: 'document', targetId: id, event })
  return bytes
})
