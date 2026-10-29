import { DOCUMENT_KINDS, type DocumentKind } from '#shared/constants'
import { requireUser } from '../../utils/auth'
import { readUpload } from '../../utils/http'
import { env } from '../../utils/env'
import { audit } from '../../utils/audit'
import { UploadRejectedError, storeDocument } from '../../domains/documents/storage'

/** Upload to the Vault (not tied to a case). */
export default defineEventHandler(async event => {
  const user = await requireUser(event)
  const { file, fields } = await readUpload(event)
  if (!file) throw createError({ statusCode: 400, statusMessage: 'A file is required' })
  const kind: DocumentKind = (DOCUMENT_KINDS as readonly string[]).includes(fields.kind ?? '') ? (fields.kind as DocumentKind) : 'other'
  try {
    const doc = await storeDocument({ userId: user.id, buffer: file.buffer, filename: file.filename, kind, caseId: fields.caseId || null, source: 'upload', mode: env.appMode === 'demo' ? 'demo' : 'live', title: fields.title || file.filename })
    await audit({ userId: user.id, actor: 'user', action: 'document.upload', targetType: 'document', targetId: doc.id, meta: { kind, filename: file.filename, bytes: file.buffer.length }, event })
    return { document: doc }
  } catch (e) {
    if (e instanceof UploadRejectedError) {
      await audit({ userId: user.id, actor: 'user', action: 'document.upload_rejected', meta: { filename: file.filename, reason: e.message }, event })
      throw createError({ statusCode: 422, statusMessage: e.message })
    }
    throw e
  }
})
