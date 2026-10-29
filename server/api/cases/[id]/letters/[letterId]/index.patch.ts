import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { getDb, schema } from '../../../../../db'
import { requireUser } from '../../../../../utils/auth'
import { readValidatedJson, requireParam } from '../../../../../utils/http'
import { audit } from '../../../../../utils/audit'
import { saveLetterRevision } from '../../../../../domains/correspondence/letters'

const addressSchema = z.object({
  name: z.string().min(1).max(120),
  line1: z.string().min(1).max(120),
  line2: z.string().max(120).optional(),
  city: z.string().min(1).max(80),
  state: z.string().min(2).max(2),
  postalCode: z.string().min(5).max(10),
  country: z.string().max(2).optional().default('US'),
})

const bodySchema = z.object({
  subject: z.string().min(1).max(200).optional(),
  body: z.string().min(20).max(20_000).optional(),
  recipient: addressSchema.optional(),
  sender: addressSchema.optional(),
  enclosures: z.array(z.string().max(200)).max(20).optional(),
})

export default defineEventHandler(async event => {
  const user = await requireUser(event)
  const caseId = requireParam(event, 'id')
  const letterId = requireParam(event, 'letterId')
  const body = await readValidatedJson(event, bodySchema)
  const db = getDb()
  const c = await db.query.cases.findFirst({ where: and(eq(schema.cases.id, caseId), eq(schema.cases.userId, user.id)) })
  if (!c) throw createError({ statusCode: 404, statusMessage: 'Case not found' })
  if (['QUEUED_FOR_MAIL', 'SENT', 'DELIVERY_CONFIRMED'].includes(c.status)) {
    throw createError({ statusCode: 409, statusMessage: 'The letter is in flight and cannot be edited.' })
  }
  const letter = await saveLetterRevision(caseId, letterId, body, 'user')
  await audit({ userId: user.id, actor: 'user', action: 'letter.revise', targetType: 'letter', targetId: letter.id, meta: { version: letter.version }, event })
  return { letter }
})
