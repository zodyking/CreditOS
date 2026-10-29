import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { getDb, schema } from '../../db'
import { toSessionUser } from '../../utils/auth'
import { verifyPasswordScrypt } from '../../utils/password'
import { audit } from '../../utils/audit'

const bodySchema = z.object({ email: z.string().email().max(200), password: z.string().min(1).max(200) })

// Simple in-memory throttle: 10 attempts / 10 minutes per IP+email.
const attempts = new Map<string, { count: number; resetAt: number }>()

export default defineEventHandler(async event => {
  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Email and password are required' })
  const { email, password } = parsed.data
  const ip = getRequestIP(event, { xForwardedFor: true }) ?? 'unknown'
  const key = `${ip}:${email.toLowerCase()}`
  const now = Date.now()
  const slot = attempts.get(key)
  if (slot && slot.resetAt > now && slot.count >= 10) throw createError({ statusCode: 429, statusMessage: 'Too many attempts. Try again in a few minutes.' })

  const db = getDb()
  const user = await db.query.users.findFirst({ where: eq(schema.users.email, email.toLowerCase()) })
  const ok = user ? await verifyPasswordScrypt(user.passwordHash, password) : false
  if (!user || !ok) {
    attempts.set(key, { count: (slot && slot.resetAt > now ? slot.count : 0) + 1, resetAt: slot && slot.resetAt > now ? slot.resetAt : now + 10 * 60_000 })
    await audit({ actor: 'anonymous', action: 'auth.login_failed', meta: { email }, event })
    throw createError({ statusCode: 401, statusMessage: 'Invalid email or password' })
  }
  attempts.delete(key)
  await db.update(schema.users).set({ lastLoginAt: new Date() }).where(eq(schema.users.id, user.id))
  await setUserSession(event, { user: toSessionUser(user), loggedInAt: new Date().toISOString() })
  await audit({ userId: user.id, actor: 'user', action: 'auth.login', event })
  return { user: toSessionUser(user) }
})
