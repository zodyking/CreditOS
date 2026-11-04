import { existsSync, readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import postgres from 'postgres'
import { decryptSecret, encryptSecret } from './crypto'
import { assertPostgresConnectionString, describeConnection, type DatabaseDescription } from './database-url'
import { env } from './env'

const FILE_NAME = 'database.enc'

export type DatabaseSource = 'saved' | 'environment'

export interface ResolvedDatabase {
  url: string
  source: DatabaseSource
}

function filePath(): string {
  return resolve(env.dataDir, FILE_NAME)
}

function envDatabaseUrl(): string | undefined {
  const value = process.env.DATABASE_URL?.trim() || process.env.NUXT_DATABASE_URL?.trim()
  return value || undefined
}

function readSavedUrl(): string | null {
  const path = filePath()
  if (!existsSync(path)) return null
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as { v?: number; ciphertext?: string }
  if (!parsed.ciphertext) throw new Error('The saved database file is unreadable.')
  return decryptSecret(parsed.ciphertext)
}

/**
 * A connection saved from the app wins over DATABASE_URL, so editing it in
 * Settings is what the next request and the next boot use. DATABASE_URL stays
 * available for local development when nothing has been saved yet.
 */
export function resolveDatabaseUrl(): ResolvedDatabase | null {
  try {
    const saved = readSavedUrl()
    if (saved) return { url: saved, source: 'saved' }
  } catch (error) {
    const fromEnv = envDatabaseUrl()
    if (fromEnv) return { url: fromEnv, source: 'environment' }
    throw error
  }
  const fromEnv = envDatabaseUrl()
  if (fromEnv) return { url: fromEnv, source: 'environment' }
  return null
}

export function databasePublicStatus(): {
  configured: boolean
  source: DatabaseSource | null
  connection: DatabaseDescription | null
} {
  try {
    const resolved = resolveDatabaseUrl()
    if (!resolved) return { configured: false, source: null, connection: null }
    return { configured: true, source: resolved.source, connection: describeConnection(resolved.url) }
  } catch {
    return { configured: false, source: null, connection: null }
  }
}

export async function saveDatabaseUrl(connectionString: string): Promise<void> {
  const path = filePath()
  await mkdir(dirname(path), { recursive: true })
  const body = JSON.stringify({ v: 1, ciphertext: encryptSecret(connectionString) })
  await writeFile(path, body, { mode: 0o600 })
}

export async function connectAndSave(raw: string): Promise<DatabaseDescription> {
  const connectionString = assertPostgresConnectionString(raw)
  await probeDatabase(connectionString)
  await saveDatabaseUrl(connectionString)
  return describeConnection(connectionString)
}

export async function probeDatabase(connectionString: string): Promise<void> {
  const sql = postgres(connectionString, { max: 1, connect_timeout: 8, idle_timeout: 1, prepare: false, onnotice: () => {} })
  try {
    await sql`select 1 as ok`
  } finally {
    await sql.end({ timeout: 2 })
  }
}

export function exportSavedDatabaseUrl(): void {
  if (envDatabaseUrl()) return
  try {
    const saved = readSavedUrl()
    if (saved) process.env.DATABASE_URL = saved
  } catch {
    /* the caller reports a missing URL */
  }
}
