import { and, desc, eq, sql } from 'drizzle-orm'
import type { Bureau, DataMode, Severity } from '#shared/constants'
import { getDb, schema } from '../../db'
import { liveBus } from '../../utils/events'
import { notify } from '../../utils/audit'

export interface MonitoringEventInput {
  bureau?: Bureau
  kind: string
  severity: Severity
  title: string
  detail: string
  fingerprint: string
  snapshotId?: string
  previousSnapshotId?: string
  entityRef?: Record<string, unknown>
  mode: DataMode
}

/**
 * Insert-or-bump. Repeated detections of the same fingerprint increment the
 * occurrence counter instead of creating alert storms.
 */
export async function recordMonitoringEvent(userId: string, input: MonitoringEventInput) {
  const db = getDb()
  const [row] = await db
    .insert(schema.monitoringEvents)
    .values({
      userId,
      bureau: input.bureau ?? null,
      kind: input.kind,
      severity: input.severity,
      title: input.title,
      detail: input.detail,
      fingerprint: input.fingerprint,
      snapshotId: input.snapshotId ?? null,
      previousSnapshotId: input.previousSnapshotId ?? null,
      entityRef: input.entityRef ?? {},
      mode: input.mode,
    })
    .onConflictDoUpdate({
      target: [schema.monitoringEvents.userId, schema.monitoringEvents.fingerprint],
      set: {
        occurrences: sql`${schema.monitoringEvents.occurrences} + 1`,
        lastSeenAt: new Date(),
        snapshotId: input.snapshotId ?? null,
        detail: input.detail,
      },
    })
    .returning()
  const isNew = row!.occurrences === 1
  if (isNew) {
    liveBus.publish('monitoring.event', { id: row!.id, kind: input.kind, severity: input.severity, title: input.title }, userId)
    if (input.severity === 'high' || input.severity === 'critical') {
      await notify(userId, { kind: 'monitoring', title: input.title, body: input.detail, href: '/monitoring', severity: input.severity })
    }
  }
  return { row: row!, isNew }
}

export async function listMonitoringEvents(userId: string, opts: { status?: string; bureau?: Bureau; limit?: number } = {}) {
  const db = getDb()
  const where = [eq(schema.monitoringEvents.userId, userId)]
  if (opts.status) where.push(eq(schema.monitoringEvents.status, opts.status as 'new'))
  if (opts.bureau) where.push(eq(schema.monitoringEvents.bureau, opts.bureau))
  return db
    .select()
    .from(schema.monitoringEvents)
    .where(and(...where))
    .orderBy(desc(schema.monitoringEvents.lastSeenAt))
    .limit(opts.limit ?? 200)
}

export async function setMonitoringEventStatus(userId: string, id: string, status: 'reviewed' | 'dismissed' | 'suppressed' | 'new') {
  const db = getDb()
  const [row] = await db
    .update(schema.monitoringEvents)
    .set({ status })
    .where(and(eq(schema.monitoringEvents.id, id), eq(schema.monitoringEvents.userId, userId)))
    .returning()
  return row
}
