import { BUREAU_LABEL, type Bureau } from '#shared/constants'
import { CASE_STATUS_LABEL, FREEZE_STATUS_LABEL, INBOUND_STATUS_LABEL, OUTBOUND_STATUS_LABEL, type CaseStatus, type FreezeStatus, type InboundStatus, type OutboundStatus } from '#shared/state-machines'

export function money(v: number | string | null | undefined, opts: { cents?: boolean } = {}): string {
  if (v === null || v === undefined || v === '') return '—'
  let n = Number(v)
  if (Number.isNaN(n)) return '—'
  if (opts.cents) n = n / 100
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })
}

export function fmtDate(v: string | Date | null | undefined, style: 'short' | 'medium' | 'long' | 'time' = 'medium'): string {
  if (!v) return '—'
  const d = typeof v === 'string' ? new Date(v) : v
  if (Number.isNaN(d.getTime())) return '—'
  if (style === 'short') return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  if (style === 'long') return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  if (style === 'time') return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function relTime(v: string | Date | null | undefined): string {
  if (!v) return '—'
  const d = typeof v === 'string' ? new Date(v) : v
  const diff = (d.getTime() - Date.now()) / 1000
  const abs = Math.abs(diff)
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
  if (abs < 60) return rtf.format(Math.round(diff), 'second')
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute')
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour')
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), 'day')
  return fmtDate(d)
}

export function pct(v: number | string | null | undefined): string {
  if (v === null || v === undefined) return '—'
  return `${Math.round(Number(v) * 100)}%`
}

export function bytes(n: number | null | undefined): string {
  if (!n && n !== 0) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

export function titleize(s: string | null | undefined): string {
  if (!s) return '—'
  return s.replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

export function bureauName(b: string | null | undefined): string {
  return b ? (BUREAU_LABEL[b as Bureau] ?? titleize(b)) : '—'
}

export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'demo' | 'live'

export const TONE_CLASS: Record<Tone, string> = {
  neutral: 'bg-surface-3 text-fg-2',
  info: 'bg-azure-100 text-azure-600 dark:bg-azure-600/20 dark:text-azure-300',
  success: 'bg-fern-100 text-fern-600 dark:bg-fern-600/20 dark:text-fern-300',
  warning: 'bg-aurum-100 text-aurum-600 dark:bg-aurum-600/20 dark:text-aurum-300',
  danger: 'bg-garnet-100 text-garnet-600 dark:bg-garnet-600/20 dark:text-garnet-300',
  demo: 'bg-orchid-100 text-orchid-600 dark:bg-orchid-600/25 dark:text-orchid-300',
  live: 'bg-verdigris-100 text-verdigris-700 dark:bg-verdigris-600/20 dark:text-verdigris-300',
}

export function caseStatusLabel(s: string): string {
  return CASE_STATUS_LABEL[s as CaseStatus] ?? titleize(s)
}

export function caseStatusTone(s: string): Tone {
  if (['RESOLVED', 'CLOSED', 'DELIVERY_CONFIRMED'].includes(s)) return 'success'
  if (['BLOCKED', 'DELIVERY_FAILED', 'UNDELIVERABLE', 'CANCELLED', 'REJECTED_BY_USER'].includes(s)) return 'danger'
  if (['NEEDS_EVIDENCE', 'AWAITING_APPROVAL', 'ESCALATION_REVIEW', 'DISPUTED_STATUS_UNKNOWN', 'FOLLOW_UP_RECOMMENDED'].includes(s)) return 'warning'
  if (['AGENT_REVIEW', 'PLAN_READY', 'RESPONSE_ANALYSIS', 'TRIAGE'].includes(s)) return 'info'
  if (['DUPLICATE'].includes(s)) return 'neutral'
  return 'info'
}

export function freezeStatusLabel(s: string): string {
  return FREEZE_STATUS_LABEL[s as FreezeStatus] ?? titleize(s)
}

export function freezeStatusTone(s: string): Tone {
  if (s === 'CONFIRMED_FROZEN') return 'success'
  if (s === 'CONFIRMED_UNFROZEN') return 'info'
  if (['REJECTED', 'FAILED'].includes(s)) return 'danger'
  if (['UNKNOWN', 'NOT_STARTED'].includes(s)) return 'neutral'
  return 'warning'
}

export function outboundStatusLabel(s: string): string {
  return OUTBOUND_STATUS_LABEL[s as OutboundStatus] ?? titleize(s)
}

export function outboundStatusTone(s: string): Tone {
  if (['DELIVERY_CONFIRMED'].includes(s)) return 'success'
  if (['FAILED', 'RETURNED', 'CANCELLED'].includes(s)) return 'danger'
  if (['APPROVAL_PENDING', 'TRACKING_UNKNOWN', 'DRAFT'].includes(s)) return 'warning'
  return 'info'
}

export function inboundStatusLabel(s: string): string {
  return INBOUND_STATUS_LABEL[s as InboundStatus] ?? titleize(s)
}

export function inboundStatusTone(s: string): Tone {
  if (['ANALYZED', 'ACTION_PENDING'].includes(s)) return 'success'
  if (['UNASSIGNED', 'EXTRACTION_FAILED'].includes(s)) return 'warning'
  if (['CLOSED', 'ARCHIVED'].includes(s)) return 'neutral'
  return 'info'
}

export function severityTone(s: string | null | undefined): Tone {
  if (s === 'critical' || s === 'high') return 'danger'
  if (s === 'medium') return 'warning'
  return 'neutral'
}

export function priorityLabel(p: string): string {
  return { p0: 'P0 · Urgent', p1: 'P1 · High', p2: 'P2 · Normal', p3: 'P3 · Low' }[p] ?? p.toUpperCase()
}

export function modeTone(mode: string | null | undefined): Tone {
  return mode === 'live' ? 'live' : 'demo'
}

export function modeLabel(mode: string | null | undefined): string {
  if (mode === 'live') return 'Live'
  if (mode === 'sandbox') return 'Sandbox'
  if (mode === 'test') return 'Test'
  return 'Demo'
}

export function truncate(s: string | null | undefined, n = 120): string {
  if (!s) return ''
  return s.length > n ? `${s.slice(0, n - 1)}…` : s
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0]!.toUpperCase())
    .join('')
}
