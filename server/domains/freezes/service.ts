import { and, asc, desc, eq, inArray } from 'drizzle-orm'
import { assertFreezeTransition, type FreezeStatus } from '#shared/state-machines'
import { getDb, schema } from '../../db'
import type { FreezeRequest } from '../../db/schema'
import { liveBus } from '../../utils/events'
import { audit, notify } from '../../utils/audit'
import { FREEZE_AGENCIES } from './agencies'

export async function ensureAgencies(): Promise<void> {
  const db = getDb()
  for (const a of FREEZE_AGENCIES) {
    await db
      .insert(schema.freezeAgencies)
      .values({ ...a, supportsApi: false, lastVerifiedAt: new Date('2026-10-01T00:00:00Z') })
      .onConflictDoUpdate({
        target: schema.freezeAgencies.slug,
        set: { name: a.name, category: a.category, description: a.description, portalUrl: a.portalUrl, phone: a.phone, mailAddress: a.mailAddress, requestMethods: a.requestMethods, requiredEvidence: a.requiredEvidence, notes: a.notes, sortOrder: a.sortOrder },
      })
  }
}

export async function freezeMatrix(userId: string) {
  const db = getDb()
  const agencies = await db.select().from(schema.freezeAgencies).orderBy(asc(schema.freezeAgencies.sortOrder))
  const requests = await db.select().from(schema.freezeRequests).where(eq(schema.freezeRequests.userId, userId)).orderBy(desc(schema.freezeRequests.createdAt))
  const reqIds = requests.map(r => r.id)
  const events = reqIds.length ? await db.select().from(schema.freezeEvents).where(inArray(schema.freezeEvents.requestId, reqIds)).orderBy(asc(schema.freezeEvents.occurredAt)) : []
  return agencies.map(a => {
    const history = requests.filter(r => r.agencyId === a.id)
    const current = history[0] ?? null
    return {
      agency: a,
      current,
      history: history.map(r => ({ ...r, events: events.filter(e => e.requestId === r.id) })),
      effectiveStatus: (current?.status ?? 'NOT_STARTED') as FreezeStatus,
    }
  })
}

export async function startFreezeRequest(userId: string, agencySlug: string, action: 'freeze' | 'lift_temporary' | 'lift_permanent', method: 'online' | 'phone' | 'mail', opts: { liftStartAt?: Date; liftEndAt?: Date; notes?: string } = {}): Promise<FreezeRequest> {
  const db = getDb()
  const agency = await db.query.freezeAgencies.findFirst({ where: eq(schema.freezeAgencies.slug, agencySlug) })
  if (!agency) throw createError({ statusCode: 404, statusMessage: 'Agency not found' })
  const latest = await db.query.freezeRequests.findFirst({ where: and(eq(schema.freezeRequests.userId, userId), eq(schema.freezeRequests.agencyId, agency.id)), orderBy: [desc(schema.freezeRequests.createdAt)] })
  if (action !== 'freeze' && latest?.status !== 'CONFIRMED_FROZEN') {
    throw createError({ statusCode: 409, statusMessage: 'A lift can only be requested from a CONFIRMED_FROZEN state with uploaded confirmation.' })
  }
  if (action === 'freeze' && latest && !['NOT_STARTED', 'CONFIRMED_UNFROZEN', 'REJECTED', 'FAILED', 'UNKNOWN'].includes(latest.status)) {
    throw createError({ statusCode: 409, statusMessage: `A freeze request is already ${latest.status}. Update it instead of starting another.` })
  }
  if (action !== 'freeze' && latest) {
    // Lift flows are recorded on the same request row so history stays contiguous.
    const updated = await transitionFreeze(userId, latest.id, 'LIFT_REQUESTED', 'user', { note: opts.notes, patch: { action, requestMethod: method, liftStartAt: opts.liftStartAt ?? null, liftEndAt: opts.liftEndAt ?? null } })
    return updated
  }
  const [req] = await db
    .insert(schema.freezeRequests)
    .values({ userId, agencyId: agency.id, action, status: 'NOT_STARTED', requestMethod: method, notes: opts.notes ?? null, mode: 'live' })
    .returning()
  await db.insert(schema.freezeEvents).values({ requestId: req!.id, fromStatus: null, toStatus: 'NOT_STARTED', actor: 'user', note: 'Request created' })
  const prepared = await transitionFreeze(userId, req!.id, 'REQUEST_PREPARED', 'system', { note: `Guided ${method} workflow prepared for ${agency.name}. ${agency.supportsApi ? '' : 'No official API: submit through the agency channel, then record the submission.'}` })
  await audit({ userId, actor: 'user', action: 'freeze.start', targetType: 'freeze_request', targetId: req!.id, meta: { agency: agency.slug, method } })
  return prepared
}

export async function transitionFreeze(
  userId: string,
  requestId: string,
  to: FreezeStatus,
  actor: string,
  opts: { note?: string; evidenceDocumentId?: string; confirmationRef?: string; requestRef?: string; patch?: Partial<FreezeRequest> } = {},
): Promise<FreezeRequest> {
  const db = getDb()
  const req = await db.query.freezeRequests.findFirst({ where: and(eq(schema.freezeRequests.id, requestId), eq(schema.freezeRequests.userId, userId)) })
  if (!req) throw createError({ statusCode: 404, statusMessage: 'Freeze request not found' })
  const hasEvidence = !!(opts.evidenceDocumentId || opts.confirmationRef)
  try {
    assertFreezeTransition(req.status, to, hasEvidence)
  } catch (e) {
    throw createError({ statusCode: 409, statusMessage: e instanceof Error ? e.message : String(e) })
  }
  const patch: Partial<FreezeRequest> = { status: to, updatedAt: new Date(), ...(opts.patch ?? {}) }
  if (to === 'SUBMITTED') {
    patch.submittedAt = new Date()
    if (opts.requestRef) patch.requestRef = opts.requestRef
  }
  if (to === 'CONFIRMED_FROZEN' || to === 'CONFIRMED_UNFROZEN') {
    patch.confirmedAt = new Date()
    patch.confirmationDocumentId = opts.evidenceDocumentId ?? null
    patch.confirmationRef = opts.confirmationRef ?? null
  }
  if (to === 'FAILED' || to === 'REJECTED') patch.lastError = opts.note ?? null
  const [updated] = await db.update(schema.freezeRequests).set(patch).where(eq(schema.freezeRequests.id, requestId)).returning()
  await db.insert(schema.freezeEvents).values({ requestId, fromStatus: req.status, toStatus: to, actor, note: opts.note ?? null, evidenceDocumentId: opts.evidenceDocumentId ?? null })
  liveBus.publish('freeze.status', { requestId, from: req.status, to }, userId)
  if (to === 'CONFIRMED_FROZEN' || to === 'CONFIRMED_UNFROZEN' || to === 'REJECTED' || to === 'FAILED') {
    const agency = await db.query.freezeAgencies.findFirst({ where: eq(schema.freezeAgencies.id, req.agencyId) })
    await notify(userId, { kind: 'freeze', title: `${agency?.name ?? 'Agency'}: ${to.replace(/_/g, ' ').toLowerCase()}`, href: '/freezes', severity: to.startsWith('CONFIRMED') ? 'low' : 'medium' })
  }
  await audit({ userId, actor, action: 'freeze.transition', targetType: 'freeze_request', targetId: requestId, meta: { from: req.status, to, hasEvidence } })
  return updated!
}
