import { rm } from 'node:fs/promises'
import { sql } from 'drizzle-orm'
import { requireDatabaseUrl } from './_bootstrap'
import { closeDb, getDb } from '../server/db'
import { env } from '../server/utils/env'

/**
 * Destructive: drops every CreditOS table and deletes stored documents.
 * Refuses to run in production unless --yes-i-am-sure is passed.
 */
requireDatabaseUrl()
if (env.isProduction && !process.argv.includes('--yes-i-am-sure')) {
  console.error('Refusing to reset a production database without --yes-i-am-sure')
  process.exit(1)
}
try {
  const db = getDb()
  await db.execute(sql`drop schema public cascade`)
  await db.execute(sql`create schema public`)
  await db.execute(sql`drop schema if exists drizzle cascade`)
  await rm(env.dataDir, { recursive: true, force: true })
  console.log('✔ database schema dropped and document storage cleared. Run `pnpm db:migrate` then `pnpm db:seed`.')
} catch (e) {
  console.error('✖ reset failed:', e instanceof Error ? e.message : e)
  process.exitCode = 1
} finally {
  await closeDb()
}
