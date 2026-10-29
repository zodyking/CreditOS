import { requireDatabaseUrl } from './_bootstrap'
import { closeDb, runMigrations } from '../server/db'
import { ensureStorage } from '../server/domains/documents/storage'
import { registerAllJobHandlers } from '../server/domains/jobs/handlers'
import { DEMO_EMAIL, DEMO_PASSWORD, seedDemo } from '../server/domains/seed/demo'

requireDatabaseUrl()
const force = process.argv.includes('--force')
try {
  await runMigrations()
  await ensureStorage()
  registerAllJobHandlers()
  const res = await seedDemo({ force })
  if (res.seeded) console.log(`✔ synthetic demo dataset seeded — sign in as ${DEMO_EMAIL} / ${DEMO_PASSWORD}`)
  else console.log(`· seed skipped (${res.reason}). Use --force to seed alongside existing users.`)
} catch (e) {
  console.error('✖ seed failed:', e instanceof Error ? e.stack ?? e.message : e)
  process.exitCode = 1
} finally {
  await closeDb()
}
