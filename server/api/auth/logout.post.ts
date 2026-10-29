import { audit } from '../../utils/audit'

export default defineEventHandler(async event => {
  const session = await getUserSession(event)
  await clearUserSession(event)
  if (session.user) await audit({ userId: session.user.id, actor: 'user', action: 'auth.logout', event })
  return { ok: true }
})
