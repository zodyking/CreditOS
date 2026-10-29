import { and, eq } from 'drizzle-orm'
import { getDb, schema } from '../../../../db'
import { requireUser } from '../../../../utils/auth'
import { requireParam } from '../../../../utils/http'
import { audit } from '../../../../utils/audit'

export default defineEventHandler(async event => {
  const user = await requireUser(event)
  const id = requireParam(event, 'id')
  const db = getDb()
  const [row] = await db
    .update(schema.discrepancies)
    .set({ status: 'dismissed' })
    .where(and(eq(schema.discrepancies.id, id), eq(schema.discrepancies.userId, user.id)))
    .returning()
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Discrepancy not found' })
  await audit({ userId: user.id, actor: 'user', action: 'discrepancy.dismiss', targetType: 'discrepancy', targetId: id, event })
  return { discrepancy: row }
})
