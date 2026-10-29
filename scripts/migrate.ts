import { requireDatabaseUrl } from './_bootstrap'
import { closeDb, runMigrations } from '../server/db'

requireDatabaseUrl()
try {
  await runMigrations()
  console.log('✔ migrations applied')
} catch (e) {
  console.error('✖ migration failed:', e instanceof Error ? e.message : e)
  process.exitCode = 1
} finally {
  await closeDb()
}
