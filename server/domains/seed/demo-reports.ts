import type { ImportReport } from '../reports/normalize'

/**
 * Synthetic three-bureau dataset. Every value is fictional. The three
 * snapshots intentionally disagree in specific, realistic ways so that the
 * detector, rules engine and council have real work to do.
 */

const months = (spec: Record<string, string>, from = '2025-11', count = 12) => {
  const out: { month: string; status: 'OK' | '30' | '60' | '90' | '120' | 'CO' | 'ND' }[] = []
  const [y, m] = from.split('-').map(Number) as [number, number]
  for (let i = 0; i < count; i++) {
    const d = new Date(Date.UTC(y, m - 1 + i, 1))
    const key = d.toISOString().slice(0, 7)
    out.push({ month: key, status: (spec[key] as 'OK') ?? 'OK' })
  }
  return out
}

const personal = (variant: 'eq' | 'ex' | 'tu') => ({
  nameOnFile: variant === 'tu' ? 'JORDAN A DEMO' : 'Jordan Avery Demo',
  addresses: ['1420 Harbor View Ln, Apt 3B, Portland, OR 97209', ...(variant === 'ex' ? ['88 Meridian Ct, Beaverton, OR 97006 (previous)'] : [])],
  dateOfBirthMasked: '••/••/1989',
  ssnMasked: '•••-••-4821',
  employers: variant === 'eq' ? ['Northwind Analytics'] : [],
})

export const DEMO_EQUIFAX: ImportReport = {
  bureau: 'equifax',
  reportDate: '2026-10-12',
  source: 'demo',
  personalInfo: personal('eq'),
  score: null,
  tradelines: [
    { creditorName: 'Capital One Bank USA', accountNumberMasked: '****4421', accountType: 'revolving', ownership: 'individual', status: 'open', paymentStatus: 'current', openedDate: '2019-05-14', reportedDate: '2026-10-05', balance: 1240.5, creditLimit: 5000, highBalance: 3120, pastDue: 0, monthlyPayment: 35, paymentHistory: months({}), remarks: [], raw: {} },
    { creditorName: 'Chase Auto Finance', accountNumberMasked: '****7788', accountType: 'installment', ownership: 'individual', status: 'open', paymentStatus: 'current', openedDate: '2022-02-10', reportedDate: '2026-10-03', balance: 14890, creditLimit: null, highBalance: 28400, pastDue: 0, monthlyPayment: 512, paymentHistory: months({}), remarks: [], raw: {} },
    { creditorName: 'Midland Credit Management', accountNumberMasked: '****0912', accountType: 'collection', ownership: 'individual', status: 'open', paymentStatus: 'collection', openedDate: '2020-01-20', reportedDate: '2026-09-28', dateFirstDelinquency: '2019-02-15', balance: 842, creditLimit: null, highBalance: 842, pastDue: 842, monthlyPayment: null, originalCreditor: 'Synchrony Bank / Amazon', paymentHistory: [], remarks: ['Placed for collection'], raw: {} },
    { creditorName: 'Synchrony Bank / Amazon', accountNumberMasked: '****5530', accountType: 'revolving', ownership: 'individual', status: 'closed', paymentStatus: 'charge-off', openedDate: '2017-06-03', reportedDate: '2026-09-28', closedDate: '2019-09-01', dateFirstDelinquency: '2019-02-15', balance: 842, creditLimit: 1500, highBalance: 1480, pastDue: 842, monthlyPayment: null, paymentHistory: [], remarks: ['Charged off as bad debt'], raw: {} },
    { creditorName: 'Discover Bank', accountNumberMasked: '****2201', accountType: 'revolving', ownership: 'individual', status: 'open', paymentStatus: 'current', openedDate: '2018-11-22', reportedDate: '2026-10-07', balance: 310.25, creditLimit: 7500, highBalance: 2200, pastDue: 0, monthlyPayment: 25, paymentHistory: months({}), remarks: [], raw: {} },
    { creditorName: 'Navient Solutions', accountNumberMasked: '****3310', accountType: 'installment', ownership: 'individual', status: 'open', paymentStatus: 'current', openedDate: '2016-08-01', reportedDate: '2026-10-01', balance: 18250, creditLimit: null, highBalance: 27000, pastDue: 0, monthlyPayment: 289, paymentHistory: months({}), remarks: ['Student loan'], raw: {} },
    { creditorName: 'Wells Fargo Home Mortgage', accountNumberMasked: '****9001', accountType: 'mortgage', ownership: 'joint', status: 'open', paymentStatus: 'current', openedDate: '2021-04-30', reportedDate: '2026-10-02', balance: 287400, creditLimit: null, highBalance: 312000, pastDue: 0, monthlyPayment: 1890, paymentHistory: months({}), remarks: [], raw: {} },
    { creditorName: 'Comenity Bank / Express', accountNumberMasked: '****6677', accountType: 'revolving', ownership: 'individual', status: 'open', paymentStatus: 'current', openedDate: '2020-09-12', reportedDate: '2026-08-15', balance: 0, creditLimit: 1200, highBalance: 640, pastDue: 0, monthlyPayment: 0, paymentHistory: months({}), remarks: [], raw: {} },
  ],
  inquiries: [
    { subscriberName: 'Chase Auto Finance', inquiryDate: '2022-02-08', type: 'hard', purpose: 'Auto loan', raw: {} },
    { subscriberName: 'Wells Fargo Home Mortgage', inquiryDate: '2021-04-02', type: 'hard', purpose: 'Mortgage', raw: {} },
    { subscriberName: 'Capital One', inquiryDate: '2026-06-18', type: 'soft', purpose: 'Account review', raw: {} },
  ],
  raw: { generator: 'creditos-demo', note: 'Synthetic data — not a real consumer file.' },
}

