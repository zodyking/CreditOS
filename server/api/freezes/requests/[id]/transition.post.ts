import { z } from 'zod'
import { FREEZE_STATUSES, type FreezeStatus } from '#shared/state-machines'
import { requireUser } from '../../../../utils/auth'
import { readUpload, readValidatedJson, requireParam } from '../../../../utils/http'
import { transitionFreeze } from '../../../../domains/freezes/service'
import { UploadRejectedError, storeDocument } from '../../../../domains/documents/storage'
import { env } from '../../../../utils/env'

const jsonSchema = z.object({
  to: z.enum(FREEZE_STATUSES),
  note: z.string().max(2000).optional(),
  requestRef: z.string().max(120).optional(),
  confirmationRef: z.string().max(120).optional(),
})

/**
 * Record a freeze state change. CONFIRMED_* states require evidence: either
 * a confirmation reference or an uploaded confirmation document (multipart
 * with fields `to`, `note`, `confirmationRef` and a `file`).
 */
export default defineEventHandler(async event => {
  const user = await requireUser(event)
  const id = requireParam(event, 'id')
  const contentType = getRequestHeader(event, 'content-type') ?? ''
  let to: FreezeStatus
  let note: string | undefined
  let requestRef: string | undefined
  let confirmationRef: string | undefined
  let evidenceDocumentId: string | undefined

  if (contentType.includes('multipart/form-data')) {
    const { file, fields } = await readUpload(event)
    const parsed = jsonSchema.safeParse({ to: fields.to, note: fields.note || undefined, requestRef: fields.requestRef || undefined, confirmationRef: fields.confirmationRef || undefined })
    if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.issues[0]?.message ?? 'Invalid fields' })
    ;({ to, note, requestRef, confirmationRef } = parsed.data)
    if (file) {
      try {
        const doc = await storeDocument({ userId: user.id, buffer: file.buffer, filename: file.filename, kind: 'freeze_confirmation', source: 'upload', mode: env.appMode === 'demo' ? 'demo' : 'live', title: `Freeze confirmation: ${file.filename}` })
        evidenceDocumentId = doc.id
      } catch (e) {
        if (e instanceof UploadRejectedError) throw createError({ statusCode: 422, statusMessage: e.message })
        throw e
      }
    }
  } else {
    ;({ to, note, requestRef, confirmationRef } = await readValidatedJson(event, jsonSchema))
  }

  const request = await transitionFreeze(user.id, id, to, 'user', { note, requestRef, confirmationRef, evidenceDocumentId })
  return { request }
})
