import { and, eq, inArray, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { getDb, schema } from '../../db'
import { requireUser } from '../../utils/auth'
import { readValidatedJson } from '../../utils/http'

const bodySchema = z.object({ ids: z.array(z.string().uuid()).max(200).optional(), all: z.boolean().optional() })

export default defineEventHandler(async event => {
  const user = await requireUser(event)
  const body = await readValidatedJson(event, bodySchema)
  const db = getDb()
  const where = [eq(schema.notifications.userId, user.id), isNull(schema.notifications.readAt)]
  if (!body.all) {
    if (!body.ids?.length) return { updated: 0 }
    where.push(inArray(schema.notifications.id, body.ids))
  }
  const rows = await db.update(schema.notifications).set({ readAt: new Date() }).where(and(...where)).returning({ id: schema.notifications.id })
  return { updated: rows.length }
})
