import type { IssueCategory, RemedyChannel, Severity } from '#shared/constants'
import corePack from './packs/core-consumer-reporting.json'

export interface LegalBasis {
  cite: string
  label: string
  summary: string
}

export interface Rule {
  id: string
  category: IssueCategory
  title: string
  description: string
  channel: RemedyChannel
  recipientType: 'bureau' | 'furnisher' | 'collector' | 'agency'
  severity: Severity
  baseConfidence: number
  disputableWhen: string
  notDisputableWhen: string
  evidenceRequirements: string[]
  legalBasis: string[]
  typicalReviewWindow: string
}

export interface RulePack {
  id: string
  version: string
  description: string
  disclaimer: string
  legalBasis: Record<string, LegalBasis>
  rules: Rule[]
}

const packs: RulePack[] = [corePack as RulePack]

export function listRulePacks(): RulePack[] {
  return packs
}

export function findRule(category: IssueCategory): Rule | undefined {
  for (const p of packs) {
    const r = p.rules.find(x => x.category === category)
    if (r) return r
  }
  return undefined
}

export function resolveLegalBasis(rule: Rule): LegalBasis[] {
  const out: LegalBasis[] = []
  for (const key of rule.legalBasis) {
    for (const p of packs) {
      if (p.legalBasis[key]) out.push(p.legalBasis[key])
    }
  }
  return out
}

export interface EvidenceItem {
  label: string
  kind: string
  credibility: 'high' | 'medium' | 'low'
  description: string
}

export interface RuleEvaluation {
  ruleId: string
  ruleVersion: string
  category: IssueCategory
  channel: RemedyChannel
  recipientType: Rule['recipientType']
  severity: Severity
  confidence: number
  disputable: 'yes' | 'no' | 'uncertain'
  evidenceGaps: string[]
  satisfiedRequirements: string[]
  legalBasis: LegalBasis[]
  explanation: {
    reportedFact: string
    whyQuestionable: string
    supportingEvidence: string[]
    outcomeSought: string
    uncertainty: string
    ifNotCorrected: string
  }
  reviewWindow: string
  disclaimer: string
}

export interface EvaluationContext {
  category: IssueCategory
  reportedFact: string
  desiredCorrection: string
  evidence: EvidenceItem[]
  /** True when the facts came from two or more independent bureau snapshots. */
  multiBureau: boolean
  /** Report date spread (days) between the compared snapshots, when applicable. */
  reportDateSpreadDays?: number
  userStatements?: string[]
}

/**
 * Deterministic rule evaluation. The council later debates this output; it
 * never fabricates evidence that is not present in the context.
 */
export function evaluateRule(ctx: EvaluationContext): RuleEvaluation {
  const rule = findRule(ctx.category) ?? findRule('monitoring_only')!
  const pack = packs.find(p => p.rules.includes(rule))!

  let confidence = rule.baseConfidence
  const satisfied: string[] = []
  const gaps: string[] = []

  const hasDoc = ctx.evidence.some(e => e.kind === 'document' && e.credibility !== 'low')
  const hasHighReportFact = ctx.evidence.filter(e => e.kind === 'report_fact').length >= 2
  const hasStatement = ctx.evidence.some(e => e.kind === 'user_statement') || (ctx.userStatements?.length ?? 0) > 0

  for (const req of rule.evidenceRequirements) {
    const r = req.toLowerCase()
    if (r.includes('snapshot') && (hasHighReportFact || ctx.multiBureau)) satisfied.push(req)
    else if (r.includes('report date') && ctx.reportDateSpreadDays !== undefined) satisfied.push(req)
    else if ((r.includes('statement') || r.includes('agreement') || r.includes('confirmation') || r.includes('letter') || r.includes('report (ftc') || r.includes('proof of identity') || r.includes('correspondence')) && hasDoc) satisfied.push(req)
    else if (r.includes('user statement') && hasStatement) satisfied.push(req)
    else if (r.includes('side-by-side') && ctx.multiBureau) satisfied.push(req)
    else if ((r.includes('conflicting') || r.includes('across bureaus')) && hasHighReportFact && ctx.multiBureau) satisfied.push(req)
    else if (r.includes('both tradelines') && hasHighReportFact) satisfied.push(req)
    else if (r.includes('tradeline details') && ctx.evidence.length > 0) satisfied.push(req)
    else gaps.push(req)
  }

  if (ctx.multiBureau) confidence += 0.1
  if (hasDoc) confidence += 0.15
  if (ctx.reportDateSpreadDays !== undefined && ctx.reportDateSpreadDays > 45) confidence -= 0.15
  if (gaps.some(g => /(strongly recommended|identity theft report|prior bureau result)/i.test(g))) confidence -= 0.2
  confidence = Math.max(0.05, Math.min(0.97, Number(confidence.toFixed(2))))

  let disputable: RuleEvaluation['disputable']
  if (rule.channel === 'goodwill_request' || rule.channel === 'monitor_only') disputable = 'no'
  else if (rule.category === 'identity_theft' && !hasDoc) disputable = 'uncertain'
  else if (confidence >= 0.6 && gaps.filter(g => !/optional/i.test(g)).length === 0) disputable = 'yes'
  else if (confidence < 0.4) disputable = 'no'
  else disputable = 'uncertain'

  return {
    ruleId: rule.id,
    ruleVersion: pack.version,
    category: rule.category,
    channel: disputable === 'no' && rule.channel !== 'goodwill_request' && rule.channel !== 'monitor_only' ? 'needs_more_evidence' : rule.channel,
    recipientType: rule.recipientType,
    severity: rule.severity,
    confidence,
    disputable,
    evidenceGaps: gaps,
    satisfiedRequirements: satisfied,
    legalBasis: resolveLegalBasis(rule),
    explanation: {
      reportedFact: ctx.reportedFact,
      whyQuestionable: rule.description,
      supportingEvidence: ctx.evidence.map(e => `${e.label}: ${e.description}`),
      outcomeSought: ctx.desiredCorrection,
      uncertainty:
        disputable === 'yes'
          ? `Evidence meets the rule's requirements (${rule.disputableWhen}). The recipient may still verify the item as reported.`
          : disputable === 'uncertain'
            ? `Evidence is incomplete: ${gaps.join('; ') || 'confidence below threshold'}. ${rule.notDisputableWhen}`
            : rule.notDisputableWhen,
      ifNotCorrected:
        rule.channel === 'bureau_dispute'
          ? 'Request the method of verification, add a consumer statement, escalate to a direct furnisher dispute, or file a regulator complaint — each requires separate approval.'
          : rule.channel === 'debt_validation_request'
            ? 'If validation is not provided, a bureau accuracy dispute citing the lack of validation may follow, subject to council review.'
            : 'Re-evaluate with any new evidence; some paths have no further recourse.',
    },
    reviewWindow: rule.typicalReviewWindow,
    disclaimer: pack.disclaimer,
  }
}
