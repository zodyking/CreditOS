import { z } from 'zod'
import { requireUser } from '../../../utils/auth'
import { readValidatedJson } from '../../../utils/http'
import { startFreezeRequest } from '../../../domains/freezes/service'

const bodySchema = z.object({
  agencySlug: z.string().min(2).max(60),
  action: z.enum(['freeze', 'lift_temporary', 'lift_permanent']).default('freeze'),
  method: z.enum(['online', 'phone', 'mail']).default('online'),
  liftStartAt: z.string().datetime().optional(),
  liftEndAt: z.string().datetime().optional(),
  notes: z.string().max(2000).optional(),
})

export default defineEventHandler(async event => {
  const user = await requireUser(event)
  const body = await readValidatedJson(event, bodySchema)
  const request = await startFreezeRequest(user.id, body.agencySlug, body.action, body.method, {
    liftStartAt: body.liftStartAt ? new Date(body.liftStartAt) : undefined,
    liftEndAt: body.liftEndAt ? new Date(body.liftEndAt) : undefined,
    notes: body.notes,
  })
  return { request }
})
