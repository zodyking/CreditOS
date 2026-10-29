import { requireUser } from '../../utils/auth'
import { listCases } from '../../domains/cases/service'

export default defineEventHandler(async event => {
  const user = await requireUser(event)
  const q = getQuery(event)
  const cases = await listCases(user.id, {
    status: q.status ? String(q.status) : undefined,
    category: q.category ? String(q.category) : undefined,
    bureau: q.bureau ? String(q.bureau) : undefined,
    q: q.q ? String(q.q) : undefined,
    open: q.open === 'true' || q.open === '1',
  })
  return { cases }
})
