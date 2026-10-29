import { and, desc, eq, gte, inArray, isNull, sql } from 'drizzle-orm'
import { BUREAUS } from '#shared/constants'
import { getDb, schema } from '../db'
import { requireUser } from '../utils/auth'
import { env } from '../utils/env'
import { latestSnapshots } from '../domains/reports/service'
import { freezeMatrix } from '../domains/freezes/service'
import { getOutboundProvider } from '../domains/correspondence/outbound'
import { activeInboundProvider } from '../domains/mailroom/providers'
import { resolveOpenRouterKey, getAiConfig } from '../domains/settings/service'

export default defineEventHandler(async event => {
  const user = await requireUser(event)
  const db = getDb()
  const uid = user.id

  const [snaps, matrix, connections, aiKey, aiConfig] = await Promise.all([latestSnapshots(uid), freezeMatrix(uid), db.select().from(schema.providerConnections).where(eq(schema.providerConnections.userId, uid)), resolveOpenRouterKey(), getAiConfig()])

  const count = async (where: ReturnType<typeof and>) => {
    const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.cases).where(where)
    return r?.n ?? 0
  }
  const [openCases, awaitingApproval, awaitingResponse, needsEvidence] = await Promise.all([
    count(and(eq(schema.cases.userId, uid), sql`${schema.cases.status} not in ('RESOLVED','CLOSED','CANCELLED','DUPLICATE')`)),
    count(and(eq(schema.cases.userId, uid), eq(schema.cases.status, 'AWAITING_APPROVAL'))),
    count(and(eq(schema.cases.userId, uid), inArray(schema.cases.status, ['SENT', 'DELIVERY_CONFIRMED', 'AWAITING_RESPONSE', 'DISPUTED_STATUS_UNKNOWN']))),
    count(and(eq(schema.cases.userId, uid), eq(schema.cases.status, 'NEEDS_EVIDENCE'))),
  ])
  const [[discOpen], [lettersSent], [unreadInbound], [unassigned], [responsesToReview], [newAlerts]] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(schema.discrepancies).where(and(eq(schema.discrepancies.userId, uid), inArray(schema.discrepancies.status, ['open', 'review_suggested']))),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.mailOrders).where(and(eq(schema.mailOrders.userId, uid), inArray(schema.mailOrders.status, ['PROVIDER_ACCEPTED', 'PRINTED', 'MAILED', 'DELIVERY_CONFIRMED', 'TRACKING_UNKNOWN']))),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.inboundMail).where(and(eq(schema.inboundMail.userId, uid), eq(schema.inboundMail.unread, true))),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.inboundMail).where(and(eq(schema.inboundMail.userId, uid), eq(schema.inboundMail.status, 'UNASSIGNED'))),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.cases).where(and(eq(schema.cases.userId, uid), inArray(schema.cases.status, ['RESPONSE_RECEIVED', 'RESPONSE_ANALYSIS', 'FOLLOW_UP_RECOMMENDED', 'ESCALATION_REVIEW']))),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.monitoringEvents).where(and(eq(schema.monitoringEvents.userId, uid), eq(schema.monitoringEvents.status, 'new'))),
  ])

  const recentCases = await db.select().from(schema.cases).where(eq(schema.cases.userId, uid)).orderBy(desc(schema.cases.updatedAt)).limit(6)
  const allCaseIds = (await db.select({ id: schema.cases.id }).from(schema.cases).where(eq(schema.cases.userId, uid))).map(c => c.id)
  const timeline = allCaseIds.length
    ? await db
        .select({ id: schema.caseEvents.id, caseId: schema.caseEvents.caseId, kind: schema.caseEvents.kind, title: schema.caseEvents.title, actor: schema.caseEvents.actor, factual: schema.caseEvents.factual, occurredAt: schema.caseEvents.occurredAt, toStatus: schema.caseEvents.toStatus })
        .from(schema.caseEvents)
        .where(inArray(schema.caseEvents.caseId, allCaseIds))
        .orderBy(desc(schema.caseEvents.occurredAt))
        .limit(14)
    : []
  const codeById = Object.fromEntries((await db.select({ id: schema.cases.id, code: schema.cases.code }).from(schema.cases).where(eq(schema.cases.userId, uid))).map(c => [c.id, c.code]))
  const deadlines = await db
    .select({ id: schema.cases.id, code: schema.cases.code, title: schema.cases.title, nextAction: schema.cases.nextAction, nextActionDueAt: schema.cases.nextActionDueAt, status: schema.cases.status })
    .from(schema.cases)
    .where(and(eq(schema.cases.userId, uid), sql`${schema.cases.nextActionDueAt} is not null`, sql`${schema.cases.status} not in ('RESOLVED','CLOSED','CANCELLED','DUPLICATE')`))
    .orderBy(schema.cases.nextActionDueAt)
    .limit(6)
  const history = await db
    .select({ bureau: schema.reportSnapshots.bureau, reportDate: schema.reportSnapshots.reportDate, summary: schema.reportSnapshots.summary, score: schema.reportSnapshots.score, mode: schema.reportSnapshots.mode })
    .from(schema.reportSnapshots)
    .where(and(eq(schema.reportSnapshots.userId, uid), gte(schema.reportSnapshots.reportDate, new Date(Date.now() - 400 * 86_400_000))))
    .orderBy(schema.reportSnapshots.reportDate)
  const unreadNotifications = await db.select({ n: sql<number>`count(*)::int` }).from(schema.notifications).where(and(eq(schema.notifications.userId, uid), isNull(schema.notifications.readAt)))

  const outbound = getOutboundProvider()
  const inbound = activeInboundProvider()
  const blocked = [
    ...connections.filter(c => ['failed', 'expired', 'degraded', 'not_connected'].includes(c.status) && c.kind === 'credit_data').map(c => ({ provider: c.provider, kind: c.kind, status: c.status, error: c.lastError })),
    ...(aiKey.key ? [] : [{ provider: 'openrouter', kind: 'ai', status: 'not_connected', error: 'No OpenRouter key — council runs in demo simulator mode.' }]),
  ]

  return {
    appMode: env.appMode,
    bureaus: BUREAUS.map(b => {
      const s = snaps[b]
      const conn = connections.find(c => c.kind === 'credit_data' && (c.config as { bureau?: string }).bureau === b)
      const fm = matrix.find(m => m.agency.slug === b)
      return {
        bureau: b,
        snapshot: s ? { id: s.id, reportDate: s.reportDate, pulledAt: s.pulledAt, source: s.source, mode: s.mode, summary: s.summary, score: s.score } : null,
        connection: conn ? { status: conn.status, mode: conn.mode, lastCheckedAt: conn.lastCheckedAt, nextEligibleCheckAt: conn.nextEligibleCheckAt, provider: conn.provider } : null,
        freeze: fm?.effectiveStatus ?? 'NOT_STARTED',
        alerts: 0,
      }
    }),
    counts: {
      openCases,
      awaitingApproval,
      awaitingResponse,
      needsEvidence,
      discrepancies: discOpen?.n ?? 0,
      lettersSent: lettersSent?.n ?? 0,
      unreadInbound: unreadInbound?.n ?? 0,
      unassignedInbound: unassigned?.n ?? 0,
      responsesToReview: responsesToReview?.n ?? 0,
      newAlerts: newAlerts?.n ?? 0,
      unreadNotifications: unreadNotifications[0]?.n ?? 0,
      blockedIntegrations: blocked.length,
    },
    recentCases,
    timeline: timeline.map(t => ({ ...t, caseCode: codeById[t.caseId] ?? '' })),
    deadlines,
    history,
    providers: {
      outbound: { slug: outbound.slug, label: outbound.label, mode: outbound.mode },
      inbound: { slug: inbound.slug, label: inbound.label, mode: inbound.mode },
      ai: { configured: !!aiKey.key, source: aiKey.source, liveEnabled: aiConfig.liveEnabled, model: aiConfig.defaultModel },
    },
    blocked,
  }
})
