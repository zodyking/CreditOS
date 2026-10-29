import { and, desc, eq, inArray } from 'drizzle-orm'
import { BUREAUS, type Bureau, type DataMode } from '#shared/constants'
import { getDb, schema } from '../../db'
import type { ReportSnapshot, Tradeline } from '../../db/schema'
import { liveBus } from '../../utils/events'
import { accountKey, numStr, parseDate, summarize, type ImportReport } from './normalize'
import { detectDiscrepancies, type DetectedDiscrepancy } from './detect'
import { recordMonitoringEvent } from '../monitoring/service'

export async function importReport(userId: string, report: ImportReport, mode: DataMode, documentId?: string): Promise<ReportSnapshot> {
  const db = getDb()
  const previous = await latestSnapshot(userId, report.bureau)

  const snapshot = await db.transaction(async tx => {
    const [snap] = await tx
      .insert(schema.reportSnapshots)
      .values({
        userId,
        bureau: report.bureau,
        source: report.source,
        mode,
        reportDate: new Date(report.reportDate),
        documentId: documentId ?? null,
        personalInfo: report.personalInfo,
        score: report.score ?? null,
        summary: summarize(report),
        raw: report.raw,
      })
      .returning()
    if (report.tradelines.length) {
      await tx.insert(schema.tradelines).values(
        report.tradelines.map(t => ({
          snapshotId: snap!.id,
          userId,
          bureau: report.bureau,
          accountKey: accountKey(t),
          creditorName: t.creditorName,
          accountNumberMasked: t.accountNumberMasked,
          accountType: t.accountType,
          ownership: t.ownership,
          status: t.status,
          paymentStatus: t.paymentStatus,
          openedDate: parseDate(t.openedDate),
          reportedDate: parseDate(t.reportedDate),
          closedDate: parseDate(t.closedDate),
          dateFirstDelinquency: parseDate(t.dateFirstDelinquency),
          balance: numStr(t.balance),
          creditLimit: numStr(t.creditLimit),
          highBalance: numStr(t.highBalance),
          pastDue: numStr(t.pastDue),
          monthlyPayment: numStr(t.monthlyPayment),
          originalCreditor: t.originalCreditor ?? null,
          paymentHistory: t.paymentHistory,
          remarks: t.remarks,
          raw: t.raw,
        })),
      )
    }
    if (report.inquiries.length) {
      await tx.insert(schema.inquiries).values(
        report.inquiries.map(i => ({
          snapshotId: snap!.id,
          userId,
          bureau: report.bureau,
          subscriberName: i.subscriberName,
          inquiryDate: new Date(i.inquiryDate),
          type: i.type,
          purpose: i.purpose ?? null,
          raw: i.raw,
        })),
      )
    }
    return snap!
  })

  await diffAgainstPrevious(userId, snapshot, previous, mode)
  liveBus.publish('report.imported', { bureau: report.bureau, snapshotId: snapshot.id, mode }, userId)
  return snapshot
}

export async function latestSnapshot(userId: string, bureau: Bureau): Promise<ReportSnapshot | undefined> {
  const db = getDb()
  return db.query.reportSnapshots.findFirst({
    where: and(eq(schema.reportSnapshots.userId, userId), eq(schema.reportSnapshots.bureau, bureau)),
    orderBy: [desc(schema.reportSnapshots.reportDate), desc(schema.reportSnapshots.pulledAt)],
  })
}

export async function latestSnapshots(userId: string): Promise<Partial<Record<Bureau, ReportSnapshot>>> {
  const out: Partial<Record<Bureau, ReportSnapshot>> = {}
  for (const b of BUREAUS) {
    const s = await latestSnapshot(userId, b)
    if (s) out[b] = s
  }
  return out
}

export async function tradelinesForSnapshots(snapshotIds: string[]): Promise<Tradeline[]> {
  if (!snapshotIds.length) return []
  const db = getDb()
  return db.select().from(schema.tradelines).where(inArray(schema.tradelines.snapshotId, snapshotIds))
}

export interface ComparisonRow {
  accountKey: string
  creditorName: string
  accountNumberMasked: string
  accountType: string
  perBureau: Partial<Record<Bureau, Tradeline>>
  matchConfidence: 'exact' | 'single'
  fieldsDiffer: string[]
}