export const DEMO_EXPERIAN: ImportReport = {
  bureau: 'experian',
  reportDate: '2026-10-09',
  source: 'demo',
  personalInfo: personal('ex'),
  score: { value: 684, model: 'VantageScore 3.0', provider: 'demo-provider (synthetic)', asOf: '2026-10-09' },
  tradelines: [
    { creditorName: 'CAPITAL ONE', accountNumberMasked: '••••••••••••4421', accountType: 'revolving', ownership: 'individual', status: 'open', paymentStatus: 'current', openedDate: '2019-05-14', reportedDate: '2026-10-04', balance: 1240.5, creditLimit: 5000, highBalance: 3120, pastDue: 0, monthlyPayment: 35, paymentHistory: months({}), remarks: [], raw: {} },
    { creditorName: 'CHASE AUTO', accountNumberMasked: '••••••••7788', accountType: 'installment', ownership: 'individual', status: 'open', paymentStatus: '30 days late', openedDate: '2022-02-10', reportedDate: '2026-10-03', balance: 14890, creditLimit: null, highBalance: 28400, pastDue: 0, monthlyPayment: 512, paymentHistory: months({ '2026-03': '30' }), remarks: ['Account 30 days past due date in Mar 2026'], raw: {} },
    { creditorName: 'DISCOVER BANK', accountNumberMasked: '••••2201', accountType: 'revolving', ownership: 'individual', status: 'open', paymentStatus: 'current', openedDate: '2018-11-22', reportedDate: '2026-10-06', balance: 310.25, creditLimit: 7500, highBalance: 2200, pastDue: 0, monthlyPayment: 25, paymentHistory: months({}), remarks: [], raw: {} },
    { creditorName: 'NAVIENT', accountNumberMasked: '••••3310', accountType: 'installment', ownership: 'joint', status: 'open', paymentStatus: 'current', openedDate: '2016-08-01', reportedDate: '2026-10-01', balance: 18250, creditLimit: null, highBalance: 27000, pastDue: 0, monthlyPayment: 289, paymentHistory: months({}), remarks: ['Education loan'], raw: {} },
    { creditorName: 'WELLS FARGO HM MORTGAG', accountNumberMasked: '••••9001', accountType: 'mortgage', ownership: 'joint', status: 'open', paymentStatus: 'current', openedDate: '2021-04-30', reportedDate: '2026-10-02', balance: 287400, creditLimit: null, highBalance: 312000, pastDue: 0, monthlyPayment: 1890, paymentHistory: months({}), remarks: [], raw: {} },
    { creditorName: 'COMENITY BANK/EXPRESS', accountNumberMasked: '••••6677', accountType: 'revolving', ownership: 'individual', status: 'closed', paymentStatus: 'current', openedDate: '2020-09-12', reportedDate: '2026-09-30', closedDate: '2026-07-20', balance: 0, creditLimit: 1200, highBalance: 640, pastDue: 0, monthlyPayment: 0, paymentHistory: months({}), remarks: ['Account closed at consumer request'], raw: {} },
  ],
  inquiries: [
    { subscriberName: 'CHASE AUTO', inquiryDate: '2022-02-08', type: 'hard', purpose: 'Auto', raw: {} },
    { subscriberName: 'WELLS FARGO HM MORTGAG', inquiryDate: '2021-04-02', type: 'hard', purpose: 'Real estate', raw: {} },
  ],
  raw: { generator: 'creditos-demo', note: 'Synthetic data — not a real consumer file.' },
}

