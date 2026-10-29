import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
import type { Bureau, DataMode, IssueCategory, Priority, Severity } from '#shared/constants'
import { BUREAU_LABEL } from '#shared/constants'
import { CASE_TRANSITIONS, assertTransition, type CaseStatus } from '#shared/state-machines'
import { getDb, schema } from '../../db'
import type { Case, CaseEvent, EvidenceFact } from '../../db/schema'
import { liveBus } from '../../utils/events'
import { audit, notify } from '../../utils/audit'
import { evaluateRule, type RuleEvaluation } from '../rules/engine'

export async function nextCaseCode(): Promise<string> {
  const db = getDb()
  const year = new Date().getFullYear()
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.cases)
    .where(sql`${schema.cases.code} like ${`CR-${year}-%`}`)
  const count = row?.count
  return `CR-${year}-${String((count ?? 0) + 1).padStart(4, '0')}`
}

export async function addCaseEvent(
  caseId: string,
  input: {
    kind: string
    title: string
    detail?: string
    actor: string
    factual?: boolean
    fromStatus?: CaseStatus | null
    toStatus?: CaseStatus | null
    refType?: string
    refId?: string
    meta?: Record<string, unknown>
    occurredAt?: Date
  },
): Promise<CaseEvent> {
  const db = getDb()
  const [row] = await db
    .insert(schema.caseEvents)
    .values({
      caseId,
      kind: input.kind,
      title: input.title,
      detail: input.detail ?? null,
      actor: input.actor,
      factual: input.factual ?? true,
      fromStatus: input.fromStatus ?? null,
      toStatus: input.toStatus ?? null,
      refType: input.refType ?? null,
      refId: input.refId ?? null,
      meta: input.meta ?? {},
      occurredAt: input.occurredAt ?? new Date(),
    })
    .returning()
  liveBus.publish('case.event', { caseId, event: row })
  return row!
}

export async function transitionCase(
  caseId: string,
  to: CaseStatus,
  actor: string,
  opts: { title?: string; detail?: string; meta?: Record<string, unknown>; nextAction?: string | null; nextActionDueAt?: Date | null } = {},
): Promise<Case> {
  const db = getDb()
  const current = await db.query.cases.findFirst({ where: eq(schema.cases.id, caseId) })
  if (!current) throw createError({ statusCode: 404, statusMessage: 'Case not found' })
  assertTransition('case', CASE_TRANSITIONS, current.status, to)
  const patch: Partial<Case> = { status: to, updatedAt: new Date() }
  if (opts.nextAction !== undefined) patch.nextAction = opts.nextAction
  if (opts.nextActionDueAt !== undefined) patch.nextActionDueAt = opts.nextActionDueAt
  if (['RESOLVED', 'CLOSED', 'CANCELLED', 'DUPLICATE'].includes(to)) patch.closedAt = new Date()
  const [updated] = await db.update(schema.cases).set(patch).where(eq(schema.cases.id, caseId)).returning()
  await addCaseEvent(caseId, {
    kind: 'status',
    title: opts.title ?? `Status → ${to.replace(/_/g, ' ').toLowerCase()}`,
    detail: opts.detail,
    actor,
    fromStatus: current.status,
    toStatus: to,
    meta: opts.meta,
  })
  liveBus.publish('case.status', { caseId, from: current.status, to }, current.userId)
  return updated!
}

export async function addEvidence(
  caseId: string,
  input: {
    kind: 'report_fact' | 'document' | 'user_statement' | 'provider_record' | 'inbound_response'
    description: string
    documentId?: string
    fact?: EvidenceFact
    credibility?: 'high' | 'medium' | 'low'
    addedBy?: string
  },
) {
  const db = getDb()
  const [countRow] = await db.select({ count: sql<number>`count(*)::int` }).from(schema.caseEvidence).where(eq(schema.caseEvidence.caseId, caseId))
  const count = countRow?.count
  const label = `E${(count ?? 0) + 1}`
  const [row] = await db
    .insert(schema.caseEvidence)
    .values({
      caseId,
      label,
      kind: input.kind,
      description: input.description,
      documentId: input.documentId ?? null,
      fact: input.fact ?? null,
      credibility: input.credibility ?? 'medium',
      addedBy: input.addedBy ?? 'system',
    })
    .returning()
  await addCaseEvent(caseId, {
    kind: 'evidence',
    title: `Evidence ${label} added`,
    detail: input.description,
    actor: input.addedBy ?? 'system',
    refType: 'evidence',
    refId: row!.id,
  })
  return row!
}

