import { describe, expect, it } from 'vitest'
import { detectDiscrepancies, type SnapshotLike, type TradelineLike } from '../server/domains/reports/detect'
import { accountKey, creditorBrand, last4, normalizeCreditor } from '../server/domains/reports/normalize'

const NOW = new Date('2026-10-01T00:00:00Z')
const snaps: SnapshotLike[] = [
  { id: 's-eq', bureau: 'equifax', reportDate: new Date('2026-09-20') },
  { id: 's-ex', bureau: 'experian', reportDate: new Date('2026-09-22') },
  { id: 's-tr', bureau: 'transunion', reportDate: new Date('2026-09-21') },
]

function tl(partial: Partial<TradelineLike> & { bureau: TradelineLike['bureau'] }): TradelineLike {
  const months = Array.from({ length: 12 }, (_, i) => ({ month: `2026-${String(i + 1).padStart(2, '0')}`, status: 'OK' }))
  return {
    id: `${partial.bureau}-${Math.random().toString(36).slice(2, 8)}`,
    snapshotId: `s-${partial.bureau.slice(0, 2)}`,
    accountKey: 'chase|1234',
    creditorName: 'Chase',
    accountNumberMasked: '****1234',
    accountType: 'revolving',
    ownership: 'individual',
    status: 'open',
    paymentStatus: 'current',
    openedDate: new Date('2019-03-01'),
    closedDate: null,
    dateFirstDelinquency: null,
    balance: '1200.00',
    creditLimit: '5000.00',
    highBalance: '3000.00',
    originalCreditor: null,
    paymentHistory: months,
    ...partial,
  }
}

describe('account key normalisation', () => {
  it('matches creditor brand variants by first token + last four', () => {
    expect(creditorBrand('CHASE CARD SERVICES')).toBe(creditorBrand('Chase Bank USA, N.A.'))
    expect(accountKey({ creditorName: 'JPMCB CARD', accountNumberMasked: 'XXXX-1234' })).toBe(accountKey({ creditorName: 'JPMCB', accountNumberMasked: '****1234' }))
    expect(last4('xxxxxxxx9876')).toBe('9876')
    expect(normalizeCreditor('  Navient   Solutions, LLC ')).toBe(normalizeCreditor('NAVIENT SOLUTIONS LLC'))
  })
  it('does not join different last-four numbers', () => {
    expect(accountKey({ creditorName: 'Chase', accountNumberMasked: '****1234' })).not.toBe(accountKey({ creditorName: 'Chase', accountNumberMasked: '****4321' }))
  })
})

describe('detectDiscrepancies', () => {
  it('reports nothing for consistent tradelines', () => {
    const rows = [tl({ bureau: 'equifax' }), tl({ bureau: 'experian' }), tl({ bureau: 'transunion' })]
    expect(detectDiscrepancies(snaps, rows, NOW)).toHaveLength(0)
  })

  it('flags a material balance difference with per-bureau evidence', () => {
    const rows = [tl({ bureau: 'equifax', balance: '1200.00' }), tl({ bureau: 'experian', balance: '2600.00' })]
    const found = detectDiscrepancies(snaps, rows, NOW)
    const bal = found.find(d => d.category === 'misreported_balance')
    expect(bal).toBeDefined()
    expect(bal!.severity).toBe('high')
    expect(bal!.evidence).toHaveLength(2)
    expect(bal!.evidence.map(e => e.bureau).sort()).toEqual(['equifax', 'experian'])
    expect(bal!.values).toEqual({ equifax: 1200, experian: 2600 })
  })

  it('ignores trivial balance drift', () => {
    const rows = [tl({ bureau: 'equifax', balance: '1200.00' }), tl({ bureau: 'experian', balance: '1230.00' })]
    expect(detectDiscrepancies(snaps, rows, NOW).filter(d => d.category === 'misreported_balance')).toHaveLength(0)
  })

  it('flags conflicting payment history months', () => {
    const late = tl({ bureau: 'transunion', paymentStatus: '30 days late' })
    late.paymentHistory = late.paymentHistory.map(m => (m.month === '2026-03' ? { ...m, status: '30' } : m))
    const found = detectDiscrepancies(snaps, [tl({ bureau: 'equifax' }), late], NOW)
    const pay = found.find(d => d.category === 'misreported_payment')
    expect(pay).toBeDefined()
    expect(pay!.field).toBe('paymentHistory[2026-03]')
    expect(pay!.confidence).toBeGreaterThan(0.7)
  })

  it('flags ownership and status contradictions separately', () => {
    const rows = [tl({ bureau: 'equifax', ownership: 'individual', status: 'open' }), tl({ bureau: 'experian', ownership: 'authorized_user', status: 'closed' })]
    const cats = detectDiscrepancies(snaps, rows, NOW).map(d => d.category)
    expect(cats).toContain('ownership_mismatch')
    expect(cats).toContain('contradictory_fields')
  })

  it('flags a derogatory account missing a DOFD on a single bureau', () => {
    const rows = [tl({ bureau: 'equifax', accountType: 'collection', paymentStatus: 'collection', dateFirstDelinquency: null })]
    const found = detectDiscrepancies(snaps, rows, NOW)
    expect(found.some(d => d.category === 'incomplete_reporting' && d.field === 'dateFirstDelinquency')).toBe(true)
  })

  it('never compares accounts with different keys', () => {
    const rows = [tl({ bureau: 'equifax', accountKey: 'chase|1234', balance: '100.00' }), tl({ bureau: 'experian', accountKey: 'chase|9999', accountNumberMasked: '****9999', balance: '9000.00' })]
    expect(detectDiscrepancies(snaps, rows, NOW).filter(d => d.category === 'misreported_balance')).toHaveLength(0)
  })

  it('produces stable fingerprints for dedupe', () => {
    const rows = [tl({ bureau: 'equifax', balance: '1200.00' }), tl({ bureau: 'experian', balance: '2600.00' })]
    const a = detectDiscrepancies(snaps, rows, NOW).map(d => d.fingerprint)
    const b = detectDiscrepancies(snaps, rows, NOW).map(d => d.fingerprint)
    expect(a).toEqual(b)
  })
})
