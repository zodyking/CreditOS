import { and, eq, inArray, lte, sql } from 'drizzle-orm'
import { getDb, schema } from '../../db'
import { notify } from '../../utils/audit'
import { createCaseFromDiscrepancy, transitionCase } from '../cases/service'
import { runCouncil } from '../council/orchestrator'
import { dispatchMailOrder, pollOrderStatus } from '../correspondence/mail'
import { analyzeInbound, extractInbound } from '../mailroom/service'
import { runDiscrepancyDetection } from '../reports/service'
import { enqueueJob, registerJobHandler } from './queue'

export function registerAllJobHandlers() {
  registerJobHandler('mail.dispatch', async p => dispatchMailOrder(String(p.orderId)))
  registerJobHandler('mail.poll_status', async p => pollOrderStatus(String(p.orderId)))
  registerJobHandler('inbound.extract', async p => {
    await extractInbound(String(p.inboundId))
  })
  registerJobHandler('inbound.match', async p => analyzeInbound(String(p.inboundId)))
  registerJobHandler('council.run', async p => {
    await runCouncil(String(p.caseId), (p.trigger as 'manual_rerun') ?? 'manual_rerun', String(p.actor ?? 'system'))
  })
  registerJobHandler('reports.detect_discrepancies', async p => {
    const userId = String(p.userId)
    const { created } = await runDiscrepancyDetection(userId)
    const user = await getDb().query.users.findFirst({ where: eq(schema.users.id, userId) })
    if (!user) return
    const db = getDb()
    const open = await db.select().from(schema.discrepancies).where(and(eq(schema.discrepancies.userId, userId), eq(schema.discrepancies.status, 'open')))
    for (const d of open) {
      const sufficient = d.actionable && Number(d.confidence) >= 0.6
      if (sufficient && user.automationMode !== 'observe_only') {
        const c = await createCaseFromDiscrepancy(userId, d.id, 'system')
        if (c.status === 'AGENT_REVIEW') await enqueueJob('council.run', { caseId: c.id, trigger: 'initial' }, { idempotencyKey: `council:initial:${c.id}` })
      } else {
        await db.update(schema.discrepancies).set({ status: 'review_suggested' }).where(eq(schema.discrepancies.id, d.id))
      }
    }
    if (created.length) await notify(userId, { kind: 'reports', title: `${created.length} new discrepanc${created.length === 1 ? 'y' : 'ies'} detected`, href: '/reports', severity: 'medium' })
  })
  registerJobHandler('monitoring.poll', async p => {
    const db = getDb()
    const userId = String(p.userId)
    const conns = await db.select().from(schema.providerConnections).where(and(eq(schema.providerConnections.userId, userId), eq(schema.providerConnections.kind, 'credit_data')))
    for (const c of conns) {
      // No licensed bureau provider is wired; polling records an honest "checked, nothing new" with the next eligible time.
      await db
        .update(schema.providerConnections)
        .set({ lastCheckedAt: new Date(), nextEligibleCheckAt: new Date(Date.now() + 24 * 60 * 60_000), status: c.mode === 'demo' ? 'healthy' : c.status === 'not_connected' ? 'not_connected' : c.status, lastError: c.mode === 'demo' ? null : 'No live credit-data provider connected; import reports manually.' })
        .where(eq(schema.providerConnections.id, c.id))
    }
  })
  registerJobHandler('deadline.check', async p => {
    const db = getDb()
    const caseId = String(p.caseId)
    const c = await db.query.cases.findFirst({ where: eq(schema.cases.id, caseId) })
    if (!c) return
    if (['SENT', 'DELIVERY_CONFIRMED', 'AWAITING_RESPONSE'].includes(c.status)) {
      await transitionCase(caseId, 'DISPUTED_STATUS_UNKNOWN', 'scheduler', { title: 'Review point reached without a response', detail: 'No response has been recorded. Check the bureau portal or upload any letter received.', nextAction: 'Check bureau portal / upload response' })
      await notify(c.userId, { kind: 'deadline', title: `${c.code}: no response by review point`, href: `/cases/${caseId}`, severity: 'high' })
    }
  })
  registerJobHandler('notification.send', async () => {
    /* in-app notifications are written directly; external channels are P2 */
  })
}

/** Enqueue periodic work once per hour per user using idempotency keys. */
export async function scheduleRecurring() {
  const db = getDb()
  const users = await db.select({ id: schema.users.id }).from(schema.users)
  const hour = new Date().toISOString().slice(0, 13)
  for (const u of users) {
    await enqueueJob('monitoring.poll', { userId: u.id }, { idempotencyKey: `monitoring.poll:${u.id}:${hour}` })
  }
  // Promote overdue next actions to notifications (daily key).
  const day = new Date().toISOString().slice(0, 10)
  const overdue = await db
    .select()
    .from(schema.cases)
    .where(and(lte(schema.cases.nextActionDueAt, new Date()), inArray(schema.cases.status, ['SENT', 'DELIVERY_CONFIRMED', 'AWAITING_RESPONSE'])))
  for (const c of overdue) {
    await enqueueJob('deadline.check', { caseId: c.id }, { idempotencyKey: `deadline:${c.id}:${day}` })
  }
  // Reap jobs stuck in running for > 15 minutes (crashed worker).
  await db
    .update(schema.jobs)
    .set({ status: 'pending', lockedAt: null, lockedBy: null, runAt: new Date() })
    .where(and(eq(schema.jobs.status, 'running'), sql`${schema.jobs.lockedAt} < now() - interval '15 minutes'`))
}
