import { hasSecret, getSecret, getSetting, setSecret, setSetting } from '../settings/service'
import { env } from '../../utils/env'
import { friendlyMailError, type MailSecurity, type SaveMailInput } from './schema'

const SMTP_SECRET = 'mail_smtp_password'
const IMAP_SECRET = 'mail_imap_password'

export interface MailEndpoint {
  host: string
  port: number
  security: MailSecurity
  username: string
}

export interface StoredMail {
  smtp: MailEndpoint & { from: string }
  imap: MailEndpoint & { mailbox: string; poll: boolean }
  notifyByEmail: boolean
  imapCursor: number | null
  imapLastCheckedAt: string | null
  imapLastError: string | null
  imapLastImported: number
}

export interface MailPublic extends StoredMail {
  smtpPasswordSet: boolean
  imapPasswordSet: boolean
}

export const DEFAULT_MAIL: StoredMail = {
  smtp: { host: '', port: 587, security: 'starttls', username: '', from: '' },
  imap: { host: '', port: 993, security: 'ssl', username: '', mailbox: 'INBOX', poll: false },
  notifyByEmail: false,
  imapCursor: null,
  imapLastCheckedAt: null,
  imapLastError: null,
  imapLastImported: 0,
}

export async function getMailConfig(): Promise<StoredMail> {
  const stored = await getSetting<StoredMail>('mail', DEFAULT_MAIL)
  return {
    ...DEFAULT_MAIL,
    ...stored,
    smtp: { ...DEFAULT_MAIL.smtp, ...stored.smtp },
    imap: { ...DEFAULT_MAIL.imap, ...stored.imap, mailbox: stored.imap?.mailbox || 'INBOX' },
  }
}

export async function getMailPublic(): Promise<MailPublic> {
  const [cfg, smtpPasswordSet, imapPasswordSet] = await Promise.all([getMailConfig(), hasSecret(SMTP_SECRET), hasSecret(IMAP_SECRET)])
  return { ...cfg, smtpPasswordSet, imapPasswordSet }
}

export async function mailPassword(kind: 'smtp' | 'imap'): Promise<string | null> {
  return getSecret(kind === 'smtp' ? SMTP_SECRET : IMAP_SECRET)
}

export async function saveMailSettings(input: SaveMailInput): Promise<MailPublic> {
  const current = await getMailConfig()
  const smtpPassword = input.smtp.password?.trim() || ''
  const imapPassword = input.imap.password?.trim() || ''
  if ((smtpPassword || imapPassword) && !env.encryptionKey) {
    throw createError({ statusCode: 412, statusMessage: 'APP_ENCRYPTION_KEY is not set, so mailbox passwords cannot be stored.' })
  }
  if (input.smtp.clearPassword) await setSecret(SMTP_SECRET, null)
  else if (smtpPassword) await setSecret(SMTP_SECRET, smtpPassword)
  if (input.imap.clearPassword) await setSecret(IMAP_SECRET, null)
  else if (imapPassword) await setSecret(IMAP_SECRET, imapPassword)

  const smtpSet = input.smtp.clearPassword ? false : smtpPassword ? true : await hasSecret(SMTP_SECRET)
  const imapSet = input.imap.clearPassword ? false : imapPassword ? true : await hasSecret(IMAP_SECRET)
  if (input.notifyByEmail && (!input.smtp.host || !input.smtp.from || !smtpSet)) {
    throw createError({ statusCode: 422, statusMessage: 'Notification email needs an SMTP host, a From address, and a password.' })
  }
  if (input.imap.poll && (!input.imap.host || !input.imap.username || !imapSet)) {
    throw createError({ statusCode: 422, statusMessage: 'Inbox polling needs an IMAP host, username, and password.' })
  }

  const mailbox = input.imap.mailbox.trim() || 'INBOX'
  const identityChanged = current.imap.host !== input.imap.host || current.imap.username !== input.imap.username || current.imap.mailbox !== mailbox
  await setSetting('mail', {
    smtp: { host: input.smtp.host, port: input.smtp.port, security: input.smtp.security, username: input.smtp.username, from: input.smtp.from },
    imap: { host: input.imap.host, port: input.imap.port, security: input.imap.security, username: input.imap.username, mailbox, poll: input.imap.poll },
    notifyByEmail: input.notifyByEmail,
    imapCursor: identityChanged ? null : current.imapCursor,
    imapLastCheckedAt: identityChanged ? null : current.imapLastCheckedAt,
    imapLastError: null,
    imapLastImported: identityChanged ? 0 : current.imapLastImported,
  } satisfies StoredMail)
  return getMailPublic()
}

export async function patchMailRuntime(patch: Partial<Pick<StoredMail, 'imapCursor' | 'imapLastCheckedAt' | 'imapLastError' | 'imapLastImported'>>): Promise<void> {
  const current = await getMailConfig()
  await setSetting('mail', { ...current, ...patch })
}

export function transportError(error: unknown): string {
  return friendlyMailError(error)
}
