import { requireUser } from '../../../utils/auth'
import { readUpload } from '../../../utils/http'
import { env } from '../../../utils/env'
import { UploadRejectedError } from '../../../domains/documents/storage'
import { ingestManualUpload } from '../../../domains/mailroom/service'
import { runOnce } from '../../../domains/jobs/queue'

/** Manual inbound upload: the file is treated as the full content scan. */
export default defineEventHandler(async event => {
  const user = await requireUser(event)
  const { file, fields } = await readUpload(event)
  if (!file) throw createError({ statusCode: 400, statusMessage: 'A PDF, JPEG or PNG file is required' })
  const receivedAt = fields.receivedAt ? new Date(fields.receivedAt) : undefined
  try {
    const mail = await ingestManualUpload(user.id, {
      buffer: file.buffer,
      filename: file.filename,
      senderName: fields.senderName?.trim() || undefined,
      caseId: fields.caseId?.trim() || undefined,
      mode: env.appMode === 'demo' ? 'demo' : 'live',
      receivedAt: receivedAt && !Number.isNaN(receivedAt.getTime()) ? receivedAt : undefined,
    })
    // Run the analysis job right away so the UI shows the council's reaction.
    if (mail.status === 'MATCHED') await runOnce().catch(() => false)
    return { mail }
  } catch (e) {
    if (e instanceof UploadRejectedError) throw createError({ statusCode: 422, statusMessage: e.message })
    throw e
  }
})
