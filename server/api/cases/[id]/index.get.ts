import { requireUser } from '../../../utils/auth'
import { requireParam } from '../../../utils/http'
import { getCaseDetail } from '../../../domains/cases/service'

export default defineEventHandler(async event => {
  const user = await requireUser(event)
  return getCaseDetail(user.id, requireParam(event, 'id'))
})
