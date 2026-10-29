import { describe, expect, it } from 'vitest'
import {
  CASE_PROGRESS_STEPS,
  CASE_STATUSES,
  CASE_TRANSITIONS,
  FREEZE_STATUSES,
  FREEZE_TRANSITIONS,
  INBOUND_STATUSES,
  INBOUND_TRANSITIONS,
  InvalidTransitionError,
  OUTBOUND_STATUSES,
  OUTBOUND_TRANSITIONS,
  assertFreezeTransition,
  assertTransition,
  canTransition,
  caseProgressIndex,
} from '#shared/state-machines'

describe('state machine tables', () => {
  it('every case status has a transition entry whose targets are valid statuses', () => {
    for (const s of CASE_STATUSES) {
      expect(CASE_TRANSITIONS[s]).toBeDefined()
      for (const t of CASE_TRANSITIONS[s]) expect(CASE_STATUSES).toContain(t)
    }
  })
  it('every freeze/outbound/inbound status is covered', () => {
    for (const s of FREEZE_STATUSES) expect(FREEZE_TRANSITIONS[s]).toBeDefined()
    for (const s of OUTBOUND_STATUSES) expect(OUTBOUND_TRANSITIONS[s]).toBeDefined()
    for (const s of INBOUND_STATUSES) expect(INBOUND_TRANSITIONS[s]).toBeDefined()
  })
  it('every case status maps to exactly one progress step', () => {
    for (const s of CASE_STATUSES) {
      const steps = CASE_PROGRESS_STEPS.filter(st => st.statuses.includes(s))
      expect(steps, s).toHaveLength(1)
      expect(caseProgressIndex(s)).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('case transitions', () => {
  it('follows the happy path', () => {
    const path = ['DETECTED', 'TRIAGE', 'AGENT_REVIEW', 'PLAN_READY', 'AWAITING_APPROVAL', 'APPROVED', 'QUEUED_FOR_MAIL', 'SENT', 'AWAITING_RESPONSE', 'RESPONSE_RECEIVED', 'RESPONSE_ANALYSIS', 'RESOLVED', 'CLOSED'] as const
    for (let i = 0; i < path.length - 1; i++) {
      expect(canTransition(CASE_TRANSITIONS, path[i]!, path[i + 1]!), `${path[i]} -> ${path[i + 1]}`).toBe(true)
    }
  })
  it('refuses to skip approval', () => {
    expect(canTransition(CASE_TRANSITIONS, 'PLAN_READY', 'SENT')).toBe(false)
    expect(canTransition(CASE_TRANSITIONS, 'PLAN_READY', 'QUEUED_FOR_MAIL')).toBe(false)
    expect(canTransition(CASE_TRANSITIONS, 'AGENT_REVIEW', 'APPROVED')).toBe(false)
    expect(() => assertTransition('case', CASE_TRANSITIONS, 'PLAN_READY', 'SENT')).toThrow(InvalidTransitionError)
  })
  it('cancelled is terminal', () => {
    expect(CASE_TRANSITIONS.CANCELLED).toHaveLength(0)
  })
  it('blocked cases can only re-enter through triage/review', () => {
    expect(CASE_TRANSITIONS.BLOCKED).not.toContain('AWAITING_APPROVAL')
    expect(CASE_TRANSITIONS.BLOCKED).not.toContain('SENT')
  })
})

describe('freeze transitions', () => {
  it('cannot assert CONFIRMED_FROZEN without evidence', () => {
    expect(() => assertFreezeTransition('SUBMITTED', 'CONFIRMED_FROZEN', false)).toThrow(InvalidTransitionError)
    expect(() => assertFreezeTransition('SUBMITTED', 'CONFIRMED_FROZEN', true)).not.toThrow()
    expect(() => assertFreezeTransition('LIFT_REQUESTED', 'CONFIRMED_UNFROZEN', false)).toThrow()
  })
  it('allows honest UNKNOWN from in-flight states', () => {
    expect(canTransition(FREEZE_TRANSITIONS, 'SUBMITTED', 'UNKNOWN')).toBe(true)
    expect(canTransition(FREEZE_TRANSITIONS, 'PENDING_VERIFICATION', 'UNKNOWN')).toBe(true)
  })
  it('a lift can only start from a confirmed freeze', () => {
    expect(canTransition(FREEZE_TRANSITIONS, 'SUBMITTED', 'LIFT_REQUESTED')).toBe(false)
    expect(canTransition(FREEZE_TRANSITIONS, 'CONFIRMED_FROZEN', 'LIFT_REQUESTED')).toBe(true)
  })
})

describe('outbound mail transitions', () => {
  it('requires approval before queueing', () => {
    expect(canTransition(OUTBOUND_TRANSITIONS, 'DRAFT', 'QUEUED')).toBe(false)
    expect(canTransition(OUTBOUND_TRANSITIONS, 'APPROVAL_PENDING', 'QUEUED')).toBe(false)
    expect(canTransition(OUTBOUND_TRANSITIONS, 'APPROVED', 'QUEUED')).toBe(true)
  })
  it('does not fake delivery confirmation without tracking', () => {
    expect(canTransition(OUTBOUND_TRANSITIONS, 'QUEUED', 'DELIVERY_CONFIRMED')).toBe(false)
    expect(canTransition(OUTBOUND_TRANSITIONS, 'MAILED', 'TRACKING_UNKNOWN')).toBe(true)
  })
})
