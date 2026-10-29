import type { H3Event } from 'h3'
import { getDb, schema } from '../db'
import { liveBus } from './events'
import { redactPii } from './crypto'

interface AuditInput {
  userId?: string | null
  actor: string
  action: string
  targetType?: string
  targetId?: string
  meta?: Record<string, unknown>
  event?: H3Event
}

function scrubMeta(meta: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(meta)) {
    if (/password|secret|token|ssn|apikey|api_key/i.test(k)) {
      out[k] = '[REDACTED]'
    } else if (typeof v === 'string') {
      out[k] = redactPii(v).slice(0, 2000)
    } else {
      out[k] = v
    }
  }
  return out
}

export async function audit(input: AuditInput): Promise<void> {
  const db = getDb()
  const ip = input.event ? getRequestIP(input.event, { xForwardedFor: true }) : undefined
  const ua = input.event ? getRequestHeader(input.event, 'user-agent') : undefined
  await db.insert(schema.auditEvents).values({
    userId: input.userId ?? null,
    actor: input.actor,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    ip: ip ?? null,
    userAgent: ua ? ua.slice(0, 300) : null,
    meta: scrubMeta(input.meta ?? {}),
  })
  liveBus.publish('audit', { action: input.action, targetType: input.targetType, targetId: input.targetId }, input.userId ?? undefined)
}

export async function notify(
  userId: string,
  input: { kind: string; title: string; body?: string; href?: string; severity?: 'low' | 'medium' | 'high' | 'critical' },
): Promise<void> {
  const db = getDb()
  const [row] = await db
    .insert(schema.notifications)
    .values({
      userId,
      kind: input.kind,
      title: input.title,
      body: input.body,
      href: input.href,
      severity: input.severity ?? 'low',
    })
    .returning()
  liveBus.publish('notification', { ...row }, userId)
}
