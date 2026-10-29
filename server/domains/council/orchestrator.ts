import { and, desc, eq, sql } from 'drizzle-orm'
import type { AgentRole, RemedyChannel } from '#shared/constants'
import { AGENT_ROLE_META, REMEDY_CHANNEL_LABEL, VOTING_ROLES } from '#shared/constants'
import { getDb, schema } from '../../db'
import type { AgentRun, ChairDecision, HardGates, PlanStrategy } from '../../db/schema'
import { env } from '../../utils/env'
import { liveBus } from '../../utils/events'
import { audit, notify } from '../../utils/audit'
import { addCaseEvent, transitionCase } from '../cases/service'
import { getAiConfig, resolveOpenRouterKey } from '../settings/service'
import { buildDossier, type Dossier } from './dossier'
import { PROMPT_VERSION, runLiveCouncil } from './live'
import { buildScenarios } from './scenarios'
import { simulateCouncil, type SimulatedTranscript } from './simulator'
import { draftLetterForPlan } from '../correspondence/letters'

export type RunTrigger = AgentRun['trigger']

const LETTER_CHANNELS: RemedyChannel[] = ['bureau_dispute', 'furnisher_direct_dispute', 'identity_theft_report', 'debt_validation_request', 'goodwill_request']

/**
 * Starts a council run for a case. In demo mode (or when live AI is not
 * configured/enabled) the deterministic simulator is used and the run is
 * labelled mode=demo. Live runs call OpenRouter with structured outputs.
 */
