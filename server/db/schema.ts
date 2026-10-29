import { sql } from 'drizzle-orm'
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import type {
  AgentRole,
  AutomationMode,
  Bureau,
  ConnectionStatus,
  DataMode,
  DocumentKind,
  FreezeAgencyCategory,
  IssueCategory,
  Priority,
  RemedyChannel,
  ResponseCategory,
  Severity,
  VoteValue,
} from '#shared/constants'
import type { CaseStatus, FreezeStatus, InboundStatus, OutboundStatus } from '#shared/state-machines'

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' })
const createdAt = () => ts('created_at').notNull().defaultNow()
const updatedAt = () => ts('updated_at').notNull().defaultNow()
const id = () => uuid('id').primaryKey().defaultRandom()

// ─── Identity & settings ─────────────────────────────────────────────────────

export const users = pgTable('users', {
  id: id(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  displayName: text('display_name').notNull(),
  role: text('role').notNull().default('owner'),
  automationMode: text('automation_mode').$type<AutomationMode>().notNull().default('recommend_and_draft'),
  mfaEnabled: boolean('mfa_enabled').notNull().default(false),
  mfaSecretEnc: text('mfa_secret_enc'),
  mailingAddress: jsonb('mailing_address').$type<MailingAddress | null>(),
  lastLoginAt: ts('last_login_at'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

export const consents = pgTable(
  'consents',
  {
    id: id(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    granted: boolean('granted').notNull().default(false),
    textVersion: text('text_version').notNull().default('v1'),
    grantedAt: ts('granted_at'),
    revokedAt: ts('revoked_at'),
    createdAt: createdAt(),
  },
  t => [uniqueIndex('consents_user_kind_idx').on(t.userId, t.kind)],
)

export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: updatedAt(),
})

export const secrets = pgTable('secrets', {
  key: text('key').primaryKey(),
  ciphertext: text('ciphertext').notNull(),
  updatedAt: updatedAt(),
})

export const providerConnections = pgTable(
  'provider_connections',
  {
    id: id(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<'credit_data' | 'mail_outbound' | 'mail_inbound' | 'ai'>().notNull(),
    provider: text('provider').notNull(),
    mode: text('mode').$type<DataMode>().notNull().default('demo'),
    status: text('status').$type<ConnectionStatus>().notNull().default('not_connected'),
    config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
    supportsWebhooks: boolean('supports_webhooks').notNull().default(false),
    lastSyncAt: ts('last_sync_at'),
    lastCheckedAt: ts('last_checked_at'),
    nextEligibleCheckAt: ts('next_eligible_check_at'),
    lastError: text('last_error'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  t => [uniqueIndex('provider_connections_user_kind_provider_idx').on(t.userId, t.kind, t.provider)],
)

// ─── Reports ─────────────────────────────────────────────────────────────────

export const reportSnapshots = pgTable(
  'report_snapshots',
  {
    id: id(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    bureau: text('bureau').$type<Bureau>().notNull(),
    source: text('source').notNull(),
    mode: text('mode').$type<DataMode>().notNull().default('demo'),
    reportDate: ts('report_date').notNull(),
    pulledAt: ts('pulled_at').notNull().defaultNow(),
    documentId: uuid('document_id'),
    personalInfo: jsonb('personal_info').$type<PersonalInfo>().notNull(),
    score: jsonb('score').$type<ScoreRecord | null>(),
    summary: jsonb('summary').$type<Record<string, unknown>>().notNull().default({}),
    raw: jsonb('raw').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  t => [index('report_snapshots_user_bureau_idx').on(t.userId, t.bureau, t.reportDate)],
)

export const tradelines = pgTable(
  'tradelines',
  {
    id: id(),
    snapshotId: uuid('snapshot_id').notNull().references(() => reportSnapshots.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull(),
    bureau: text('bureau').$type<Bureau>().notNull(),
    accountKey: text('account_key').notNull(),
    creditorName: text('creditor_name').notNull(),
    accountNumberMasked: text('account_number_masked').notNull(),
    accountType: text('account_type').notNull(),
    ownership: text('ownership').notNull().default('individual'),
    status: text('status').notNull(),
    paymentStatus: text('payment_status').notNull(),
    openedDate: ts('opened_date'),
    reportedDate: ts('reported_date'),
    closedDate: ts('closed_date'),
    dateFirstDelinquency: ts('date_first_delinquency'),
    balance: numeric('balance', { precision: 12, scale: 2 }),
    creditLimit: numeric('credit_limit', { precision: 12, scale: 2 }),
    highBalance: numeric('high_balance', { precision: 12, scale: 2 }),
    pastDue: numeric('past_due', { precision: 12, scale: 2 }),
    monthlyPayment: numeric('monthly_payment', { precision: 12, scale: 2 }),
    originalCreditor: text('original_creditor'),
    paymentHistory: jsonb('payment_history').$type<PaymentHistoryEntry[]>().notNull().default([]),
    remarks: jsonb('remarks').$type<string[]>().notNull().default([]),
    raw: jsonb('raw').$type<Record<string, unknown>>().notNull().default({}),
  },
  t => [index('tradelines_user_key_idx').on(t.userId, t.accountKey), index('tradelines_snapshot_idx').on(t.snapshotId)],
)

export const inquiries = pgTable(
  'inquiries',
  {
    id: id(),
    snapshotId: uuid('snapshot_id').notNull().references(() => reportSnapshots.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull(),
    bureau: text('bureau').$type<Bureau>().notNull(),
    subscriberName: text('subscriber_name').notNull(),
    inquiryDate: ts('inquiry_date').notNull(),
    type: text('type').$type<'hard' | 'soft'>().notNull().default('hard'),
    purpose: text('purpose'),
    raw: jsonb('raw').$type<Record<string, unknown>>().notNull().default({}),
  },
  t => [index('inquiries_snapshot_idx').on(t.snapshotId)],
)

// ─── Monitoring & discrepancies ──────────────────────────────────────────────

export const monitoringEvents = pgTable(
  'monitoring_events',
  {
    id: id(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    bureau: text('bureau').$type<Bureau>(),
    kind: text('kind').notNull(),
    severity: text('severity').$type<Severity>().notNull().default('medium'),
    title: text('title').notNull(),
    detail: text('detail').notNull(),
    fingerprint: text('fingerprint').notNull(),
    occurrences: integer('occurrences').notNull().default(1),
    firstSeenAt: ts('first_seen_at').notNull().defaultNow(),
    lastSeenAt: ts('last_seen_at').notNull().defaultNow(),
    snapshotId: uuid('snapshot_id'),
    previousSnapshotId: uuid('previous_snapshot_id'),
    entityRef: jsonb('entity_ref').$type<Record<string, unknown>>().notNull().default({}),
    status: text('status').$type<'new' | 'reviewed' | 'case_created' | 'dismissed' | 'suppressed'>().notNull().default('new'),
    caseId: uuid('case_id'),
    mode: text('mode').$type<DataMode>().notNull().default('demo'),
  },
  t => [uniqueIndex('monitoring_events_fingerprint_idx').on(t.userId, t.fingerprint)],
)

export const discrepancies = pgTable(
  'discrepancies',
  {
    id: id(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    accountKey: text('account_key'),
    category: text('category').$type<IssueCategory>().notNull(),
    severity: text('severity').$type<Severity>().notNull(),
    confidence: numeric('confidence', { precision: 4, scale: 3 }).notNull(),
    field: text('field').notNull(),
    title: text('title').notNull(),
    summary: text('summary').notNull(),
    values: jsonb('values').$type<Partial<Record<Bureau, unknown>>>().notNull(),
    evidence: jsonb('evidence').$type<DiscrepancyEvidence[]>().notNull().default([]),
    actionable: boolean('actionable').notNull().default(true),
    status: text('status').$type<'open' | 'case_created' | 'dismissed' | 'review_suggested'>().notNull().default('open'),
    caseId: uuid('case_id'),
    fingerprint: text('fingerprint').notNull(),
    mode: text('mode').$type<DataMode>().notNull().default('demo'),
    detectedAt: ts('detected_at').notNull().defaultNow(),
  },
  t => [uniqueIndex('discrepancies_fingerprint_idx').on(t.userId, t.fingerprint)],
)

// ─── Cases ───────────────────────────────────────────────────────────────────

export const cases = pgTable(
  'cases',
  {
    id: id(),
    code: text('code').notNull().unique(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    category: text('category').$type<IssueCategory>().notNull(),
    summary: text('summary').notNull(),
    status: text('status').$type<CaseStatus>().notNull().default('DETECTED'),
    priority: text('priority').$type<Priority>().notNull().default('p2'),
    confidence: numeric('confidence', { precision: 4, scale: 3 }).notNull().default('0.5'),
    bureaus: jsonb('bureaus').$type<Bureau[]>().notNull().default([]),
    accountKey: text('account_key'),
    creditorName: text('creditor_name'),
    contestedField: text('contested_field'),
    contestedValues: jsonb('contested_values').$type<Partial<Record<Bureau, unknown>>>().notNull().default({}),
    desiredCorrection: text('desired_correction'),
    sourceReportDate: ts('source_report_date'),
    mode: text('mode').$type<DataMode>().notNull().default('demo'),
    tags: jsonb('tags').$type<string[]>().notNull().default([]),
    linkedCaseIds: jsonb('linked_case_ids').$type<string[]>().notNull().default([]),
    mergedIntoCaseId: uuid('merged_into_case_id'),
    blockers: jsonb('blockers').$type<CaseBlocker[]>().notNull().default([]),
    nextAction: text('next_action'),
    nextActionDueAt: ts('next_action_due_at'),
    estimatedDates: jsonb('estimated_dates').$type<Record<string, string>>().notNull().default({}),
    discrepancyId: uuid('discrepancy_id'),
    recommendedChannel: text('recommended_channel').$type<RemedyChannel>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    closedAt: ts('closed_at'),
  },
  t => [index('cases_user_status_idx').on(t.userId, t.status)],
)

export const caseEvents = pgTable(
  'case_events',
  {
    id: id(),
    caseId: uuid('case_id').notNull().references(() => cases.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    title: text('title').notNull(),
    detail: text('detail'),
    actor: text('actor').notNull(),
    factual: boolean('factual').notNull().default(true),
    fromStatus: text('from_status').$type<CaseStatus>(),
    toStatus: text('to_status').$type<CaseStatus>(),
    refType: text('ref_type'),
    refId: text('ref_id'),
    meta: jsonb('meta').$type<Record<string, unknown>>().notNull().default({}),
    occurredAt: ts('occurred_at').notNull().defaultNow(),
  },
  t => [index('case_events_case_idx').on(t.caseId, t.occurredAt)],
)

// ─── Documents & evidence ────────────────────────────────────────────────────

export const documents = pgTable(
  'documents',
  {
    id: id(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    caseId: uuid('case_id'),
    kind: text('kind').$type<DocumentKind>().notNull(),
    filename: text('filename').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    sha256: text('sha256').notNull(),
    storagePath: text('storage_path').notNull(),
    pageCount: integer('page_count'),
    textExtracted: text('text_extracted'),
    extraction: jsonb('extraction').$type<Record<string, unknown>>().notNull().default({}),
    sensitivity: text('sensitivity').$type<'standard' | 'sensitive'>().notNull().default('sensitive'),
    source: text('source').notNull().default('upload'),
    mode: text('mode').$type<DataMode>().notNull().default('live'),
    title: text('title'),
    createdAt: createdAt(),
    deletedAt: ts('deleted_at'),
  },
  t => [index('documents_user_idx').on(t.userId, t.kind), index('documents_case_idx').on(t.caseId)],
)

export const caseEvidence = pgTable(
  'case_evidence',
  {
    id: id(),
    caseId: uuid('case_id').notNull().references(() => cases.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    kind: text('kind').$type<'report_fact' | 'document' | 'user_statement' | 'provider_record' | 'inbound_response'>().notNull(),
    description: text('description').notNull(),
    documentId: uuid('document_id'),
    fact: jsonb('fact').$type<EvidenceFact | null>(),
    credibility: text('credibility').$type<'high' | 'medium' | 'low'>().notNull().default('medium'),
    addedBy: text('added_by').notNull().default('system'),
    createdAt: createdAt(),
  },
  t => [uniqueIndex('case_evidence_label_idx').on(t.caseId, t.label)],
)

// ─── Agent council ───────────────────────────────────────────────────────────

export const agentRuns = pgTable(
  'agent_runs',
  {
    id: id(),
    caseId: uuid('case_id').notNull().references(() => cases.id, { onDelete: 'cascade' }),
    trigger: text('trigger').$type<'initial' | 'manual_rerun' | 'new_evidence' | 'inbound_response' | 'new_snapshot'>().notNull(),
    mode: text('mode').$type<'demo' | 'live'>().notNull(),
    modelConfig: jsonb('model_config').$type<Record<string, string>>().notNull().default({}),
    promptVersion: text('prompt_version').notNull(),
    status: text('status').$type<'queued' | 'running' | 'completed' | 'failed' | 'cancelled'>().notNull().default('queued'),
    dossierHash: text('dossier_hash').notNull(),
    dossier: jsonb('dossier').$type<Record<string, unknown>>().notNull().default({}),
    decision: jsonb('decision').$type<ChairDecision | null>(),
    usage: jsonb('usage').$type<{ promptTokens: number; completionTokens: number; estimatedCostUsd: number }>(),
    error: text('error'),
    startedAt: ts('started_at'),
    completedAt: ts('completed_at'),
    createdAt: createdAt(),
  },
  t => [index('agent_runs_case_idx').on(t.caseId, t.createdAt)],
)

export const agentMessages = pgTable(
  'agent_messages',
  {
    id: id(),
    runId: uuid('run_id').notNull().references(() => agentRuns.id, { onDelete: 'cascade' }),
    round: integer('round').notNull(),
    seq: integer('seq').notNull(),
    role: text('role').$type<AgentRole>().notNull(),
    kind: text('kind').$type<'finding' | 'critique' | 'reply' | 'proposal' | 'chair_summary' | 'gate_check'>().notNull(),
    content: text('content').notNull(),
    structured: jsonb('structured').$type<Record<string, unknown>>().notNull().default({}),
    citations: jsonb('citations').$type<string[]>().notNull().default([]),
    inReplyToId: uuid('in_reply_to_id'),
    targetRole: text('target_role').$type<AgentRole>(),
    model: text('model').notNull(),
    createdAt: createdAt(),
  },
  t => [index('agent_messages_run_idx').on(t.runId, t.round, t.seq)],
)

export const agentVotes = pgTable(
  'agent_votes',
  {
    id: id(),
    runId: uuid('run_id').notNull().references(() => agentRuns.id, { onDelete: 'cascade' }),
    role: text('role').$type<AgentRole>().notNull(),
    vote: text('vote').$type<VoteValue>().notNull(),
    rationale: text('rationale').notNull(),
    dissent: boolean('dissent').notNull().default(false),
    proposalRef: text('proposal_ref'),
    createdAt: createdAt(),
  },
  t => [uniqueIndex('agent_votes_run_role_idx').on(t.runId, t.role)],
)

export const casePlans = pgTable(
  'case_plans',
  {
    id: id(),
    caseId: uuid('case_id').notNull().references(() => cases.id, { onDelete: 'cascade' }),
    runId: uuid('run_id'),
    version: integer('version').notNull(),
    status: text('status').$type<'draft' | 'active' | 'superseded' | 'rejected'>().notNull().default('draft'),
    strategy: jsonb('strategy').$type<PlanStrategy>().notNull(),
    scenarios: jsonb('scenarios').$type<ResponseScenario[]>().notNull().default([]),
    hardGates: jsonb('hard_gates').$type<HardGates>().notNull(),
    createdAt: createdAt(),
  },
  t => [uniqueIndex('case_plans_case_version_idx').on(t.caseId, t.version)],
)

// ─── Approvals & letters ─────────────────────────────────────────────────────

export const approvals = pgTable(
  'approvals',
  {
    id: id(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    caseId: uuid('case_id').references(() => cases.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<'mail_send' | 'sensitive_disclosure' | 'cost' | 'freeze_request' | 'other'>().notNull(),
    status: text('status').$type<'pending' | 'approved' | 'rejected' | 'revoked' | 'expired'>().notNull().default('pending'),
    targetType: text('target_type').notNull(),
    targetId: uuid('target_id').notNull(),
    bundle: jsonb('bundle').$type<ApprovalBundle>().notNull(),
    consentTextHash: text('consent_text_hash').notNull(),
    decidedAt: ts('decided_at'),
    decisionNote: text('decision_note'),
    createdAt: createdAt(),
  },
  t => [index('approvals_status_idx').on(t.userId, t.status)],
)

export const letters = pgTable(
  'letters',
  {
    id: id(),
    caseId: uuid('case_id').notNull().references(() => cases.id, { onDelete: 'cascade' }),
    planId: uuid('plan_id'),
    version: integer('version').notNull(),
    status: text('status').$type<'draft' | 'final' | 'superseded'>().notNull().default('draft'),
    letterType: text('letter_type').$type<RemedyChannel>().notNull(),
    recipientType: text('recipient_type').$type<'bureau' | 'furnisher' | 'collector' | 'agency'>().notNull(),
    recipient: jsonb('recipient').$type<MailingAddress>().notNull(),
    sender: jsonb('sender').$type<MailingAddress>().notNull(),
    subject: text('subject').notNull(),
    body: text('body').notNull(),
    enclosures: jsonb('enclosures').$type<string[]>().notNull().default([]),
    pdfDocumentId: uuid('pdf_document_id'),
    pdfSha256: text('pdf_sha256'),
    createdBy: text('created_by').notNull().default('agent'),
    createdAt: createdAt(),
  },
  t => [uniqueIndex('letters_case_version_idx').on(t.caseId, t.version)],
)

// ─── Outbound mail ───────────────────────────────────────────────────────────

export const mailOrders = pgTable(
  'mail_orders',
  {
    id: id(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    caseId: uuid('case_id').notNull().references(() => cases.id, { onDelete: 'cascade' }),
    letterId: uuid('letter_id').notNull(),
    approvalId: uuid('approval_id'),
    provider: text('provider').notNull(),
    mode: text('mode').$type<DataMode>().notNull(),
    status: text('status').$type<OutboundStatus>().notNull().default('DRAFT'),
    idempotencyKey: text('idempotency_key').notNull().unique(),
    providerOrderId: text('provider_order_id'),
    mailClass: text('mail_class').notNull().default('first_class'),
    options: jsonb('options').$type<Record<string, unknown>>().notNull().default({}),
    recipient: jsonb('recipient').$type<MailingAddress>().notNull(),
    costEstimateCents: integer('cost_estimate_cents'),
    costActualCents: integer('cost_actual_cents'),
    pdfSha256: text('pdf_sha256'),
    submittedAt: ts('submitted_at'),
    mailedAt: ts('mailed_at'),
    deliveredAt: ts('delivered_at'),
    expectedDeliveryDate: ts('expected_delivery_date'),
    trackingNumber: text('tracking_number'),
    trackingSupported: boolean('tracking_supported').notNull().default(false),
    lastError: text('last_error'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  t => [index('mail_orders_case_idx').on(t.caseId)],
)

export const mailEvents = pgTable(
  'mail_events',
  {
    id: id(),
    mailOrderId: uuid('mail_order_id').notNull().references(() => mailOrders.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    externalEventId: text('external_event_id').notNull(),
    fromStatus: text('from_status').$type<OutboundStatus>(),
    toStatus: text('to_status').$type<OutboundStatus>(),
    applied: boolean('applied').notNull().default(true),
    signatureValid: boolean('signature_valid').notNull().default(false),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    receivedAt: ts('received_at').notNull().defaultNow(),
  },
  t => [uniqueIndex('mail_events_external_idx').on(t.provider, t.externalEventId)],
)

// ─── Inbound mail ────────────────────────────────────────────────────────────

export const inboundMail = pgTable(
  'inbound_mail',
  {
    id: id(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull().default('manual'),
    mode: text('mode').$type<DataMode>().notNull().default('live'),
    externalId: text('external_id'),
    status: text('status').$type<InboundStatus>().notNull(),
    senderName: text('sender_name'),
    senderAddress: jsonb('sender_address').$type<Partial<MailingAddress> | null>(),
    receivedAt: ts('received_at').notNull().defaultNow(),
    envelopeDocumentId: uuid('envelope_document_id'),
    contentDocumentId: uuid('content_document_id'),
    pageCount: integer('page_count'),
    extraction: jsonb('extraction').$type<InboundExtraction | null>(),
    matchedCaseId: uuid('matched_case_id'),
    matchConfidence: numeric('match_confidence', { precision: 4, scale: 3 }),
    matchMethod: text('match_method'),
    unread: boolean('unread').notNull().default(true),
    duplicateOfId: uuid('duplicate_of_id'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  t => [index('inbound_mail_status_idx').on(t.userId, t.status), uniqueIndex('inbound_mail_external_idx').on(t.provider, t.externalId)],
)

export const responseAnalyses = pgTable('response_analyses', {
  id: id(),
  caseId: uuid('case_id').notNull().references(() => cases.id, { onDelete: 'cascade' }),
  inboundMailId: uuid('inbound_mail_id').notNull(),
  runId: uuid('run_id'),
  category: text('category').$type<ResponseCategory>().notNull(),
  matchedScenarioKey: text('matched_scenario_key'),
  summary: text('summary').notNull(),
  extracted: jsonb('extracted').$type<Record<string, unknown>>().notNull().default({}),
  recommendedNextAction: text('recommended_next_action').notNull(),
  requiresApproval: boolean('requires_approval').notNull().default(true),
  createdAt: createdAt(),
})

// ─── Freezes ─────────────────────────────────────────────────────────────────

export const freezeAgencies = pgTable('freeze_agencies', {
  id: id(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  category: text('category').$type<FreezeAgencyCategory>().notNull(),
  description: text('description').notNull(),
  portalUrl: text('portal_url'),
  phone: text('phone'),
  mailAddress: jsonb('mail_address').$type<MailingAddress | null>(),
  requestMethods: jsonb('request_methods').$type<('online' | 'phone' | 'mail')[]>().notNull().default([]),
  supportsApi: boolean('supports_api').notNull().default(false),
  requiredEvidence: jsonb('required_evidence').$type<string[]>().notNull().default([]),
  notes: text('notes'),
  sortOrder: integer('sort_order').notNull().default(100),
  lastVerifiedAt: ts('last_verified_at'),
})

export const freezeRequests = pgTable(
  'freeze_requests',
  {
    id: id(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    agencyId: uuid('agency_id').notNull().references(() => freezeAgencies.id),
    action: text('action').$type<'freeze' | 'lift_temporary' | 'lift_permanent'>().notNull().default('freeze'),
    status: text('status').$type<FreezeStatus>().notNull().default('NOT_STARTED'),
    requestMethod: text('request_method').$type<'online' | 'phone' | 'mail' | null>(),
    requestRef: text('request_ref'),
    submittedAt: ts('submitted_at'),
    confirmedAt: ts('confirmed_at'),
    confirmationDocumentId: uuid('confirmation_document_id'),
    confirmationRef: text('confirmation_ref'),
    liftStartAt: ts('lift_start_at'),
    liftEndAt: ts('lift_end_at'),
    notes: text('notes'),
    lastError: text('last_error'),
    mode: text('mode').$type<DataMode>().notNull().default('live'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  t => [index('freeze_requests_user_idx').on(t.userId, t.agencyId)],
)

export const freezeEvents = pgTable(
  'freeze_events',
  {
    id: id(),
    requestId: uuid('request_id').notNull().references(() => freezeRequests.id, { onDelete: 'cascade' }),
    fromStatus: text('from_status').$type<FreezeStatus>(),
    toStatus: text('to_status').$type<FreezeStatus>().notNull(),
    actor: text('actor').notNull(),
    note: text('note'),
    evidenceDocumentId: uuid('evidence_document_id'),
    occurredAt: ts('occurred_at').notNull().defaultNow(),
  },
  t => [index('freeze_events_request_idx').on(t.requestId, t.occurredAt)],
)

// ─── Notifications, audit, jobs ──────────────────────────────────────────────

export const notifications = pgTable(
  'notifications',
  {
    id: id(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    severity: text('severity').$type<Severity>().notNull().default('low'),
    title: text('title').notNull(),
    body: text('body'),
    href: text('href'),
    readAt: ts('read_at'),
    createdAt: createdAt(),
  },
  t => [index('notifications_user_idx').on(t.userId, t.readAt, t.createdAt)],
)

export const auditEvents = pgTable(
  'audit_events',
  {
    id: id(),
    userId: uuid('user_id'),
    actor: text('actor').notNull(),
    action: text('action').notNull(),
    targetType: text('target_type'),
    targetId: text('target_id'),
    ip: text('ip'),
    userAgent: text('user_agent'),
    meta: jsonb('meta').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  t => [index('audit_events_created_idx').on(t.createdAt)],
)

export const jobs = pgTable(
  'jobs',
  {
    id: id(),
    kind: text('kind').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    status: text('status').$type<'pending' | 'running' | 'completed' | 'failed' | 'dead'>().notNull().default('pending'),
    runAt: ts('run_at').notNull().defaultNow(),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(5),
    lastError: text('last_error'),
    lockedAt: ts('locked_at'),
    lockedBy: text('locked_by'),
    idempotencyKey: text('idempotency_key'),
    completedAt: ts('completed_at'),
    createdAt: createdAt(),
  },
  t => [
    index('jobs_status_run_at_idx').on(t.status, t.runAt),
    uniqueIndex('jobs_idempotency_idx').on(t.idempotencyKey).where(sql`${t.idempotencyKey} is not null`),
  ],
)

// ─── JSON shapes ─────────────────────────────────────────────────────────────

export interface MailingAddress {
  name: string
  line1: string
  line2?: string
  city: string
  state: string
  postalCode: string
  country?: string
}

export interface PersonalInfo {
  nameOnFile: string
  addresses: string[]
  dateOfBirthMasked?: string
  ssnMasked?: string
  employers?: string[]
}

export interface ScoreRecord {
  value: number
  model: string
  provider: string
  asOf: string
}

export interface PaymentHistoryEntry {
  month: string
  status: 'OK' | '30' | '60' | '90' | '120' | 'CO' | 'ND'
}

export interface DiscrepancyEvidence {
  bureau: Bureau
  snapshotId: string
  tradelineId?: string
  inquiryId?: string
  field: string
  value: unknown
  reportDate: string
}

export interface EvidenceFact {
  bureau?: Bureau
  snapshotId?: string
  tradelineId?: string
  field?: string
  value?: unknown
  reportDate?: string
}

export interface CaseBlocker {
  code: string
  message: string
  since: string
  resolvable: boolean
}

export interface PlanStrategy {
  approach: string
  channel: RemedyChannel
  recipientType: 'bureau' | 'furnisher' | 'collector' | 'agency'
  recipients: string[]
  letterType: RemedyChannel
  rationale: string
  requestedOutcome: string
  risks: string[]
  proofRequirements: string[]
  pros: string[]
  cons: string[]
  estimatedTimeline: string
  requiresUserApproval: boolean
}

export interface ResponseScenario {
  key: ResponseCategory
  title: string
  whyPlausible: string
  evidenceThatMatters: string[]
  recommendedNextStep: string
  statusImpact: CaseStatus
  requiresApproval: boolean
  illustrativeOnly: true
}

export interface HardGates {
  evidenceSufficient: boolean
  compliancePassed: boolean
  consentPresent: boolean
  fabricationCheckPassed: boolean
  notes: string[]
}

export interface ChairDecision {
  outcome: 'proceed' | 'collect_evidence' | 'monitor_only' | 'escalate' | 'reject'
  selectedChannel: RemedyChannel
  summary: string
  tally: Record<VoteValue, number>
  minorityOpinion?: string
  gatesRespected: boolean
}

export interface ApprovalBundle {
  title: string
  target: string
  letterId?: string
  letterVersion?: number
  exhibits: string[]
  provider: string
  providerMode: DataMode
  mailClass?: string
  costEstimateCents?: number
  consentText: string
  consequences: string[]
  pdfSha256?: string
}

export interface InboundExtraction {
  engine: 'pdf-text' | 'ocr' | 'manual' | 'none'
  confidence: number
  caseCodes: string[]
  accountRefs: string[]
  responseCategory: ResponseCategory | null
  senderGuess: string | null
  datesMentioned: string[]
  pageTexts: { page: number; chars: number }[]
  warnings: string[]
}

export type User = typeof users.$inferSelect
export type Case = typeof cases.$inferSelect
export type CaseEvent = typeof caseEvents.$inferSelect
export type Tradeline = typeof tradelines.$inferSelect
export type ReportSnapshot = typeof reportSnapshots.$inferSelect
export type Document = typeof documents.$inferSelect
export type AgentRun = typeof agentRuns.$inferSelect
export type AgentMessage = typeof agentMessages.$inferSelect
export type AgentVote = typeof agentVotes.$inferSelect
export type CasePlan = typeof casePlans.$inferSelect
export type Letter = typeof letters.$inferSelect
export type MailOrder = typeof mailOrders.$inferSelect
export type InboundMail = typeof inboundMail.$inferSelect
export type FreezeAgency = typeof freezeAgencies.$inferSelect
export type FreezeRequest = typeof freezeRequests.$inferSelect
export type Approval = typeof approvals.$inferSelect
export type Job = typeof jobs.$inferSelect
