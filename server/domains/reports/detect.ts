import type { Bureau, IssueCategory, Severity } from '#shared/constants'
import type { DiscrepancyEvidence } from '../../db/schema'

export interface SnapshotLike {
  id: string
  bureau: Bureau
  reportDate: Date
}

export interface TradelineLike {
  id: string
  snapshotId: string
  bureau: Bureau
  accountKey: string
  creditorName: string
  accountNumberMasked: string
  accountType: string
  ownership: string
  status: string
  paymentStatus: string
  openedDate: Date | null
  closedDate: Date | null
  dateFirstDelinquency: Date | null
  balance: string | null
  creditLimit: string | null
  highBalance: string | null
  originalCreditor: string | null
  paymentHistory: { month: string; status: string }[]
}

export interface DetectedDiscrepancy {
  fingerprint: string
  accountKey: string | null
  category: IssueCategory
  severity: Severity
  confidence: number
  field: string
  title: string
  summary: string
  values: Partial<Record<Bureau, unknown>>
  evidence: DiscrepancyEvidence[]
  actionable: boolean
  creditorName: string
  desiredCorrection: string
}

const num = (v: string | null) => (v === null ? null : Number(v))
const daysBetween = (a: Date, b: Date) => Math.abs(a.getTime() - b.getTime()) / 86_400_000
const fmtMoney = (v: number | null) => (v === null ? '—' : `$${v.toLocaleString('en-US', { minimumFractionDigits: 2 })}`)
const fmtDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : '—')
const isDerog = (t: TradelineLike) =>
  t.accountType === 'collection' || /charge|collection|late|delinq|30|60|90|120/i.test(t.paymentStatus) || /charge/i.test(t.status)

function ev(t: TradelineLike, snap: SnapshotLike, field: string, value: unknown): DiscrepancyEvidence {
  return { bureau: t.bureau, snapshotId: snap.id, tradelineId: t.id, field, value, reportDate: snap.reportDate.toISOString() }
}

/**
 * Pure, deterministic cross-bureau discrepancy detection. Operates on the latest
 * snapshot per bureau. Never joins accounts with different account keys.
 */
