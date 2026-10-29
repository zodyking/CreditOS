import { getBootState } from '../plugins/boot'
import { env } from '../utils/env'
import { getDb } from '../db'

export default defineEventHandler(async event => {
  const boot = getBootState()
  let database: 'ok' | 'error' | 'unconfigured' = 'unconfigured'
  if (env.hasDatabaseUrl) {
    try {
      await getDb().execute('select 1')
      database = 'ok'
    } catch {
      database = 'error'
    }
  }
  const ok = boot.ok && database === 'ok'
  setResponseStatus(event, ok ? 200 : 503)
  return {
    ok,
    version: useRuntimeConfig().public.appVersion,
    mode: env.appMode,
    database,
    migrated: boot.migrated,
    seeded: boot.seeded,
    error: boot.error,
    startedAt: boot.startedAt,
    now: new Date().toISOString(),
  }
})
