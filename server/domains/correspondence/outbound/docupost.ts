import { env } from '../../../utils/env'
import { isAddressComplete } from '../recipients'
import type { CostEstimate, OutboundMailProvider } from './types'

/**
 * DocuPost adapter — SCAFFOLD ONLY.
 *
 * DocuPost's letter API shape, authentication, and webhook signing were not
 * verifiable from public documentation at build time, so this adapter
 * deliberately declares every network operation as NOT implemented. It exists
 * so the provider appears honestly in Settings with its configuration
 * requirements, and so a future implementation only has to fill in the
 * methods below. Nothing here pretends to send mail.
 */
export const docupostProvider: OutboundMailProvider = {
  slug: 'docupost',
  label: 'DocuPost (scaffold — API verification pending)',
  mode: 'sandbox',
  capabilities: { certifiedMail: false, returnReceipt: false, tracking: false, deliveryConfirmation: false, addressValidation: false, webhooks: false, colorPrinting: false },
  implemented: { createOrder: false, getStatus: false, webhooks: false, validateAddress: false, estimateCost: false },
  get configured() {
    return !!env.docupostApiKey
  },
  configurationHelp: 'Set DOCUPOST_API_KEY once DocuPost confirms API access and documentation. Until then this provider cannot create orders; use sandbox or PostGrid.',

  async validateAddress(address) {
    const valid = isAddressComplete(address)
    return { valid, messages: ['Local completeness check only.'] }
  },
  async estimateCost(): Promise<CostEstimate> {
    throw new Error('DocuPost cost estimation is not implemented (provider API unverified)')
  },
  async createOrder() {
    throw new Error('DocuPost order creation is not implemented (provider API unverified). No mail was sent.')
  },
  async getStatus() {
    throw new Error('DocuPost status polling is not implemented')
  },
  async verifyWebhook() {
    return { valid: false, events: [], error: 'DocuPost webhooks are not implemented' }
  },
}
