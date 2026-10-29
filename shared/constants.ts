/**
 * Shared vocabulary for CreditOS. Imported by both the Nuxt app and the Nitro
 * server (via the auto-aliased `#shared` directory), and by unit tests.
 */

export const BUREAUS = ['equifax', 'experian', 'transunion'] as const
export type Bureau = (typeof BUREAUS)[number]

export const BUREAU_LABEL: Record<Bureau, string> = {
  equifax: 'Equifax',
  experian: 'Experian',
  transunion: 'TransUnion',
}

/** Where a record's facts come from. Displayed on every data surface. */
export const DATA_MODES = ['demo', 'sandbox', 'live'] as const
export type DataMode = (typeof DATA_MODES)[number]

export const APP_MODES = ['demo', 'test', 'live'] as const
export type AppMode = (typeof APP_MODES)[number]

export const AUTOMATION_MODES = ['observe_only', 'recommend_and_draft', 'submit_after_approval'] as const
export type AutomationMode = (typeof AUTOMATION_MODES)[number]

export const AUTOMATION_MODE_LABEL: Record<AutomationMode, string> = {
  observe_only: 'Observe only',
  recommend_and_draft: 'Recommend & draft',
  submit_after_approval: 'Submit after approval',
}

export const CONNECTION_STATUSES = [
  'not_connected',
  'awaiting_consent',
  'authenticated',
  'syncing',
  'healthy',
  'degraded',
  'expired',
  'failed',
] as const
export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number]

export const ISSUE_CATEGORIES = [
  'factual_inaccuracy',
  'mixed_file',
  'identity_theft',
  'incomplete_reporting',
  'duplicate_tradeline',
  'unrecognized_inquiry',
  'obsolete_reporting',
  'misreported_payment',
  'misreported_balance',
  'ownership_mismatch',
  'contradictory_fields',
  'reappeared_item',
  'collection_validation',
  'goodwill_candidate',
  'monitoring_only',
] as const
export type IssueCategory = (typeof ISSUE_CATEGORIES)[number]

export const ISSUE_CATEGORY_LABEL: Record<IssueCategory, string> = {
  factual_inaccuracy: 'Factual inaccuracy',
  mixed_file: 'Mixed file',
  identity_theft: 'Identity theft',
  incomplete_reporting: 'Incomplete reporting',
  duplicate_tradeline: 'Duplicate tradeline',
  unrecognized_inquiry: 'Unrecognized inquiry',
  obsolete_reporting: 'Obsolete reporting',
  misreported_payment: 'Misreported payment history',
  misreported_balance: 'Misreported balance',
  ownership_mismatch: 'Account ownership mismatch',
  contradictory_fields: 'Contradictory fields',
  reappeared_item: 'Previously corrected item reappeared',
  collection_validation: 'Collection validation question',
  goodwill_candidate: 'Goodwill request candidate',
  monitoring_only: 'Monitoring only',
}

export const REMEDY_CHANNELS = [
  'bureau_dispute',
  'furnisher_direct_dispute',
  'identity_theft_report',
  'debt_validation_request',
  'goodwill_request',
  'monitor_only',
  'needs_more_evidence',
] as const
export type RemedyChannel = (typeof REMEDY_CHANNELS)[number]

export const REMEDY_CHANNEL_LABEL: Record<RemedyChannel, string> = {
  bureau_dispute: 'Bureau dispute (FCRA §611)',
  furnisher_direct_dispute: 'Direct furnisher dispute (FCRA §623)',
  identity_theft_report: 'Identity theft block request (FCRA §605B)',
  debt_validation_request: 'Debt validation request (FDCPA §809)',
  goodwill_request: 'Goodwill adjustment request',
  monitor_only: 'Monitor only',
  needs_more_evidence: 'Collect more evidence',
}

export const SEVERITIES = ['low', 'medium', 'high', 'critical'] as const
export type Severity = (typeof SEVERITIES)[number]

export const PRIORITIES = ['p3', 'p2', 'p1', 'p0'] as const
export type Priority = (typeof PRIORITIES)[number]

export const AGENT_ROLES = [
  'evidence_analyst',
  'bureau_specialist',
  'furnisher_specialist',
  'compliance_reviewer',
  'adversarial_skeptic',
  'decision_chair',
] as const
export type AgentRole = (typeof AGENT_ROLES)[number]

export const VOTING_ROLES: AgentRole[] = [
  'evidence_analyst',
  'bureau_specialist',
  'furnisher_specialist',
  'compliance_reviewer',
  'adversarial_skeptic',
]

