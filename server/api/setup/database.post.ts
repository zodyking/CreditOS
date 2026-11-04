import { z } from 'zod'
import { applyDatabaseConnection, getBootState } from '../../plugins/boot'
import { redactConnectionError } from '../../utils/database-url'

const bodySchema = z.object({ connectionString: z.string().min(1).max(2000) })

const attempts = new Map<string, { count: number; resetAt: number }>()

/** First launch, and recovery when the saved database cannot be reached. */
export default defineEventHandler(async event => {
  if (getBootState().ok) {
    throw createError({ statusCode: 409, statusMessage: 'Already connected. Change the database in Settings.' })
  }
  const ip = getRequestIP(event, { xForwardedFor: true }) ?? 'unknown'
  const now = Date.now()
  const slot = attempts.get(ip)
  if (slot && slot.resetAt > now && slot.count >= 8) {
    throw createError({ statusCode: 429, statusMessage: 'Too many attempts. Wait a few minutes and try again.' })
  }
  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Paste a PostgreSQL connection string.' })
  attempts.set(ip, { count: (slot && slot.resetAt > now ? slot.count : 0) + 1, resetAt: slot && slot.resetAt > now ? slot.resetAt : now + 10 * 60_000 })
  try {
    const database = await applyDatabaseConnection(parsed.data.connectionString)
    return { ok: true, database }
  } catch (error) {
    throw createError({ statusCode: 400, statusMessage: redactConnectionError(error, parsed.data.connectionString) })
  }
})
