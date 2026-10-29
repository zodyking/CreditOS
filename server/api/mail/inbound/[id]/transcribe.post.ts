import { z } from 'zod'
import { requireUser } from '../../../../utils/auth'
import { readValidatedJson, requireParam } from '../../../../utils/http'
import { audit } from '../../../../utils/audit'
import { transcribeInbound } from '../../../../domains/mailroom/service'
import { runOnce } from '../../../../domains/jobs/queue'

const bodySchema = z.object({
  text: z.string().min(10).max(200_000),
  caseId: z.string().uuid().optional(),
})

/** Manual transcription for image scans or PDFs without a text layer. */
export default defineEventHandler(async event => {
  const user = await requireUser(event)
  const id = requireParam(event, 'id')
  const body = await readValidatedJson(event, bodySchema)
  const mail = await transcribeInbound(user.id, id, body.text, body.caseId)
  await audit({ userId: user.id, actor: 'user', action: 'inbound.transcribe', targetType: 'inbound_mail', targetId: id, meta: { chars: body.text.length }, event })
  if (mail.status === 'MATCHED') await runOnce().catch(() => false)
  return { mail }
})
