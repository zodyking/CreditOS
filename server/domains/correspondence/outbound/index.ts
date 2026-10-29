import { env } from '../../../utils/env'
import { docupostProvider } from './docupost'
import { postgridProvider } from './postgrid'
import { sandboxProvider } from './sandbox'
import type { OutboundMailProvider } from './types'

const providers: Record<string, OutboundMailProvider> = {
  sandbox: sandboxProvider,
  postgrid: postgridProvider,
  docupost: docupostProvider,
}

export function listOutboundProviders(): OutboundMailProvider[] {
  return Object.values(providers)
}

export function getOutboundProvider(slug?: string): OutboundMailProvider {
  const wanted = slug ?? env.mailOutboundProvider
  const p = providers[wanted]
  if (!p) return sandboxProvider
  // Never let a non-live app mode reach a live provider.
  if (env.appMode !== 'live' && p.mode === 'live') return sandboxProvider
  if (!p.configured || !p.implemented.createOrder) return sandboxProvider
  return p
}

export function describeOutboundProvider(p: OutboundMailProvider) {
  return {
    slug: p.slug,
    label: p.label,
    mode: p.mode,
    configured: p.configured,
    implemented: p.implemented,
    capabilities: p.capabilities,
    configurationHelp: p.configurationHelp,
    active: getOutboundProvider().slug === p.slug,
  }
}

export type { OutboundMailProvider }
