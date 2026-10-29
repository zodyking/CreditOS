/**
 * Explicit state machines for the four core workflows. Transitions are the
 * single source of truth; the server refuses any change not listed here and
 * every transition is persisted as an event with actor + timestamp.
 */

export class InvalidTransitionError extends Error {
  constructor(
    public readonly machine: string,
    public readonly from: string,
    public readonly to: string,
    public readonly reason?: string,
  ) {
    super(`${machine}: cannot transition ${from} -> ${to}${reason ? ` (${reason})` : ''}`)
    this.name = 'InvalidTransitionError'
  }
}

// ─── Case ─────────────────────────────────────────────────────────────────────

export const CASE_STATUSES = [
  'DETECTED',
  'TRIAGE',
  'NEEDS_EVIDENCE',
  'AGENT_REVIEW',
  'PLAN_READY',
  'AWAITING_APPROVAL',
  'APPROVED',
  'QUEUED_FOR_MAIL',
  'SENT',
  'DELIVERY_CONFIRMED',
  'AWAITING_RESPONSE',
  'RESPONSE_RECEIVED',
  'RESPONSE_ANALYSIS',
  'RESOLVED',
  'FOLLOW_UP_RECOMMENDED',
  'ESCALATION_REVIEW',
  'CLOSED',
  // exception states
  'REJECTED_BY_USER',
  'CANCELLED',
  'DUPLICATE',
  'BLOCKED',
  'DELIVERY_FAILED',
  'UNDELIVERABLE',
  'DISPUTED_STATUS_UNKNOWN',
] as const
export type CaseStatus = (typeof CASE_STATUSES)[number]

export const CASE_TRANSITIONS: Record<CaseStatus, readonly CaseStatus[]> = {
  DETECTED: ['TRIAGE', 'DUPLICATE', 'CANCELLED'],
  TRIAGE: ['NEEDS_EVIDENCE', 'AGENT_REVIEW', 'DUPLICATE', 'CANCELLED', 'BLOCKED'],
  NEEDS_EVIDENCE: ['AGENT_REVIEW', 'TRIAGE', 'CANCELLED', 'BLOCKED'],
  AGENT_REVIEW: ['PLAN_READY', 'NEEDS_EVIDENCE', 'ESCALATION_REVIEW', 'BLOCKED', 'CANCELLED'],
  PLAN_READY: ['AWAITING_APPROVAL', 'AGENT_REVIEW', 'NEEDS_EVIDENCE', 'REJECTED_BY_USER', 'CANCELLED'],
  AWAITING_APPROVAL: ['APPROVED', 'REJECTED_BY_USER', 'AGENT_REVIEW', 'PLAN_READY', 'CANCELLED'],
  APPROVED: ['QUEUED_FOR_MAIL', 'PLAN_READY', 'BLOCKED', 'CANCELLED'],
  QUEUED_FOR_MAIL: ['SENT', 'DELIVERY_FAILED', 'APPROVED', 'BLOCKED'],
  SENT: ['DELIVERY_CONFIRMED', 'AWAITING_RESPONSE', 'UNDELIVERABLE', 'DELIVERY_FAILED', 'RESPONSE_RECEIVED'],
  DELIVERY_CONFIRMED: ['AWAITING_RESPONSE', 'RESPONSE_RECEIVED'],
  AWAITING_RESPONSE: ['RESPONSE_RECEIVED', 'DISPUTED_STATUS_UNKNOWN', 'FOLLOW_UP_RECOMMENDED', 'ESCALATION_REVIEW'],
  RESPONSE_RECEIVED: ['RESPONSE_ANALYSIS'],
  RESPONSE_ANALYSIS: ['RESOLVED', 'FOLLOW_UP_RECOMMENDED', 'ESCALATION_REVIEW', 'CLOSED', 'AGENT_REVIEW'],
  RESOLVED: ['CLOSED', 'FOLLOW_UP_RECOMMENDED'],
  FOLLOW_UP_RECOMMENDED: ['AGENT_REVIEW', 'PLAN_READY', 'CLOSED', 'CANCELLED'],
  ESCALATION_REVIEW: ['AGENT_REVIEW', 'CLOSED', 'CANCELLED', 'BLOCKED'],
  CLOSED: ['AGENT_REVIEW'],
  REJECTED_BY_USER: ['AGENT_REVIEW', 'CLOSED'],
  CANCELLED: [],
  DUPLICATE: ['CLOSED'],
  BLOCKED: ['TRIAGE', 'AGENT_REVIEW', 'PLAN_READY', 'CANCELLED'],
  DELIVERY_FAILED: ['QUEUED_FOR_MAIL', 'PLAN_READY', 'CANCELLED'],
  UNDELIVERABLE: ['PLAN_READY', 'AGENT_REVIEW', 'CANCELLED'],
  DISPUTED_STATUS_UNKNOWN: ['RESPONSE_RECEIVED', 'FOLLOW_UP_RECOMMENDED', 'ESCALATION_REVIEW'],
}

