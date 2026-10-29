import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { CONSENT_KINDS } from '#shared/constants'
import { getDb, schema } from '../../db'
import { requireUser } from '../../utils/auth'
import { readValidatedJson } from '../../utils/http'
import { audit } from '../../utils/audit'

const bodySchema = z.object({ kind: z.enum(CONSENT_KINDS), granted: z.boolean() })

export default defineEventHandler(async event => {
  const user = await requireUser(event)
  const body = await readValidatedJson(event, bodySchema)
  const db = getDb()
  const now = new Date()
  const existing = await db.query.consents.findFirst({ where: and(eq(schema.consents.userId, user.id), eq(schema.consents.kind, body.kind)) })
  if (existing) {
    await db.update(schema.consents).set({ granted: body.granted, grantedAt: body.granted ? now : existing.grantedAt, revokedAt: body.granted ? null : now, textVersion: 'v1' }).where(eq(schema.consents.id, existing.id))
  } else {
    await db.insert(schema.consents).values({ userId: user.id, kind: body.kind, granted: body.granted, grantedAt: body.granted ? now : null, revokedAt: body.granted ? null : now, textVersion: 'v1' })
  }
  await audit({ userId: user.id, actor: 'user', action: body.granted ? 'consent.grant' : 'consent.revoke', targetType: 'consent', targetId: body.kind, event })
  const row = await db.query.consents.findFirst({ where: and(eq(schema.consents.userId, user.id), eq(schema.consents.kind, body.kind)) })
  return { consent: row }
})