export async function runCouncil(caseId: string, trigger: RunTrigger, actor = 'system'): Promise<AgentRun> {
  const db = getDb()
  const c = await db.query.cases.findFirst({ where: eq(schema.cases.id, caseId) })
  if (!c) throw createError({ statusCode: 404, statusMessage: 'Case not found' })

  if (!['AGENT_REVIEW', 'NEEDS_EVIDENCE', 'PLAN_READY', 'AWAITING_APPROVAL', 'RESPONSE_ANALYSIS', 'FOLLOW_UP_RECOMMENDED', 'ESCALATION_REVIEW', 'REJECTED_BY_USER', 'CLOSED', 'TRIAGE'].includes(c.status)) {
    throw createError({ statusCode: 409, statusMessage: `Council cannot run while case is ${c.status}` })
  }
  if (c.status !== 'AGENT_REVIEW') {
    await transitionCase(caseId, 'AGENT_REVIEW', actor, { title: `Council re-convened (${trigger.replace(/_/g, ' ')})` })
  }

  const aiConfig = await getAiConfig()
  const { key, source } = await resolveOpenRouterKey()
  const liveCapable = env.appMode !== 'demo' && aiConfig.liveEnabled && !!key
  const mode: 'demo' | 'live' = liveCapable ? 'live' : 'demo'

  const { dossier, hash } = await buildDossier(caseId, trigger)

  // Consent gate for live AI: never send case facts to an external model without consent.
  if (mode === 'live' && !dossier.consents.aiProcessing) {
    throw createError({ statusCode: 412, statusMessage: 'AI processing consent has not been granted. Grant it in Settings → Consents or switch to demo mode.' })
  }

  const [run] = await db
    .insert(schema.agentRuns)
    .values({
      caseId,
      trigger,
      mode,
      modelConfig: mode === 'live' ? { default: aiConfig.defaultModel, ...aiConfig.roleModels, keySource: source } : { simulator: 'deterministic-v1' },
      promptVersion: mode === 'live' ? PROMPT_VERSION : 'simulator-v1',
      status: 'running',
      dossierHash: hash,
      dossier: dossier as unknown as Record<string, unknown>,
      startedAt: new Date(),
    })
    .returning()
  const runId = run!.id
  liveBus.publish('council.started', { caseId, runId, mode }, c.userId)
  await addCaseEvent(caseId, {
    kind: 'council',
    title: mode === 'demo' ? 'Simulated council convened (DEMO)' : 'Live council convened',
    detail: `Dossier ${hash.slice(0, 12)}… with ${dossier.evidence.length} evidence items. ${mode === 'demo' ? 'Deterministic simulator — not real AI deliberation.' : `Models: ${aiConfig.defaultModel}`}`,
    actor: 'system',
    refType: 'agent_run',
    refId: runId,
    meta: { mode, trigger },
  })

  try {
    let transcript: SimulatedTranscript
    let usage: AgentRun['usage'] = null
    if (mode === 'live') {
      const res = await runLiveCouncil(key!, aiConfig, dossier, (role, kind) => liveBus.publish('council.progress', { caseId, runId, role, kind }, c.userId))
      transcript = res.transcript
      usage = { promptTokens: res.usage.promptTokens, completionTokens: res.usage.completionTokens, estimatedCostUsd: res.usage.estimatedCostUsd }
    } else {
      transcript = simulateCouncil(dossier)
    }

    const modelLabel = (role: AgentRole) => (mode === 'live' ? aiConfig.roleModels[role] || aiConfig.defaultModel : 'simulator/deterministic-v1')
    await persistTranscript(runId, transcript, modelLabel, caseId, c.userId)

    const gates = evaluateHardGates(dossier, transcript)
    const decision = reconcileDecision(transcript, gates)

    await db.insert(schema.agentMessages).values({
      runId,
      round: 4,
      seq: 0,
      role: 'compliance_reviewer',
      kind: 'gate_check',
      content: gates.notes.join('\n'),
      structured: gates as unknown as Record<string, unknown>,
      citations: [],
      model: 'creditos/hard-gates',
    })
    await db.insert(schema.agentMessages).values({
      runId,
      round: 4,
      seq: 1,
      role: 'decision_chair',
      kind: 'chair_summary',
      content: decision.summary + (decision.minorityOpinion ? `\n\nMinority opinion: ${decision.minorityOpinion}` : ''),
      structured: decision as unknown as Record<string, unknown>,
      citations: [],
      model: modelLabel('decision_chair'),
    })

    const plan = await createPlan(caseId, runId, dossier, transcript, decision, gates)

    await db.update(schema.agentRuns).set({ status: 'completed', completedAt: new Date(), decision, usage }).where(eq(schema.agentRuns.id, runId))

    await applyDecisionToCase(caseId, decision, gates, plan.id, c.userId, mode)
    liveBus.publish('council.completed', { caseId, runId, outcome: decision.outcome }, c.userId)
    await audit({ userId: c.userId, actor, action: 'council.run', targetType: 'agent_run', targetId: runId, meta: { mode, outcome: decision.outcome, costUsd: usage?.estimatedCostUsd ?? 0 } })
    return (await db.query.agentRuns.findFirst({ where: eq(schema.agentRuns.id, runId) }))!
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    await db.update(schema.agentRuns).set({ status: 'failed', completedAt: new Date(), error: message }).where(eq(schema.agentRuns.id, runId))
    await addCaseEvent(caseId, { kind: 'council', title: 'Council run failed', detail: message, actor: 'system', refType: 'agent_run', refId: runId })
    liveBus.publish('council.failed', { caseId, runId, error: message }, c.userId)
    await notify(c.userId, { kind: 'council', title: `Council run failed for ${c.code}`, body: message, href: `/cases/${caseId}`, severity: 'high' })
    throw e
  }
}

