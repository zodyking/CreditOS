import type { AppMode } from '#shared/constants'

/**
 * Centralised environment access. Accepts both un-prefixed names (what a
 * Dokploy env panel would normally hold) and Nuxt's NUXT_* runtime config names.
 */
function pick(...names: string[]): string | undefined {
  for (const n of names) {
    const v = process.env[n]
    if (v && v.trim() !== '') return v.trim()
  }
  return undefined
}

export const env = {
  get databaseUrl(): string {
    const v = pick('DATABASE_URL', 'NUXT_DATABASE_URL')
    if (!v) throw new Error('DATABASE_URL is not set. CreditOS requires an external PostgreSQL database.')
    return v
  },
  get hasDatabaseUrl(): boolean {
    return !!pick('DATABASE_URL', 'NUXT_DATABASE_URL')
  },
  get appMode(): AppMode {
    const v = (pick('APP_MODE', 'NUXT_APP_MODE') ?? 'demo').toLowerCase()
    return (['demo', 'test', 'live'].includes(v) ? v : 'demo') as AppMode
  },
  get encryptionKey(): string | undefined {
    return pick('APP_ENCRYPTION_KEY', 'NUXT_APP_ENCRYPTION_KEY')
  },
  get openrouterApiKey(): string | undefined {
    return pick('OPENROUTER_API_KEY', 'NUXT_OPENROUTER_API_KEY')
  },
  get openrouterDefaultModel(): string {
    return pick('OPENROUTER_DEFAULT_MODEL', 'NUXT_OPENROUTER_DEFAULT_MODEL') ?? 'openai/gpt-4o-mini'
  },
  get openrouterSiteUrl(): string {
    return pick('OPENROUTER_SITE_URL') ?? 'http://localhost:3000'
  },
  get dataDir(): string {
    return pick('DATA_DIR', 'NUXT_DATA_DIR') ?? './data'
  },
  get migrationsDir(): string | undefined {
    return pick('MIGRATIONS_DIR')
  },
  get autoMigrate(): boolean {
    return (pick('AUTO_MIGRATE', 'NUXT_AUTO_MIGRATE') ?? 'true') !== 'false'
  },
  get demoSeed(): boolean {
    return (pick('DEMO_SEED', 'NUXT_DEMO_SEED') ?? 'true') !== 'false'
  },
  get mailOutboundProvider(): string {
    return pick('MAIL_OUTBOUND_PROVIDER') ?? 'sandbox'
  },
  get mailInboundProvider(): string {
    return pick('MAIL_INBOUND_PROVIDER') ?? 'manual'
  },
  get mailWebhookSecret(): string | undefined {
    return pick('MAIL_WEBHOOK_SECRET')
  },
  get docupostApiKey(): string | undefined {
    return pick('DOCUPOST_API_KEY')
  },
  get postgridApiKey(): string | undefined {
    return pick('POSTGRID_API_KEY')
  },
  get postscanApiKey(): string | undefined {
    return pick('POSTSCAN_API_KEY')
  },
  get earthclassApiKey(): string | undefined {
    return pick('EARTHCLASS_API_KEY')
  },
  get isProduction(): boolean {
    return process.env.NODE_ENV === 'production'
  },
}
