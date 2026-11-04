import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { applyDatabaseConnection } from '../../plugins/boot'
import { getDb, schema } from '../../db'
import { requireUser } from '../../utils/auth'
import { audit } from '../../utils/audit'
import { redactConnectionError } from '../../utils/database-url'

const bodySchema = z.object({ connectionString: z.string().min(1).max(2000) })

/** Replace the saved Postgres connection. The signed-in owner is required. */
export default defineEventHandler(async event => {
  const user = await requireUser(event)
  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Paste a PostgreSQL connection string.' })
  try {
    const database = await applyDatabaseConnection(parsed.data.connectionString)
    const stillThere = await getDb().query.users.findFirst({ where: eq(schema.users.id, user.id), columns: { id: true } })
    if (!stillThere) await clearUserSession(event)
    else await audit({ userId: user.id, actor: 'user', action: 'settings.database', targetType: 'database', meta: { host: database.host, database: database.database }, event })
    return { ok: true, database, signedOut: !stillThere }
  } catch (error) {
    throw createError({ statusCode: 400, statusMessage: redactConnectionError(error, parsed.data.connectionString) })
  }
})
