import { z } from 'zod'
import { AGENT_ROLES, REMEDY_CHANNELS, VOTE_VALUES } from '#shared/constants'

/** Machine-readable agent outputs. Every message must validate against one of these. */

export const findingSchema = z.object({
  summary: z.string().min(20).max(1500),
  keyFacts: z.array(z.string().min(3)).min(1).max(8),
  concerns: z.array(z.string()).max(8),
  citations: z.array(z.string().regex(/^E\d+$/)).min(1),
  confidence: z.number().min(0).max(1),
})
export type Finding = z.infer<typeof findingSchema>

export const critiqueSchema = z.object({
  targetRole: z.enum(AGENT_ROLES),
  critique: z.string().min(20).max(1200),
  citations: z.array(z.string().regex(/^E\d+$/)),
  severity: z.enum(['minor', 'material', 'blocking']),
})
export type Critique = z.infer<typeof critiqueSchema>

export const replySchema = z.object({
  reply: z.string().min(20).max(1200),
  positionChanged: z.boolean(),
  citations: z.array(z.string().regex(/^E\d+$/)),
})
export type Reply = z.infer<typeof replySchema>

export const proposalSchema = z.object({
  channel: z.enum(REMEDY_CHANNELS),
  recipientType: z.enum(['bureau', 'furnisher', 'collector', 'agency']),
  approach: z.string().min(20).max(1500),
  requestedOutcome: z.string().min(5).max(500),
  risks: z.array(z.string()).max(8),
  proofRequirements: z.array(z.string()).max(8),
  uncertainty: z.string().min(10).max(800),
  estimatedTimeline: z.string().max(200),
  citations: z.array(z.string().regex(/^E\d+$/)),
})
export type Proposal = z.infer<typeof proposalSchema>

export const ballotSchema = z.object({
  vote: z.enum(VOTE_VALUES),
  rationale: z.string().min(20).max(1000),
})
export type Ballot = z.infer<typeof ballotSchema>

export const chairSchema = z.object({
  outcome: z.enum(['proceed', 'collect_evidence', 'monitor_only', 'escalate', 'reject']),
  selectedChannel: z.enum(REMEDY_CHANNELS),
  summary: z.string().min(40).max(2000),
  minorityOpinion: z.string().max(1000).optional(),
})
export type Chair = z.infer<typeof chairSchema>

/** JSON schemas handed to OpenRouter's structured-output mode. */
export const jsonSchemas = {
  finding: {
    type: 'object',
    additionalProperties: false,
    required: ['summary', 'keyFacts', 'concerns', 'citations', 'confidence'],
    properties: {
      summary: { type: 'string' },
      keyFacts: { type: 'array', items: { type: 'string' } },
      concerns: { type: 'array', items: { type: 'string' } },
      citations: { type: 'array', items: { type: 'string' } },
      confidence: { type: 'number' },
    },
  },
  critique: {
    type: 'object',
    additionalProperties: false,
    required: ['targetRole', 'critique', 'citations', 'severity'],
    properties: {
      targetRole: { type: 'string', enum: [...AGENT_ROLES] },
      critique: { type: 'string' },
      citations: { type: 'array', items: { type: 'string' } },
      severity: { type: 'string', enum: ['minor', 'material', 'blocking'] },
    },
  },
  reply: {
    type: 'object',
    additionalProperties: false,
    required: ['reply', 'positionChanged', 'citations'],
    properties: {
      reply: { type: 'string' },
      positionChanged: { type: 'boolean' },
      citations: { type: 'array', items: { type: 'string' } },
    },
  },
  proposal: {
    type: 'object',
    additionalProperties: false,
    required: ['channel', 'recipientType', 'approach', 'requestedOutcome', 'risks', 'proofRequirements', 'uncertainty', 'estimatedTimeline', 'citations'],
    properties: {
      channel: { type: 'string', enum: [...REMEDY_CHANNELS] },
      recipientType: { type: 'string', enum: ['bureau', 'furnisher', 'collector', 'agency'] },
      approach: { type: 'string' },
      requestedOutcome: { type: 'string' },
      risks: { type: 'array', items: { type: 'string' } },
      proofRequirements: { type: 'array', items: { type: 'string' } },
      uncertainty: { type: 'string' },
      estimatedTimeline: { type: 'string' },
      citations: { type: 'array', items: { type: 'string' } },
    },
  },
  ballot: {
    type: 'object',
    additionalProperties: false,
    required: ['vote', 'rationale'],
    properties: {
      vote: { type: 'string', enum: [...VOTE_VALUES] },
      rationale: { type: 'string' },
    },
  },
  chair: {
    type: 'object',
    additionalProperties: false,
    required: ['outcome', 'selectedChannel', 'summary', 'minorityOpinion'],
    properties: {
      outcome: { type: 'string', enum: ['proceed', 'collect_evidence', 'monitor_only', 'escalate', 'reject'] },
      selectedChannel: { type: 'string', enum: [...REMEDY_CHANNELS] },
      summary: { type: 'string' },
      minorityOpinion: { type: 'string' },
    },
  },
} as const
