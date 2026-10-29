import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { env } from './env'

const ALGO = 'aes-256-gcm'

let cachedKey: Buffer | null = null

function deriveKey(): Buffer {
  if (cachedKey) return cachedKey
  const raw = env.encryptionKey
  if (!raw) {
    if (env.isProduction) {
      throw new Error('APP_ENCRYPTION_KEY is required in production to store provider secrets.')
    }
    // Deterministic dev-only key so local restarts can still decrypt. Never used in production.
    cachedKey = createHash('sha256').update('creditos-dev-insecure-key').digest()
    return cachedKey
  }
  let buf: Buffer
  if (/^[0-9a-fA-F]{64}$/.test(raw)) buf = Buffer.from(raw, 'hex')
  else buf = Buffer.from(raw, 'base64')
  if (buf.length !== 32) {
    // Accept arbitrary passphrases by hashing them to 32 bytes.
    buf = createHash('sha256').update(raw).digest()
  }
  cachedKey = buf
  return buf
}

/** AES-256-GCM. Output format: base64(iv).base64(tag).base64(ciphertext) */
export function encryptSecret(plaintext: string): string {
  const key = deriveKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGO, key, iv)
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join('.')
}

export function decryptSecret(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split('.')
  if (!ivB64 || !tagB64 || !dataB64) throw new Error('Malformed encrypted payload')
  const key = deriveKey()
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivB64, 'base64'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8')
}

export function sha256Hex(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex')
}

export function hmacSha256Hex(secret: string, data: Buffer | string): string {
  return createHmac('sha256', secret).update(data).digest('hex')
}

export function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  try {
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'))
  } catch {
    return false
  }
}

export function randomToken(bytes = 16): string {
  return randomBytes(bytes).toString('hex')
}

/** Mask everything but the last 4 characters. */
export function maskTail(value: string, visible = 4): string {
  if (!value) return ''
  const tail = value.slice(-visible)
  return `${'•'.repeat(Math.max(0, value.length - visible))}${tail}`
}

/** Redact common PII patterns before anything reaches logs or external AI. */
export function redactPii(text: string): string {
  return text
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN-REDACTED]')
    .replace(/\b\d{9}\b/g, '[ID-REDACTED]')
    .replace(/\b(?:\d[ -]?){13,19}\b/g, m => `[ACCT-…${m.replace(/\D/g, '').slice(-4)}]`)
}
