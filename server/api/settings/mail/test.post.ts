import { requireUser } from '../../../utils/auth'
import { readValidatedJson } from '../../../utils/http'
import { friendlyMailError, testMailSchema } from '../../../domains/email/schema'
import { imapStatus } from '../../../domains/email/imap'
import { sendSmtp, verifySmtp } from '../../../domains/email/smtp'

export default defineEventHandler(async event => {
  await requireUser(event)
  const body = await readValidatedJson(event, testMailSchema)
  try {
    if (body.channel === 'smtp') {
      const target = { host: body.smtp.host, port: body.smtp.port, security: body.smtp.security, username: body.smtp.username, from: body.smtp.from, password: body.smtp.password }
      const to = body.to?.trim()
      if (to) {
        await sendSmtp(target, { to, subject: 'CreditOS SMTP test', text: 'CreditOS connected to this SMTP server. This message was sent from Settings → Email.' })
        return { ok: true as const, message: `Test message sent to ${to}.` }
      }
      await verifySmtp(target)
      return { ok: true as const, message: 'SMTP accepted the connection.' }
    }
    const status = await imapStatus({ host: body.imap.host, port: body.imap.port, security: body.imap.security, username: body.imap.username, mailbox: body.imap.mailbox || 'INBOX', password: body.imap.password })
    return { ok: true as const, message: `Connected to ${body.imap.mailbox || 'INBOX'}. ${status.messages ?? 0} messages, ${status.unseen ?? 0} unread.` }
  } catch (error) {
    throw createError({ statusCode: 422, statusMessage: friendlyMailError(error) })
  }
})
