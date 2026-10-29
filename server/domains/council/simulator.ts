import type { AgentRole, RemedyChannel } from '#shared/constants'
import { AGENT_ROLE_META, REMEDY_CHANNEL_LABEL, VOTING_ROLES } from '#shared/constants'
import type { Dossier } from './dossier'
import type { Ballot, Chair, Critique, Finding, Proposal, Reply } from './schemas'

/**
 * Deterministic council simulator used ONLY in DEMO mode. Every statement is
 * derived from the dossier; nothing is invented. Output is labelled as
 * simulated everywhere it is displayed.
 */

export interface SimulatedTranscript {
  findings: Record<AgentRole, Finding>
  critiques: { from: AgentRole; critique: Critique }[]
  replies: { from: AgentRole; to: AgentRole; reply: Reply }[]
  proposals: Record<AgentRole, Proposal>
  ballots: Record<AgentRole, Ballot>
  chair: Chair
}

function labels(d: Dossier, kind?: string): string[] {
  return d.evidence.filter(e => !kind || e.kind === kind).map(e => e.label)
}
function allLabels(d: Dossier): string[] {
  return d.evidence.map(e => e.label)
}
function firstLabel(d: Dossier): string {
  return d.evidence[0]?.label ?? 'E1'
}
function joinLabels(ls: string[]): string {
  return ls.length ? `[${ls.join(', ')}]` : ''
}

const recipientFor = (ch: RemedyChannel): Proposal['recipientType'] =>
  ch === 'furnisher_direct_dispute' || ch === 'goodwill_request' ? 'furnisher' : ch === 'debt_validation_request' ? 'collector' : 'bureau'

