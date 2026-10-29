import type { DataMode } from '#shared/constants'
import { env } from '../../utils/env'

/**
 * Inbound mailroom connector architecture. A provider supplies envelope
 * notifications and — if contractually available — full content scans.
 * Only `manual` is implemented end to end; the others are honest scaffolds
 * that declare exactly which operations are missing.
 */
export interface InboundMailProvider {
  slug: string
  label: string
  mode: DataMode
  configured: boolean
  implemented: { listNewItems: boolean; requestContentScan: boolean; fetchDocument: boolean; webhooks: boolean }
  distinguishesEnvelopeFromContent: boolean
  configurationHelp: string
  notes: string
}

export const inboundProviders: InboundMailProvider[] = [
  {
    slug: 'manual',
    label: 'Manual upload (PDF / JPEG / PNG)',
    mode: 'live',
    configured: true,
    implemented: { listNewItems: true, requestContentScan: true, fetchDocument: true, webhooks: false },
    distinguishesEnvelopeFromContent: true,
    configurationHelp: 'No configuration. Upload scanned letters from the Mailroom; each upload is treated as a full content scan.',
    notes: 'Always available as the reliable fallback. Text is extracted from PDF text layers; image uploads require a manual transcription.',
  },
  {
    slug: 'postscan',
    label: 'PostScan Mail (scaffold)',
    mode: 'sandbox',
    get configured() {
      return !!env.postscanApiKey
    },
    implemented: { listNewItems: false, requestContentScan: false, fetchDocument: false, webhooks: false },
    distinguishesEnvelopeFromContent: true,
    configurationHelp: 'Requires a PostScan Mail business account with API access and a verified virtual address plus USPS Form 1583 authorisation. Set POSTSCAN_API_KEY after access is granted.',
    notes: 'API operations are not implemented: PostScan Mail API access and scan-content availability must be confirmed contractually before wiring. Nothing in CreditOS pretends to fetch PostScan items.',
  },
  {
    slug: 'earthclass',
    label: 'Earth Class Mail (scaffold)',
    mode: 'sandbox',
    get configured() {
      return !!env.earthclassApiKey
    },
    implemented: { listNewItems: false, requestContentScan: false, fetchDocument: false, webhooks: false },
    distinguishesEnvelopeFromContent: true,
    configurationHelp: 'Requires an Earth Class Mail account with API access. Set EARTHCLASS_API_KEY after access is granted.',
    notes: 'API operations are not implemented pending account and documentation verification.',
  },
]

export function activeInboundProvider(): InboundMailProvider {
  const wanted = env.mailInboundProvider
  const p = inboundProviders.find(x => x.slug === wanted)
  if (!p || !p.configured || !p.implemented.fetchDocument) return inboundProviders[0]!
  return p
}