async function persistTranscript(runId: string, t: SimulatedTranscript, modelLabel: (r: AgentRole) => string, caseId: string, userId: string) {
  const db = getDb()
  let seq = 0
  const rows: (typeof schema.agentMessages.$inferInsert)[] = []
  const push = (round: number, role: AgentRole, kind: (typeof schema.agentMessages.$inferInsert)['kind'], content: string, structured: unknown, citations: string[], targetRole?: AgentRole) => {
    rows.push({ runId, round, seq: seq++, role, kind, content, structured: structured as Record<string, unknown>, citations, targetRole: targetRole ?? null, model: modelLabel(role) })
  }
  for (const role of [...VOTING_ROLES, 'decision_chair'] as AgentRole[]) {
    const f = t.findings[role]
    push(1, role, 'finding', `${f.summary}\n\nKey facts:\n${f.keyFacts.map(k => `• ${k}`).join('\n')}${f.concerns.length ? `\n\nConcerns:\n${f.concerns.map(k => `• ${k}`).join('\n')}` : ''}`, f, f.citations)
  }
  for (const c of t.critiques) push(2, c.from, 'critique', c.critique.critique, c.critique, c.critique.citations, c.critique.targetRole)
  for (const r of t.replies) push(2, r.from, 'reply', r.reply.reply + (r.reply.positionChanged ? '\n\n(Position revised.)' : '\n\n(Position maintained.)'), r.reply, r.reply.citations, r.to)
  for (const role of VOTING_ROLES) {
    const p = t.proposals[role]
    push(3, role, 'proposal', `Proposal: ${REMEDY_CHANNEL_LABEL[p.channel]} → ${p.recipientType}.\n\n${p.approach}\n\nRequested outcome: ${p.requestedOutcome}\nRisks: ${p.risks.join('; ') || 'none listed'}\nProof: ${p.proofRequirements.join('; ') || 'none listed'}\nUncertainty: ${p.uncertainty}\nTimeline: ${p.estimatedTimeline}`, p, p.citations)
  }
  const chairP = t.proposals.decision_chair
  push(3, 'decision_chair', 'proposal', `Consolidated candidate for ballot: ${REMEDY_CHANNEL_LABEL[chairP.channel]}.`, chairP, chairP.citations)
  await db.insert(schema.agentMessages).values(rows)

  const votes = VOTING_ROLES.map(role => ({
    runId,
    role,
    vote: t.ballots[role].vote,
    rationale: t.ballots[role].rationale,
    dissent: t.ballots[role].vote === 'oppose',
    proposalRef: chairP.channel,
  }))
  await db.insert(schema.agentVotes).values(votes)
  liveBus.publish('council.transcript', { caseId, runId, messages: rows.length, votes: votes.length }, userId)
}

export function evaluateHardGates(d: Dossier, t: SimulatedTranscript): HardGates {
  const notes: string[] = []
  const evidenceSufficient = d.rule.disputable === 'yes' || d.rule.channel === 'goodwill_request' || d.rule.channel === 'monitor_only'
  notes.push(evidenceSufficient ? `Evidence gate: PASS (rule ${d.rule.ruleId}, confidence ${Math.round(d.rule.confidence * 100)}%).` : `Evidence gate: FAIL — ${d.rule.evidenceGaps.filter(g => !/optional/i.test(g)).join('; ') || 'confidence below threshold'}.`)

  const complianceBlocking = t.critiques.some(c => c.from === 'compliance_reviewer' && c.critique.severity === 'blocking') || t.findings.compliance_reviewer.summary.toUpperCase().includes('BLOCKING') || t.findings.compliance_reviewer.confidence < 0.3
  const idTheftWithoutReport = d.category === 'identity_theft' && !d.evidence.some(e => e.kind === 'document')
  const compliancePassed = !complianceBlocking && !idTheftWithoutReport
  notes.push(compliancePassed ? 'Compliance gate: PASS.' : `Compliance gate: FAIL — ${idTheftWithoutReport ? 'identity theft asserted without an identity theft report' : 'compliance reviewer raised a blocking objection'}.`)

  const consentPresent = d.consents.aiProcessing || d.mode === 'demo'
  notes.push(consentPresent ? 'Consent gate: PASS (analysis consent present).' : 'Consent gate: FAIL — AI processing consent missing.')

  const validLabels = new Set(d.evidence.map(e => e.label))
  const allCites = [
    ...Object.values(t.findings).flatMap(f => f.citations),
    ...t.critiques.flatMap(c => c.critique.citations),
    ...t.replies.flatMap(r => r.reply.citations),
    ...Object.values(t.proposals).flatMap(p => p.citations),
  ]
  const bad = allCites.filter(c => !validLabels.has(c))
  const fabricationCheckPassed = bad.length === 0
  notes.push(fabricationCheckPassed ? `Fabrication gate: PASS (${allCites.length} citations all resolve to dossier evidence).` : `Fabrication gate: FAIL — unknown citations: ${[...new Set(bad)].join(', ')}.`)

  return { evidenceSufficient, compliancePassed, consentPresent, fabricationCheckPassed, notes }
}

