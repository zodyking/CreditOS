import { z } from 'zod'
import { APP_MODES } from '#shared/constants'
import { requireUser } from '../../utils/auth'
import { audit } from '../../utils/audit'
import { saveAppMode } from '../../utils/app-mode'
import { env } from '../../utils/env'
import { seedDemo } from '../../domains/seed/demo'
import { getBootState } from '../../plugins/boot'

const bodySchema = z.object({ mode: z.enum(APP_MODES) })

/** Switch Demo, Test, or Live without an environment variable or a restart. */
export default defineEventHandler(async event => {
  const user = await requireUser(event)
  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Choose Demo, Test, or Live.' })
  await saveAppMode(parsed.data.mode)
  if (parsed.data.mode === 'demo' && env.demoSeed) {
    const seeded = await seedDemo()
    if (seeded.seeded) getBootState().seeded = true
  }
  await audit({ userId: user.id, actor: 'user', action: 'settings.mode', targetType: 'app', meta: { mode: parsed.data.mode }, event })
  return { ok: true, mode: parsed.data.mode }
})