function priorityFor(severity: Severity, confidence: number): Priority {
  if (severity === 'critical') return 'p0'
  if (severity === 'high') return confidence >= 0.6 ? 'p1' : 'p2'
  if (severity === 'medium') return 'p2'
  return 'p3'
}

export async function evaluateCaseRules(caseId: string): Promise<RuleEvaluation> {
  const db = getDb()
  const c = await db.query.cases.findFirst({ where: eq(schema.cases.id, caseId) })
  if (!c) throw createError({ statusCode: 404, statusMessage: 'Case not found' })
  const evidence = await db.select().from(schema.caseEvidence).where(eq(schema.caseEvidence.caseId, caseId))
  const reportDates = evidence.map(e => e.fact?.reportDate).filter(Boolean).map(d => new Date(d!).getTime())
  const spread = reportDates.length > 1 ? Math.round((Math.max(...reportDates) - Math.min(...reportDates)) / 86_400_000) : undefined
  return evaluateRule({
    category: c.category,
    reportedFact: c.summary,
    desiredCorrection: c.desiredCorrection ?? 'Correct or remove the inaccurate information.',
    evidence: evidence.map(e => ({ label: e.label, kind: e.kind, credibility: e.credibility, description: e.description })),
    multiBureau: c.bureaus.length > 1,
    reportDateSpreadDays: spread,
    userStatements: evidence.filter(e => e.kind === 'user_statement').map(e => e.description),
  })
}

