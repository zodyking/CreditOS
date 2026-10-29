import { describe, expect, it } from 'vitest'
import { evaluateRule, findRule, listRulePacks, type EvidenceItem } from '../server/domains/rules/engine'

const fact = (label: string, bureau: string): EvidenceItem => ({ label, kind: 'report_fact', credibility: 'high', description: `${bureau} reports value` })
const doc = (label: string): EvidenceItem => ({ label, kind: 'document', credibility: 'high', description: 'Bank statement' })
const stmt = (label: string): EvidenceItem => ({ label, kind: 'user_statement', credibility: 'low', description: 'I never applied' })

describe('rule packs', () => {
  it('ships a core pack with legal-basis metadata and a disclaimer', () => {
    const packs = listRulePacks()
    expect(packs.length).toBeGreaterThan(0)
    expect(packs[0]!.disclaimer).toMatch(/not legal advice/i)
    expect(findRule('misreported_balance')).toBeDefined()
  })
})

describe('evaluateRule', () => {
  it('a balance mismatch backed by two bureau facts is disputable without extra documents', () => {
    const r = evaluateRule({ category: 'misreported_balance', reportedFact: 'EQ $1,200 vs EX $2,600', desiredCorrection: 'Consistent balance', evidence: [fact('E1', 'Equifax'), fact('E2', 'Experian')], multiBureau: true, reportDateSpreadDays: 2 })
    expect(r.disputable).toBe('yes')
    expect(r.channel).toBe('bureau_dispute')
    expect(r.evidenceGaps.filter(g => !/optional/i.test(g))).toHaveLength(0)
    expect(r.legalBasis.map(l => l.cite)).toContain('15 U.S.C. § 1681i')
  })

  it('a payment-history conflict needs the bank statement before it is disputable', () => {
    const without = evaluateRule({ category: 'misreported_payment', reportedFact: 'TU 30 late, EQ current', desiredCorrection: 'Correct March', evidence: [fact('E1', 'Equifax'), fact('E2', 'TransUnion')], multiBureau: true })
    expect(without.disputable).not.toBe('yes')
    expect(without.evidenceGaps.some(g => /statement/i.test(g))).toBe(true)
    const withDoc = evaluateRule({ category: 'misreported_payment', reportedFact: 'TU 30 late, EQ current', desiredCorrection: 'Correct March', evidence: [fact('E1', 'Equifax'), fact('E2', 'TransUnion'), doc('E3')], multiBureau: true })
    expect(withDoc.disputable).toBe('yes')
    expect(withDoc.confidence).toBeGreaterThan(without.confidence)
  })

  it('identity theft without a report is uncertain and lists the report as a gap', () => {
    const r = evaluateRule({ category: 'identity_theft', reportedFact: 'Unknown account', desiredCorrection: 'Block', evidence: [fact('E1', 'Experian'), stmt('E2')], multiBureau: false })
    expect(r.disputable).toBe('uncertain')
    expect(r.evidenceGaps.some(g => /identity theft report/i.test(g))).toBe(true)
    expect(r.channel).toBe('identity_theft_report')
  })

  it('goodwill candidates are never disputable and keep the goodwill channel', () => {
    const r = evaluateRule({ category: 'goodwill_candidate', reportedFact: 'One accurate 30-day late', desiredCorrection: 'Goodwill removal', evidence: [fact('E1', 'Equifax'), stmt('E2')], multiBureau: false })
    expect(r.disputable).toBe('no')
    expect(r.channel).toBe('goodwill_request')
  })

  it('stale report dates reduce confidence', () => {
    const fresh = evaluateRule({ category: 'misreported_balance', reportedFact: 'x', desiredCorrection: 'y', evidence: [fact('E1', 'a'), fact('E2', 'b')], multiBureau: true, reportDateSpreadDays: 3 })
    const stale = evaluateRule({ category: 'misreported_balance', reportedFact: 'x', desiredCorrection: 'y', evidence: [fact('E1', 'a'), fact('E2', 'b')], multiBureau: true, reportDateSpreadDays: 90 })
    expect(stale.confidence).toBeLessThan(fresh.confidence)
  })

  it('explanation always echoes the reported fact and never invents evidence', () => {
    const ev = [fact('E1', 'Equifax')]
    const r = evaluateRule({ category: 'collection_validation', reportedFact: 'Harbor Collections $412', desiredCorrection: 'Validate', evidence: ev, multiBureau: false })
    expect(r.explanation.reportedFact).toBe('Harbor Collections $412')
    expect(r.explanation.supportingEvidence).toHaveLength(1)
    expect(r.explanation.supportingEvidence[0]).toContain('E1')
  })
})
