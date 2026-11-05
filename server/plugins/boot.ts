import { env } from '../utils/env'
import { closeDb, getDb, runMigrations } from '../db'
import { ensureStorage } from '../domains/documents/storage'
import { ensureAgencies } from '../domains/freezes/service'
import { registerAllJobHandlers, scheduleRecurring } from '../domains/jobs/handlers'
import { startWorker, stopWorker } from '../domains/jobs/queue'
import { seedDemo } from '../domains/seed/demo'
import { connectAndSave, resolveDatabaseUrl } from '../utils/database-store'
import { readSavedAppMode } from '../utils/app-mode'
import { redactConnectionError, type DatabaseDescription } from '../utils/database-url'

export interface BootState {
  ok: boolean
  databaseConfigured: boolean
  migrated: boolean
  seeded: boolean
  error: string | null
  startedAt: string
}

type NitroLike = { hooks: { hook: (name: string, fn: () => void) => void } }
const g = globalThis as unknown as { __creditosBoot?: BootState; __creditosNitro?: NitroLike; __creditosScheduler?: boolean }
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

/** Connect, migrate, seed and start the worker. Safe to call again after the connection string changes. */
export async function bootDatabase(): Promise<BootState> {
  const state: BootState = {
    ok: false,
    databaseConfigured: false,
    migrated: false,
    seeded: false,
    error: null,
    startedAt: g.__creditosBoot?.startedAt ?? new Date().toISOString(),
  }
  g.__creditosBoot = state
  let resolved: ReturnType<typeof resolveDatabaseUrl>
  try {
    resolved = resolveDatabaseUrl()
  } catch (error) {
    state.error = error instanceof Error ? error.message : String(error)
    console.error('[creditos] saved database connection could not be read:', state.error)
    return state
  }
  if (!resolved) {
    state.error = 'PostgreSQL is not connected yet.'
    console.info('[creditos] no database yet — open the app and paste a connection string.')
    return state
  }
  state.databaseConfigured = true
  try {
    if (env.autoMigrate) {
      await runMigrations()
      state.migrated = true
      console.info('[creditos] database migrations applied')
    }
    await ensureStorage()
    await ensureAgencies()
    if (env.demoSeed && readSavedAppMode() === 'demo') {
      const res = await seedDemo()
      state.seeded = res.seeded
      if (res.seeded) console.info('[creditos] synthetic demo dataset seeded (demo@creditos.local / creditos-demo)')
    }
    registerAllJobHandlers()
    startWorker(2000)
    await scheduleRecurring()
    const nitro = g.__creditosNitro
    if (nitro && !g.__creditosScheduler) {
      g.__creditosScheduler = true
      const recurring = setInterval(() => scheduleRecurring().catch(e => console.error('[creditos] scheduler failed', e)), 15 * 60_000)
      nitro.hooks.hook('close', () => {
        clearInterval(recurring)
        stopWorker()
      })
    }
    await getDb().execute('select 1')
    state.ok = true
    console.info(`[creditos] ready · mode=${env.appMode} · database=${resolved.source} · outbound=${env.mailOutboundProvider} · inbound=${env.mailInboundProvider}`)
  } catch (e) {
    state.error = e instanceof Error ? e.message : String(e)
    console.error('[creditos] boot failed:', state.error)
  }
  return state
}

/** Probe a connection string, store it encrypted, and reconnect. */
export async function applyDatabaseConnection(raw: string): Promise<DatabaseDescription> {
  try {
    const description = await connectAndSave(raw)
    await closeDb()
    const state = await bootDatabase()
    if (!state.ok) throw new Error(state.error || 'Connected, but startup did not finish.')
    return description
  } catch (error) {
    throw new Error(redactConnectionError(error, raw), { cause: error })
  }
}

export default defineNitroPlugin(async nitro => {
  g.__creditosNitro = nitro as unknown as NitroLike
  await bootDatabase()
})
