import type { ZodType } from 'zod'
import type { AgentRole } from '#shared/constants'
import { AGENT_ROLE_META, VOTING_ROLES } from '#shared/constants'
import { openRouterChat, type ChatMessage } from '../ai/openrouter'
import type { AiConfig } from '../settings/service'
import type { Dossier } from './dossier'
import { ballotSchema, chairSchema, critiqueSchema, findingSchema, jsonSchemas, proposalSchema, replySchema, type Ballot, type Chair, type Critique, type Finding, type Proposal, type Reply } from './schemas'
import type { SimulatedTranscript } from './simulator'

export const PROMPT_VERSION = 'council-v1.2'

export class CouncilBudgetExceeded extends Error {
  constructor(public spentUsd: number, public capUsd: number) {
    super(`Council run exceeded cost cap: spent $${spentUsd.toFixed(4)} of $${capUsd.toFixed(2)}`)
  }
}

export interface LiveUsage {
  promptTokens: number
  completionTokens: number
  estimatedCostUsd: number
  calls: number
  modelsUsed: Record<AgentRole, string>
}

const COMMON_RULES = `You are one member of a multi-agent credit dispute council inside CreditOS.
Hard rules you must never break:
- Only reference evidence by its label (E1, E2, ...). Never invent evidence, dates, amounts, account numbers, or legal citations.
- Never assert that accurate negative information is inaccurate. Never promise deletion, score changes, or outcomes.
- Distinguish facts (cited evidence) from inference. Keep uncertainty explicit.
- Identity theft may only be asserted if an identity theft report is present in evidence.
- Respond ONLY with JSON matching the provided schema.`

const ROLE_PROMPTS: Record<AgentRole, string> = {
  evidence_analyst: 'Role: Evidence Analyst. Validate the claimed error, evidence coverage, source credibility and ambiguities. Identify exactly which evidence labels support each fact and what is missing.',
  bureau_specialist: 'Role: Credit Reporting Specialist. Evaluate bureau-specific discrepancies, Metro 2 reporting mechanics, and the correct dispute target and request wording for a bureau reinvestigation.',
  furnisher_specialist: 'Role: Furnisher & Collections Specialist. Analyze source-data correction, original creditor vs. collector nuances, debt validation, goodwill, and the right contact channel.',
  compliance_reviewer: 'Role: Consumer-Protection / Compliance Reviewer. Reject unsupported claims, prohibited content, and unauthorized actions. Check consent presence. Your "blocking" findings are hard gates.',
  adversarial_skeptic: 'Role: Adversarial Skeptic. Attack weak arguments. Identify the most likely rebuttal from the bureau or furnisher and reasons the dispute could fail or backfire.',
  decision_chair: 'Role: Decision Chair. Reconcile the ballots. You may not override hard gates (insufficient evidence, compliance block, missing consent). Summarize the decision, record the minority opinion.',
}

interface Ctx {
  apiKey: string
  config: AiConfig
  dossier: Dossier
  usage: LiveUsage
  onMessage?: (role: AgentRole, kind: string, model: string) => void
}

function modelFor(cfg: AiConfig, role: AgentRole): string {
  return cfg.roleModels[role] || cfg.defaultModel
}

async function ask<T>(ctx: Ctx, role: AgentRole, task: string, schemaName: keyof typeof jsonSchemas, zod: ZodType<T>, transcript: string): Promise<T> {
  const model = modelFor(ctx.config, role)
  ctx.usage.modelsUsed[role] = model
  const messages: ChatMessage[] = [
    { role: 'system', content: `${COMMON_RULES}\n\n${ROLE_PROMPTS[role]}` },
    {
      role: 'user',
      content: `DOSSIER (immutable, PII-minimized):\n${JSON.stringify(ctx.dossier, null, 1)}\n\nTRANSCRIPT SO FAR:\n${transcript || '(none)'}\n\nTASK:\n${task}`,
    },
  ]
  let lastErr: string | null = null
  for (let attempt = 0; attempt < 2; attempt++) {
    if (ctx.usage.estimatedCostUsd > ctx.config.maxCostUsdPerRun) throw new CouncilBudgetExceeded(ctx.usage.estimatedCostUsd, ctx.config.maxCostUsdPerRun)
    const res = await openRouterChat({
      apiKey: ctx.apiKey,
      model,
      messages: lastErr ? [...messages, { role: 'user', content: `Your previous answer failed validation: ${lastErr}. Return corrected JSON only.` }] : messages,
      temperature: ctx.config.temperature,
      maxTokens: ctx.config.maxTokensPerMessage,
      jsonSchema: { name: schemaName, schema: jsonSchemas[schemaName] as unknown as Record<string, unknown> },
      providerOrder: ctx.config.providerOrder,
      allowFallbacks: ctx.config.allowFallbacks,
      requireParameters: ctx.config.requireParameters,
    })
    ctx.usage.calls++
    ctx.usage.promptTokens += res.promptTokens
    ctx.usage.completionTokens += res.completionTokens
    ctx.usage.estimatedCostUsd += res.estimatedCostUsd
    try {
      const raw = JSON.parse(stripFences(res.content))
      const parsed = zod.parse(raw)
      const validLabels = new Set(ctx.dossier.evidence.map(e => e.label))
      const cites = (parsed as { citations?: string[] }).citations
      if (cites && cites.some(c => !validLabels.has(c))) {
        throw new Error(`cited unknown evidence label(s): ${cites.filter(c => !validLabels.has(c)).join(', ')}`)
      }
      ctx.onMessage?.(role, schemaName, res.model)
      return parsed
    } catch (e) {
      lastErr = e instanceof Error ? e.message.slice(0, 400) : String(e)
    }
  }
  throw new Error(`Agent ${AGENT_ROLE_META[role].label} failed schema validation twice: ${lastErr}`)
}