export const DEMO_TRANSUNION: ImportReport = {
  bureau: 'transunion',
  reportDate: '2026-10-14',
  source: 'demo',
  personalInfo: personal('tu'),
  score: null,
  tradelines: [
    { creditorName: 'CAPITAL ONE BANK USA NA', accountNumberMasked: 'XXXXXXXXXXXX4421', accountType: 'revolving', ownership: 'individual', status: 'open', paymentStatus: 'current', openedDate: '2019-05-14', reportedDate: '2026-08-02', balance: 0, creditLimit: 5000, highBalance: 3120, pastDue: 0, monthlyPayment: 0, paymentHistory: months({}), remarks: [], raw: {} },
    { creditorName: 'CHASE AUTO FINANCE', accountNumberMasked: 'XXXXXXXX7788', accountType: 'installment', ownership: 'individual', status: 'open', paymentStatus: 'current', openedDate: '2022-02-10', reportedDate: '2026-10-03', balance: 14890, creditLimit: null, highBalance: 28400, pastDue: 0, monthlyPayment: 512, paymentHistory: months({}), remarks: [], raw: {} },
    { creditorName: 'MIDLAND CREDIT MGMT', accountNumberMasked: 'XXXX0912', accountType: 'collection', ownership: 'individual', status: 'open', paymentStatus: 'collection', openedDate: '2020-01-20', reportedDate: '2026-09-30', dateFirstDelinquency: null, balance: 842, creditLimit: null, highBalance: 842, pastDue: 842, monthlyPayment: null, originalCreditor: 'SYNCHRONY BANK/AMAZON', paymentHistory: [], remarks: ['Collection account'], raw: {} },
    { creditorName: 'DISCOVER BANK', accountNumberMasked: 'XXXX2201', accountType: 'revolving', ownership: 'individual', status: 'open', paymentStatus: 'current', openedDate: '2018-11-22', reportedDate: '2026-10-07', balance: 310.25, creditLimit: 7500, highBalance: 2200, pastDue: 0, monthlyPayment: 25, paymentHistory: months({}), remarks: [], raw: {} },
    { creditorName: 'NAVIENT SOLUTIONS LLC', accountNumberMasked: 'XXXX3310', accountType: 'installment', ownership: 'individual', status: 'open', paymentStatus: 'current', openedDate: '2017-01-15', reportedDate: '2026-10-01', balance: 18250, creditLimit: null, highBalance: 27000, pastDue: 0, monthlyPayment: 289, paymentHistory: months({}), remarks: ['Student loan'], raw: {} },
    { creditorName: 'WELLS FARGO HOME MORTGAGE', accountNumberMasked: 'XXXX9001', accountType: 'mortgage', ownership: 'joint', status: 'open', paymentStatus: 'current', openedDate: '2021-04-30', reportedDate: '2026-10-02', balance: 287400, creditLimit: null, highBalance: 312000, pastDue: 0, monthlyPayment: 1890, paymentHistory: months({}), remarks: [], raw: {} },
  ],
  inquiries: [
    { subscriberName: 'CHASE AUTO FINANCE', inquiryDate: '2022-02-08', type: 'hard', purpose: 'Auto loan', raw: {} },
    { subscriberName: 'QUANTUM LENDING SOLUTIONS', inquiryDate: '2026-09-21', type: 'hard', purpose: 'Personal loan', raw: {} },
  ],
  raw: { generator: 'creditos-demo', note: 'Synthetic data — not a real consumer file.' },
}

/** Older Equifax snapshot used to generate monitoring diffs (new collection, balance change). */
export const DEMO_EQUIFAX_PREVIOUS: ImportReport = {
  ...DEMO_EQUIFAX,
  reportDate: '2026-07-10',
  tradelines: DEMO_EQUIFAX.tradelines
    .filter(t => t.creditorName !== 'Midland Credit Management')
    .map(t => (t.creditorName === 'Capital One Bank USA' ? { ...t, balance: 860.1, reportedDate: '2026-07-05' } : t)),
  inquiries: DEMO_EQUIFAX.inquiries.slice(0, 2),
}
