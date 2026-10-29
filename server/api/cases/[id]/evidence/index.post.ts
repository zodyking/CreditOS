import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { DOCUMENT_KINDS } from '#shared/constants'
import { getDb, schema } from '../../../../db'
import { requireUser } from '../../../../utils/auth'
import { readUpload, readValidatedJson, requireParam } from '../../../../utils/http'
import { audit } from '../../../../utils/audit'
import { addEvidence, evaluateCaseRules, transitionCase } from '../../../../domains/cases/service'
import { UploadRejectedError, storeDocument } from '../../../../domains/documents/storage'

const statementSchema = z.object({
  kind: z.literal('user_statement'),
  description: z.string().min(5).max(4000),
})

/**
 * Add evidence to a case. Accepts either JSON ({kind:'user_statement',
 * description}) or multipart (file + description + documentKind). After new
 * evidence, the rules engine is re-run and a NEEDS_EVIDENCE case may advance.
 */
export default defineEventHandler(async event => {
  const user = await requireUser(event)
  const id = requireParam(event, 'id')
  const db = getDb()
  const c = await db.query.cases.findFirst({ where: and(eq(schema.cases.id, id), eq(schema.cases.userId, user.id)) })
  if (!c) throw createError({ statusCode: 404, statusMessage: 'Case not found' })

  const contentType = getRequestHeader(event, 'content-type') ?? ''
  let evidenceRow
  if (contentType.includes('multipart/form-data')) {
    const { file, fields } = await readUpload(event)
    if (!file) throw createError({ statusCode: 400, statusMessage: 'A file is required' })
    const kind = (DOCUMENT_KINDS as readonly string[]).includes(fields.documentKind ?? '') ? (fields.documentKind as (typeof DOCUMENT_KINDS)[number]) : 'evidence'
    let doc
    try {
      doc = await storeDocument({ userId: user.id, buffer: file.buffer, filename: file.filename, kind, caseId: id, source: 'upload', mode: c.mode, title: fields.title || file.filename })
    } catch (e) {
      if (e instanceof UploadRejectedError) throw createError({ statusCode: 422, statusMessage: e.message })
      throw e
    }
    evidenceRow = await addEvidence(id, {
      kind: 'document',
      description: fields.description?.trim() || `Uploaded document: ${file.filename}`,
      documentId: doc.id,
      credibility: (['high', 'medium', 'low'] as const).includes(fields.credibility as 'high') ? (fields.credibility as 'high') : 'high',
      addedBy: 'user',
    })
  } else {
    const body = await readValidatedJson(event, statementSchema)
    evidenceRow = await addEvidence(id, { kind: body.kind, description: body.description, credibility: 'medium', addedBy: 'user' })
  }

  const evaluation = await evaluateCaseRules(id)
  await db.update(schema.cases).set({ confidence: evaluation.confidence.toFixed(3), recommendedChannel: evaluation.channel }).where(eq(schema.cases.id, id))
  let advanced = false
  if (c.status === 'NEEDS_EVIDENCE' && evaluation.disputable === 'yes') {
    await transitionCase(id, 'AGENT_REVIEW', 'system', { title: 'Evidence now sufficient — queued for council', nextAction: 'Run agent council' })
    advanced = true
  }
  await audit({ userId: user.id, actor: 'user', action: 'case.evidence_add', targetType: 'case', targetId: id, meta: { evidenceId: evidenceRow.id, kind: evidenceRow.kind }, event })
  return { evidence: evidenceRow, evaluation, advanced }
})
