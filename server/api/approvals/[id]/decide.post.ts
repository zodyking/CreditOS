import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { getDb, schema } from '../../../db'
import { requireUser } from '../../../utils/auth'
import { readValidatedJson, requireParam } from '../../../utils/http'
import { decideApproval } from '../../../domains/correspondence/mail'
import { runOnce } from '../../../domains/jobs/queue'

const bodySchema = z.object({
  decision: z.enum(['approved', 'rejected', 'revoked']),
  note: z.string().max(2000).optional(),
  /** Client must echo the bundle hash it displayed so a stale screen cannot approve a changed letter. */
  pdfSha256: z.string().length(64).optional(),
})

export default defineEventHandler(async event => {
  const user = await requireUser(event)
  const id = requireParam(event, 'id')
  const body = await readValidatedJson(event, bodySchema)
  const db = getDb()
  const existing = await db.query.approvals.findFirst({ where: and(eq(schema.approvals.id, id), eq(schema.approvals.userId, user.id)) })
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Approval not found' })
  if (body.decision === 'approved' && body.pdfSha256 && existing.bundle.pdfSha256 !== body.pdfSha256) {
    throw createError({ statusCode: 409, statusMessage: 'The approval bundle shown does not match the current letter. Reload and review again.' })
  }
  const approval = await decideApproval(user.id, id, body.decision, body.note)
  // Give the dispatcher a chance to run immediately so the UI sees progress.
  if (body.decision === 'approved') await runOnce().catch(() => false)
  return { approval }
})
