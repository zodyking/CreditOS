import { env } from '../../utils/env'
import { hasAnyUser } from '../../utils/auth'
import { getBootState } from '../../plugins/boot'

export default defineEventHandler(async () => {
  const boot = getBootState()
  const hasUser = boot.ok ? await hasAnyUser().catch(() => false) : false
  return { hasUser, appMode: env.appMode, demoSeeded: boot.seeded, bootOk: boot.ok, bootError: boot.error }
})
