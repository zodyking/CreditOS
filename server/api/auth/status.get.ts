import { eq } from 'drizzle-orm'
import { getDb, schema } from '../../db'
import { env } from '../../utils/env'
import { hasAnyUser } from '../../utils/auth'
import { getBootState } from '../../plugins/boot'
import { DEMO_EMAIL } from '../../domains/seed/demo'

export default defineEventHandler(async () => {
  const boot = getBootState()
  const hasUser = boot.ok ? await hasAnyUser().catch(() => false) : false
  const demoSeeded = boot.ok && env.appMode === 'demo' ? !!(await getDb().query.users.findFirst({ where: eq(schema.users.email, DEMO_EMAIL), columns: { id: true } }).catch(() => null)) : false
  return { hasUser, appMode: env.appMode, demoSeeded, bootOk: boot.ok, bootError: boot.error }
})