export function reconcileDecision(t: SimulatedTranscript, gates: HardGates): ChairDecision {
  const tally = { support: 0, oppose: 0, abstain: 0 }
  for (const r of VOTING_ROLES) tally[t.ballots[r].vote]++
  const gatesOk = gates.evidenceSufficient && gates.compliancePassed && gates.consentPresent && gates.fabricationCheckPassed
  let outcome = t.chair.outcome
  let gatesRespected = true
  if (!gates.compliancePassed && outcome !== 'reject') {
    // A compliance failure always blocks, whatever the chair proposed.
    outcome = 'reject'
    gatesRespected = false
  } else if (!gatesOk && outcome === 'proceed') {
    // The chair cannot override hard gates.
    outcome = 'collect_evidence'
    gatesRespected = false
  }
  if (outcome === 'proceed' && tally.oppose >= tally.support) {
    outcome = 'escalate'
  }
  const selectedChannel: RemedyChannel = outcome === 'proceed' ? t.chair.selectedChannel : outcome === 'monitor_only' ? 'monitor_only' : 'needs_more_evidence'
  return {
    outcome,
    selectedChannel,
    summary: gatesRespected ? t.chair.summary : `${t.chair.summary}\n\nOVERRIDDEN BY HARD GATES: the chair proposed to proceed but a hard gate failed (${gates.notes.filter(n => n.includes('FAIL')).join(' ')}). Outcome forced to "${outcome}".`,
    tally,
    minorityOpinion: t.chair.minorityOpinion,
    gatesRespected,
  }
}

async function createPlan(caseId: string, runId: string, d: Dossier, t: SimulatedTranscript, decision: ChairDecision, gates: HardGates) {
  const db = getDb()
  const [maxRow] = await db.select({ max: sql<number>`coalesce(max(${schema.casePlans.version}), 0)::int` }).from(schema.casePlans).where(eq(schema.casePlans.caseId, caseId))
  const max = maxRow?.max
  const version = (max ?? 0) + 1
  await db.update(schema.casePlans).set({ status: 'superseded' }).where(and(eq(schema.casePlans.caseId, caseId), eq(schema.casePlans.status, 'active')))

  const chosen = Object.values(t.proposals).find(p => p.channel === decision.selectedChannel) ?? t.proposals.decision_chair
  const strategy: PlanStrategy = {
    approach: decision.outcome === 'proceed' ? chosen.approach : decision.summary,
    channel: decision.selectedChannel,
    recipientType: chosen.recipientType,
    recipients: d.bureaus.length && chosen.recipientType === 'bureau' ? d.bureaus : [d.creditorName ?? 'furnisher'],
    letterType: decision.selectedChannel,
    rationale: t.findings.bureau_specialist.summary,
    requestedOutcome: chosen.requestedOutcome,
    risks: [...new Set(Object.values(t.proposals).flatMap(p => p.risks))].slice(0, 8),
    proofRequirements: [...new Set(Object.values(t.proposals).flatMap(p => p.proofRequirements))].slice(0, 10),
    pros: [`${decision.tally.support} of ${VOTING_ROLES.length} voting agents support the plan`, ...(gates.evidenceSufficient ? ['Evidence requirements met'] : [])],
    cons: [...(decision.tally.oppose ? [`${decision.tally.oppose} dissenting vote(s)`] : []), ...t.findings.adversarial_skeptic.concerns.slice(0, 2)],
    estimatedTimeline: chosen.estimatedTimeline || d.rule.reviewWindow,
    requiresUserApproval: true,
  }
  const scenarios = decision.outcome === 'proceed' && LETTER_CHANNELS.includes(decision.selectedChannel) ? buildScenarios(decision.selectedChannel, d.contestedField, d.rule.reviewWindow) : []
  const [plan] = await db
    .insert(schema.casePlans)
    .values({ caseId, runId, version, status: decision.outcome === 'proceed' || decision.outcome === 'monitor_only' ? 'active' : 'draft', strategy, scenarios, hardGates: gates })
    .returning()
  await addCaseEvent(caseId, {
    kind: 'plan',
    title: `Plan v${version} drafted — ${decision.outcome.replace(/_/g, ' ')}`,
    detail: decision.summary,
    actor: 'agent:decision_chair',
    factual: false,
    refType: 'plan',
    refId: plan!.id,
    meta: { tally: decision.tally, gates },
  })
  return plan!
}