export function simulateCouncil(d: Dossier): SimulatedTranscript {
  const reportFacts = labels(d, 'report_fact')
  const docs = labels(d, 'document')
  const statements = labels(d, 'user_statement')
  const gaps = d.rule.evidenceGaps
  const hardGaps = gaps.filter(g => !/optional/i.test(g))
  const weak = d.rule.disputable !== 'yes'
  const conf = d.rule.confidence
  const channel = d.rule.channel
  const multi = d.bureaus.length > 1
  const bureauList = d.bureaus.map(b => b.charAt(0).toUpperCase() + b.slice(1)).join(', ')
  const idTheftNoReport = d.category === 'identity_theft' && docs.length === 0
  const isGoodwill = d.category === 'goodwill_candidate'
  const isMonitor = d.category === 'monitoring_only' || channel === 'monitor_only'
  const hasResponse = !!d.latestResponse

  // ── Round 1: independent findings ──────────────────────────────────────────
  const findings: Record<AgentRole, Finding> = {
    evidence_analyst: {
      summary: `The dossier contains ${reportFacts.length} report-sourced fact${reportFacts.length === 1 ? '' : 's'} ${joinLabels(reportFacts)}${docs.length ? `, ${docs.length} document${docs.length === 1 ? '' : 's'} ${joinLabels(docs)}` : ''}${statements.length ? ` and ${statements.length} user statement${statements.length === 1 ? '' : 's'} ${joinLabels(statements)}` : ''}. ${
        multi ? `The contested field "${d.contestedField}" is reported differently by ${bureauList}, which is a verifiable inconsistency rather than an opinion.` : `Only one bureau is represented, so the inconsistency cannot be corroborated across sources from the report alone.`
      } ${hardGaps.length ? `Coverage gaps remain: ${hardGaps.join('; ')}.` : 'Rule evidence requirements are met.'}`,
      keyFacts: d.evidence.slice(0, 6).map(e => `${e.label}: ${e.description}`),
      concerns: hardGaps.length ? hardGaps.map(g => `Missing evidence: ${g}`) : ['Report dates differ between bureaus; some variance may reflect timing.'],
      citations: allLabels(d).slice(0, 6),
      confidence: Math.min(0.95, conf + (docs.length ? 0.1 : 0)),
    },
    bureau_specialist: {
      summary: multi
        ? `Because ${bureauList} receive the same Metro 2 record from the furnisher, divergence on "${d.contestedField}" ${joinLabels(reportFacts)} points to either a stale update at one bureau or a furnisher transmission error. A reinvestigation request to each bureau reporting the questionable value is the standard route; the bureau must forward the dispute to the furnisher.`
        : `With a single bureau represented, the right first step is to confirm whether the other bureaus report the account at all before choosing a dispute target ${joinLabels(reportFacts)}.`,
      keyFacts: [`Contested field: ${d.contestedField ?? 'n/a'}`, `Reported values: ${JSON.stringify(d.contestedValues)}`, `Rule: ${d.rule.ruleId} v${d.rule.ruleVersion}`],
      concerns: [d.rule.reviewWindow !== 'n/a' ? `Review window: ${d.rule.reviewWindow}` : 'No statutory window applies to this path.'],
      citations: reportFacts.length ? reportFacts : [firstLabel(d)],
      confidence: multi ? Math.min(0.9, conf + 0.05) : Math.max(0.2, conf - 0.15),
    },
    furnisher_specialist: {
      summary: `${d.creditorName ?? 'The furnisher'} controls the source record. ${
        channel === 'debt_validation_request'
          ? `As a third-party collection, a written validation request to the collector is distinct from a bureau accuracy dispute and should precede it ${joinLabels(reportFacts)}.`
          : channel === 'goodwill_request'
            ? `The entry appears accurate; the only honest path is a discretionary goodwill request to the furnisher, not a dispute ${joinLabels(reportFacts)}.`
            : `A parallel direct dispute to the furnisher is available but duplicative at this stage; I recommend the bureau route first and the furnisher route only if the bureau verifies without change ${joinLabels(reportFacts)}.`
      }`,
      keyFacts: [`Furnisher: ${d.creditorName ?? 'unknown'}`, `Recommended recipient type: ${d.rule.recipientType}`],
      concerns: ['Furnisher may simply re-verify the existing record without reviewing underlying documents.'],
      citations: reportFacts.length ? reportFacts.slice(0, 2) : [firstLabel(d)],
      confidence: Math.max(0.3, conf - 0.05),
    },
    compliance_reviewer: {
      summary: idTheftNoReport
        ? `BLOCKING: the dossier asserts identity theft but contains no identity theft report or proof of identity. Any letter asserting fraud without that documentation is prohibited content under CreditOS policy and cannot be approved ${joinLabels(allLabels(d))}.`
        : isGoodwill
          ? `The item is accurate. A dispute would be frivolous; only a goodwill request is permissible, and it must not characterise the entry as inaccurate.`
          : `No prohibited content detected. The claim is limited to a verifiable inconsistency with cited evidence ${joinLabels(allLabels(d).slice(0, 4))}. Consent for AI processing: ${d.consents.aiProcessing ? 'present' : 'ABSENT'}; consent for correspondence: ${d.consents.sendCorrespondence ? 'present' : 'ABSENT — mailing will remain blocked until granted'}. ${hardGaps.length ? `Letter must not assert facts the evidence does not support (${hardGaps.length} gap${hardGaps.length === 1 ? '' : 's'}).` : ''}`,
      keyFacts: d.rule.legalBasis.map(l => `${l.cite} — ${l.label}`),
      concerns: [
        ...(d.consents.sendCorrespondence ? [] : ['Correspondence consent not yet granted.']),
        ...(idTheftNoReport ? ['Identity theft report missing.'] : []),
        'Letter must distinguish requested outcome from guaranteed outcome.',
      ],
      citations: allLabels(d).slice(0, 3).length ? allLabels(d).slice(0, 3) : [firstLabel(d)],
      confidence: idTheftNoReport ? 0.15 : 0.85,
    },
    adversarial_skeptic: {
      summary: weak
        ? `The case is weaker than it looks. Confidence is ${Math.round(conf * 100)}% and ${hardGaps.length ? `the following is missing: ${hardGaps.join('; ')}` : 'the rule threshold is not met'}. A bureau will likely respond "verified as reported" and the case will have consumed its first dispute cycle without documentary proof ${joinLabels(reportFacts)}.`
        : multi
          ? `The strongest rebuttal is timing: report dates differ and the furnisher may have updated one bureau later than another. Expect "information updated" rather than deletion. The dispute should ask for consistency, not removal, unless removal is independently supported ${joinLabels(reportFacts)}.`
          : `A single-source inconsistency can be explained as a reporting lag. Without the other bureaus or a statement, the bureau will almost certainly verify ${joinLabels(reportFacts)}.`,
      keyFacts: [`Confidence: ${Math.round(conf * 100)}%`, `Evidence gaps: ${hardGaps.length}`],
      concerns: ['Bureau may use automated e-OSCAR verification without reviewing enclosures.', 'Requesting deletion without basis would weaken credibility.'],
      citations: reportFacts.length ? reportFacts.slice(0, 2) : [firstLabel(d)],
      confidence: weak ? 0.35 : 0.6,
    },
    decision_chair: {
      summary: `Opening the round. Dossier hash locked; ${d.evidence.length} evidence items, rule ${d.rule.ruleId}. ${hasResponse ? `A real response has been received (${d.latestResponse!.category}); this round reassesses the plan against it.` : 'No bureau response yet.'}`,
      keyFacts: [`Trigger: ${d.trigger}`],
      concerns: [],
      citations: [firstLabel(d)],
      confidence: 0.5,
    },
  }

  // ── Round 2: critiques and replies ─────────────────────────────────────────
  const critiques: SimulatedTranscript['critiques'] = [
    {
      from: 'adversarial_skeptic',
      critique: {
        targetRole: 'bureau_specialist',
        critique: `Your Metro 2 argument assumes the furnisher sent identical records on the same day. The dossier shows different report dates ${joinLabels(reportFacts)}; the gap may be ordinary lag. Ask for the furnisher's current record rather than asserting an error.`,
        citations: reportFacts.slice(0, 2),
        severity: multi ? 'material' : 'blocking',
      },
    },
    {
      from: 'compliance_reviewer',
      critique: {
        targetRole: 'furnisher_specialist',
        critique: idTheftNoReport
          ? `Any furnisher contact must not claim fraud until an identity theft report is on file. Hold the furnisher route.`
          : `Running a bureau dispute and a furnisher dispute simultaneously risks being treated as repetitive. Sequence them and record the decision.`,
        citations: allLabels(d).slice(0, 1),
        severity: idTheftNoReport ? 'blocking' : 'minor',
      },
    },
    {
      from: 'evidence_analyst',
      critique: {
        targetRole: 'adversarial_skeptic',
        critique: weak
          ? `Agreed on weakness, but "verified as reported" is not the only outcome: the bureau must forward enclosures, so even a thin dispute surfaces the furnisher's record. The right call is to collect ${hardGaps[0] ?? 'supporting documents'} first, then file once.`
          : `Timing lag cannot explain a contradiction within the same reporting month ${joinLabels(reportFacts)}. The inconsistency is factual regardless of which bureau is stale.`,
        citations: reportFacts.slice(0, 2),
        severity: 'material',
      },
    },
  ]

  const replies: SimulatedTranscript['replies'] = [
    {
      from: 'bureau_specialist',
      to: 'adversarial_skeptic',
      reply: {
        reply: `Fair point on lag. I revise the requested outcome from "correct the error" to "reinvestigate and report the furnisher's verified current value consistently", which is accurate whichever bureau is stale ${joinLabels(reportFacts)}.`,
        positionChanged: true,
        citations: reportFacts.slice(0, 2),
      },
    },
    {
      from: 'furnisher_specialist',
      to: 'compliance_reviewer',
      reply: {
        reply: idTheftNoReport
          ? `Accepted. Furnisher contact deferred until the identity theft report is uploaded.`
          : `Accepted. Bureau route first; furnisher direct dispute only if the bureau verifies without change, and only after a new council round.`,
        positionChanged: true,
        citations: [],
      },
    },
    {
      from: 'adversarial_skeptic',
      to: 'evidence_analyst',
      reply: {
        reply: weak
          ? `I maintain my objection: filing without ${hardGaps[0] ?? 'documents'} wastes the first cycle. I will vote to collect evidence rather than proceed.`
          : `I concede the same-month contradiction is factual, but I still expect an "updated" result rather than deletion, and the letter must not promise otherwise.`,
        positionChanged: !weak,
        citations: reportFacts.slice(0, 1),
      },
    },
  ]

  // ── Round 3: revised proposals ─────────────────────────────────────────────
  const baseProposal = (ch: RemedyChannel, approach: string, extraRisks: string[] = []): Proposal => ({
    channel: ch,
    recipientType: recipientFor(ch),
    approach,
    requestedOutcome: d.desiredCorrection ?? d.rule.explanation.outcomeSought,
    risks: ['Recipient may verify the item as reported.', 'Outcome is not guaranteed and may differ by bureau.', ...extraRisks],
    proofRequirements: [...d.rule.satisfiedRequirements.map(r => `Present: ${r}`), ...hardGaps.map(g => `Missing: ${g}`)],
    uncertainty: `Confidence ${Math.round(conf * 100)}%. Scenarios are illustrative, not predictions.`,
    estimatedTimeline: d.rule.reviewWindow,
    citations: allLabels(d).slice(0, 4),
  })

  const proposals: Record<AgentRole, Proposal> = {
    evidence_analyst: weak
      ? baseProposal('needs_more_evidence', `Collect ${hardGaps.join(' and ') || 'a supporting statement or document'} before filing. Re-run the council when uploaded.`)
      : baseProposal(channel, `Proceed via ${REMEDY_CHANNEL_LABEL[channel]} citing ${joinLabels(allLabels(d).slice(0, 4))}; enclose every report excerpt and any documents.`),
    bureau_specialist: isMonitor
      ? baseProposal('monitor_only', 'Record and watch; no dispute is supported.')
      : baseProposal(weak ? 'needs_more_evidence' : channel, `Send to ${multi ? 'each bureau reporting the inconsistent value' : d.bureaus[0] ?? 'the reporting bureau'} asking for reinvestigation and consistent reporting of the verified value.`),
    furnisher_specialist: isGoodwill
      ? baseProposal('goodwill_request', 'Discretionary goodwill request to the furnisher; make no accuracy claim.')
      : channel === 'debt_validation_request'
        ? baseProposal('debt_validation_request', 'Written validation request to the collector before any bureau dispute.')
        : baseProposal(weak ? 'needs_more_evidence' : channel, 'Bureau route first; hold the furnisher direct dispute in reserve.'),
    compliance_reviewer: idTheftNoReport
      ? baseProposal('needs_more_evidence', 'Blocked until identity theft report and proof of identity are uploaded.', ['Asserting fraud without a report is prohibited.'])
      : baseProposal(weak ? 'needs_more_evidence' : channel, `Approve the ${REMEDY_CHANNEL_LABEL[channel]} template only if it limits claims to cited evidence and states the requested outcome without guarantees.`),
    adversarial_skeptic: weak
      ? baseProposal('needs_more_evidence', 'Do not file yet. Gather proof, then file once with full enclosures.', ['Filing a thin dispute burns the first cycle.'])
      : baseProposal(channel, 'Proceed, but request consistency/verification rather than deletion, and prepare for an "updated" result.', ['Expect partial update rather than deletion.']),
    decision_chair: baseProposal(weak ? 'needs_more_evidence' : channel, 'Consolidated candidate for ballot.'),
  }

  // ── Ballots on the consolidated candidate ──────────────────────────────────
  const candidate: RemedyChannel = idTheftNoReport ? 'needs_more_evidence' : isMonitor ? 'monitor_only' : isGoodwill ? 'goodwill_request' : weak ? 'needs_more_evidence' : channel
  const ballots: Record<AgentRole, Ballot> = {
    evidence_analyst: {
      vote: 'support',
      rationale: weak ? `Supports collecting ${hardGaps[0] ?? 'evidence'} first; the dossier does not yet meet the rule's requirements.` : `Supports: evidence ${joinLabels(allLabels(d).slice(0, 3))} documents a verifiable inconsistency.`,
    },
    bureau_specialist: {
      vote: 'support',
      rationale: weak ? 'Supports deferring; a thin filing invites automated verification.' : 'Supports the bureau reinvestigation route with the revised, lag-proof requested outcome.',
    },
    furnisher_specialist: {
      vote: weak && !idTheftNoReport ? 'abstain' : 'support',
      rationale: weak && !idTheftNoReport ? 'Abstains: would prefer a furnisher-side inquiry in parallel with evidence collection, but defers to the majority.' : 'Supports; furnisher route held in reserve.',
    },
    compliance_reviewer: {
      vote: 'support',
      rationale: idTheftNoReport ? 'Supports the block: no fraud assertion without a report.' : `Supports subject to the letter limiting claims to cited evidence${d.consents.sendCorrespondence ? '.' : ' and consent being granted before any mailing.'}`,
    },
    adversarial_skeptic: {
      vote: weak ? 'support' : conf < 0.75 ? 'oppose' : 'abstain',
      rationale: weak
        ? 'Supports collecting evidence; filing now would be premature.'
        : conf < 0.75
          ? `Opposes proceeding now: at ${Math.round(conf * 100)}% confidence the most likely result is "updated" or "verified"; a statement or document would materially strengthen the request.`
          : 'Abstains: the inconsistency is real, but the outcome is uncertain; recorded for the minority view.',
    },
    decision_chair: { vote: 'abstain', rationale: 'Chair does not vote.' },
  }

  const tally = { support: 0, oppose: 0, abstain: 0 }
  for (const r of VOTING_ROLES) tally[ballots[r].vote]++
  const dissenters = VOTING_ROLES.filter(r => ballots[r].vote === 'oppose')

  const outcome: Chair['outcome'] = idTheftNoReport
    ? 'reject'
    : isMonitor
      ? 'monitor_only'
      : weak
        ? 'collect_evidence'
        : tally.support > tally.oppose
          ? 'proceed'
          : 'escalate'

  const chair: Chair = {
    outcome,
    selectedChannel: candidate,
    summary:
      outcome === 'proceed'
        ? `Ballot ${tally.support}–${tally.oppose}–${tally.abstain} (support–oppose–abstain) in favour of ${REMEDY_CHANNEL_LABEL[candidate]}. The requested outcome is reinvestigation and consistent reporting of the verified value, not deletion. All hard gates pass. The plan requires your approval before any letter is mailed.`
        : outcome === 'reject'
          ? `Ballot ${tally.support}–${tally.oppose}–${tally.abstain}. The compliance reviewer raised a blocking objection: identity theft is asserted without an identity theft report or proof of identity. No letter asserting fraud may be drafted or sent. The case is blocked until the report is uploaded; the council will re-run automatically when it is.`
        : outcome === 'collect_evidence'
          ? `Ballot ${tally.support}–${tally.oppose}–${tally.abstain}. The council declines to file now: ${hardGaps.join('; ') || 'the rule threshold is not met'}. Upload the requested evidence and the council will re-run automatically.`
          : outcome === 'monitor_only'
            ? `The council finds no disputable inaccuracy. The item stays under monitoring; any change will re-trigger review.`
            : `The council is split (${tally.support}–${tally.oppose}–${tally.abstain}). Escalating for your decision rather than forcing a plan.`,
    minorityOpinion: dissenters.length
      ? `${dissenters.map(r => AGENT_ROLE_META[r].label).join(', ')} dissent: ${dissenters.map(r => ballots[r].rationale).join(' ')}`
      : undefined,
  }

  return { findings, critiques, replies, proposals, ballots, chair }
}
