import type { H3Event } from 'h3'
import type { z } from 'zod'
import { MAX_UPLOAD_BYTES } from '#shared/constants'

/** Parse and validate a JSON body, returning a 400 with the first issue on failure. */
export async function readValidatedJson<T extends z.ZodTypeAny>(event: H3Event, schema: T): Promise<z.infer<T>> {
  const raw = await readBody(event).catch(() => undefined)
  const parsed = schema.safeParse(raw ?? {})
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    throw createError({ statusCode: 400, statusMessage: issue ? `${issue.path.join('.') || 'body'}: ${issue.message}` : 'Invalid request body' })
  }
  return parsed.data
}

export interface UploadedFile {
  buffer: Buffer
  filename: string
  fieldName: string
}

/** Read a multipart upload. Returns the first file plus all text fields. */
export async function readUpload(event: H3Event, fileField = 'file'): Promise<{ file: UploadedFile | null; fields: Record<string, string> }> {
  const parts = await readMultipartFormData(event)
  if (!parts) throw createError({ statusCode: 400, statusMessage: 'Expected multipart/form-data' })
  let file: UploadedFile | null = null
  const fields: Record<string, string> = {}
  for (const p of parts) {
    if (p.filename && (p.name === fileField || !file)) {
      if (p.data.length > MAX_UPLOAD_BYTES) throw createError({ statusCode: 413, statusMessage: 'File exceeds the upload size limit' })
      if (!file) file = { buffer: Buffer.from(p.data), filename: p.filename, fieldName: p.name ?? fileField }
    } else if (p.name) {
      fields[p.name] = p.data.toString('utf8')
    }
  }
  return { file, fields }
}

export function requireParam(event: H3Event, name: string): string {
  const v = getRouterParam(event, name)
  if (!v) throw createError({ statusCode: 400, statusMessage: `Missing ${name}` })
  return v
}