function stripFences(s: string): string {
  return s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
}

function fmt(role: AgentRole, kind: string, body: unknown): string {
  return `[${AGENT_ROLE_META[role].label} · ${kind}] ${JSON.stringify(body)}`
}

/** Runs the full three-round protocol against live models. Same shape as the simulator output. */
export async function runLiveCouncil(apiKey: string, config: AiConfig, dossier: Dossier, onMessage?: Ctx['onMessage']): Promise<{ transcript: SimulatedTranscript; usage: LiveUsage }> {
  const usage: LiveUsage = { promptTokens: 0, completionTokens: 0, estimatedCostUsd: 0, calls: 0, modelsUsed: {} as Record<AgentRole, string> }
  const ctx: Ctx = { apiKey, config, dossier, usage, onMessage }
  const lines: string[] = []

  // Round 1
  const findings = {} as Record<AgentRole, Finding>
  for (const role of [...VOTING_ROLES, 'decision_chair'] as AgentRole[]) {
    findings[role] = await ask(ctx, role, 'ROUND 1 — Independent finding. Cite evidence labels for every fact.', 'finding', findingSchema, lines.join('\n'))
    lines.push(fmt(role, 'finding', findings[role]))
  }

  // Round 2 — critiques (each voting agent critiques one other), then replies
  const critiques: SimulatedTranscript['critiques'] = []
  const pairs: [AgentRole, AgentRole][] = [
    ['adversarial_skeptic', 'bureau_specialist'],
    ['compliance_reviewer', 'furnisher_specialist'],
    ['evidence_analyst', 'adversarial_skeptic'],
    ['bureau_specialist', 'evidence_analyst'],
    ['furnisher_specialist', 'compliance_reviewer'],
  ]
  for (const [from, to] of pairs) {
    const c = await ask(ctx, from, `ROUND 2 — Critique the Round 1 finding of ${AGENT_ROLE_META[to].label} (targetRole must be "${to}"). Be specific and cite evidence.`, 'critique', critiqueSchema, lines.join('\n'))
    c.targetRole = to
    critiques.push({ from, critique: c })
    lines.push(fmt(from, 'critique→' + to, c))
  }
  const replies: SimulatedTranscript['replies'] = []
  for (const { from, critique } of critiques) {
    const r = await ask(ctx, critique.targetRole, `ROUND 2 — Reply directly to the critique from ${AGENT_ROLE_META[from].label}. State whether your position changed.`, 'reply', replySchema, lines.join('\n'))
    replies.push({ from: critique.targetRole, to: from, reply: r })
    lines.push(fmt(critique.targetRole, 'reply→' + from, r))
  }

  // Round 3 — proposals
  const proposals = {} as Record<AgentRole, Proposal>
  for (const role of VOTING_ROLES) {
    proposals[role] = await ask(ctx, role, 'ROUND 3 — Revised proposal: channel, recipient, approach, risks, proof requirements, uncertainty, timeline.', 'proposal', proposalSchema, lines.join('\n'))
    lines.push(fmt(role, 'proposal', proposals[role]))
  }
  // Chair consolidates a candidate = most common channel among proposals
  const counts = new Map<string, number>()
  for (const r of VOTING_ROLES) counts.set(proposals[r].channel, (counts.get(proposals[r].channel) ?? 0) + 1)
  const candidate = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]![0]
  const candidateProposal = Object.values(proposals).find(p => p.channel === candidate)!
  proposals.decision_chair = { ...candidateProposal, approach: `Consolidated candidate for ballot: ${candidate}. ${candidateProposal.approach}` }
  lines.push(fmt('decision_chair', 'candidate', { channel: candidate }))

  // Ballots
  const ballots = {} as Record<AgentRole, Ballot>
  for (const role of VOTING_ROLES) {
    ballots[role] = await ask(ctx, role, `BALLOT — Vote support/oppose/abstain on the consolidated candidate "${candidate}" with a rationale grounded in evidence.`, 'ballot', ballotSchema, lines.join('\n'))
    lines.push(fmt(role, 'ballot', ballots[role]))
  }
  ballots.decision_chair = { vote: 'abstain', rationale: 'Chair does not vote.' }

  const chairRaw = await ask(ctx, 'decision_chair', `DECISION — Reconcile ballots on "${candidate}". You cannot override hard gates. Provide outcome, selectedChannel, summary, minorityOpinion (empty string if none).`, 'chair', chairSchema, lines.join('\n'))
  const chair: Chair = { ...chairRaw, minorityOpinion: chairRaw.minorityOpinion || undefined }

  return { transcript: { findings, critiques, replies, proposals, ballots, chair }, usage }
}

export type { Critique, Reply }
