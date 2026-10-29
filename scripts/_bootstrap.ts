/**
 * Minimal runtime shim so server domain modules (which rely on Nitro
 * auto-imports such as `createError`) can run from plain tsx scripts.
 */
import { createError } from 'h3'
import { config } from 'dotenv'

config({ path: '.env', quiet: true })

const g = globalThis as unknown as Record<string, unknown>
if (!g.createError) g.createError = createError

export function requireDatabaseUrl(): void {
  if (!process.env.DATABASE_URL && !process.env.NUXT_DATABASE_URL) {
    console.error('DATABASE_URL is not set. Export it (or put it in .env) and retry.')
    process.exit(1)
  }
}
