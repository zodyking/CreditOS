import { z } from 'zod'
import { getDb, schema } from '../../db'
import { hasAnyUser, toSessionUser } from '../../utils/auth'
import { hashPasswordScrypt } from '../../utils/password'
import { audit } from '../../utils/audit'
import { ensureAgencies } from '../../domains/freezes/service'

const bodySchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(12, 'Use at least 12 characters').max(200),
  displayName: z.string().min(1).max(120),
})

/** First-run owner creation. Refuses once any user exists (owner-only MVP). */
export default defineEventHandler(async event => {
  if (await hasAnyUser()) throw createError({ statusCode: 409, statusMessage: 'An owner account already exists' })
  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.issues[0]?.message ?? 'Invalid input' })
  const db = getDb()
  const [user] = await db
    .insert(schema.users)
    .values({ email: parsed.data.email.toLowerCase(), passwordHash: await hashPasswordScrypt(parsed.data.password), displayName: parsed.data.displayName, role: 'owner' })
    .returning()
  await ensureAgencies()
  for (const bureau of ['equifax', 'experian', 'transunion'] as const) {
    await db.insert(schema.providerConnections).values({ userId: user!.id, kind: 'credit_data', provider: `manual:${bureau}`, mode: 'live', status: 'not_connected', config: { bureau } })
  }
  await setUserSession(event, { user: toSessionUser(user!), loggedInAt: new Date().toISOString() })
  await audit({ userId: user!.id, actor: 'user', action: 'auth.setup_owner', event })
  return { user: toSessionUser(user!) }
})
