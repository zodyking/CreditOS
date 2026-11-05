import { and, asc, eq } from 'drizzle-orm'
import { MAX_UPLOAD_BYTES } from '#shared/constants'
import { getDb, schema } from '../../db'
import { env } from '../../utils/env'
import { UploadRejectedError } from '../documents/storage'
import { ingestManualUpload } from '../mailroom/service'
import { getMailConfig, patchMailRuntime } from './config'
import { fetchImapMessages, imapStatus, searchImapUids } from './imap'
import { textToPdf } from './pdf'
import { MAX_IMAP_MESSAGES, newestUids, usableAttachments } from './schema'

export interface ImapPollResult {
  imported: number
  skipped: number
  primed: boolean
  unseen: number | null
}

/**
 * `new` files mail that arrived after the saved cursor, oldest first, 20 per run.
 * The first run only records the cursor so an existing mailbox is not imported in bulk.
 * `unseen` files up to 20 messages already unread. It does not move the cursor.
 */
export async function pollImap(scope: 'new' | 'unseen'): Promise<ImapPollResult> {
  const cfg = await getMailConfig()
  if (!cfg.imap.host || !cfg.imap.username) return { imported: 0, skipped: 0, primed: false, unseen: null }
  const owner = await getDb().query.users.findFirst({ orderBy: [asc(schema.users.createdAt)] })
  if (!owner) return { imported: 0, skipped: 0, primed: false, unseen: null }

  try {
    if (scope === 'new' && cfg.imapCursor == null) {
      const status = await imapStatus(cfg.imap)
      const cursor = Math.max(0, (status.uidNext ?? 1) - 1)
      await patchMailRuntime({ imapCursor: cursor, imapLastCheckedAt: new Date().toISOString(), imapLastError: null, imapLastImported: 0 })
      return { imported: 0, skipped: 0, primed: true, unseen: status.unseen }
    }

    const found = scope === 'unseen'
      ? await searchImapUids(cfg.imap, { unseen: true })
      : await searchImapUids(cfg.imap, { uidFrom: (cfg.imapCursor ?? 0) + 1 })
    const pending = scope === 'unseen'
      ? newestUids(found.uids)
      : found.uids.filter(uid => uid > (cfg.imapCursor ?? 0)).sort((a, b) => a - b).slice(0, MAX_IMAP_MESSAGES)
    const { messages, skippedLarge } = await fetchImapMessages(cfg.imap, pending)
    let imported = 0
    let skipped = skippedLarge
    const mode = env.appMode === 'demo' ? 'demo' : 'live'
    const db = getDb()
    for (const message of messages) {
      const parts = usableAttachments(message.attachments, MAX_UPLOAD_BYTES)
      const files = parts.length
        ? parts.map((part, index) => ({ ...part, externalId: `imap:${message.uid}:${index}` }))
        : message.text.trim()
          ? [{
              filename: `email-${message.uid}.pdf`,
              content: await textToPdf(message.subject || 'Email', `From: ${message.from ?? 'unknown'}\nDate: ${(message.date ?? new Date()).toISOString()}\n\n${message.text}`),
              externalId: `imap:${message.uid}`,
            }]
          : []
      if (!files.length) {
        skipped += 1
        continue
      }
      let filed = false
      for (const file of files) {
        const dup = await db.query.inboundMail.findFirst({ where: and(eq(schema.inboundMail.provider, 'imap'), eq(schema.inboundMail.externalId, file.externalId)) })
        if (dup) continue
        try {
          await ingestManualUpload(owner.id, {
            buffer: file.content,
            filename: file.filename,
            senderName: message.from,
            receivedAt: message.date,
            provider: 'imap',
            externalId: file.externalId,
            mode,
          })
          filed = true
        } catch (error) {
          if (error instanceof UploadRejectedError) {
            skipped += 1
            continue
          }
          throw error
        }
      }
      if (filed) imported += 1
    }
    let cursor = scope === 'new' && pending.length ? pending[pending.length - 1]! : cfg.imapCursor
    if (scope === 'unseen' && cfg.imapCursor == null) cursor = Math.max(0, (found.uidNext ?? 1) - 1)
    await patchMailRuntime({
      imapCursor: cursor,
      imapLastCheckedAt: new Date().toISOString(),
      imapLastError: skipped ? `${skipped} message${skipped === 1 ? '' : 's'} skipped (too large, empty, or not a PDF, JPEG or PNG).` : null,
      imapLastImported: imported,
    })
    return { imported, skipped, primed: false, unseen: found.unseen }
  } catch (error) {
    const { friendlyMailError } = await import('./schema')
    await patchMailRuntime({ imapLastCheckedAt: new Date().toISOString(), imapLastError: friendlyMailError(error) }).catch(() => undefined)
    throw error
  }
}
