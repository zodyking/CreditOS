import { eq } from 'drizzle-orm'
import type { AgentRole } from '#shared/constants'
import { getDb, schema } from '../../db'
import { decryptSecret, encryptSecret } from '../../utils/crypto'
import { env } from '../../utils/env'

export interface AiConfig {
  provider: 'openrouter'
  defaultModel: string
  roleModels: Partial<Record<AgentRole, string>>
  temperature: number
  maxTokensPerMessage: number
  maxCostUsdPerRun: number
  piiMinimization: boolean
  liveEnabled: boolean
  /** OpenRouter provider routing preferences */
  providerOrder: string[]
  allowFallbacks: boolean
  requireParameters: boolean
}

export const DEFAULT_AI_CONFIG: AiConfig = {
  provider: 'openrouter',
  defaultModel: env.openrouterDefaultModel,
  roleModels: {},
  temperature: 0.2,
  maxTokensPerMessage: 1200,
  maxCostUsdPerRun: 0.5,
  piiMinimization: true,
  liveEnabled: false,
  providerOrder: [],
  allowFallbacks: true,
  requireParameters: true,
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const db = getDb()
  const row = await db.query.settings.findFirst({ where: eq(schema.settings.key, key) })
  return row ? ({ ...fallback, ...(row.value as object) } as T) : fallback
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  const db = getDb()
  await db
    .insert(schema.settings)
    .values({ key, value: value as object })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value: value as object, updatedAt: new Date() } })
}

export async function getAiConfig(): Promise<AiConfig> {
  return getSetting<AiConfig>('ai', DEFAULT_AI_CONFIG)
}

export async function setAiConfig(partial: Partial<AiConfig>): Promise<AiConfig> {
  const current = await getAiConfig()
  const next = { ...current, ...partial }
  await setSetting('ai', next)
  return next
}

export async function setSecret(key: string, value: string | null): Promise<void> {
  const db = getDb()
  if (!value) {
    await db.delete(schema.secrets).where(eq(schema.secrets.key, key))
    return
  }
  const ciphertext = encryptSecret(value)
  await db
    .insert(schema.secrets)
    .values({ key, ciphertext })
    .onConflictDoUpdate({ target: schema.secrets.key, set: { ciphertext, updatedAt: new Date() } })
}

export async function getSecret(key: string): Promise<string | null> {
  const db = getDb()
  const row = await db.query.secrets.findFirst({ where: eq(schema.secrets.key, key) })
  if (!row) return null
  try {
    return decryptSecret(row.ciphertext)
  } catch {
    return null
  }
}

export async function hasSecret(key: string): Promise<boolean> {
  const db = getDb()
  const row = await db.query.secrets.findFirst({ where: eq(schema.secrets.key, key) })
  return !!row
}

/** Resolve the OpenRouter key: DB-stored (encrypted) wins over the environment. */
export async function resolveOpenRouterKey(): Promise<{ key: string | null; source: 'database' | 'environment' | 'none' }> {
  const fromDb = await getSecret('openrouter_api_key')
  if (fromDb) return { key: fromDb, source: 'database' }
  if (env.openrouterApiKey) return { key: env.openrouterApiKey, source: 'environment' }
  return { key: null, source: 'none' }
}
