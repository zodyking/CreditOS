import { hostname } from 'node:os'
import { and, asc, eq, lte, sql } from 'drizzle-orm'
import type { JobKind } from '#shared/constants'
import { getDb, schema } from '../../db'
import type { Job } from '../../db/schema'
import { liveBus } from '../../utils/events'

export type JobHandler = (payload: Record<string, unknown>, job: Job) => Promise<void>

const handlers = new Map<string, JobHandler>()
const workerId = `${hostname()}-${process.pid}`

export function registerJobHandler(kind: JobKind, handler: JobHandler) {
  handlers.set(kind, handler)
}

export async function enqueueJob(kind: JobKind, payload: Record<string, unknown> = {}, opts: { runAt?: Date; idempotencyKey?: string; maxAttempts?: number } = {}): Promise<Job | null> {
  const db = getDb()
  const rows = await db
    .insert(schema.jobs)
    .values({ kind, payload, runAt: opts.runAt ?? new Date(), idempotencyKey: opts.idempotencyKey ?? null, maxAttempts: opts.maxAttempts ?? 5 })
    .onConflictDoNothing({ target: schema.jobs.idempotencyKey, where: sql`${schema.jobs.idempotencyKey} is not null` })
    .returning()
  const job = rows[0] ?? null
  if (job) liveBus.publish('job.enqueued', { id: job.id, kind })
  return job
}

/** Claim one due job using SKIP LOCKED so multiple instances never double-run. */
async function claimNext(): Promise<Job | null> {
  const db = getDb()
  return db.transaction(async tx => {
    const [row] = await tx
      .select()
      .from(schema.jobs)
      .where(and(eq(schema.jobs.status, 'pending'), lte(schema.jobs.runAt, new Date())))
      .orderBy(asc(schema.jobs.runAt))
      .limit(1)
      .for('update', { skipLocked: true })
    if (!row) return null
    const [claimed] = await tx
      .update(schema.jobs)
      .set({ status: 'running', lockedAt: new Date(), lockedBy: workerId, attempts: sql`${schema.jobs.attempts} + 1` })
      .where(eq(schema.jobs.id, row.id))
      .returning()
    return claimed ?? null
  })
}

export async function runOnce(): Promise<boolean> {
  const job = await claimNext()
  if (!job) return false
  const db = getDb()
  const handler = handlers.get(job.kind)
  try {
    if (!handler) throw new Error(`No handler registered for job kind ${job.kind}`)
    await handler(job.payload, job)
    await db.update(schema.jobs).set({ status: 'completed', completedAt: new Date(), lockedAt: null, lockedBy: null }).where(eq(schema.jobs.id, job.id))
    liveBus.publish('job.completed', { id: job.id, kind: job.kind })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    const dead = job.attempts >= job.maxAttempts
    const backoffMs = Math.min(60 * 60_000, 2 ** job.attempts * 5_000)
    await db
      .update(schema.jobs)
      .set({ status: dead ? 'dead' : 'pending', lastError: message.slice(0, 2000), runAt: dead ? job.runAt : new Date(Date.now() + backoffMs), lockedAt: null, lockedBy: null })
      .where(eq(schema.jobs.id, job.id))
    liveBus.publish(dead ? 'job.dead' : 'job.failed', { id: job.id, kind: job.kind, error: message, attempts: job.attempts })
  }
  return true
}

let timer: NodeJS.Timeout | null = null
let running = false

export function startWorker(intervalMs = 2000) {
  if (timer) return
  const tick = async () => {
    if (running) return
    running = true
    try {
      // Drain up to 10 jobs per tick.
      for (let i = 0; i < 10; i++) {
        const did = await runOnce()
        if (!did) break
      }
    } catch (e) {
      console.error('[jobs] worker tick failed', e)
    } finally {
      running = false
    }
  }
  timer = setInterval(tick, intervalMs)
  void tick()
}

export function stopWorker() {
  if (timer) clearInterval(timer)
  timer = null
}

export async function retryDeadJob(id: string) {
  const db = getDb()
  await db.update(schema.jobs).set({ status: 'pending', attempts: 0, runAt: new Date(), lastError: null }).where(eq(schema.jobs.id, id))
}

export async function listJobs(limit = 100) {
  const db = getDb()
  return db.select().from(schema.jobs).orderBy(sql`${schema.jobs.createdAt} desc`).limit(limit)
}
