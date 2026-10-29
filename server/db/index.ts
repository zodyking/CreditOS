import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import * as schema from './schema'
import { env } from '../utils/env'

export type Db = PostgresJsDatabase<typeof schema>

let client: ReturnType<typeof postgres> | null = null
let db: Db | null = null

export function getDb(): Db {
  if (db) return db
  client = postgres(env.databaseUrl, {
    max: 10,
    idle_timeout: 30,
    connect_timeout: 10,
    prepare: false,
    onnotice: () => {},
  })
  db = drizzle(client, { schema })
  return db
}

export async function closeDb(): Promise<void> {
  if (client) await client.end({ timeout: 5 })
  client = null
  db = null
}

export function resolveMigrationsDir(): string {
  const candidates = [
    env.migrationsDir,
    resolve(process.cwd(), 'server/db/migrations'),
    resolve(process.cwd(), '../server/db/migrations'),
  ].filter(Boolean) as string[]
  for (const c of candidates) {
    if (existsSync(c)) return c
  }
  throw new Error(`Could not locate migrations directory (looked in ${candidates.join(', ')})`)
}

export async function runMigrations(): Promise<void> {
  const migrationsFolder = resolveMigrationsDir()
  await migrate(getDb(), { migrationsFolder })
}

export { schema }
