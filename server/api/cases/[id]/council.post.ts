import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { getDb, schema } from '../../../db'
import { requireUser } from '../../../utils/auth'
import { readValidatedJson, requireParam } from '../../../utils/http'
import { runCouncil } from '../../../domains/council/orchestrator'

const bodySchema = z.object({
  trigger: z.enum(['manual_rerun', 'new_evidence', 'initial']).default('manual_rerun'),
})

/** Runs the council synchronously so the UI can show the transcript on return. */
export default defineEventHandler(async event => {
  const user = await requireUser(event)
  const id = requireParam(event, 'id')
  const body = await readValidatedJson(event, bodySchema)
  const db = getDb()
  const c = await db.query.cases.findFirst({ where: and(eq(schema.cases.id, id), eq(schema.cases.userId, user.id)) })
  if (!c) throw createError({ statusCode: 404, statusMessage: 'Case not found' })
  const run = await runCouncil(id, body.trigger, 'user')
  return { run }
})
