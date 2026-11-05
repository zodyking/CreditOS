import { z } from 'zod'
import { APP_MODES } from '#shared/constants'
import { applyDatabaseConnection, getBootState } from '../../plugins/boot'
import { redactConnectionError } from '../../utils/database-url'
import { appModeChosen, readSavedAppMode, saveAppMode } from '../../utils/app-mode'
import { env } from '../../utils/env'
import { seedDemo } from '../../domains/seed/demo'

const bodySchema = z.object({
  mode: z.enum(APP_MODES).optional(),
  connectionString: z.string().min(1).max(2000).optional(),
})

const attempts = new Map<string, { count: number; resetAt: number }>()

/** First launch: choose Demo, Test, or Live, and connect PostgreSQL if needed. */
export default defineEventHandler(async event => {
  const boot = getBootState()
  const chosen = appModeChosen()
  if (boot.ok && chosen) {
    throw createError({ statusCode: 409, statusMessage: 'Already set up. Change the mode or database in Settings.' })
  }
  const ip = getRequestIP(event, { xForwardedFor: true }) ?? 'unknown'
  const now = Date.now()
  const slot = attempts.get(ip)
  if (slot && slot.resetAt > now && slot.count >= 8) {
    throw createError({ statusCode: 429, statusMessage: 'Too many attempts. Wait a few minutes and try again.' })
  }
  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Choose a mode to continue.' })
  if (!chosen && !parsed.data.mode) throw createError({ statusCode: 400, statusMessage: 'Choose Demo, Test, or Live.' })
  if (!boot.ok && !parsed.data.connectionString) throw createError({ statusCode: 400, statusMessage: 'Paste a PostgreSQL connection string.' })
  attempts.set(ip, { count: (slot && slot.resetAt > now ? slot.count : 0) + 1, resetAt: slot && slot.resetAt > now ? slot.resetAt : now + 10 * 60_000 })
  try {
    if (parsed.data.mode) await saveAppMode(parsed.data.mode)
    let database: { user: string; host: string; database: string } | undefined
    if (!boot.ok && parsed.data.connectionString) {
      database = await applyDatabaseConnection(parsed.data.connectionString)
    } else if (readSavedAppMode() === 'demo' && env.demoSeed) {
      const seeded = await seedDemo()
      getBootState().seeded = seeded.seeded || getBootState().seeded
    }
    return { ok: true, mode: readSavedAppMode(), database }
  } catch (error) {
    throw createError({ statusCode: 400, statusMessage: redactConnectionError(error, parsed.data.connectionString ?? '') })
  }
})
