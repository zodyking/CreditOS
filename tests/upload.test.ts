import { PDFDocument } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { UploadRejectedError, sanitizeFilename, validateUpload } from '../server/domains/documents/storage'

async function makePdf(pages = 1): Promise<Buffer> {
  const doc = await PDFDocument.create()
  for (let i = 0; i < pages; i++) doc.addPage([612, 792])
  return Buffer.from(await doc.save())
}

// Minimal valid 1x1 PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)

describe('validateUpload', () => {
  it('rejects empty files', async () => {
    await expect(validateUpload(Buffer.alloc(0), 'empty.pdf')).rejects.toBeInstanceOf(UploadRejectedError)
  })

  it('rejects files whose magic bytes are not PDF/JPEG/PNG regardless of extension', async () => {
    const fake = Buffer.from('MZ\x90\x00 this is not a pdf', 'latin1')
    await expect(validateUpload(fake, 'statement.pdf')).rejects.toThrow(/Unsupported or unrecognised/)
  })

  it('rejects dangerous declared extensions even when the bytes are valid', async () => {
    await expect(validateUpload(PNG, 'payload.html')).rejects.toThrow(/extension is not allowed/)
  })

  it('rejects PDFs containing active content', async () => {
    const pdf = await makePdf()
    const tampered = Buffer.concat([pdf, Buffer.from('\n<< /S /JavaScript /JS (app.alert(1)) >>\n')])
    await expect(validateUpload(tampered, 'evil.pdf')).rejects.toThrow(/active content/)
  })

  it('accepts a well-formed PDF and reports its page count', async () => {
    const res = await validateUpload(await makePdf(3), 'report.pdf')
    expect(res.mimeType).toBe('application/pdf')
    expect(res.pageCount).toBe(3)
  })

  it('accepts PNG images', async () => {
    const res = await validateUpload(PNG, 'id-card.png')
    expect(res.mimeType).toBe('image/png')
    expect(res.pageCount).toBe(1)
  })
})

describe('sanitizeFilename', () => {
  it('strips path separators and unsafe characters', () => {
    const out = sanitizeFilename('../../etc/passwd; rm -rf /.pdf')
    expect(out).not.toMatch(/[/\\]/)
    expect(out).not.toContain('..')
  })
})
