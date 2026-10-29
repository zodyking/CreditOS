import { describe, expect, it } from 'vitest'
import { VOTING_ROLES } from '#shared/constants'
import type { Dossier } from '../server/domains/council/dossier'
import { simulateCouncil } from '../server/domains/council/simulator'
import { evaluateHardGates, reconcileDecision } from '../server/domains/council/orchestrator'
import { buildScenarios } from '../server/domains/council/scenarios'
import { evaluateRule } from '../server/domains/rules/engine'

function dossier(overrides: Partial<Dossier> & { category: Dossier['category'] }): Dossier {
  const evidence = overrides.evidence ?? [
    { label: 'E1', kind: 'report_fact', credibility: 'high', description: 'Equifax reports balance $1,200.00 (2026-09-20)', fact: { bureau: 'equifax' }, hasDocument: false },
    { label: 'E2', kind: 'report_fact', credibility: 'high', description: 'Experian reports balance $2,600.00 (2026-09-22)', fact: { bureau: 'experian' }, hasDocument: false },
  ]
  const rule = evaluateRule({
    category: overrides.category as never,
    reportedFact: 'Balance differs',
    desiredCorrection: 'Consistent balance',
    evidence: evidence.map(e => ({ label: e.label, kind: e.kind, credibility: e.credibility, description: e.description })),
    multiBureau: (overrides.bureaus ?? ['equifax', 'experian']).length > 1,
    reportDateSpreadDays: 2,
  })
  return {
    caseCode: 'CR-2026-0042',
    title: 'Test case',
    summary: 'Test summary',
    bureaus: ['equifax', 'experian'],
    creditorName: 'Chase',
    contestedField: 'balance',
    contestedValues: { equifax: 1200, experian: 2600 },
    desiredCorrection: 'Consistent balance',
    sourceReportDate: '2026-09-22',
    priorPlans: [],
    latestResponse: null,
    userStatements: [],
    consents: { aiProcessing: true, sendCorrespondence: true },
    mode: 'demo',
    trigger: 'initial',
    ...overrides,
    evidence,
    rule: { ...rule, legalBasis: rule.legalBasis.map(l => ({ cite: l.cite, label: l.label })) },
  }
}

