import { z } from 'zod'
import { requireUser } from '../../../utils/auth'
import { readValidatedJson, requireParam } from '../../../utils/http'
import { linkCases, mergeCase } from '../../../domains/cases/service'
import { audit } from '../../../utils/audit'

const bodySchema = z.object({
  otherCaseId: z.string().uuid(),
  action: z.enum(['link', 'merge_into']).default('link'),
})

/** Link two cases, or merge this case into another (this case becomes DUPLICATE). */
export default defineEventHandler(async event => {
  const user = await requireUser(event)
  const id = requireParam(event, 'id')
  const body = await readValidatedJson(event, bodySchema)
  if (body.otherCaseId === id) throw createError({ statusCode: 400, statusMessage: 'Cannot link a case to itself' })
  if (body.action === 'merge_into') await mergeCase(user.id, id, body.otherCaseId)
  else await linkCases(user.id, id, body.otherCaseId)
  await audit({ userId: user.id, actor: 'user', action: `case.${body.action}`, targetType: 'case', targetId: id, meta: { otherCaseId: body.otherCaseId }, event })
  return { ok: true }
})