/** Ordered "happy path" used by the progress rail. Exception states map to the nearest step. */
export const CASE_PROGRESS_STEPS: { key: string; label: string; statuses: CaseStatus[] }[] = [
  { key: 'detect', label: 'Detected', statuses: ['DETECTED', 'DUPLICATE'] },
  { key: 'triage', label: 'Triage & evidence', statuses: ['TRIAGE', 'NEEDS_EVIDENCE', 'BLOCKED'] },
  { key: 'council', label: 'Council review', statuses: ['AGENT_REVIEW', 'ESCALATION_REVIEW'] },
  { key: 'plan', label: 'Plan ready', statuses: ['PLAN_READY'] },
  { key: 'approval', label: 'Approval', statuses: ['AWAITING_APPROVAL', 'APPROVED', 'REJECTED_BY_USER'] },
  { key: 'mail', label: 'Mailed', statuses: ['QUEUED_FOR_MAIL', 'SENT', 'DELIVERY_CONFIRMED', 'DELIVERY_FAILED', 'UNDELIVERABLE'] },
  { key: 'response', label: 'Response', statuses: ['AWAITING_RESPONSE', 'RESPONSE_RECEIVED', 'RESPONSE_ANALYSIS', 'DISPUTED_STATUS_UNKNOWN'] },
  { key: 'outcome', label: 'Outcome', statuses: ['RESOLVED', 'FOLLOW_UP_RECOMMENDED', 'CLOSED', 'CANCELLED'] },
]

export const CASE_EXCEPTION_STATUSES: readonly CaseStatus[] = [
  'REJECTED_BY_USER',
  'CANCELLED',
  'DUPLICATE',
  'BLOCKED',
  'DELIVERY_FAILED',
  'UNDELIVERABLE',
  'DISPUTED_STATUS_UNKNOWN',
]

export const CASE_OPEN_STATUSES: readonly CaseStatus[] = CASE_STATUSES.filter(
  s => !['RESOLVED', 'CLOSED', 'CANCELLED', 'DUPLICATE'].includes(s),
)

export const CASE_STATUS_LABEL: Record<CaseStatus, string> = {
  DETECTED: 'Detected',
  TRIAGE: 'Triage',
  NEEDS_EVIDENCE: 'Needs evidence',
  AGENT_REVIEW: 'Council review',
  PLAN_READY: 'Plan ready',
  AWAITING_APPROVAL: 'Awaiting approval',
  APPROVED: 'Approved',
  QUEUED_FOR_MAIL: 'Queued for mail',
  SENT: 'Sent',
  DELIVERY_CONFIRMED: 'Delivery confirmed',
  AWAITING_RESPONSE: 'Awaiting response',
  RESPONSE_RECEIVED: 'Response received',
  RESPONSE_ANALYSIS: 'Analyzing response',
  RESOLVED: 'Resolved',
  FOLLOW_UP_RECOMMENDED: 'Follow-up recommended',
  ESCALATION_REVIEW: 'Escalation review',
  CLOSED: 'Closed',
  REJECTED_BY_USER: 'Rejected by you',
  CANCELLED: 'Cancelled',
  DUPLICATE: 'Duplicate',
  BLOCKED: 'Blocked',
  DELIVERY_FAILED: 'Delivery failed',
  UNDELIVERABLE: 'Undeliverable',
  DISPUTED_STATUS_UNKNOWN: 'Status unknown',
}

// ─── Freeze ───────────────────────────────────────────────────────────────────

