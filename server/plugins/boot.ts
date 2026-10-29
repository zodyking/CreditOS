import { env } from '../utils/env'
import { getDb, runMigrations } from '../db'
import { ensureStorage } from '../domains/documents/storage'
import { ensureAgencies } from '../domains/freezes/service'
import { registerAllJobHandlers, scheduleRecurring } from '../domains/jobs/handlers'
import { startWorker, stopWorker } from '../domains/jobs/queue'
import { seedDemo } from '../domains/seed/demo'

export interface BootState {
  ok: boolean
  databaseConfigured: boolean
  migrated: boolean
  seeded: boolean
  error: string | null
  startedAt: string
}

const g = globalThis as unknown as { __creditosBoot?: BootState }
export function getBootState(): BootState {
  return (
    g.__creditosBoot ?? {
      ok: false,
      databaseConfigured: false,
      migrated: false,
      seeded: false,
      error: 'booting',
      startedAt: new Date().toISOString(),
    }
  )
}

export default defineNitroPlugin(async nitro => {
  const state: BootState = { ok: false, databaseConfigured: env.hasDatabaseUrl, migrated: false, seeded: false, error: null, startedAt: new Date().toISOString() }
  g.__creditosBoot = state
  if (!env.hasDatabaseUrl) {
    state.error = 'DATABASE_URL is not configured'
    console.error('[creditos] DATABASE_URL is not set — the app will serve the setup page only.')
    return
  }
  try {
    if (env.autoMigrate) {
      await runMigrations()
      state.migrated = true
      console.info('[creditos] database migrations applied')
    }
    await ensureStorage()
    await ensureAgencies()
    if (env.demoSeed && env.appMode === 'demo') {
      const res = await seedDemo()
      state.seeded = res.seeded
      if (res.seeded) console.info('[creditos] synthetic demo dataset seeded (demo@creditos.local / creditos-demo)')
    }
    registerAllJobHandlers()
    startWorker(2000)
    await scheduleRecurring()
    const recurring = setInterval(() => scheduleRecurring().catch(e => console.error('[creditos] scheduler failed', e)), 15 * 60_000)
    nitro.hooks.hook('close', () => {
      clearInterval(recurring)
      stopWorker()
    })
    // Warm the pool so /api/health reflects real connectivity.
    await getDb().execute('select 1')
    state.ok = true
    console.info(`[creditos] ready · mode=${env.appMode} · outbound=${env.mailOutboundProvider} · inbound=${env.mailInboundProvider}`)
  } catch (e) {
    state.error = e instanceof Error ? e.message : String(e)
    console.error('[creditos] boot failed:', state.error)
  }
})
