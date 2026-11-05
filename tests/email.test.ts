import { PDFDocument } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { textToPdf } from '../server/domains/email/pdf'
import { friendlyMailError, newestUids, saveMailSchema, usableAttachments, validFromAddress } from '../server/domains/email/schema'
import { extractText } from '../server/domains/mailroom/extract'
import { validateUpload } from '../server/domains/documents/storage'

describe('mailbox settings', () => {
  it('accepts a normal SMTP and IMAP setup and drops the password from the parsed host fields', () => {
    const parsed = saveMailSchema.parse({
      smtp: { host: 'smtp.example.com', port: '587', security: 'starttls', username: 'ada@example.com', password: 'secret', from: 'CreditOS <ada@example.com>' },
      imap: { host: 'imap.example.com', port: 993, security: 'ssl', username: 'ada@example.com', password: 'secret', mailbox: 'INBOX', poll: true },
      notifyByEmail: true,
    })
    expect(parsed.smtp.port).toBe(587)
    expect(parsed.smtp.password).toBe('secret')
    expect(parsed.imap.poll).toBe(true)
  })

  it('rejects a host that is not a hostname', () => {
    const parsed = saveMailSchema.safeParse({
      smtp: { host: 'https://smtp.example.com/path', port: 587, security: 'starttls', from: '' },
      imap: { host: '', port: 993, security: 'ssl' },
    })
    expect(parsed.success).toBe(false)
  })

  it('accepts an empty from address and a display-name from address', () => {
    expect(validFromAddress('')).toBe(true)
    expect(validFromAddress('CreditOS <ada@example.com>')).toBe(true)
    expect(validFromAddress('not an email')).toBe(false)
  })
})

describe('IMAP message selection', () => {
  it('keeps the newest 20 UIDs and returns them oldest first', () => {
    const uids = Array.from({ length: 30 }, (_, i) => i + 1)
    expect(newestUids(uids)).toEqual(Array.from({ length: 20 }, (_, i) => i + 11))
  })

  it('keeps pdf and image attachments and drops everything else', () => {
    const pdf = Buffer.from('%PDF')
    const png = Buffer.from('png')
    const parts = usableAttachments([
      { filename: 'letter.pdf', contentType: 'application/pdf', content: pdf, size: pdf.length },
      { filename: 'scan.png', contentType: 'image/png; name=scan.png', content: png, size: png.length },
      { filename: 'notes.txt', contentType: 'text/plain', content: Buffer.from('hello'), size: 5 },
      { filename: 'pixel.png', contentType: 'image/png', content: png, size: png.length, related: true },
      { contentType: 'image/jpeg', content: Buffer.alloc(0), size: 0 },
    ], 1024)
    expect(parts.map(p => p.filename)).toEqual(['letter.pdf', 'scan.png'])
  })

  it('turns connection failures into a short message', () => {
    expect(friendlyMailError(new Error('Invalid credentials (Failure)'))).toMatch(/username or password/)
    expect(friendlyMailError(new Error('getaddrinfo ENOTFOUND mail.example'))).toMatch(/did not resolve/)
    expect(friendlyMailError(Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:993'), { code: 'ECONNREFUSED' }))).toMatch(/refused/)
  })
})

describe('email body pdf', () => {
  it('builds a PDF whose text layer contains the message', async () => {
    const body = 'Equifax confirmed the security freeze on November 2, 2026. Reference ZF-100200.'
    const pdf = await textToPdf('Security freeze confirmation', body)
    const validated = await validateUpload(pdf, 'email.pdf')
    expect(validated.mimeType).toBe('application/pdf')
    expect(validated.pageCount).toBeGreaterThan(0)
    const extracted = await extractText(pdf, 'application/pdf')
    expect(extracted.pages.join('\n')).toContain('security freeze')
    const reopened = await PDFDocument.load(pdf)
    expect(reopened.getPageCount()).toBeGreaterThan(0)
  })
})