/** Create a case from a persisted discrepancy and triage it with the rules engine. */
export async function createCaseFromDiscrepancy(userId: string, discrepancyId: string, actor = 'system'): Promise<Case> {
  const db = getDb()
  const d = await db.query.discrepancies.findFirst({ where: and(eq(schema.discrepancies.id, discrepancyId), eq(schema.discrepancies.userId, userId)) })
  if (!d) throw createError({ statusCode: 404, statusMessage: 'Discrepancy not found' })
  if (d.caseId) {
    const existing = await db.query.cases.findFirst({ where: eq(schema.cases.id, d.caseId) })
    if (existing) return existing
  }

  const bureaus = [...new Set(d.evidence.map(e => e.bureau))] as Bureau[]
  const reportDates = d.evidence.map(e => new Date(e.reportDate).getTime())
  const code = await nextCaseCode()
  const creditor = d.title.split(':')[0] ?? d.title
  const [created] = await db
    .insert(schema.cases)
    .values({
      code,
      userId,
      title: d.title,
      category: d.category,
      summary: d.summary,
      status: 'DETECTED',
      priority: priorityFor(d.severity, Number(d.confidence)),
      confidence: d.confidence,
      bureaus,
      accountKey: d.accountKey,
      creditorName: creditor,
      contestedField: d.field,
      contestedValues: d.values,
      desiredCorrection: null,
      sourceReportDate: reportDates.length ? new Date(Math.max(...reportDates)) : null,
      mode: d.mode,
      discrepancyId: d.id,
      nextAction: 'Triage with rules engine',
    })
    .returning()
  const c = created!

  await addCaseEvent(c.id, {
    kind: 'detected',
    title: 'Discrepancy detected from report comparison',
    detail: d.summary,
    actor,
    refType: 'discrepancy',
    refId: d.id,
    toStatus: 'DETECTED',
  })

  for (const e of d.evidence) {
    await addEvidence(c.id, {
      kind: 'report_fact',
      description: `${BUREAU_LABEL[e.bureau]} report dated ${e.reportDate.slice(0, 10)} — ${e.field}: ${formatValue(e.value)}`,
      fact: { bureau: e.bureau, snapshotId: e.snapshotId, tradelineId: e.tradelineId, field: e.field, value: e.value, reportDate: e.reportDate },
      credibility: 'high',
      addedBy: 'system',
    })
  }

  await db.update(schema.discrepancies).set({ status: 'case_created', caseId: c.id }).where(eq(schema.discrepancies.id, d.id))
  await db.update(schema.monitoringEvents).set({ status: 'case_created', caseId: c.id }).where(and(eq(schema.monitoringEvents.userId, userId), sql`${schema.monitoringEvents.entityRef}->>'accountKey' = ${d.accountKey ?? ''}`))

  await transitionCase(c.id, 'TRIAGE', actor, { title: 'Triage started', detail: 'Rules engine evaluating evidence sufficiency.' })
  const evaluation = await evaluateCaseRules(c.id)
  await db
    .update(schema.cases)
    .set({
      recommendedChannel: evaluation.channel,
      confidence: evaluation.confidence.toFixed(3),
      desiredCorrection: evaluation.explanation.outcomeSought,
      priority: priorityFor(evaluation.severity, evaluation.confidence),
    })
    .where(eq(schema.cases.id, c.id))
  await addCaseEvent(c.id, {
    kind: 'rules',
    title: `Rule "${evaluation.ruleId}" evaluated — ${evaluation.disputable === 'yes' ? 'evidence sufficient' : evaluation.disputable === 'uncertain' ? 'evidence incomplete' : 'not disputable'}`,
    detail: evaluation.explanation.uncertainty,
    actor: 'system',
    factual: false,
    meta: { ruleId: evaluation.ruleId, ruleVersion: evaluation.ruleVersion, confidence: evaluation.confidence, gaps: evaluation.evidenceGaps },
  })

  if (evaluation.disputable === 'yes' || evaluation.channel === 'goodwill_request' || evaluation.channel === 'monitor_only') {
    await transitionCase(c.id, 'AGENT_REVIEW', 'system', { title: 'Queued for council review', nextAction: 'Run agent council' })
  } else {
    const gaps = evaluation.evidenceGaps.filter(g => !/optional/i.test(g))
    await transitionCase(c.id, 'NEEDS_EVIDENCE', 'system', {
      title: 'Additional evidence requested',
      detail: gaps.length ? `Missing: ${gaps.join('; ')}` : 'Confidence below the dispute threshold.',
      nextAction: gaps.length ? `Upload: ${gaps[0]}` : 'Add a statement or supporting document',
    })
    await notify(userId, { kind: 'case', title: `${code} needs evidence`, body: gaps[0] ?? d.title, href: `/cases/${c.id}`, severity: 'medium' })
  }
  await audit({ userId, actor, action: 'case.create', targetType: 'case', targetId: c.id, meta: { code, category: d.category } })
  const fresh = await db.query.cases.findFirst({ where: eq(schema.cases.id, c.id) })
  return fresh!
}

