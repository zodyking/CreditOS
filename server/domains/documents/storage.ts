import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { fileTypeFromBuffer } from 'file-type'
import { PDFDocument } from 'pdf-lib'
import { ALLOWED_UPLOAD_MIME, MAX_UPLOAD_BYTES, type DataMode, type DocumentKind } from '#shared/constants'
import { getDb, schema } from '../../db'
import type { Document } from '../../db/schema'
import { env } from '../../utils/env'
import { sha256Hex } from '../../utils/crypto'

export class UploadRejectedError extends Error {
  constructor(public reason: string) {
    super(reason)
    this.name = 'UploadRejectedError'
  }
}

function documentsDir(): string {
  return resolve(env.dataDir, 'documents')
}

export async function ensureStorage(): Promise<void> {
  await mkdir(documentsDir(), { recursive: true })
}

const EXT: Record<string, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' }

export interface ValidatedUpload {
  mimeType: string
  pageCount: number | null
  warnings: string[]
}

/**
 * Validate an upload by magic bytes and structure, not by the client-declared
 * content type. PDFs containing active content are rejected outright.
 */
export async function validateUpload(buffer: Buffer, declaredName: string): Promise<ValidatedUpload> {
  if (buffer.length === 0) throw new UploadRejectedError('Empty file')
  if (buffer.length > MAX_UPLOAD_BYTES) throw new UploadRejectedError(`File exceeds ${MAX_UPLOAD_BYTES / 1024 / 1024} MB limit`)
  const ft = await fileTypeFromBuffer(buffer)
  if (!ft || !(ALLOWED_UPLOAD_MIME as readonly string[]).includes(ft.mime)) {
    throw new UploadRejectedError(`Unsupported or unrecognised file type${ft ? ` (${ft.mime})` : ''}. Allowed: PDF, JPEG, PNG.`)
  }
  if (/\.(exe|js|html?|svg|bat|sh|cmd|scr|zip)$/i.test(declaredName)) {
    throw new UploadRejectedError('File extension is not allowed')
  }
  const warnings: string[] = []
  let pageCount: number
  if (ft.mime === 'application/pdf') {
    const head = buffer.subarray(0, Math.min(buffer.length, 4 * 1024 * 1024)).toString('latin1')
    if (/\/(JavaScript|JS|Launch|OpenAction|AA|EmbeddedFile|RichMedia|XFA)\b/.test(head)) {
      throw new UploadRejectedError('PDF contains active content (JavaScript, launch actions, or embedded files) and was rejected')
    }
    try {
      const pdf = await PDFDocument.load(buffer, { ignoreEncryption: false, updateMetadata: false })
      pageCount = pdf.getPageCount()
      if (pageCount === 0) throw new UploadRejectedError('PDF has no pages')
      if (pageCount > 200) throw new UploadRejectedError('PDF exceeds 200 pages')
    } catch (e) {
      if (e instanceof UploadRejectedError) throw e
      const msg = e instanceof Error ? e.message : String(e)
      if (/encrypted/i.test(msg)) throw new UploadRejectedError('Encrypted PDFs are not accepted; remove the password first')
      throw new UploadRejectedError(`PDF could not be parsed: ${msg.slice(0, 120)}`)
    }
  } else {
    pageCount = 1
  }
  return { mimeType: ft.mime, pageCount, warnings }
}

export async function storeDocument(input: {
  userId: string
  buffer: Buffer
  filename: string
  kind: DocumentKind
  caseId?: string | null
  source?: string
  mode?: DataMode
  title?: string
  sensitivity?: 'standard' | 'sensitive'
  skipValidation?: boolean
  mimeType?: string
  pageCount?: number | null
}): Promise<Document> {
  await ensureStorage()
  let mimeType = input.mimeType ?? 'application/octet-stream'
  let pageCount: number | null = input.pageCount ?? null
  if (!input.skipValidation) {
    const v = await validateUpload(input.buffer, input.filename)
    mimeType = v.mimeType
    pageCount = v.pageCount
  }
  const sha = sha256Hex(input.buffer)
  const id = randomUUID()
  const ext = EXT[mimeType] ?? 'bin'
  const rel = `${id}.${ext}`
  await writeFile(join(documentsDir(), rel), input.buffer, { mode: 0o600 })
  const db = getDb()
  const [doc] = await db
    .insert(schema.documents)
    .values({
      id,
      userId: input.userId,
      caseId: input.caseId ?? null,
      kind: input.kind,
      filename: sanitizeFilename(input.filename),
      mimeType,
      sizeBytes: input.buffer.length,
      sha256: sha,
      storagePath: rel,
      pageCount,
      sensitivity: input.sensitivity ?? 'sensitive',
      source: input.source ?? 'upload',
      mode: input.mode ?? 'live',
      title: input.title ?? null,
    })
    .returning()
  return doc!
}

export async function readDocument(doc: Pick<Document, 'storagePath'>): Promise<Buffer> {
  const p = join(documentsDir(), doc.storagePath)
  if (!existsSync(p)) throw createError({ statusCode: 410, statusMessage: 'Document file is missing from storage' })
  return readFile(p)
}

export async function deleteDocument(userId: string, id: string): Promise<void> {
  const db = getDb()
  const doc = await db.query.documents.findFirst({ where: eq(schema.documents.id, id) })
  if (!doc || doc.userId !== userId) throw createError({ statusCode: 404, statusMessage: 'Document not found' })
  await db.update(schema.documents).set({ deletedAt: new Date() }).where(eq(schema.documents.id, id))
  try {
    await unlink(join(documentsDir(), doc.storagePath))
  } catch {
    /* already gone */
  }
}

export function sanitizeFilename(name: string): string {
  return (
    name
      .replace(/[^\w.\- ()]/g, '_')
      .replace(/\.{2,}/g, '.')
      .replace(/^[. ]+/, '')
      .slice(0, 140) || 'document'
  )
}
