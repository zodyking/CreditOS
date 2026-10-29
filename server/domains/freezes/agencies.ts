import type { FreezeAgencyCategory } from '#shared/constants'
import type { MailingAddress } from '../../db/schema'

export interface AgencySeed {
  slug: string
  name: string
  category: FreezeAgencyCategory
  description: string
  portalUrl: string | null
  phone: string | null
  mailAddress: MailingAddress | null
  requestMethods: ('online' | 'phone' | 'mail')[]
  requiredEvidence: string[]
  notes: string
  sortOrder: number
}

/**
 * Directory of consumer reporting agencies that offer security freezes.
 * None expose a consumer-facing freeze API, so every entry is a GUIDED
 * workflow: CreditOS prepares the request, the user submits it through the
 * official channel, and uploads the confirmation. Portal URLs and phone
 * numbers are the agencies' published consumer contacts and should be
 * re-verified periodically (lastVerifiedAt is shown in the UI).
 */
export const FREEZE_AGENCIES: AgencySeed[] = [
  {
    slug: 'equifax',
    name: 'Equifax',
    category: 'nationwide_credit',
    description: 'Nationwide credit bureau. Security freezes are free and managed through the myEquifax portal, by phone, or by mail.',
    portalUrl: 'https://www.equifax.com/personal/credit-report-services/credit-freeze/',
    phone: '1-888-298-0045',
    mailAddress: { name: 'Equifax Information Services LLC', line1: 'P.O. Box 105788', city: 'Atlanta', state: 'GA', postalCode: '30348-5788', country: 'US' },
    requestMethods: ['online', 'phone', 'mail'],
    requiredEvidence: ['Confirmation email or letter', 'Screenshot of frozen status in myEquifax'],
    notes: 'A freeze does not affect existing accounts. Temporary lifts can be scheduled by date range.',
    sortOrder: 10,
  },
  {
    slug: 'experian',
    name: 'Experian',
    category: 'nationwide_credit',
    description: 'Nationwide credit bureau. Freeze via the Experian Security Freeze Center online, by phone, or by mail.',
    portalUrl: 'https://www.experian.com/freeze/center.html',
    phone: '1-888-397-3742',
    mailAddress: { name: 'Experian Security Freeze', line1: 'P.O. Box 9554', city: 'Allen', state: 'TX', postalCode: '75013', country: 'US' },
    requestMethods: ['online', 'phone', 'mail'],
    requiredEvidence: ['Confirmation email/letter with freeze PIN notice', 'Screenshot of frozen status'],
    notes: 'Experian issues a PIN for mail/phone management; CreditOS does not store PINs.',
    sortOrder: 20,
  },
  {
    slug: 'transunion',
    name: 'TransUnion',
    category: 'nationwide_credit',
    description: 'Nationwide credit bureau. Freeze through the TransUnion Service Center online, by phone, or by mail.',
    portalUrl: 'https://www.transunion.com/credit-freeze',
    phone: '1-800-916-8800',
    mailAddress: { name: 'TransUnion LLC', line1: 'P.O. Box 160', city: 'Woodlyn', state: 'PA', postalCode: '19094', country: 'US' },
    requestMethods: ['online', 'phone', 'mail'],
    requiredEvidence: ['Confirmation email/letter', 'Screenshot of frozen status'],
    notes: 'Distinct from the TransUnion "credit lock" product, which is not a statutory freeze.',
    sortOrder: 30,
  },
  {
    slug: 'innovis',
    name: 'Innovis',
    category: 'specialty_credit',
    description: 'Fourth nationwide-scale credit reporting agency used by some lenders and for pre-screened offers.',
    portalUrl: 'https://www.innovis.com/securityFreeze/index',
    phone: '1-800-540-2505',
    mailAddress: { name: 'Innovis Consumer Assistance', line1: 'P.O. Box 26', city: 'Pittsburgh', state: 'PA', postalCode: '15230-0026', country: 'US' },
    requestMethods: ['online', 'phone', 'mail'],
    requiredEvidence: ['Confirmation letter (Innovis typically confirms by mail)'],
    notes: 'Confirmation usually arrives by postal mail; status remains PENDING_VERIFICATION until uploaded.',
    sortOrder: 40,
  },
  {
    slug: 'chexsystems',
    name: 'ChexSystems',
    category: 'banking',
    description: 'Consumer reporting agency for checking/savings account history used by banks and credit unions.',
    portalUrl: 'https://www.chexsystems.com/security-freeze/place-freeze',
    phone: '1-800-887-7652',
    mailAddress: { name: 'Chex Systems, Inc.', line1: 'Attn: Security Freeze Department', line2: '7805 Hudson Road, Suite 100', city: 'Woodbury', state: 'MN', postalCode: '55125', country: 'US' },
    requestMethods: ['online', 'phone', 'mail'],
    requiredEvidence: ['Confirmation letter with freeze PIN notice'],
    notes: 'A ChexSystems freeze can block new deposit account openings; lift before opening a bank account.',
    sortOrder: 50,
  },
  {
    slug: 'lexisnexis',
    name: 'LexisNexis Risk Solutions (incl. SageStream)',
    category: 'specialty_credit',
    description: 'Consumer reporting agency used in insurance, tenant screening and some lending decisions. SageStream was consolidated into LexisNexis.',
    portalUrl: 'https://consumer.risk.lexisnexis.com/freeze',
    phone: '1-888-497-0011',
    mailAddress: { name: 'LexisNexis Consumer Center', line1: 'Attn: Security Freeze', line2: 'P.O. Box 105615', city: 'Atlanta', state: 'GA', postalCode: '30348-5615', country: 'US' },
    requestMethods: ['online', 'phone', 'mail'],
    requiredEvidence: ['Confirmation letter or email'],
    notes: 'Separate from the LexisNexis "opt-out" program; a freeze and an opt-out are different actions.',
    sortOrder: 60,
  },
  {
    slug: 'nctue',
    name: 'NCTUE (National Consumer Telecom & Utilities Exchange)',
    category: 'utility_telecom',
    description: 'Exchange used by telecom, pay-TV and utility providers when opening service accounts. Operated by Equifax.',
    portalUrl: 'https://www.nctue.com/consumers',
    phone: '1-866-349-5355',
    mailAddress: { name: 'NCTUE Disclosure Report', line1: 'P.O. Box 105161', city: 'Atlanta', state: 'GA', postalCode: '30348', country: 'US' },
    requestMethods: ['online', 'phone', 'mail'],
    requiredEvidence: ['Confirmation letter with PIN notice'],
    notes: 'Lift before switching utility or mobile providers.',
    sortOrder: 70,
  },
  {
    slug: 'the-work-number',
    name: 'The Work Number (Equifax Workforce Solutions)',
    category: 'employment_income',
    description: 'Employment and income verification database. A freeze blocks verifiers from pulling your employment data.',
    portalUrl: 'https://employees.theworknumber.com/employee-data-freeze',
    phone: '1-800-367-2884',
    mailAddress: { name: 'TALX Corporation / The Work Number', line1: 'Attn: Employee Data Freeze', line2: '11432 Lackland Road', city: 'St. Louis', state: 'MO', postalCode: '63146', country: 'US' },
    requestMethods: ['online', 'phone', 'mail'],
    requiredEvidence: ['Confirmation letter or portal screenshot'],
    notes: 'Lift temporarily for mortgage, lease or employment verifications.',
    sortOrder: 80,
  },
  {
    slug: 'datax',
    name: 'DataX (Equifax)',
    category: 'alternative_lending',
    description: 'Specialty consumer reporting agency used by short-term and alternative lenders.',
    portalUrl: 'https://consumers.datax.com/#/',
    phone: '1-800-295-4790',
    mailAddress: { name: 'DataX Ltd.', line1: 'Attn: Security Freeze', line2: '325 E. Warm Springs Road, Suite 202', city: 'Las Vegas', state: 'NV', postalCode: '89119', country: 'US' },
    requestMethods: ['online', 'phone', 'mail'],
    requiredEvidence: ['Confirmation letter or email'],
    notes: 'Confirmation timing varies; keep status honest until evidence is uploaded.',
    sortOrder: 90,
  },
]