export async function compareLatest(userId: string) {
  const snaps = await latestSnapshots(userId)
  const ids = Object.values(snaps).map(s => s.id)
  const rows = await tradelinesForSnapshots(ids)
  const db = getDb()
  const inq = ids.length ? await db.select().from(schema.inquiries).where(inArray(schema.inquiries.snapshotId, ids)) : []

  const byKey = new Map<string, ComparisonRow>()
  for (const t of rows) {
    const row = byKey.get(t.accountKey) ?? {
      accountKey: t.accountKey,
      creditorName: t.creditorName,
      accountNumberMasked: t.accountNumberMasked,
      accountType: t.accountType,
      perBureau: {},
      matchConfidence: 'single' as const,
      fieldsDiffer: [],
    }
    row.perBureau[t.bureau] = t
    byKey.set(t.accountKey, row)
  }
  for (const row of byKey.values()) {
    const present = Object.values(row.perBureau)
    row.matchConfidence = present.length > 1 ? 'exact' : 'single'
    if (present.length > 1) {
      for (const f of ['balance', 'creditLimit', 'status', 'paymentStatus', 'openedDate', 'ownership', 'dateFirstDelinquency'] as const) {
        const vals = new Set(present.map(t => String(t[f] instanceof Date ? (t[f] as Date).toISOString().slice(0, 10) : (t[f] ?? ''))))
        if (vals.size > 1) row.fieldsDiffer.push(f)
      }
    }
  }
  return {
    snapshots: snaps,
    accounts: [...byKey.values()].sort((a, b) => b.fieldsDiffer.length - a.fieldsDiffer.length || a.creditorName.localeCompare(b.creditorName)),
    inquiries: inq,
  }
}

export async function snapshotHistory(userId: string) {
  const db = getDb()
  return db
    .select({
      id: schema.reportSnapshots.id,
      bureau: schema.reportSnapshots.bureau,
      source: schema.reportSnapshots.source,
      mode: schema.reportSnapshots.mode,
      reportDate: schema.reportSnapshots.reportDate,
      pulledAt: schema.reportSnapshots.pulledAt,
      summary: schema.reportSnapshots.summary,
      score: schema.reportSnapshots.score,
      documentId: schema.reportSnapshots.documentId,
    })
    .from(schema.reportSnapshots)
    .where(eq(schema.reportSnapshots.userId, userId))
    .orderBy(desc(schema.reportSnapshots.reportDate))
}

/** Run detection on the latest snapshots and upsert discrepancies (deduped by fingerprint). */
export async function runDiscrepancyDetection(userId: string): Promise<{ created: DetectedDiscrepancy[]; existing: number }> {
  const db = getDb()
  const snaps = await latestSnapshots(userId)
  const snapList = Object.values(snaps)
  const rows = await tradelinesForSnapshots(snapList.map(s => s.id))
  const detected = detectDiscrepancies(
    snapList.map(s => ({ id: s.id, bureau: s.bureau, reportDate: s.reportDate })),
    rows.map(t => ({ ...t, paymentHistory: t.paymentHistory })),
  )
  const mode: DataMode = snapList.some(s => s.mode === 'live') ? 'live' : snapList.some(s => s.mode === 'sandbox') ? 'sandbox' : 'demo'
  const created: DetectedDiscrepancy[] = []
  let existing = 0
  for (const d of detected) {
    const inserted = await db
      .insert(schema.discrepancies)
      .values({
        userId,
        accountKey: d.accountKey,
        category: d.category,
        severity: d.severity,
        confidence: d.confidence.toFixed(3),
        field: d.field,
        title: d.title,
        summary: d.summary,
        values: d.values,
        evidence: d.evidence,
        actionable: d.actionable,
        fingerprint: d.fingerprint,
        mode,
      })
      .onConflictDoNothing({ target: [schema.discrepancies.userId, schema.discrepancies.fingerprint] })
      .returning({ id: schema.discrepancies.id })
    if (inserted.length) created.push(d)
    else existing++
  }
  if (created.length) liveBus.publish('discrepancies.detected', { count: created.length }, userId)
  return { created, existing }
}

