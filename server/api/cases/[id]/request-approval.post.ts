import { z } from 'zod'
import { requireUser } from '../../../utils/auth'
import { readValidatedJson, requireParam } from '../../../utils/http'
import { audit } from '../../../utils/audit'
import { requestMailApproval } from '../../../domains/correspondence/mail'
import { latestLetter } from '../../../domains/correspondence/letters'

const bodySchema = z.object({
  letterId: z.string().uuid().optional(),
  mailClass: z.enum(['first_class', 'standard', 'certified']).default('first_class'),
  color: z.boolean().default(false),
})

export default defineEventHandler(async event => {
  const user = await requireUser(event)
  const caseId = requireParam(event, 'id')
  const body = await readValidatedJson(event, bodySchema)
  let letterId = body.letterId
  if (!letterId) {
    const l = await latestLetter(caseId)
    if (!l) throw createError({ statusCode: 422, statusMessage: 'No letter drafted for this case yet. Run the council first.' })
    letterId = l.id
  }
  const result = await requestMailApproval(user.id, caseId, letterId, { mailClass: body.mailClass, color: body.color })
  await audit({ userId: user.id, actor: 'user', action: 'mail.request_approval', targetType: 'mail_order', targetId: result.order.id, meta: { caseId, letterId, mailClass: body.mailClass }, event })
  return result
})
