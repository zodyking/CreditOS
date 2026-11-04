/**
 * Minimal runtime shim so server domain modules (which rely on Nitro
 * auto-imports such as `createError`) can run from plain tsx scripts.
 */
import { createError } from 'h3'
import { config } from 'dotenv'
import { exportSavedDatabaseUrl } from '../server/utils/database-store'

config({ path: '.env', quiet: true })
exportSavedDatabaseUrl()

const g = globalThis as unknown as Record<string, unknown>
if (!g.createError) g.createError = createError

export function requireDatabaseUrl(): void {
  if (!process.env.DATABASE_URL && !process.env.NUXT_DATABASE_URL) {
    console.error('No database connection. Set DATABASE_URL, or paste one in the app first so it is saved in DATA_DIR.')
    process.exit(1)
  }
}
