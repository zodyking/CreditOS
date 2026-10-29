import type { DataMode } from '#shared/constants'
import type { OutboundStatus } from '#shared/state-machines'
import type { MailingAddress } from '../../../db/schema'

export interface ProviderCapabilities {
  certifiedMail: boolean
  returnReceipt: boolean
  tracking: boolean
  deliveryConfirmation: boolean
  addressValidation: boolean
  webhooks: boolean
  colorPrinting: boolean
}

export interface CostEstimate {
  cents: number
  currency: 'USD'
  breakdown: { label: string; cents: number }[]
  isEstimate: true
}

export interface CreateOrderInput {
  idempotencyKey: string
  pdf: Uint8Array
  to: MailingAddress
  from: MailingAddress
  mailClass: 'first_class' | 'standard' | 'certified'
  options: { doubleSided?: boolean; color?: boolean; returnEnvelope?: boolean }
  description: string
}

export interface CreateOrderResult {
  providerOrderId: string
  status: OutboundStatus
  expectedDeliveryDate?: Date
  trackingNumber?: string
  costCents?: number
  raw: Record<string, unknown>
}

export interface StatusResult {
  status: OutboundStatus
  trackingNumber?: string
  deliveredAt?: Date
  mailedAt?: Date
  raw: Record<string, unknown>
}

export interface WebhookEvent {
  externalEventId: string
  providerOrderId: string
  status: OutboundStatus
  occurredAt: Date
  trackingNumber?: string
  raw: Record<string, unknown>
}

export interface OutboundMailProvider {
  slug: string
  label: string
  mode: DataMode
  capabilities: ProviderCapabilities
  /** Which operations are genuinely implemented against a documented API. */
  implemented: { createOrder: boolean; getStatus: boolean; webhooks: boolean; validateAddress: boolean; estimateCost: boolean }
  configured: boolean
  configurationHelp: string
  validateAddress(address: MailingAddress): Promise<{ valid: boolean; normalized?: MailingAddress; messages: string[] }>
  estimateCost(input: Omit<CreateOrderInput, 'pdf' | 'idempotencyKey'> & { pageCount: number }): Promise<CostEstimate>
  createOrder(input: CreateOrderInput): Promise<CreateOrderResult>
  getStatus(providerOrderId: string): Promise<StatusResult>
  verifyWebhook(rawBody: string, headers: Record<string, string | undefined>): Promise<{ valid: boolean; events: WebhookEvent[]; error?: string }>
}
