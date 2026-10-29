import { eq, desc } from 'drizzle-orm'
import { getDb, schema } from '../../db'
import { sha256Hex, redactPii } from '../../utils/crypto'
import { evaluateCaseRules } from '../cases/service'
import type { RuleEvaluation } from '../rules/engine'

export interface DossierEvidence {
  label: string
  kind: string
  credibility: 'high' | 'medium' | 'low'
  description: string
  fact: Record<string, unknown> | null
  hasDocument: boolean
}

export interface Dossier {
  caseCode: string
  category: string
  title: string
  summary: string
  bureaus: string[]
  creditorName: string | null
  contestedField: string | null
  contestedValues: Record<string, unknown>
  desiredCorrection: string | null
  sourceReportDate: string | null
  evidence: DossierEvidence[]
  rule: Pick<RuleEvaluation, 'ruleId' | 'ruleVersion' | 'channel' | 'recipientType' | 'severity' | 'confidence' | 'disputable' | 'evidenceGaps' | 'satisfiedRequirements' | 'reviewWindow'> & {
    legalBasis: { cite: string; label: string }[]
    explanation: RuleEvaluation['explanation']
  }
  priorPlans: { version: number; status: string; channel: string; outcomeSummary?: string }[]
  latestResponse: { category: string; summary: string; matchedScenarioKey: string | null } | null
  userStatements: string[]
  consents: { aiProcessing: boolean; sendCorrespondence: boolean }
  mode: string
  trigger: string
}

/**
 * Builds the immutable evidence dossier shared by every agent. PII is
 * minimized: only masked identifiers and already-redacted descriptions.
 */
export async function buildDossier(caseId: string, trigger: string): Promise<{ dossier: Dossier; hash: string }> {
  const db = getDb()
  const c = await db.query.cases.findFirst({ where: eq(schema.cases.id, caseId) })
  if (!c) throw createError({ statusCode: 404, statusMessage: 'Case not found' })
  const evidence = await db.select().from(schema.caseEvidence).where(eq(schema.caseEvidence.caseId, caseId))
  const plans = await db.select().from(schema.casePlans).where(eq(schema.casePlans.caseId, caseId)).orderBy(desc(schema.casePlans.version))
  const analyses = await db.select().from(schema.responseAnalyses).where(eq(schema.responseAnalyses.caseId, caseId)).orderBy(desc(schema.responseAnalyses.createdAt)).limit(1)
  const consents = await db.select().from(schema.consents).where(eq(schema.consents.userId, c.userId))
  const rule = await evaluateCaseRules(caseId)

  const dossier: Dossier = {
    caseCode: c.code,
    category: c.category,
    title: redactPii(c.title),
    summary: redactPii(c.summary),
    bureaus: c.bureaus,
    creditorName: c.creditorName,
    contestedField: c.contestedField,
    contestedValues: c.contestedValues as Record<string, unknown>,
    desiredCorrection: c.desiredCorrection,
    sourceReportDate: c.sourceReportDate?.toISOString().slice(0, 10) ?? null,
    evidence: evidence.map(e => ({
      label: e.label,
      kind: e.kind,
      credibility: e.credibility,
      description: redactPii(e.description),
      fact: e.fact ? { field: e.fact.field, value: e.fact.value, bureau: e.fact.bureau, reportDate: e.fact.reportDate } : null,
      hasDocument: !!e.documentId,
    })),
    rule: {
      ruleId: rule.ruleId,
      ruleVersion: rule.ruleVersion,
      channel: rule.channel,
      recipientType: rule.recipientType,
      severity: rule.severity,
      confidence: rule.confidence,
      disputable: rule.disputable,
      evidenceGaps: rule.evidenceGaps,
      satisfiedRequirements: rule.satisfiedRequirements,
      reviewWindow: rule.reviewWindow,
      legalBasis: rule.legalBasis.map(l => ({ cite: l.cite, label: l.label })),
      explanation: rule.explanation,
    },
    priorPlans: plans.map(p => ({ version: p.version, status: p.status, channel: p.strategy.channel })),
    latestResponse: analyses[0] ? { category: analyses[0].category, summary: redactPii(analyses[0].summary), matchedScenarioKey: analyses[0].matchedScenarioKey } : null,
    userStatements: evidence.filter(e => e.kind === 'user_statement').map(e => redactPii(e.description)),
    consents: {
      aiProcessing: consents.some(x => x.kind === 'ai_processing' && x.granted),
      sendCorrespondence: consents.some(x => x.kind === 'send_correspondence' && x.granted),
    },
    mode: c.mode,
    trigger,
  }
  const hash = sha256Hex(JSON.stringify(dossier))
  return { dossier, hash }
}
