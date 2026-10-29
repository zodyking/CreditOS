import { env } from '../../utils/env'

export interface OpenRouterModel {
  id: string
  name: string
  description?: string
  contextLength: number
  pricing: { prompt: number; completion: number }
  supportsStructuredOutput: boolean
  supportsTools: boolean
  inputModalities: string[]
  provider: string
}

interface RawModel {
  id: string
  name: string
  description?: string
  context_length?: number
  pricing?: { prompt?: string; completion?: string }
  supported_parameters?: string[]
  architecture?: { input_modalities?: string[]; modality?: string }
}

let modelCache: { at: number; models: OpenRouterModel[] } | null = null
const MODEL_TTL_MS = 10 * 60 * 1000

export async function listOpenRouterModels(force = false): Promise<OpenRouterModel[]> {
  if (!force && modelCache && Date.now() - modelCache.at < MODEL_TTL_MS) return modelCache.models
  const res = await fetch('https://openrouter.ai/api/v1/models', {
    headers: { 'HTTP-Referer': env.openrouterSiteUrl, 'X-Title': 'CreditOS' },
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) throw new Error(`OpenRouter model list failed: HTTP ${res.status}`)
  const json = (await res.json()) as { data: RawModel[] }
  const models: OpenRouterModel[] = json.data
    .map(m => ({
      id: m.id,
      name: m.name,
      description: m.description,
      contextLength: m.context_length ?? 0,
      pricing: {
        prompt: Number(m.pricing?.prompt ?? 0),
        completion: Number(m.pricing?.completion ?? 0),
      },
      supportsStructuredOutput: (m.supported_parameters ?? []).includes('response_format') || (m.supported_parameters ?? []).includes('structured_outputs'),
      supportsTools: (m.supported_parameters ?? []).includes('tools'),
      inputModalities: m.architecture?.input_modalities ?? [],
      provider: m.id.split('/')[0] ?? 'unknown',
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
  modelCache = { at: Date.now(), models }
  return models
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatResult {
  content: string
  model: string
  promptTokens: number
  completionTokens: number
  estimatedCostUsd: number
}

export interface ChatOptions {
  apiKey: string
  model: string
  messages: ChatMessage[]
  temperature?: number
  maxTokens?: number
  jsonSchema?: { name: string; schema: Record<string, unknown> }
  providerOrder?: string[]
  allowFallbacks?: boolean
  requireParameters?: boolean
  timeoutMs?: number
}

export async function openRouterChat(opts: ChatOptions): Promise<ChatResult> {
  const body: Record<string, unknown> = {
    model: opts.model,
    messages: opts.messages,
    temperature: opts.temperature ?? 0.2,
    max_tokens: opts.maxTokens ?? 1200,
    usage: { include: true },
  }
  if (opts.jsonSchema) {
    body.response_format = {
      type: 'json_schema',
      json_schema: { name: opts.jsonSchema.name, strict: true, schema: opts.jsonSchema.schema },
    }
  }
  const provider: Record<string, unknown> = {}
  if (opts.providerOrder?.length) provider.order = opts.providerOrder
  if (opts.allowFallbacks === false) provider.allow_fallbacks = false
  if (opts.requireParameters) provider.require_parameters = true
  if (Object.keys(provider).length) body.provider = provider

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${opts.apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': env.openrouterSiteUrl,
      'X-Title': 'CreditOS',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 90_000),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`OpenRouter chat failed: HTTP ${res.status} ${text.slice(0, 300)}`)
  }
  const json = (await res.json()) as {
    model?: string
    choices?: { message?: { content?: string } }[]
    usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number }
    error?: { message?: string }
  }
  if (json.error) throw new Error(`OpenRouter error: ${json.error.message}`)
  const content = json.choices?.[0]?.message?.content ?? ''
  return {
    content,
    model: json.model ?? opts.model,
    promptTokens: json.usage?.prompt_tokens ?? 0,
    completionTokens: json.usage?.completion_tokens ?? 0,
    estimatedCostUsd: json.usage?.cost ?? 0,
  }
}

export async function verifyOpenRouterKey(apiKey: string): Promise<{ ok: boolean; label?: string; limitRemaining?: number | null; error?: string }> {
  try {
    const res = await fetch('https://openrouter.ai/api/v1/auth/key', {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
    const json = (await res.json()) as { data?: { label?: string; limit_remaining?: number | null } }
    return { ok: true, label: json.data?.label, limitRemaining: json.data?.limit_remaining ?? null }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
