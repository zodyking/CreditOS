import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { CASE_STATUSES, InvalidTransitionError } from '#shared/state-machines'
import { getDb, schema } from '../../../db'
import { requireUser } from '../../../utils/auth'
import { readValidatedJson, requireParam } from '../../../utils/http'
import { audit } from '../../../utils/audit'
import { transitionCase } from '../../../domains/cases/service'

/**
 * User-driven transitions only. Transitions that require evidence or a
 * provider event (SENT, DELIVERY_CONFIRMED, …) are not allowed here; they are
 * set by the mail pipeline.
 */
const USER_ALLOWED = ['CANCELLED', 'CLOSED', 'RESOLVED', 'AGENT_REVIEW', 'PLAN_READY', 'TRIAGE', 'NEEDS_EVIDENCE', 'RESPONSE_RECEIVED', 'ESCALATION_REVIEW', 'FOLLOW_UP_RECOMMENDED'] as const

const bodySchema = z.object({
  to: z.enum(CASE_STATUSES),
  note: z.string().max(2000).optional(),
})

export default defineEventHandler(async event => {
  const user = await requireUser(event)
  const id = requireParam(event, 'id')
  const body = await readValidatedJson(event, bodySchema)
  if (!(USER_ALLOWED as readonly string[]).includes(body.to)) {
    throw createError({ statusCode: 422, statusMessage: `Status ${body.to} is set by the system from provider or council events, not manually.` })
  }
  const db = getDb()
  const c = await db.query.cases.findFirst({ where: and(eq(schema.cases.id, id), eq(schema.cases.userId, user.id)) })
  if (!c) throw createError({ statusCode: 404, statusMessage: 'Case not found' })
  try {
    const updated = await transitionCase(id, body.to, 'user', { detail: body.note, title: body.note ? `Status → ${body.to.replace(/_/g, ' ').toLowerCase()} (user)` : undefined })
    await audit({ userId: user.id, actor: 'user', action: 'case.transition', targetType: 'case', targetId: id, meta: { from: c.status, to: body.to }, event })
    return { case: updated }
  } catch (e) {
    if (e instanceof InvalidTransitionError) throw createError({ statusCode: 409, statusMessage: e.message })
    throw e
  }
})