async function applyDecisionToCase(caseId: string, decision: ChairDecision, gates: HardGates, planId: string, userId: string, mode: 'demo' | 'live') {
  const db = getDb()
  const c = (await db.query.cases.findFirst({ where: eq(schema.cases.id, caseId) }))!
  switch (decision.outcome) {
    case 'proceed': {
      if (LETTER_CHANNELS.includes(decision.selectedChannel)) {
        const letter = await draftLetterForPlan(caseId, planId)
        await transitionCase(caseId, 'PLAN_READY', 'agent:decision_chair', {
          title: 'Plan ready — letter drafted for your review',
          nextAction: `Review letter v${letter.version} and request approval`,
        })
      } else {
        await transitionCase(caseId, 'PLAN_READY', 'agent:decision_chair', { nextAction: 'Review plan' })
      }
      await db.update(schema.cases).set({ recommendedChannel: decision.selectedChannel, blockers: [] }).where(eq(schema.cases.id, caseId))
      await notify(userId, { kind: 'council', title: `${c.code}: plan ready for review`, body: decision.summary.slice(0, 200), href: `/cases/${caseId}`, severity: 'medium' })
      break
    }
    case 'collect_evidence': {
      const gaps = gates.notes.filter(n => n.includes('FAIL'))
      await transitionCase(caseId, 'NEEDS_EVIDENCE', 'agent:decision_chair', { title: 'Council requests more evidence', detail: gaps.join(' '), nextAction: 'Upload the requested evidence' })
      await db
        .update(schema.cases)
        .set({ blockers: [{ code: 'EVIDENCE', message: gaps[0] ?? 'More evidence required', since: new Date().toISOString(), resolvable: true }] })
        .where(eq(schema.cases.id, caseId))
      await notify(userId, { kind: 'council', title: `${c.code}: more evidence needed`, body: gaps[0], href: `/cases/${caseId}`, severity: 'medium' })
      break
    }
    case 'monitor_only':
      await transitionCase(caseId, 'PLAN_READY', 'agent:decision_chair', { title: 'Council recommends monitoring only', nextAction: 'Acknowledge and keep monitoring' })
      await db.update(schema.cases).set({ recommendedChannel: 'monitor_only' }).where(eq(schema.cases.id, caseId))
      break
    case 'escalate':
      await transitionCase(caseId, 'ESCALATION_REVIEW', 'agent:decision_chair', { title: 'Council split — escalated to you', detail: decision.summary, nextAction: 'Decide: re-run council, add evidence, or close' })
      await notify(userId, { kind: 'council', title: `${c.code}: council escalated`, body: decision.minorityOpinion ?? decision.summary, href: `/cases/${caseId}`, severity: 'high' })
      break
    case 'reject':
      await transitionCase(caseId, 'BLOCKED', 'agent:compliance_reviewer', { title: 'Blocked by compliance gate', detail: decision.summary, nextAction: 'Resolve the compliance blocker' })
      await db
        .update(schema.cases)
        .set({ blockers: [{ code: 'COMPLIANCE', message: gates.notes.find(n => n.startsWith('Compliance gate: FAIL')) ?? 'Compliance gate failed', since: new Date().toISOString(), resolvable: true }] })
        .where(eq(schema.cases.id, caseId))
      await notify(userId, { kind: 'council', title: `${c.code}: blocked by compliance`, body: decision.summary.slice(0, 200), href: `/cases/${caseId}`, severity: 'high' })
      break
  }
  void mode
}

export async function latestRunForCase(caseId: string) {
  const db = getDb()
  return db.query.agentRuns.findFirst({ where: eq(schema.agentRuns.caseId, caseId), orderBy: [desc(schema.agentRuns.createdAt)] })
}

export { AGENT_ROLE_META }