export function detectDiscrepancies(snapshots: SnapshotLike[], tradelines: TradelineLike[], now = new Date()): DetectedDiscrepancy[] {
  const snapById = new Map(snapshots.map(s => [s.id, s]))
  const byKey = new Map<string, TradelineLike[]>()
  for (const t of tradelines) {
    if (!snapById.has(t.snapshotId)) continue
    const arr = byKey.get(t.accountKey) ?? []
    arr.push(t)
    byKey.set(t.accountKey, arr)
  }

  const out: DetectedDiscrepancy[] = []

  for (const [key, group] of byKey) {
    // one tradeline per bureau (latest snapshot only)
    const perBureau = new Map<Bureau, TradelineLike>()
    for (const t of group) perBureau.set(t.bureau, t)
    const rows = [...perBureau.values()]
    const creditor = rows[0]!.creditorName
    const spread = rows.length > 1 ? Math.max(...rows.map(r => daysBetween(snapById.get(r.snapshotId)!.reportDate, now))) : 0

    if (rows.length >= 2) {
      // Balance
      const balances = rows.map(r => num(r.balance)).filter((v): v is number => v !== null)
      if (balances.length >= 2) {
        const max = Math.max(...balances)
        const min = Math.min(...balances)
        if (max - min > 50 && (max - min) / Math.max(max, 1) > 0.05) {
          out.push({
            fingerprint: `misreported_balance:${key}:balance`,
            accountKey: key,
            category: 'misreported_balance',
            severity: max - min > 1000 ? 'high' : 'medium',
            confidence: spread > 45 ? 0.5 : 0.7,
            field: 'balance',
            title: `${creditor}: balance differs by ${fmtMoney(max - min)} across bureaus`,
            summary: rows.map(r => `${label(r.bureau)} reports ${fmtMoney(num(r.balance))} (as of ${fmtDate(snapById.get(r.snapshotId)!.reportDate)})`).join('; ') + '.',
            values: Object.fromEntries(rows.map(r => [r.bureau, num(r.balance)])),
            evidence: rows.map(r => ev(r, snapById.get(r.snapshotId)!, 'balance', num(r.balance))),
            actionable: true,
            creditorName: creditor,
            desiredCorrection: `Report the verified current balance consistently at every bureau.`,
          })
        }
      }

      // Payment status / history
      const statuses = new Set(rows.map(r => r.paymentStatus.toLowerCase()))
      const conflictingMonths = findConflictingMonths(rows)
      if (statuses.size > 1 || conflictingMonths.length > 0) {
        const derogRow = rows.find(r => isDerog(r)) ?? rows[0]!
        out.push({
          fingerprint: `misreported_payment:${key}:paymentStatus`,
          accountKey: key,
          category: 'misreported_payment',
          severity: 'high',
          confidence: conflictingMonths.length > 0 ? 0.78 : 0.62,
          field: conflictingMonths.length > 0 ? `paymentHistory[${conflictingMonths[0]}]` : 'paymentStatus',
          title: `${creditor}: payment history conflicts across bureaus${conflictingMonths.length ? ` (${conflictingMonths.join(', ')})` : ''}`,
          summary:
            rows.map(r => `${label(r.bureau)} shows "${r.paymentStatus}"${conflictingMonths.length ? ` with ${describeMonths(r, conflictingMonths)}` : ''}`).join('; ') + '.',
          values: Object.fromEntries(rows.map(r => [r.bureau, conflictingMonths.length ? describeMonths(r, conflictingMonths) : r.paymentStatus])),
          evidence: rows.map(r => ev(r, snapById.get(r.snapshotId)!, 'paymentStatus', { paymentStatus: r.paymentStatus, months: pickMonths(r, conflictingMonths) })),
          actionable: true,
          creditorName: creditor,
          desiredCorrection: `Correct the payment history for ${derogRow.bureau === rows[0]!.bureau ? 'the' : 'each'} month shown inconsistently and report it uniformly.`,
        })
      }

      // Open/closed status
      const statusSet = new Set(rows.map(r => r.status.toLowerCase()))
      if (statusSet.size > 1) {
        out.push({
          fingerprint: `contradictory_fields:${key}:status`,
          accountKey: key,
          category: 'contradictory_fields',
          severity: 'medium',
          confidence: 0.6,
          field: 'status',
          title: `${creditor}: account status reported as ${[...statusSet].join(' vs ')}`,
          summary: rows.map(r => `${label(r.bureau)}: ${r.status}`).join('; ') + '.',
          values: Object.fromEntries(rows.map(r => [r.bureau, r.status])),
          evidence: rows.map(r => ev(r, snapById.get(r.snapshotId)!, 'status', r.status)),
          actionable: true,
          creditorName: creditor,
          desiredCorrection: 'Report the account status consistently with the furnisher record.',
        })
      }

      // Opened date spread
      const opened = rows.filter(r => r.openedDate)
      if (opened.length >= 2) {
        const dates = opened.map(r => r.openedDate!.getTime())
        if ((Math.max(...dates) - Math.min(...dates)) / 86_400_000 > 60) {
          out.push({
            fingerprint: `contradictory_fields:${key}:openedDate`,
            accountKey: key,
            category: 'contradictory_fields',
            severity: 'low',
            confidence: 0.55,
            field: 'openedDate',
            title: `${creditor}: opened date differs by more than 60 days`,
            summary: opened.map(r => `${label(r.bureau)}: opened ${fmtDate(r.openedDate)}`).join('; ') + '.',
            values: Object.fromEntries(opened.map(r => [r.bureau, fmtDate(r.openedDate)])),
            evidence: opened.map(r => ev(r, snapById.get(r.snapshotId)!, 'openedDate', fmtDate(r.openedDate))),
            actionable: true,
            creditorName: creditor,
            desiredCorrection: 'Report the correct account open date.',
          })
        }
      }

      // Ownership
      const own = new Set(rows.map(r => r.ownership.toLowerCase()))
      if (own.size > 1) {
        out.push({
          fingerprint: `ownership_mismatch:${key}:ownership`,
          accountKey: key,
          category: 'ownership_mismatch',
          severity: 'medium',
          confidence: 0.55,
          field: 'ownership',
          title: `${creditor}: ownership reported as ${[...own].join(' vs ')}`,
          summary: rows.map(r => `${label(r.bureau)}: ${r.ownership}`).join('; ') + '.',
          values: Object.fromEntries(rows.map(r => [r.bureau, r.ownership])),
          evidence: rows.map(r => ev(r, snapById.get(r.snapshotId)!, 'ownership', r.ownership)),
          actionable: true,
          creditorName: creditor,
          desiredCorrection: 'Report the consumer\u2019s actual responsibility code for the account.',
        })
      }
    }

    // Single-bureau checks (apply per row)
    for (const r of rows) {
      const snap = snapById.get(r.snapshotId)!
      if (isDerog(r) && !r.dateFirstDelinquency) {
        out.push({
          fingerprint: `incomplete_reporting:${key}:dofd:${r.bureau}`,
          accountKey: key,
          category: 'incomplete_reporting',
          severity: 'medium',
          confidence: 0.7,
          field: 'dateFirstDelinquency',
          title: `${creditor}: ${label(r.bureau)} reports a derogatory status without a Date of First Delinquency`,
          summary: `${label(r.bureau)} shows "${r.paymentStatus}" for ${r.accountNumberMasked} but the DOFD field is empty, so the removal date cannot be computed.`,
          values: { [r.bureau]: null },
          evidence: [ev(r, snap, 'dateFirstDelinquency', null), ev(r, snap, 'paymentStatus', r.paymentStatus)],
          actionable: true,
          creditorName: creditor,
          desiredCorrection: 'Report the Date of First Delinquency or remove the unverifiable derogatory entry.',
        })
      }
      if (isDerog(r) && r.dateFirstDelinquency) {
        const obsoleteAt = new Date(r.dateFirstDelinquency.getTime() + (180 + 365 * 7 + 2) * 86_400_000)
        if (obsoleteAt < now) {
          out.push({
            fingerprint: `obsolete_reporting:${key}:${r.bureau}`,
            accountKey: key,
            category: 'obsolete_reporting',
            severity: 'high',
            confidence: 0.82,
            field: 'dateFirstDelinquency',
            title: `${creditor}: item appears past its reporting period at ${label(r.bureau)}`,
            summary: `DOFD ${fmtDate(r.dateFirstDelinquency)} + 180 days + 7 years = ${fmtDate(obsoleteAt)}, which precedes the report date ${fmtDate(snap.reportDate)}.`,
            values: { [r.bureau]: fmtDate(r.dateFirstDelinquency) },
            evidence: [ev(r, snap, 'dateFirstDelinquency', fmtDate(r.dateFirstDelinquency)), ev(r, snap, 'reportDate', fmtDate(snap.reportDate))],
            actionable: true,
            creditorName: creditor,
            desiredCorrection: 'Remove the obsolete item from the report.',
          })
        }
      }
    }
  }

  // Duplicate tradelines within one bureau (original creditor + balance match, both reporting a balance)
  const byBureau = new Map<Bureau, TradelineLike[]>()
  for (const t of tradelines) {
    if (!snapById.has(t.snapshotId)) continue
    const arr = byBureau.get(t.bureau) ?? []
    arr.push(t)
    byBureau.set(t.bureau, arr)
  }
  for (const [bureau, rows] of byBureau) {
    for (let i = 0; i < rows.length; i++) {
      for (let j = i + 1; j < rows.length; j++) {
        const a = rows[i]!
        const b = rows[j]!
        if (a.accountKey === b.accountKey) continue
        const sameDebt =
          (a.originalCreditor && b.originalCreditor && norm(a.originalCreditor) === norm(b.originalCreditor)) ||
          (a.originalCreditor && norm(a.originalCreditor) === norm(b.creditorName)) ||
          (b.originalCreditor && norm(b.originalCreditor) === norm(a.creditorName))
        const ba = num(a.balance) ?? 0
        const bb = num(b.balance) ?? 0
        if (sameDebt && ba > 0 && bb > 0 && Math.abs(ba - bb) / Math.max(ba, bb) < 0.1) {
          const snap = snapById.get(a.snapshotId)!
          const fp = `duplicate_tradeline:${[a.accountKey, b.accountKey].sort().join('+')}:${bureau}`
          out.push({
            fingerprint: fp,
            accountKey: a.accountKey,
            category: 'duplicate_tradeline',
            severity: 'medium',
            confidence: 0.62,
            field: 'balance',
            title: `${label(bureau)}: ${a.creditorName} and ${b.creditorName} both report a balance for the same debt`,
            summary: `${a.creditorName} (${a.accountNumberMasked}) reports ${fmtMoney(ba)} and ${b.creditorName} (${b.accountNumberMasked}) reports ${fmtMoney(bb)}; both reference ${a.originalCreditor ?? b.originalCreditor}.`,
            values: { [bureau]: { [a.creditorName]: ba, [b.creditorName]: bb } },
            evidence: [ev(a, snap, 'balance', ba), ev(b, snapById.get(b.snapshotId)!, 'balance', bb)],
            actionable: true,
            creditorName: a.creditorName,
            desiredCorrection: 'Report the debt once; the transferred/sold tradeline should show a zero balance.',
          })
        }
      }
    }
  }

  return out
}

function label(b: Bureau) {
  return b.charAt(0).toUpperCase() + b.slice(1)
}
function norm(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '')
}
function findConflictingMonths(rows: TradelineLike[]): string[] {
  const months = new Map<string, Set<string>>()
  for (const r of rows) {
    for (const h of r.paymentHistory) {
      const set = months.get(h.month) ?? new Set()
      set.add(h.status)
      months.set(h.month, set)
    }
  }
  return [...months.entries()]
    .filter(([, set]) => set.size > 1)
    .map(([m]) => m)
    .sort()
}
function pickMonths(r: TradelineLike, months: string[]) {
  return r.paymentHistory.filter(h => months.includes(h.month))
}
function describeMonths(r: TradelineLike, months: string[]) {
  return pickMonths(r, months)
    .map(h => `${h.month}=${h.status}`)
    .join(', ')
}