export const FREEZE_STATUSES = [
  'NOT_STARTED',
  'ACTION_REQUIRED',
  'REQUEST_PREPARED',
  'SUBMITTED',
  'PENDING_VERIFICATION',
  'CONFIRMED_FROZEN',
  'LIFT_REQUESTED',
  'CONFIRMED_UNFROZEN',
  'REJECTED',
  'FAILED',
  'UNKNOWN',
] as const
export type FreezeStatus = (typeof FREEZE_STATUSES)[number]

export const FREEZE_TRANSITIONS: Record<FreezeStatus, readonly FreezeStatus[]> = {
  NOT_STARTED: ['ACTION_REQUIRED', 'REQUEST_PREPARED', 'UNKNOWN'],
  ACTION_REQUIRED: ['REQUEST_PREPARED', 'SUBMITTED', 'UNKNOWN', 'NOT_STARTED'],
  REQUEST_PREPARED: ['SUBMITTED', 'ACTION_REQUIRED', 'FAILED'],
  SUBMITTED: ['PENDING_VERIFICATION', 'CONFIRMED_FROZEN', 'REJECTED', 'FAILED', 'UNKNOWN'],
  PENDING_VERIFICATION: ['CONFIRMED_FROZEN', 'REJECTED', 'FAILED', 'UNKNOWN', 'ACTION_REQUIRED'],
  CONFIRMED_FROZEN: ['LIFT_REQUESTED', 'UNKNOWN'],
  LIFT_REQUESTED: ['CONFIRMED_UNFROZEN', 'CONFIRMED_FROZEN', 'FAILED', 'UNKNOWN'],
  CONFIRMED_UNFROZEN: ['REQUEST_PREPARED', 'ACTION_REQUIRED', 'SUBMITTED', 'UNKNOWN'],
  REJECTED: ['ACTION_REQUIRED', 'REQUEST_PREPARED'],
  FAILED: ['ACTION_REQUIRED', 'REQUEST_PREPARED'],
  UNKNOWN: ['ACTION_REQUIRED', 'PENDING_VERIFICATION', 'CONFIRMED_FROZEN', 'CONFIRMED_UNFROZEN'],
}

/** States that assert a verified fact and therefore require confirmation evidence. */
export const FREEZE_EVIDENCE_REQUIRED: readonly FreezeStatus[] = ['CONFIRMED_FROZEN', 'CONFIRMED_UNFROZEN']

export const FREEZE_STATUS_LABEL: Record<FreezeStatus, string> = {
  NOT_STARTED: 'Not started',
  ACTION_REQUIRED: 'Action required',
  REQUEST_PREPARED: 'Request prepared',
  SUBMITTED: 'Submitted',
  PENDING_VERIFICATION: 'Pending verification',
  CONFIRMED_FROZEN: 'Confirmed frozen',
  LIFT_REQUESTED: 'Lift requested',
  CONFIRMED_UNFROZEN: 'Confirmed unfrozen',
  REJECTED: 'Rejected',
  FAILED: 'Failed',
  UNKNOWN: 'Unknown',
}

// ─── Outbound mail ────────────────────────────────────────────────────────────

export const OUTBOUND_STATUSES = [
  'DRAFT',
  'APPROVAL_PENDING',
  'APPROVED',
  'QUEUED',
  'PROVIDER_ACCEPTED',
  'PRINTED',
  'MAILED',
  'DELIVERY_CONFIRMED',
  'TRACKING_UNKNOWN',
  'RETURNED',
  'FAILED',
  'CANCELLED',
] as const
export type OutboundStatus = (typeof OUTBOUND_STATUSES)[number]

export const OUTBOUND_TRANSITIONS: Record<OutboundStatus, readonly OutboundStatus[]> = {
  DRAFT: ['APPROVAL_PENDING', 'CANCELLED'],
  APPROVAL_PENDING: ['APPROVED', 'DRAFT', 'CANCELLED'],
  APPROVED: ['QUEUED', 'DRAFT', 'CANCELLED'],
  QUEUED: ['PROVIDER_ACCEPTED', 'FAILED', 'CANCELLED'],
  PROVIDER_ACCEPTED: ['PRINTED', 'MAILED', 'FAILED', 'CANCELLED'],
  PRINTED: ['MAILED', 'FAILED'],
  MAILED: ['DELIVERY_CONFIRMED', 'RETURNED', 'TRACKING_UNKNOWN'],
  TRACKING_UNKNOWN: ['DELIVERY_CONFIRMED', 'RETURNED'],
  DELIVERY_CONFIRMED: [],
  RETURNED: ['DRAFT'],
  FAILED: ['QUEUED', 'DRAFT', 'CANCELLED'],
  CANCELLED: [],
}

