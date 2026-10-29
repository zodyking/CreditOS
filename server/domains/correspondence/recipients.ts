import type { Bureau } from '#shared/constants'
import type { MailingAddress } from '../../db/schema'

/**
 * Publicly listed consumer dispute mailing addresses for the nationwide
 * bureaus. These change occasionally; the UI prompts the user to confirm the
 * address against the bureau's current website before approving a mailing.
 */
export const BUREAU_DISPUTE_ADDRESSES: Record<Bureau, MailingAddress & { verifyUrl: string }> = {
  equifax: {
    name: 'Equifax Information Services LLC',
    line1: 'P.O. Box 740256',
    city: 'Atlanta',
    state: 'GA',
    postalCode: '30374-0256',
    country: 'US',
    verifyUrl: 'https://www.equifax.com/personal/credit-report-services/credit-dispute/',
  },
  experian: {
    name: 'Experian',
    line1: 'P.O. Box 4500',
    city: 'Allen',
    state: 'TX',
    postalCode: '75013',
    country: 'US',
    verifyUrl: 'https://www.experian.com/disputes/main.html',
  },
  transunion: {
    name: 'TransUnion Consumer Solutions',
    line1: 'P.O. Box 2000',
    city: 'Chester',
    state: 'PA',
    postalCode: '19016-2000',
    country: 'US',
    verifyUrl: 'https://www.transunion.com/credit-disputes/dispute-your-credit',
  },
}

export function placeholderFurnisherAddress(name: string): MailingAddress {
  return {
    name,
    line1: '[Furnisher dispute address — confirm from your statement]',
    city: '',
    state: '',
    postalCode: '',
    country: 'US',
  }
}

export function isAddressComplete(a: MailingAddress | null | undefined): boolean {
  return !!a && !!a.name && !!a.line1 && !a.line1.startsWith('[') && !!a.city && !!a.state && /^\d{5}(-\d{4})?$/.test(a.postalCode ?? '')
}