/** Create a user-initiated case (e.g. unrecognized inquiry, identity theft, goodwill). */
export async function createManualCase(
  userId: string,
  input: { title: string; category: IssueCategory; summary: string; bureaus: Bureau[]; creditorName?: string; statement?: string; mode?: DataMode },
) {
  const db = getDb()
  const code = await nextCaseCode()
  const [c] = await db
    .insert(schema.cases)
    .values({
      code,
      userId,
      title: input.title,
      category: input.category,
      summary: input.summary,
      status: 'DETECTED',
      priority: 'p2',
      confidence: '0.400',
      bureaus: input.bureaus,
      creditorName: input.creditorName ?? null,
      mode: input.mode ?? 'live',
      nextAction: 'Triage with rules engine',
    })
    .returning()
  await addCaseEvent(c!.id, { kind: 'detected', title: 'Case opened by user', detail: input.summary, actor: 'user', toStatus: 'DETECTED' })
  if (input.statement) {
    await addEvidence(c!.id, { kind: 'user_statement', description: input.statement, credibility: 'medium', addedBy: 'user' })
  }
  await transitionCase(c!.id, 'TRIAGE', 'user')
  const evaluation = await evaluateCaseRules(c!.id)
  await db.update(schema.cases).set({ recommendedChannel: evaluation.channel, confidence: evaluation.confidence.toFixed(3), desiredCorrection: evaluation.explanation.outcomeSought }).where(eq(schema.cases.id, c!.id))
  if (evaluation.disputable === 'yes') await transitionCase(c!.id, 'AGENT_REVIEW', 'system', { nextAction: 'Run agent council' })
  else
    await transitionCase(c!.id, 'NEEDS_EVIDENCE', 'system', {
      detail: evaluation.evidenceGaps.join('; '),
      nextAction: evaluation.evidenceGaps[0] ? `Upload: ${evaluation.evidenceGaps[0]}` : 'Add supporting evidence',
    })
  await audit({ userId, actor: 'user', action: 'case.create_manual', targetType: 'case', targetId: c!.id })
  return (await db.query.cases.findFirst({ where: eq(schema.cases.id, c!.id) }))!
}

export async function listCases(userId: string, filters: { status?: string; category?: string; q?: string; bureau?: string; open?: boolean } = {}) {
  const db = getDb()
  const where = [eq(schema.cases.userId, userId)]
  if (filters.status) where.push(eq(schema.cases.status, filters.status as CaseStatus))
  if (filters.category) where.push(eq(schema.cases.category, filters.category as IssueCategory))
  if (filters.q) where.push(sql`(${schema.cases.title} ilike ${'%' + filters.q + '%'} or ${schema.cases.code} ilike ${'%' + filters.q + '%'} or ${schema.cases.summary} ilike ${'%' + filters.q + '%'})`)
  if (filters.bureau) where.push(sql`${schema.cases.bureaus} @> ${JSON.stringify([filters.bureau])}::jsonb`)
  if (filters.open) where.push(sql`${schema.cases.status} not in ('RESOLVED','CLOSED','CANCELLED','DUPLICATE')`)
  return db
    .select()
    .from(schema.cases)
    .where(and(...where))
    .orderBy(desc(schema.cases.updatedAt))
}

