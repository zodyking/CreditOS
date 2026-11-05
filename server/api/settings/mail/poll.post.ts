import { z } from 'zod'
import { requireUser } from '../../../utils/auth'
import { readValidatedJson } from '../../../utils/http'
import { audit } from '../../../utils/audit'
import { friendlyMailError } from '../../../domains/email/schema'
import { pollImap } from '../../../domains/email/poll'

const bodySchema = z.object({ scope: z.enum(['new', 'unseen']).default('unseen') })

export default defineEventHandler(async event => {
  const user = await requireUser(event)
  const body = await readValidatedJson(event, bodySchema)
  try {
    const result = await pollImap(body.scope)
    await audit({ userId: user.id, actor: 'user', action: 'settings.mail_poll', meta: { ...result, scope: body.scope }, event })
    return result
  } catch (error) {
    throw createError({ statusCode: 422, statusMessage: friendlyMailError(error) })
  }
})
