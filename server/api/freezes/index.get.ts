import { requireUser } from '../../utils/auth'
import { freezeMatrix } from '../../domains/freezes/service'

export default defineEventHandler(async event => {
  const user = await requireUser(event)
  const matrix = await freezeMatrix(user.id)
  return { matrix }
})
