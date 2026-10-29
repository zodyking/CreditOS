import { requireUser } from '../../../utils/auth'
import { requireParam } from '../../../utils/http'
import { audit } from '../../../utils/audit'
import { deleteDocument } from '../../../domains/documents/storage'

export default defineEventHandler(async event => {
  const user = await requireUser(event)
  const id = requireParam(event, 'id')
  await deleteDocument(user.id, id)
  await audit({ userId: user.id, actor: 'user', action: 'document.delete', targetType: 'document', targetId: id, event })
  return { ok: true }
})
