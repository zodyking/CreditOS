import { z } from 'zod'

export const MAIL_SECURITY = ['ssl', 'starttls', 'none'] as const
export type MailSecurity = (typeof MAIL_SECURITY)[number]

const HOST = /^[A-Za-z0-9._:-]+$/

export function validFromAddress(value: string): boolean {
  if (!value) return true
  return /^(?:[^<>]*<)?[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+>?$/.test(value)
}

const endpoint = {
  host: z.string().trim().max(253).refine(h => h === '' || HOST.test(h), 'Host must be a hostname or IP address'),
  port: z.coerce.number().int().min(1).max(65535),
  security: z.enum(MAIL_SECURITY),
  username: z.string().trim().max(320).default(''),
  password: z.string().max(500).optional(),
  clearPassword: z.boolean().optional(),
}

export const saveMailSchema = z.object({
  smtp: z.object({
    ...endpoint,
    from: z.string().trim().max(320).default('').refine(validFromAddress, 'From address must be an email'),
  }),
  imap: z.object({
    ...endpoint,
    mailbox: z.string().trim().max(200).default('INBOX'),
    poll: z.boolean().default(false),
  }),
  notifyByEmail: z.boolean().default(false),
})

export type SaveMailInput = z.infer<typeof saveMailSchema>

export const testMailSchema = saveMailSchema.extend({
  channel: z.enum(['smtp', 'imap']),
  to: z.string().trim().max(320).optional(),
})

export type TestMailInput = z.infer<typeof testMailSchema>

export const MAX_IMAP_MESSAGES = 20
export const MAX_IMAP_BYTES = 15 * 1024 * 1024

const ALLOWED_ATTACHMENT = new Set(['application/pdf', 'image/jpeg', 'image/png'])

export interface MailAttachment {
  filename?: string
  contentType: string
  content: Buffer
  size?: number
  related?: boolean
}

export interface InboundPart {
  filename: string
  content: Buffer
}

/** Keep PDF, JPEG and PNG attachments. Skip inline images and anything the mailroom cannot store. */
export function usableAttachments(attachments: MailAttachment[], maxBytes: number): InboundPart[] {
  const out: InboundPart[] = []
  for (const a of attachments) {
    if (a.related) continue
    const type = a.contentType.split(';')[0]?.trim().toLowerCase() ?? ''
    if (!ALLOWED_ATTACHMENT.has(type)) continue
    if (!a.content?.length || a.content.length > maxBytes) continue
    const ext = type === 'application/pdf' ? 'pdf' : type === 'image/png' ? 'png' : 'jpg'
    const name = a.filename?.trim() || `attachment.${ext}`
    out.push({ filename: name, content: a.content })
  }
  return out
}

/** Newest UIDs first, then returned oldest-to-newest so filing stays in arrival order. */
export function newestUids(uids: number[], limit = MAX_IMAP_MESSAGES): number[] {
  return [...new Set(uids.filter(n => Number.isInteger(n) && n > 0))].sort((a, b) => b - a).slice(0, limit).sort((a, b) => a - b)
}

export function friendlyMailError(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error)
  if (/auth|invalid credentials|authentication failed|login failed/i.test(msg)) return 'The server rejected the username or password.'
  if (/ENOTFOUND|getaddrinfo|EAI_AGAIN/i.test(msg)) return 'The host name did not resolve.'
  if (/ECONNREFUSED/.test(msg)) return 'The server refused the connection. Check the host and port.'
  if (/timed out|ETIMEDOUT|CONNECT_TIMEOUT|timeout/i.test(msg)) return 'The server did not respond in time.'
  if (/certificate|self signed|UNABLE_TO_VERIFY|CERT_/i.test(msg)) return 'TLS certificate check failed.'
  return msg.replace(/\s+/g, ' ').slice(0, 240)
}
