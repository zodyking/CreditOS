import nodemailer from 'nodemailer'
import { getMailConfig, mailPassword } from './config'
import type { MailSecurity } from './schema'

export interface SmtpTarget {
  host: string
  port: number
  security: MailSecurity
  username: string
  from: string
  password?: string
}

function transport(target: SmtpTarget, password: string) {
  return nodemailer.createTransport({
    host: target.host,
    port: target.port,
    secure: target.security === 'ssl',
    requireTLS: target.security === 'starttls',
    ignoreTLS: target.security === 'none',
    auth: target.username ? { user: target.username, pass: password } : undefined,
    connectionTimeout: 12_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  })
}

async function resolvePassword(target: SmtpTarget): Promise<string> {
  if (target.password?.trim()) return target.password
  return (await mailPassword('smtp')) ?? ''
}

export async function verifySmtp(target: SmtpTarget): Promise<void> {
  if (!target.host) throw new Error('SMTP host is required')
  const password = await resolvePassword(target)
  if (target.username && !password) throw new Error('SMTP password is required')
  await transport(target, password).verify()
}

export async function sendSmtp(target: SmtpTarget, message: { to: string; subject: string; text: string }): Promise<void> {
  if (!target.from) throw new Error('From address is required')
  const password = await resolvePassword(target)
  if (target.username && !password) throw new Error('SMTP password is required')
  await transport(target, password).sendMail({ from: target.from, to: message.to, subject: message.subject, text: message.text })
}

/** Sends one notification. Returns without doing anything when SMTP is not configured. */
export async function sendNotificationEmail(to: string, input: { title: string; body?: string; href?: string }): Promise<void> {
  const cfg = await getMailConfig()
  if (!cfg.notifyByEmail || !cfg.smtp.host || !cfg.smtp.from) return
  const password = (await mailPassword('smtp')) ?? ''
  const lines = [input.title, '', input.body?.trim() || '', input.href ? `Open CreditOS: ${input.href}` : ''].filter(Boolean)
  await transport({ ...cfg.smtp, password }, password).sendMail({
    from: cfg.smtp.from,
    to,
    subject: input.title.slice(0, 120),
    text: lines.join('\n'),
  })
}