describe('council simulator (demo mode)', () => {
  it('produces three rounds with critiques, replies, proposals and one ballot per voting role', () => {
    const t = simulateCouncil(dossier({ category: 'misreported_balance' }))
    expect(Object.keys(t.findings)).toHaveLength(6)
    expect(t.critiques.length).toBeGreaterThanOrEqual(2)
    expect(t.replies.length).toBeGreaterThanOrEqual(1)
    for (const r of VOTING_ROLES) expect(t.ballots[r]).toBeDefined()
    expect(t.chair.summary.length).toBeGreaterThan(40)
  })

  it('only cites evidence labels that exist in the dossier', () => {
    const d = dossier({ category: 'misreported_balance' })
    const t = simulateCouncil(d)
    const gates = evaluateHardGates(d, t)
    expect(gates.fabricationCheckPassed).toBe(true)
  })

  it('a well-evidenced inconsistency proceeds with a bureau dispute', () => {
    const d = dossier({ category: 'misreported_balance' })
    const t = simulateCouncil(d)
    const gates = evaluateHardGates(d, t)
    const decision = reconcileDecision(t, gates)
    expect(gates.evidenceSufficient).toBe(true)
    expect(decision.outcome).toBe('proceed')
    expect(decision.selectedChannel).toBe('bureau_dispute')
    expect(decision.gatesRespected).toBe(true)
    expect(decision.tally.support).toBeGreaterThan(decision.tally.oppose)
  })

  it('identity theft without a report fails the compliance gate and is rejected, with a dissent recorded', () => {
    const d = dossier({
      category: 'identity_theft',
      bureaus: ['experian'],
      evidence: [
        { label: 'E1', kind: 'report_fact', credibility: 'high', description: 'Experian reports an unknown account', fact: null, hasDocument: false },
        { label: 'E2', kind: 'user_statement', credibility: 'low', description: 'I never opened this account', fact: null, hasDocument: false },
      ],
    })
    const t = simulateCouncil(d)
    const gates = evaluateHardGates(d, t)
    expect(gates.compliancePassed).toBe(false)
    const decision = reconcileDecision(t, gates)
    expect(decision.outcome).toBe('reject')
    // The compliance objection is recorded in the reviewer's proposal; the ballot
    // supports the "needs more evidence" candidate rather than a fraud letter.
    expect(t.proposals.compliance_reviewer.channel).toBe('needs_more_evidence')
    expect(t.proposals.compliance_reviewer.risks.join(' ')).toMatch(/without a report is prohibited/i)
    expect(t.chair.summary).toMatch(/compliance reviewer raised a blocking objection/i)
  })

  it('the chair cannot override a failed evidence gate', () => {
    const d = dossier({ category: 'misreported_balance' })
    const t = simulateCouncil(d)
    const gates = { ...evaluateHardGates(d, t), evidenceSufficient: false }
    t.chair.outcome = 'proceed'
    const decision = reconcileDecision(t, gates)
    expect(decision.outcome).toBe('collect_evidence')
    expect(decision.gatesRespected).toBe(false)
    expect(decision.summary).toMatch(/OVERRIDDEN BY HARD GATES/)
  })

  it('a weak case asks for more evidence instead of proceeding', () => {
    const d = dossier({
      category: 'misreported_payment',
      evidence: [
        { label: 'E1', kind: 'report_fact', credibility: 'high', description: 'Equifax current', fact: null, hasDocument: false },
        { label: 'E2', kind: 'report_fact', credibility: 'high', description: 'TransUnion 30 days late', fact: null, hasDocument: false },
      ],
    })
    const t = simulateCouncil(d)
    const decision = reconcileDecision(t, evaluateHardGates(d, t))
    expect(decision.outcome).toBe('collect_evidence')
  })

  it('a split or losing ballot escalates to the user instead of forcing a plan', () => {
    const d = dossier({ category: 'misreported_balance' })
    const t = simulateCouncil(d)
    const gates = evaluateHardGates(d, t)
    // Flip two supporters to opposition so oppose >= support while every gate still passes.
    t.ballots.bureau_specialist = { vote: 'oppose', rationale: 'Prefers a furnisher-first sequence.' }
    t.ballots.furnisher_specialist = { vote: 'oppose', rationale: 'Wants the statement first.' }
    t.ballots.adversarial_skeptic = { vote: 'oppose', rationale: 'Outcome too uncertain to file now.' }
    t.chair.outcome = 'proceed'
    const decision = reconcileDecision(t, gates)
    expect(decision.outcome).toBe('escalate')
    expect(decision.tally.oppose).toBeGreaterThanOrEqual(decision.tally.support)
    expect(decision.gatesRespected).toBe(true)
  })

  it('unknown citations are caught by the fabrication gate', () => {
    const d = dossier({ category: 'misreported_balance' })
    const t = simulateCouncil(d)
    t.findings.evidence_analyst.citations.push('E99')
    const gates = evaluateHardGates(d, t)
    expect(gates.fabricationCheckPassed).toBe(false)
    expect(reconcileDecision({ ...t, chair: { ...t.chair, outcome: 'proceed' } }, gates).outcome).toBe('collect_evidence')
  })
})

describe('response scenarios', () => {
  it('are branching, labelled illustrative and map to valid case statuses', () => {
    const d = dossier({ category: 'misreported_balance' })
    const scenarios = buildScenarios(d, 'bureau_dispute')
    expect(scenarios.length).toBeGreaterThanOrEqual(5)
    for (const s of scenarios) {
      expect(s.illustrativeOnly).toBe(true)
      expect(s.evidenceThatMatters.length).toBeGreaterThan(0)
      expect(s.recommendedNextStep.length).toBeGreaterThan(10)
      expect(typeof s.statusImpact).toBe('string')
    }
    expect(scenarios.map(s => s.key)).toContain('verified_no_change')
    expect(scenarios.map(s => s.key)).toContain('no_response')
  })
})
