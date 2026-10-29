import { eq } from 'drizzle-orm'
import { CONSENT_KINDS, CONSENT_META } from '#shared/constants'
import { getDb, schema } from '../../db'
import { requireUser } from '../../utils/auth'
import { env } from '../../utils/env'
import { maskTail } from '../../utils/crypto'
import { getAiConfig, resolveOpenRouterKey } from '../../domains/settings/service'
import { describeOutboundProvider, listOutboundProviders } from '../../domains/correspondence/outbound'
import { activeInboundProvider, inboundProviders } from '../../domains/mailroom/providers'
import { listRulePacks, resolveLegalBasis } from '../../domains/rules/engine'
import { getBootState } from '../../plugins/boot'

export default defineEventHandler(async event => {
  const user = await requireUser(event)
  const db = getDb()
  const [aiConfig, key, consentRows, connections] = await Promise.all([
    getAiConfig(),
    resolveOpenRouterKey(),
    db.select().from(schema.consents).where(eq(schema.consents.userId, user.id)),
    db.select().from(schema.providerConnections).where(eq(schema.providerConnections.userId, user.id)),
  ])
  return {
    profile: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      automationMode: user.automationMode,
      mailingAddress: user.mailingAddress,
      mfaEnabled: user.mfaEnabled,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
    },
    app: { mode: env.appMode, version: useRuntimeConfig().public.appVersion, boot: getBootState(), encryptionConfigured: !!env.encryptionKey, dataDir: env.dataDir },
    ai: {
      ...aiConfig,
      keyConfigured: !!key.key,
      keySource: key.source,
      keyMasked: key.key ? maskTail(key.key, 4) : null,
      liveCapable: env.appMode !== 'demo' && aiConfig.liveEnabled && !!key.key,
      liveBlockedReason: env.appMode === 'demo' ? 'APP_MODE is demo — live AI is disabled by design' : !key.key ? 'No OpenRouter API key configured' : !aiConfig.liveEnabled ? 'Live council runs are switched off' : null,
    },
    consents: CONSENT_KINDS.map(kind => {
      const row = consentRows.find(r => r.kind === kind)
      return { kind, ...CONSENT_META[kind], granted: row?.granted ?? false, grantedAt: row?.grantedAt ?? null, revokedAt: row?.revokedAt ?? null, textVersion: row?.textVersion ?? 'v1' }
    }),
    connections,
    outbound: { active: env.mailOutboundProvider, providers: listOutboundProviders().map(describeOutboundProvider), webhookSecretConfigured: !!env.mailWebhookSecret },
    inbound: { active: activeInboundProvider().slug, providers: inboundProviders },
    rulePacks: listRulePacks().map(p => ({
      id: p.id,
      version: p.version,
      description: p.description,
      disclaimer: p.disclaimer,
      rules: p.rules.map(r => ({ ...r, legalBasis: resolveLegalBasis(r) })),
    })),
  }
})
