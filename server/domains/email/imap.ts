import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import { mailPassword } from './config'
import { MAX_IMAP_BYTES, type MailSecurity } from './schema'

export interface ImapTarget {
  host: string
  port: number
  security: MailSecurity
  username: string
  mailbox: string
  password?: string
}

export interface ImapStatus {
  messages: number | null
  unseen: number | null
  uidNext: number | null
}

function clientOptions(target: ImapTarget, password: string) {
  return {
    host: target.host,
    port: target.port,
    secure: target.security === 'ssl',
    doSTARTTLS: target.security === 'none' ? false : target.security === 'starttls' ? true : undefined,
    auth: { user: target.username, pass: password },
    logger: false as const,
    disableAutoIdle: true,
    connectionTimeout: 12_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    clientInfo: { name: 'CreditOS', version: '1.1.0' },
  }
}

async function resolvePassword(target: ImapTarget): Promise<string> {
  if (target.password?.trim()) return target.password
  return (await mailPassword('imap')) ?? ''
}

export async function withImap<T>(target: ImapTarget, fn: (client: ImapFlow) => Promise<T>): Promise<T> {
  if (!target.host) throw new Error('IMAP host is required')
  if (!target.username) throw new Error('IMAP username is required')
  const password = await resolvePassword(target)
  if (!password) throw new Error('IMAP password is required')
  const client = new ImapFlow(clientOptions(target, password))
  try {
    await client.connect()
    return await fn(client)
  } finally {
    await client.logout().catch(() => client.close())
  }
}

export async function imapStatus(target: ImapTarget): Promise<ImapStatus> {
  return withImap(target, async client => {
    const status = await client.status(target.mailbox || 'INBOX', { messages: true, unseen: true, uidNext: true })
    if (!status) throw new Error(`Mailbox ${target.mailbox || 'INBOX'} was not found`)
    return { messages: status.messages ?? null, unseen: status.unseen ?? null, uidNext: status.uidNext ?? null }
  })
}

function asDate(value: unknown): Date | undefined {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? undefined : date
  }
  return undefined
}

export interface FetchedMail {
  uid: number
  from?: string
  subject?: string
  date?: Date
  text: string
  attachments: { filename?: string; contentType: string; content: Buffer; size: number; related?: boolean }[]
}

export async function fetchImapMessages(target: ImapTarget, uids: number[]): Promise<{ messages: FetchedMail[]; skippedLarge: number }> {
  if (!uids.length) return { messages: [], skippedLarge: 0 }
  return withImap(target, async client => {
    const lock = await client.getMailboxLock(target.mailbox || 'INBOX')
    try {
      const sized: { uid: number; size: number }[] = []
      for await (const msg of client.fetch(uids, { uid: true, size: true }, { uid: true })) {
        if (msg.uid) sized.push({ uid: msg.uid, size: msg.size ?? 0 })
      }
      const accepted = sized.filter(m => m.size <= MAX_IMAP_BYTES).map(m => m.uid)
      const skippedLarge = sized.length - accepted.length
      const messages: FetchedMail[] = []
      if (accepted.length) {
        for await (const msg of client.fetch(accepted, { uid: true, envelope: true, internalDate: true, source: true }, { uid: true })) {
          if (!msg.uid || !msg.source) continue
          const parsed = await simpleParser(msg.source)
          const from = parsed.from?.value?.[0]
          const fromLabel = from ? (from.name && from.address ? `${from.name} <${from.address}>` : from.name || from.address) : undefined
          messages.push({
            uid: msg.uid,
            from: fromLabel,
            subject: parsed.subject,
            date: asDate(parsed.date) ?? asDate(msg.internalDate),
            text: parsed.text || '',
            attachments: parsed.attachments.map(a => ({ filename: a.filename, contentType: a.contentType, content: a.content, size: a.size, related: a.related })),
          })
        }
      }
      return { messages, skippedLarge }
    } finally {
      lock.release()
    }
  })
}

export async function searchImapUids(target: ImapTarget, query: { unseen?: boolean; uidFrom?: number }): Promise<{ uids: number[]; uidNext: number | null; unseen: number | null }> {
  return withImap(target, async client => {
    const status = await client.status(target.mailbox || 'INBOX', { unseen: true, uidNext: true })
    const lock = await client.getMailboxLock(target.mailbox || 'INBOX')
    try {
      const found = await client.search(query.unseen ? { seen: false } : { uid: `${query.uidFrom ?? 1}:*` }, { uid: true })
      const uids = Array.isArray(found) ? found : []
      return { uids, uidNext: status ? status.uidNext ?? null : null, unseen: status ? status.unseen ?? null : null }
    } finally {
      lock.release()
    }
  })
}