async function diffAgainstPrevious(userId: string, current: ReportSnapshot, previous: ReportSnapshot | undefined, mode: DataMode) {
  const db = getDb()
  const curRows = await tradelinesForSnapshots([current.id])
  const curInq = await db.select().from(schema.inquiries).where(eq(schema.inquiries.snapshotId, current.id))
  const bureau = current.bureau
  if (!previous) {
    await recordMonitoringEvent(userId, {
      bureau,
      kind: 'snapshot.first',
      severity: 'low',
      title: `First ${bureau} snapshot imported`,
      detail: `${curRows.length} tradelines and ${curInq.length} inquiries recorded from ${current.source} (report date ${current.reportDate.toISOString().slice(0, 10)}).`,
      fingerprint: `snapshot.first:${bureau}`,
      snapshotId: current.id,
      mode,
    })
    return
  }
  const prevRows = await tradelinesForSnapshots([previous.id])
  const prevInq = await db.select().from(schema.inquiries).where(eq(schema.inquiries.snapshotId, previous.id))
  const prevByKey = new Map(prevRows.map(r => [r.accountKey, r]))
  const curByKey = new Map(curRows.map(r => [r.accountKey, r]))

  for (const [key, row] of curByKey) {
    const prev = prevByKey.get(key)
    if (!prev) {
      await recordMonitoringEvent(userId, {
        bureau,
        kind: 'tradeline.new',
        severity: row.accountType === 'collection' ? 'high' : 'medium',
        title: `New ${row.accountType} account: ${row.creditorName}`,
        detail: `${row.creditorName} (${row.accountNumberMasked}) appears on ${bureau} as of ${current.reportDate.toISOString().slice(0, 10)} and was not on the previous snapshot.`,
        fingerprint: `tradeline.new:${bureau}:${key}`,
        snapshotId: current.id,
        previousSnapshotId: previous.id,
        entityRef: { accountKey: key, tradelineId: row.id },
        mode,
      })
      continue
    }
    if (prev.balance !== row.balance) {
      await recordMonitoringEvent(userId, {
        bureau,
        kind: 'tradeline.balance_change',
        severity: 'low',
        title: `${row.creditorName}: balance changed`,
        detail: `Balance moved from $${prev.balance ?? '—'} to $${row.balance ?? '—'} on ${bureau}.`,
        fingerprint: `tradeline.balance_change:${bureau}:${key}`,
        snapshotId: current.id,
        previousSnapshotId: previous.id,
        entityRef: { accountKey: key, tradelineId: row.id },
        mode,
      })
    }
    if (prev.paymentStatus !== row.paymentStatus) {
      await recordMonitoringEvent(userId, {
        bureau,
        kind: 'tradeline.status_change',
        severity: /late|charge|collection/i.test(row.paymentStatus) ? 'high' : 'medium',
        title: `${row.creditorName}: payment status changed to "${row.paymentStatus}"`,
        detail: `Previously "${prev.paymentStatus}" on ${bureau}.`,
        fingerprint: `tradeline.status_change:${bureau}:${key}`,
        snapshotId: current.id,
        previousSnapshotId: previous.id,
        entityRef: { accountKey: key, tradelineId: row.id },
        mode,
      })
    }
  }
  for (const [key, prev] of prevByKey) {
    if (!curByKey.has(key)) {
      await recordMonitoringEvent(userId, {
        bureau,
        kind: 'tradeline.removed',
        severity: 'medium',
        title: `${prev.creditorName} no longer appears on ${bureau}`,
        detail: `The account (${prev.accountNumberMasked}) was on the previous snapshot but is absent from the latest one. Verify whether this reflects a correction.`,
        fingerprint: `tradeline.removed:${bureau}:${key}`,
        snapshotId: current.id,
        previousSnapshotId: previous.id,
        entityRef: { accountKey: key },
        mode,
      })
    }
  }
  const prevInqKeys = new Set(prevInq.map(i => `${i.subscriberName}|${i.inquiryDate.toISOString().slice(0, 10)}`))
  for (const i of curInq) {
    const k = `${i.subscriberName}|${i.inquiryDate.toISOString().slice(0, 10)}`
    if (!prevInqKeys.has(k) && i.type === 'hard') {
      await recordMonitoringEvent(userId, {
        bureau,
        kind: 'inquiry.new',
        severity: 'medium',
        title: `New hard inquiry: ${i.subscriberName}`,
        detail: `Hard inquiry dated ${i.inquiryDate.toISOString().slice(0, 10)} on ${bureau}. Confirm you recognise this application.`,
        fingerprint: `inquiry.new:${bureau}:${k}`,
        snapshotId: current.id,
        previousSnapshotId: previous.id,
        entityRef: { inquiryId: i.id },
        mode,
      })
    }
  }
}