export const OUTBOUND_STATUS_LABEL: Record<OutboundStatus, string> = {
  DRAFT: 'Draft',
  APPROVAL_PENDING: 'Approval pending',
  APPROVED: 'Approved',
  QUEUED: 'Queued',
  PROVIDER_ACCEPTED: 'Accepted by provider',
  PRINTED: 'Printed',
  MAILED: 'Mailed',
  DELIVERY_CONFIRMED: 'Delivery confirmed',
  TRACKING_UNKNOWN: 'Tracking unknown',
  RETURNED: 'Returned to sender',
  FAILED: 'Failed',
  CANCELLED: 'Cancelled',
}

// ─── Inbound mail ─────────────────────────────────────────────────────────────

export const INBOUND_STATUSES = [
  'RECEIVED_ENVELOPE',
  'AWAITING_CONTENT_SCAN',
  'SCANNED',
  'EXTRACTED',
  'EXTRACTION_FAILED',
  'MATCHED',
  'UNASSIGNED',
  'ANALYZED',
  'ACTION_PENDING',
  'ARCHIVED',
] as const
export type InboundStatus = (typeof INBOUND_STATUSES)[number]

export const INBOUND_TRANSITIONS: Record<InboundStatus, readonly InboundStatus[]> = {
  RECEIVED_ENVELOPE: ['AWAITING_CONTENT_SCAN', 'SCANNED'],
  AWAITING_CONTENT_SCAN: ['SCANNED', 'UNASSIGNED'],
  SCANNED: ['EXTRACTED', 'EXTRACTION_FAILED'],
  EXTRACTION_FAILED: ['SCANNED', 'UNASSIGNED'],
  EXTRACTED: ['MATCHED', 'UNASSIGNED'],
  UNASSIGNED: ['MATCHED', 'ARCHIVED'],
  MATCHED: ['ANALYZED', 'UNASSIGNED'],
  ANALYZED: ['ACTION_PENDING', 'ARCHIVED'],
  ACTION_PENDING: ['ARCHIVED'],
  ARCHIVED: [],
}

export const INBOUND_STATUS_LABEL: Record<InboundStatus, string> = {
  RECEIVED_ENVELOPE: 'Envelope received',
  AWAITING_CONTENT_SCAN: 'Awaiting content scan',
  SCANNED: 'Scanned',
  EXTRACTED: 'Text extracted',
  EXTRACTION_FAILED: 'Extraction failed',
  MATCHED: 'Matched to case',
  UNASSIGNED: 'Unassigned',
  ANALYZED: 'Analyzed',
  ACTION_PENDING: 'Action pending',
  ARCHIVED: 'Archived',
}

// ─── Generic helpers ──────────────────────────────────────────────────────────

export function canTransition<S extends string>(
  table: Record<S, readonly S[]>,
  from: S,
  to: S,
): boolean {
  return from === to ? false : (table[from] ?? []).includes(to)
}

export function assertTransition<S extends string>(
  machine: string,
  table: Record<S, readonly S[]>,
  from: S,
  to: S,
  reason?: string,
): void {
  if (!canTransition(table, from, to)) {
    throw new InvalidTransitionError(machine, from, to, reason)
  }
}

export function assertFreezeTransition(from: FreezeStatus, to: FreezeStatus, hasEvidence: boolean): void {
  assertTransition('freeze', FREEZE_TRANSITIONS, from, to)
  if (FREEZE_EVIDENCE_REQUIRED.includes(to) && !hasEvidence) {
    throw new InvalidTransitionError('freeze', from, to, 'confirmation evidence required')
  }
}

export function caseProgressIndex(status: CaseStatus): number {
  const idx = CASE_PROGRESS_STEPS.findIndex(step => step.statuses.includes(status))
  return idx === -1 ? 0 : idx
}
