import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { AUTOMATION_MODES } from '#shared/constants'
import { getDb, schema } from '../../db'
import { requireUser, toSessionUser } from '../../utils/auth'
import { readValidatedJson } from '../../utils/http'
import { audit } from '../../utils/audit'
import { hashPasswordScrypt, verifyPasswordScrypt } from '../../utils/password'

const addressSchema = z.object({
  name: z.string().min(1).max(120),
  line1: z.string().min(1).max(120),
  line2: z.string().max(120).optional(),
  city: z.string().min(1).max(80),
  state: z.string().length(2),
  postalCode: z.string().regex(/^\d{5}(-\d{4})?$/, 'ZIP must be 5 digits (optionally ZIP+4)'),
  country: z.string().length(2).default('US'),
})

const bodySchema = z.object({
  displayName: z.string().min(1).max(120).optional(),
  automationMode: z.enum(AUTOMATION_MODES).optional(),
  mailingAddress: addressSchema.nullable().optional(),
  currentPassword: z.string().max(200).optional(),
  newPassword: z.string().min(12).max(200).optional(),
})

export default defineEventHandler(async event => {
  const user = await requireUser(event)
  const body = await readValidatedJson(event, bodySchema)
  const db = getDb()
  const patch: Partial<typeof user> = { updatedAt: new Date() }
  if (body.displayName) patch.displayName = body.displayName
  if (body.automationMode) patch.automationMode = body.automationMode
  if (body.mailingAddress !== undefined) patch.mailingAddress = body.mailingAddress
  if (body.newPassword) {
    if (!body.currentPassword || !(await verifyPasswordScrypt(user.passwordHash, body.currentPassword))) {
      throw createError({ statusCode: 403, statusMessage: 'Current password is incorrect' })
    }
    patch.passwordHash = await hashPasswordScrypt(body.newPassword)
  }
  const [updated] = await db.update(schema.users).set(patch).where(eq(schema.users.id, user.id)).returning()
  await setUserSession(event, { user: toSessionUser(updated!) })
  await audit({ userId: user.id, actor: 'user', action: 'settings.profile_update', meta: { fields: Object.keys(body).filter(k => !/password/i.test(k)), passwordChanged: !!body.newPassword }, event })
  return { profile: { displayName: updated!.displayName, automationMode: updated!.automationMode, mailingAddress: updated!.mailingAddress } }
})