export async function getCaseDetail(userId: string, caseId: string) {
  const db = getDb()
  const c = await db.query.cases.findFirst({ where: and(eq(schema.cases.id, caseId), eq(schema.cases.userId, userId)) })
  if (!c) throw createError({ statusCode: 404, statusMessage: 'Case not found' })
  const [events, evidence, runs, plans, lettersRows, orders, inbound, analyses, approvalsRows] = await Promise.all([
    db.select().from(schema.caseEvents).where(eq(schema.caseEvents.caseId, caseId)).orderBy(asc(schema.caseEvents.occurredAt)),
    db.select().from(schema.caseEvidence).where(eq(schema.caseEvidence.caseId, caseId)).orderBy(asc(schema.caseEvidence.createdAt)),
    db.select().from(schema.agentRuns).where(eq(schema.agentRuns.caseId, caseId)).orderBy(desc(schema.agentRuns.createdAt)),
    db.select().from(schema.casePlans).where(eq(schema.casePlans.caseId, caseId)).orderBy(desc(schema.casePlans.version)),
    db.select().from(schema.letters).where(eq(schema.letters.caseId, caseId)).orderBy(desc(schema.letters.version)),
    db.select().from(schema.mailOrders).where(eq(schema.mailOrders.caseId, caseId)).orderBy(desc(schema.mailOrders.createdAt)),
    db.select().from(schema.inboundMail).where(eq(schema.inboundMail.matchedCaseId, caseId)).orderBy(desc(schema.inboundMail.receivedAt)),
    db.select().from(schema.responseAnalyses).where(eq(schema.responseAnalyses.caseId, caseId)).orderBy(desc(schema.responseAnalyses.createdAt)),
    db.select().from(schema.approvals).where(eq(schema.approvals.caseId, caseId)).orderBy(desc(schema.approvals.createdAt)),
  ])
  const runIds = runs.map(r => r.id)
  const [messages, votes] = runIds.length
    ? await Promise.all([
        db.select().from(schema.agentMessages).where(inArray(schema.agentMessages.runId, runIds)).orderBy(asc(schema.agentMessages.round), asc(schema.agentMessages.seq)),
        db.select().from(schema.agentVotes).where(inArray(schema.agentVotes.runId, runIds)).orderBy(asc(schema.agentVotes.createdAt)),
      ])
    : [[], []]
  const docIds = [...new Set([...evidence.map(e => e.documentId), ...lettersRows.map(l => l.pdfDocumentId), ...inbound.map(i => i.contentDocumentId)].filter(Boolean))] as string[]
  const docs = docIds.length ? await db.select().from(schema.documents).where(inArray(schema.documents.id, docIds)) : []
  const orderIds = orders.map(o => o.id)
  const mailEventsRows = orderIds.length ? await db.select().from(schema.mailEvents).where(inArray(schema.mailEvents.mailOrderId, orderIds)).orderBy(asc(schema.mailEvents.receivedAt)) : []
  const linked = c.linkedCaseIds.length
    ? await db.select({ id: schema.cases.id, code: schema.cases.code, title: schema.cases.title, status: schema.cases.status }).from(schema.cases).where(inArray(schema.cases.id, c.linkedCaseIds))
    : []
  const rules = await evaluateCaseRules(caseId)
  return {
    case: c,
    events,
    evidence,
    documents: docs,
    runs: runs.map(r => ({ ...r, messages: messages.filter(m => m.runId === r.id), votes: votes.filter(v => v.runId === r.id) })),
    plans,
    letters: lettersRows,
    mailOrders: orders.map(o => ({ ...o, events: mailEventsRows.filter(e => e.mailOrderId === o.id) })),
    inboundMail: inbound,
    responseAnalyses: analyses,
    approvals: approvalsRows,
    linkedCases: linked,
    rules,
  }
}

export async function linkCases(userId: string, caseId: string, otherId: string) {
  const db = getDb()
  const [a, b] = await Promise.all([
    db.query.cases.findFirst({ where: and(eq(schema.cases.id, caseId), eq(schema.cases.userId, userId)) }),
    db.query.cases.findFirst({ where: and(eq(schema.cases.id, otherId), eq(schema.cases.userId, userId)) }),
  ])
  if (!a || !b) throw createError({ statusCode: 404, statusMessage: 'Case not found' })
  await db.update(schema.cases).set({ linkedCaseIds: [...new Set([...a.linkedCaseIds, b.id])] }).where(eq(schema.cases.id, a.id))
  await db.update(schema.cases).set({ linkedCaseIds: [...new Set([...b.linkedCaseIds, a.id])] }).where(eq(schema.cases.id, b.id))
  await addCaseEvent(a.id, { kind: 'link', title: `Linked to ${b.code}`, actor: 'user', refType: 'case', refId: b.id })
  await addCaseEvent(b.id, { kind: 'link', title: `Linked to ${a.code}`, actor: 'user', refType: 'case', refId: a.id })
}

export async function mergeCase(userId: string, duplicateId: string, intoId: string) {
  const db = getDb()
  const dup = await db.query.cases.findFirst({ where: and(eq(schema.cases.id, duplicateId), eq(schema.cases.userId, userId)) })
  const target = await db.query.cases.findFirst({ where: and(eq(schema.cases.id, intoId), eq(schema.cases.userId, userId)) })
  if (!dup || !target) throw createError({ statusCode: 404, statusMessage: 'Case not found' })
  await db.update(schema.cases).set({ mergedIntoCaseId: target.id }).where(eq(schema.cases.id, dup.id))
  await transitionCase(dup.id, 'DUPLICATE', 'user', { title: `Merged into ${target.code}` })
  await addCaseEvent(target.id, { kind: 'merge', title: `${dup.code} merged into this case`, actor: 'user', refType: 'case', refId: dup.id })
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return '(empty)'
  if (typeof v === 'number') return `$${v.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}
