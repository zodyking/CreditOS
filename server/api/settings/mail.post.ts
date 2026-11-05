import { requireUser } from '../../utils/auth'
import { readValidatedJson } from '../../utils/http'
import { audit } from '../../utils/audit'
import { saveMailSchema } from '../../domains/email/schema'
import { saveMailSettings } from '../../domains/email/config'
import { enqueueJob } from '../../domains/jobs/queue'

export default defineEventHandler(async event => {
  const user = await requireUser(event)
  const body = await readValidatedJson(event, saveMailSchema)
  const mail = await saveMailSettings(body)
  await audit({
    userId: user.id,
    actor: 'user',
    action: 'settings.mail_saved',
    meta: { smtpHost: mail.smtp.host, imapHost: mail.imap.host, imapPoll: mail.imap.poll, notifyByEmail: mail.notifyByEmail },
    event,
  })
  if (mail.imap.poll && mail.imap.host) {
    await enqueueJob('mail.imap_poll', {}, { idempotencyKey: `mail.imap:save:${Date.now()}` })
  }
  return { mail }
})
