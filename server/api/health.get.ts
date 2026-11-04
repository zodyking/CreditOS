import { getBootState } from '../plugins/boot'
import { env } from '../utils/env'
import { getDb } from '../db'
import { databasePublicStatus } from '../utils/database-store'

export default defineEventHandler(async event => {
  const boot = getBootState()
  const configured = databasePublicStatus().configured
  let database: 'ok' | 'error' | 'unconfigured' = configured ? 'error' : 'unconfigured'
  if (configured) {
    try {
      await getDb().execute('select 1')
      database = 'ok'
    } catch {
      database = 'error'
    }
  }
  // Always answer 200 so a missing or down database does not crash-loop the container
  // before someone can open the setup page and paste a connection string.
  const ok = database === 'ok'
  setResponseStatus(event, 200)
  return {
    ok,
    version: useRuntimeConfig().public.appVersion,
    mode: env.appMode,
    database,
    migrated: boot.migrated,
    seeded: boot.seeded,
    error: database === 'ok' ? null : boot.error,
    startedAt: boot.startedAt,
    now: new Date().toISOString(),
  }
})