export const AGENT_ROLE_META: Record<AgentRole, { label: string; short: string; color: string; description: string }> = {
  evidence_analyst: {
    label: 'Evidence Analyst',
    short: 'EA',
    color: 'azure',
    description: 'Validates claimed errors, evidence coverage, source credibility, and ambiguities.',
  },
  bureau_specialist: {
    label: 'Credit Reporting Specialist',
    short: 'CR',
    color: 'verdigris',
    description: 'Evaluates bureau-specific discrepancies and the right dispute target.',
  },
  furnisher_specialist: {
    label: 'Furnisher & Collections Specialist',
    short: 'FC',
    color: 'aurum',
    description: 'Analyzes source-data correction, original creditor / collector nuances, and contact channels.',
  },
  compliance_reviewer: {
    label: 'Compliance Reviewer',
    short: 'CM',
    color: 'fern',
    description: 'Rejects unsupported claims and risky or unauthorized actions; identifies process constraints.',
  },
  adversarial_skeptic: {
    label: 'Adversarial Skeptic',
    short: 'AS',
    color: 'garnet',
    description: 'Attacks weak arguments and identifies likely rebuttals or reasons a dispute might fail.',
  },
  decision_chair: {
    label: 'Decision Chair',
    short: 'DC',
    color: 'orchid',
    description: 'Facilitates debate, reconciles ballots, and selects a plan or orders more evidence. Cannot override hard gates.',
  },
}

export const VOTE_VALUES = ['support', 'oppose', 'abstain'] as const
export type VoteValue = (typeof VOTE_VALUES)[number]

export const RESPONSE_CATEGORIES = [
  'corrected',
  'deleted',
  'verified_no_change',
  'partially_updated',
  'more_information_requested',
  'rerouted_other_channel',
  'undeliverable',
  'no_response',
  'unclear',
] as const
export type ResponseCategory = (typeof RESPONSE_CATEGORIES)[number]

export const RESPONSE_CATEGORY_LABEL: Record<ResponseCategory, string> = {
  corrected: 'Corrected',
  deleted: 'Deleted',
  verified_no_change: 'Verified — no change',
  partially_updated: 'Partially updated',
  more_information_requested: 'More information requested',
  rerouted_other_channel: 'Moved to another channel',
  undeliverable: 'Undeliverable',
  no_response: 'No response by review point',
  unclear: 'Unclear / needs human review',
}

export const DOCUMENT_KINDS = [
  'evidence',
  'report_import',
  'letter_pdf',
  'inbound_scan',
  'inbound_envelope',
  'freeze_confirmation',
  'other',
] as const
export type DocumentKind = (typeof DOCUMENT_KINDS)[number]

export const ALLOWED_UPLOAD_MIME = ['application/pdf', 'image/jpeg', 'image/png'] as const
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024

export const FREEZE_AGENCY_CATEGORIES = [
  'nationwide_credit',
  'specialty_credit',
  'banking',
  'employment_income',
  'utility_telecom',
  'alternative_lending',
] as const
export type FreezeAgencyCategory = (typeof FREEZE_AGENCY_CATEGORIES)[number]

export const FREEZE_AGENCY_CATEGORY_LABEL: Record<FreezeAgencyCategory, string> = {
  nationwide_credit: 'Nationwide credit bureau',
  specialty_credit: 'Specialty consumer reporting',
  banking: 'Banking / deposit account history',
  employment_income: 'Employment & income verification',
  utility_telecom: 'Utility & telecom exchange',
  alternative_lending: 'Alternative / short-term lending',
}

export const JOB_KINDS = [
  'monitoring.poll',
  'reports.detect_discrepancies',
  'council.run',
  'mail.dispatch',
  'mail.poll_status',
  'inbound.extract',
  'inbound.match',
  'deadline.check',
  'notification.send',
] as const
export type JobKind = (typeof JOB_KINDS)[number]

export const CONSENT_KINDS = ['pull_reports', 'analyze_documents', 'store_evidence', 'ai_processing', 'send_correspondence'] as const
export type ConsentKind = (typeof CONSENT_KINDS)[number]

export const CONSENT_META: Record<ConsentKind, { label: string; description: string; required: string }> = {
  pull_reports: {
    label: 'Import and compare credit reports',
    description: 'Allow CreditOS to store imported report snapshots, compare them across bureaus and detect changes over time.',
    required: 'Report import, monitoring',
  },
  analyze_documents: {
    label: 'Analyze uploaded documents',
    description: 'Allow text extraction and classification of uploaded PDFs and scans (letters, statements, confirmations).',
    required: 'Mailroom, evidence uploads',
  },
  store_evidence: {
    label: 'Store evidence and letters',
    description: 'Keep uploaded evidence, rendered letters and provider records in the encrypted document vault.',
    required: 'Case vault',
  },
  ai_processing: {
    label: 'Send PII-minimised case facts to the AI council (OpenRouter)',
    description: 'Only in Live mode. A redacted dossier (no full account numbers, SSN or date of birth) is sent to the selected OpenRouter models. Demo mode never contacts an external model.',
    required: 'Live council runs',
  },
  send_correspondence: {
    label: 'Transmit approved letters to a mail provider',
    description: 'Each letter still requires a separate, explicit approval of the exact PDF before anything is transmitted.',
    required: 'Outbound mail approvals',
  },
}
