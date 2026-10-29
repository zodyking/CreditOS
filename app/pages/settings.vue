<script setup lang="ts">
import { AGENT_ROLES, AGENT_ROLE_META, AUTOMATION_MODES, AUTOMATION_MODE_LABEL, ISSUE_CATEGORY_LABEL, REMEDY_CHANNEL_LABEL, type AgentRole, type AutomationMode } from '#shared/constants'
import { TONE_CLASS, fmtDate, money, relTime, titleize } from '~/utils/format'

useHead({ title: 'Settings' })
const route = useRoute()
const router = useRouter()
const toast = useToast()
const { clear: clearSession } = useUserSession()
const { data, refresh, pending } = await useFetch('/api/settings', { key: 'settings' })
const { data: jobsData, refresh: refreshJobs } = await useFetch('/api/settings/jobs', { key: 'settings-jobs', lazy: true, server: false })

type Section = 'ai' | 'consents' | 'profile' | 'providers' | 'jobs' | 'rules' | 'system'
const SECTIONS: { k: Section; l: string; i: string }[] = [
  { k: 'ai', l: 'AI council (OpenRouter)', i: 'lucide:brain-circuit' },
  { k: 'consents', l: 'Consents & automation', i: 'lucide:shield-check' },
  { k: 'profile', l: 'Profile & address', i: 'lucide:user-round' },
  { k: 'providers', l: 'Integrations', i: 'lucide:plug' },
  { k: 'jobs', l: 'Background jobs', i: 'lucide:list-checks' },
  { k: 'rules', l: 'Rule packs', i: 'lucide:scale' },
  { k: 'system', l: 'System', i: 'lucide:server' },
]
const section = ref<Section>((SECTIONS.some(s => s.k === route.query.s) ? String(route.query.s) : 'ai') as Section)
watch(section, s => router.replace({ query: { s } }))

const api = useApi()

const busy = ref<string | null>(null)
async function run(key: string, fn: () => Promise<unknown>, ok?: string) {
  busy.value = key
  try {
    await fn()
    if (ok) toast.success(ok)
    await refresh()
  } catch (e) {
    toast.error('Not saved', errorMessage(e))
  } finally {
    busy.value = null
  }
}

// ── AI ────────────────────────────────────────────────────────────────────────
const ai = reactive({ defaultModel: '', roleModels: {} as Record<AgentRole, string>, temperature: 0.2, maxTokensPerMessage: 1200, maxCostUsdPerRun: 1, liveEnabled: false, providerOrder: '', allowFallbacks: true, requireParameters: true })
watch(
  data,
  d => {
    if (!d) return
    ai.defaultModel = d.ai.defaultModel
    ai.roleModels = Object.fromEntries(AGENT_ROLES.map(r => [r, d.ai.roleModels[r] ?? ''])) as Record<AgentRole, string>
    ai.temperature = d.ai.temperature
    ai.maxTokensPerMessage = d.ai.maxTokensPerMessage
    ai.maxCostUsdPerRun = d.ai.maxCostUsdPerRun
    ai.liveEnabled = d.ai.liveEnabled
    ai.providerOrder = d.ai.providerOrder.join(', ')
    ai.allowFallbacks = d.ai.allowFallbacks
    ai.requireParameters = d.ai.requireParameters
  },
  { immediate: true },
)
function saveAi() {
  const body: Record<string, unknown> = {
    defaultModel: ai.defaultModel,
    roleModels: ai.roleModels,
    temperature: Number(ai.temperature),
    maxTokensPerMessage: Number(ai.maxTokensPerMessage),
    maxCostUsdPerRun: Number(ai.maxCostUsdPerRun),
    liveEnabled: ai.liveEnabled,
    providerOrder: ai.providerOrder.split(',').map(s => s.trim()).filter(Boolean),
    allowFallbacks: ai.allowFallbacks,
    requireParameters: ai.requireParameters,
  }
  return run('ai', async () => {
    await api('/api/settings/ai', { method: 'PATCH', body })
  }, 'AI settings saved')
}
const apiKey = ref('')
const keyResult = ref<string | null>(null)
function saveKey(remove = false) {
  return run('key', async () => {
    const r = await api<{ keyMasked: string | null; verification: { ok: boolean; label?: string; limitRemaining?: number | null } | null }>('/api/settings/ai/key', { method: 'POST', body: { apiKey: remove ? null : apiKey.value, verify: true } })
    keyResult.value = remove ? 'Key removed.' : r.verification ? `Verified${r.verification.label ? ` · ${r.verification.label}` : ''}${r.verification.limitRemaining != null ? ` · ${money(r.verification.limitRemaining)} remaining` : ''}` : 'Stored.'
    apiKey.value = ''
  }, remove ? 'OpenRouter key removed' : 'OpenRouter key stored (encrypted)')
}
const testResult = ref<{ ok: boolean; message: string; model: string; latencyMs: number; usage: { estimatedCostUsd: number } } | null>(null)
const testModel = ref('')
function testAi() {
  return run('test', async () => {
    testResult.value = await api<NonNullable<typeof testResult.value>>('/api/settings/ai/test', { method: 'POST', body: { model: testModel.value || undefined } })
  })
}

// ── Consents / automation ─────────────────────────────────────────────────────
function setConsent(kind: string, granted: boolean) {
  return run(`consent-${kind}`, () => api('/api/settings/consents', { method: 'POST', body: { kind, granted } }), granted ? 'Consent granted' : 'Consent revoked')
}
function setAutomation(mode: AutomationMode) {
  return run('automation', () => api('/api/settings/profile', { method: 'PATCH', body: { automationMode: mode } }), 'Automation mode updated')
}
const AUTOMATION_HELP: Record<AutomationMode, string> = {
  observe_only: 'Detect and explain only. No plans, no letters, nothing to approve.',
  recommend_and_draft: 'Council deliberates and drafts letters. Nothing is sent unless you request and approve it.',
  submit_after_approval: 'Same as above, plus approved letters are dispatched automatically by the scheduler.',
}

// ── Profile ───────────────────────────────────────────────────────────────────
const profile = reactive({ displayName: '', address: { name: '', line1: '', line2: '', city: '', state: '', postalCode: '', country: 'US' } })
watch(
  data,
  d => {
    if (!d) return
    profile.displayName = d.profile.displayName
    const a = d.profile.mailingAddress
    profile.address = { name: a?.name ?? d.profile.displayName, line1: a?.line1 ?? '', line2: a?.line2 ?? '', city: a?.city ?? '', state: a?.state ?? '', postalCode: a?.postalCode ?? '', country: a?.country ?? 'US' }
  },
  { immediate: true },
)
function saveProfile() {
  return run('profile', () => api('/api/settings/profile', { method: 'PATCH', body: { displayName: profile.displayName, mailingAddress: { ...profile.address, line2: profile.address.line2 || undefined, state: profile.address.state.toUpperCase() } } }), 'Profile saved')
}
const pw = reactive({ current: '', next: '', confirm: '' })
function changePassword() {
  if (pw.next !== pw.confirm) return toast.warning('Passwords do not match')
  return run('password', async () => {
    await api('/api/settings/profile', { method: 'PATCH', body: { currentPassword: pw.current, newPassword: pw.next } })
    pw.current = ''
    pw.next = ''
    pw.confirm = ''
  }, 'Password changed')
}
async function logout() {
  await api('/api/auth/logout', { method: 'POST' })
  await clearSession()
  navigateTo('/login')
}

// ── Jobs ─────────────────────────────────────────────────────────────────────
function retryJob(id: string) {
  return run(`job-${id}`, async () => {
    await api(`/api/settings/jobs/${id}/retry`, { method: 'POST' })
    await refreshJobs()
  }, 'Job re-queued')
}
const jobTone: Record<string, string> = { pending: TONE_CLASS.info, running: TONE_CLASS.warning, completed: TONE_CLASS.success, failed: TONE_CLASS.danger, dead: TONE_CLASS.danger }
</script>

<template>
  <div>
    <PageHeader title="Settings" eyebrow="Configuration" description="Model selection, consents, your mailing identity, integrations and the job queue. Secrets are encrypted at rest and never echoed back." />

    <div v-if="pending && !data" class="skeleton h-64" />
    <div v-else-if="data" class="grid gap-6 lg:grid-cols-4">
      <nav class="lg:col-span-1" aria-label="Settings sections">
        <ul class="card p-1.5 flex lg:flex-col gap-0.5 overflow-x-auto">
          <li v-for="s in SECTIONS" :key="s.k">
            <button type="button" class="w-full flex items-center gap-2 rounded-md px-3 py-2 text-sm whitespace-nowrap" :class="section === s.k ? 'bg-accent/10 text-fg font-medium' : 'text-fg-2 hover:bg-surface-2'" :aria-current="section === s.k ? 'page' : undefined" @click="section = s.k"><Icon :name="s.i" class="size-4" /> {{ s.l }}</button>
          </li>
        </ul>
      </nav>

      <div class="lg:col-span-3 space-y-6">
        <!-- AI -->
        <template v-if="section === 'ai'">
          <section class="card">
            <div class="px-5 py-4 border-b border-border flex flex-wrap items-center gap-2">
              <h2 class="font-semibold">Live council status</h2>
              <span class="pill ml-auto" :class="data.ai.liveCapable ? TONE_CLASS.live : TONE_CLASS.demo">{{ data.ai.liveCapable ? 'Live-capable' : 'Simulator' }}</span>
            </div>
            <div class="px-5 py-4 text-sm space-y-2">
              <p v-if="data.ai.liveBlockedReason" class="flex items-start gap-2 text-fg-2"><Icon name="lucide:info" class="size-4 mt-0.5 text-accent shrink-0" /> {{ data.ai.liveBlockedReason }}. The council still runs, using the deterministic simulator, and every run is labelled Demo.</p>
              <p v-else class="text-fg-2">Council runs will call OpenRouter with the models below. Only a PII-minimised dossier is sent; full account numbers, SSN and date of birth never leave this server.</p>
              <ul class="grid gap-2 sm:grid-cols-3 text-xs mt-2">
                <li class="rounded-md bg-surface-2 p-2.5"><p class="text-fg-3">App mode</p><p class="font-medium">{{ titleize(data.app.mode) }}</p></li>
                <li class="rounded-md bg-surface-2 p-2.5"><p class="text-fg-3">API key</p><p class="font-medium">{{ data.ai.keyConfigured ? `${data.ai.keyMasked} (${data.ai.keySource})` : 'not configured' }}</p></li>
                <li class="rounded-md bg-surface-2 p-2.5"><p class="text-fg-3">PII minimisation</p><p class="font-medium">Always on</p></li>
              </ul>
            </div>
          </section>

          <section class="card">
            <div class="px-5 py-4 border-b border-border"><h2 class="font-semibold">OpenRouter API key</h2><p class="text-xs text-fg-3">Stored encrypted (AES-256-GCM) with <span class="mono">APP_ENCRYPTION_KEY</span>. Alternatively set <span class="mono">OPENROUTER_API_KEY</span> in the environment; a stored key takes precedence.</p></div>
            <div class="px-5 py-4 space-y-3">
              <div class="flex flex-col sm:flex-row gap-2">
                <input v-model="apiKey" type="password" class="input mono flex-1" placeholder="sk-or-v1-…" autocomplete="off" aria-label="OpenRouter API key">
                <button class="btn btn-primary" :disabled="!apiKey || busy === 'key' || !data.app.encryptionConfigured" @click="saveKey()"><Icon :name="busy === 'key' ? 'lucide:loader-2' : 'lucide:key-round'" class="size-4" :class="busy === 'key' && 'animate-spin'" /> Verify & store</button>
                <button v-if="data.ai.keySource === 'database'" class="btn btn-ghost" :disabled="busy === 'key'" @click="saveKey(true)">Remove</button>
              </div>
              <p v-if="!data.app.encryptionConfigured" class="text-xs text-garnet-500">APP_ENCRYPTION_KEY is not set, so keys cannot be stored in the database. Set it (64 hex chars) or use the OPENROUTER_API_KEY environment variable.</p>
              <p v-if="keyResult" class="text-xs text-fern-600 dark:text-fern-300">{{ keyResult }}</p>
            </div>
          </section>

          <section class="card">
            <div class="px-5 py-4 border-b border-border"><h2 class="font-semibold">Model selection</h2><p class="text-xs text-fg-3">Browse the live OpenRouter catalogue with pricing and context size. Models with JSON-schema structured output are strongly recommended — the council rejects any message that fails schema validation.</p></div>
            <div class="px-5 py-4 space-y-5">
              <ModelPicker id="m-default" v-model="ai.defaultModel" label="Default model" hint="Used for any role without an override." />
              <div class="grid gap-4 md:grid-cols-2">
                <ModelPicker v-for="r in AGENT_ROLES" :id="`m-${r}`" :key="r" v-model="ai.roleModels[r]" :label="AGENT_ROLE_META[r].label" :hint="AGENT_ROLE_META[r].description" allow-empty />
              </div>
              <div class="grid gap-4 sm:grid-cols-3">
                <div><label class="label" for="ai-temp">Temperature</label><input id="ai-temp" v-model.number="ai.temperature" type="number" min="0" max="1.5" step="0.05" class="input num"></div>
                <div><label class="label" for="ai-tok">Max tokens / message</label><input id="ai-tok" v-model.number="ai.maxTokensPerMessage" type="number" min="200" max="8000" step="100" class="input num"></div>
                <div><label class="label" for="ai-cost">Cost cap per run (USD)</label><input id="ai-cost" v-model.number="ai.maxCostUsdPerRun" type="number" min="0.01" max="50" step="0.25" class="input num"></div>
              </div>
              <details class="rounded-md border border-border">
                <summary class="px-3 py-2 text-sm cursor-pointer">Advanced provider routing</summary>
                <div class="px-3 pb-3 space-y-3 text-sm">
                  <div><label class="label" for="ai-order">Preferred providers (comma separated, in order)</label><input id="ai-order" v-model="ai.providerOrder" class="input" placeholder="anthropic, openai, google"><p class="text-xs text-fg-3 mt-1">Sent as OpenRouter <span class="mono">provider.order</span>.</p></div>
                  <label class="flex items-center gap-2 cursor-pointer"><input v-model="ai.allowFallbacks" type="checkbox" class="size-4 accent-[var(--accent)]"> Allow fallbacks to other providers if preferred ones are unavailable</label>
                  <label class="flex items-center gap-2 cursor-pointer"><input v-model="ai.requireParameters" type="checkbox" class="size-4 accent-[var(--accent)]"> Only route to providers that support all requested parameters (structured output)</label>
                </div>
              </details>
              <label class="flex items-start gap-2 text-sm cursor-pointer rounded-md border border-border p-3" :class="ai.liveEnabled ? 'border-verdigris-500/50 bg-verdigris-500/5' : ''">
                <input v-model="ai.liveEnabled" type="checkbox" class="size-4 mt-0.5 accent-[var(--accent)]">
                <span><span class="font-medium">Enable live council runs</span><br><span class="text-xs text-fg-2">Requires APP_MODE=test or live, a verified key and the “AI processing” consent. Costs are capped per run.</span></span>
              </label>
              <div class="flex justify-end"><button class="btn btn-primary" :disabled="busy === 'ai'" @click="saveAi"><Icon v-if="busy === 'ai'" name="lucide:loader-2" class="size-4 animate-spin" /> Save AI settings</button></div>
            </div>
          </section>

          <section class="card">
            <div class="px-5 py-4 border-b border-border"><h2 class="font-semibold">Connection test</h2><p class="text-xs text-fg-3">Sends a tiny structured-output probe (no case data) through OpenRouter and reports latency and cost.</p></div>
            <div class="px-5 py-4 space-y-3">
              <div class="flex flex-col sm:flex-row gap-2"><input v-model.trim="testModel" class="input mono flex-1" :placeholder="ai.defaultModel || 'provider/model'" aria-label="Model to test"><button class="btn btn-secondary" :disabled="busy === 'test' || !data.ai.keyConfigured" @click="testAi"><Icon :name="busy === 'test' ? 'lucide:loader-2' : 'lucide:zap'" class="size-4" :class="busy === 'test' && 'animate-spin'" /> Run probe</button></div>
              <div v-if="testResult" class="rounded-md p-3 text-sm" :class="testResult.ok ? 'bg-fern-500/10' : 'bg-garnet-500/10'">
                <p class="font-medium">{{ testResult.ok ? 'Structured output honoured' : 'Probe failed' }} · <span class="mono text-xs">{{ testResult.model }}</span></p>
                <p class="text-xs text-fg-2 mt-1">{{ testResult.message }} · {{ testResult.latencyMs }} ms · {{ money(testResult.usage.estimatedCostUsd) }}</p>
              </div>
            </div>
          </section>
        </template>

        <!-- Consents -->
        <template v-else-if="section === 'consents'">
          <section class="card">
            <div class="px-5 py-4 border-b border-border"><h2 class="font-semibold">Consents</h2><p class="text-xs text-fg-3">Each capability is gated by an explicit, revocable consent. Revoking one blocks the features listed under it until re-granted.</p></div>
            <ul class="divide-y divide-border">
              <li v-for="c in data.consents" :key="c.kind" class="px-5 py-4 flex items-start gap-4">
                <div class="min-w-0 flex-1">
                  <p class="font-medium text-sm">{{ c.label }}</p>
                  <p class="text-xs text-fg-2 mt-0.5">{{ c.description }}</p>
                  <p class="text-[11px] text-fg-3 mt-1">Required for: {{ c.required }} · text {{ c.textVersion }}<span v-if="c.grantedAt && c.granted"> · granted {{ fmtDate(c.grantedAt) }}</span><span v-else-if="c.revokedAt"> · revoked {{ fmtDate(c.revokedAt) }}</span></p>
                </div>
                <button type="button" role="switch" :aria-checked="c.granted" :aria-label="c.label" class="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]" :class="c.granted ? 'bg-verdigris-500' : 'bg-surface-3'" :disabled="busy === `consent-${c.kind}`" @click="setConsent(c.kind, !c.granted)">
                  <span class="inline-block size-5 rounded-full bg-white shadow transition-transform" :class="c.granted ? 'translate-x-5' : 'translate-x-0.5'" />
                </button>
              </li>
            </ul>
          </section>
          <section class="card">
            <div class="px-5 py-4 border-b border-border"><h2 class="font-semibold">Automation mode</h2><p class="text-xs text-fg-3">How far CreditOS goes on its own. No mode ever sends mail without a recorded approval.</p></div>
            <div class="px-5 py-4 grid gap-3 sm:grid-cols-3">
              <button v-for="m in AUTOMATION_MODES" :key="m" type="button" class="rounded-lg border p-3 text-left" :class="data.profile.automationMode === m ? 'border-accent bg-accent/10' : 'border-border hover:bg-surface-2'" :aria-pressed="data.profile.automationMode === m" :disabled="busy === 'automation'" @click="setAutomation(m)">
                <p class="font-medium text-sm">{{ AUTOMATION_MODE_LABEL[m] }}</p>
                <p class="text-xs text-fg-2 mt-1">{{ AUTOMATION_HELP[m] }}</p>
              </button>
            </div>
          </section>
        </template>

        <!-- Profile -->
        <template v-else-if="section === 'profile'">
          <section class="card">
            <div class="px-5 py-4 border-b border-border"><h2 class="font-semibold">Profile & return address</h2><p class="text-xs text-fg-3">The return address is printed on every letter and used by mail providers. Letters cannot be approved without a complete address.</p></div>
            <form class="px-5 py-4 space-y-4" @submit.prevent="saveProfile">
              <div class="grid gap-4 sm:grid-cols-2">
                <div><label class="label" for="p-name">Display name</label><input id="p-name" v-model="profile.displayName" class="input" required></div>
                <div><label class="label" for="p-email">Email</label><input id="p-email" :value="data.profile.email" class="input" disabled></div>
              </div>
              <fieldset class="space-y-3">
                <legend class="label">Mailing address</legend>
                <div><label class="label" for="a-name">Name on letters</label><input id="a-name" v-model="profile.address.name" class="input" required></div>
                <div class="grid gap-3 sm:grid-cols-2"><div><label class="label" for="a-l1">Street</label><input id="a-l1" v-model="profile.address.line1" class="input" required autocomplete="address-line1"></div><div><label class="label" for="a-l2">Apt / unit</label><input id="a-l2" v-model="profile.address.line2" class="input" autocomplete="address-line2"></div></div>
                <div class="grid gap-3 grid-cols-6"><div class="col-span-3"><label class="label" for="a-city">City</label><input id="a-city" v-model="profile.address.city" class="input" required autocomplete="address-level2"></div><div class="col-span-1"><label class="label" for="a-state">State</label><input id="a-state" v-model="profile.address.state" class="input uppercase" maxlength="2" required autocomplete="address-level1"></div><div class="col-span-2"><label class="label" for="a-zip">ZIP</label><input id="a-zip" v-model="profile.address.postalCode" class="input num" required pattern="\d{5}(-\d{4})?" autocomplete="postal-code"></div></div>
              </fieldset>
              <div class="flex justify-end"><button class="btn btn-primary" type="submit" :disabled="busy === 'profile'">Save profile</button></div>
            </form>
          </section>
          <section class="card">
            <div class="px-5 py-4 border-b border-border"><h2 class="font-semibold">Password</h2><p class="text-xs text-fg-3">Minimum 12 characters. Changing it does not log out other sessions in this build.</p></div>
            <form class="px-5 py-4 grid gap-3 sm:grid-cols-3" @submit.prevent="changePassword">
              <div><label class="label" for="pw-c">Current</label><input id="pw-c" v-model="pw.current" type="password" class="input" required autocomplete="current-password"></div>
              <div><label class="label" for="pw-n">New</label><input id="pw-n" v-model="pw.next" type="password" class="input" required minlength="12" autocomplete="new-password"></div>
              <div><label class="label" for="pw-r">Confirm</label><input id="pw-r" v-model="pw.confirm" type="password" class="input" required minlength="12" autocomplete="new-password"></div>
              <div class="sm:col-span-3 flex justify-end"><button class="btn btn-secondary" type="submit" :disabled="busy === 'password'">Change password</button></div>
            </form>
          </section>
          <section class="card card-pad flex flex-wrap items-center gap-3 text-sm">
            <div class="flex-1"><p class="font-medium">Session</p><p class="text-xs text-fg-3">Signed in as {{ data.profile.email }} · last login {{ fmtDate(data.profile.lastLoginAt, 'time') }}</p></div>
            <button class="btn btn-ghost" @click="logout"><Icon name="lucide:log-out" class="size-4" /> Sign out</button>
          </section>
        </template>

        <!-- Providers -->
        <template v-else-if="section === 'providers'">
          <section class="card">
            <div class="px-5 py-4 border-b border-border"><h2 class="font-semibold">Integration status</h2><p class="text-xs text-fg-3">Configured through environment variables (Dokploy → Environment). See <span class="mono">INTEGRATIONS.md</span> for every variable and what each provider actually supports.</p></div>
            <div class="divide-y divide-border text-sm">
              <div class="px-5 py-4">
                <p class="eyebrow mb-2">Outbound mail <span class="normal-case tracking-normal text-fg-3">· active: {{ data.outbound.active }} · webhook secret {{ data.outbound.webhookSecretConfigured ? 'set' : 'using sandbox default' }}</span></p>
                <ul class="space-y-2">
                  <li v-for="p in data.outbound.providers" :key="p.slug" class="flex flex-wrap items-center gap-2"><span class="font-medium w-40">{{ p.label }}</span><ModeBadge :mode="p.mode" /><span class="pill" :class="p.configured ? TONE_CLASS.success : TONE_CLASS.neutral">{{ p.configured ? 'configured' : 'not configured' }}</span><span v-if="p.active" class="pill" :class="TONE_CLASS.live">active</span><span class="text-xs text-fg-3 basis-full sm:basis-auto sm:ml-2">{{ p.configurationHelp }}</span></li>
                </ul>
              </div>
              <div class="px-5 py-4">
                <p class="eyebrow mb-2">Inbound mail <span class="normal-case tracking-normal text-fg-3">· active: {{ data.inbound.active }}</span></p>
                <ul class="space-y-2">
                  <li v-for="p in data.inbound.providers" :key="p.slug" class="flex flex-wrap items-center gap-2"><span class="font-medium w-40">{{ p.label }}</span><ModeBadge :mode="p.mode" /><span class="pill" :class="p.configured ? TONE_CLASS.success : TONE_CLASS.neutral">{{ p.configured ? 'configured' : 'not configured' }}</span><span class="text-xs text-fg-3 basis-full sm:basis-auto sm:ml-2">{{ p.configurationHelp }}</span></li>
                </ul>
              </div>
              <div class="px-5 py-4">
                <p class="eyebrow mb-2">Data connections</p>
                <ul v-if="data.connections.length" class="space-y-2">
                  <li v-for="c in data.connections" :key="c.id" class="flex flex-wrap items-center gap-2"><span class="font-medium w-40">{{ titleize(c.provider) }}</span><span class="pill bg-surface-3 text-fg-2">{{ titleize(c.kind) }}</span><ModeBadge :mode="c.mode" /><span class="pill" :class="c.status === 'healthy' ? TONE_CLASS.live : ['failed', 'expired', 'degraded'].includes(c.status) ? TONE_CLASS.danger : TONE_CLASS.neutral">{{ titleize(c.status) }}</span><span v-if="c.lastCheckedAt" class="text-xs text-fg-3">checked {{ relTime(c.lastCheckedAt) }}</span></li>
                </ul>
                <p v-else class="text-xs text-fg-3">No provider connections recorded.</p>
              </div>
            </div>
          </section>
        </template>

        <!-- Jobs -->
        <template v-else-if="section === 'jobs'">
          <section class="card">
            <div class="px-5 py-4 border-b border-border flex flex-wrap items-center gap-2">
              <h2 class="font-semibold">Job queue</h2>
              <div class="flex gap-1.5 ml-auto"><span v-for="(n, s) in jobsData?.counts ?? {}" :key="s" class="pill" :class="jobTone[String(s)] ?? TONE_CLASS.neutral">{{ n }} {{ s }}</span></div>
              <button class="btn btn-ghost btn-sm" @click="refreshJobs()"><Icon name="lucide:refresh-cw" class="size-3.5" /></button>
            </div>
            <p class="px-5 py-2 text-xs text-fg-3 border-b border-border">Postgres-backed queue with <span class="mono">FOR UPDATE SKIP LOCKED</span>, exponential retries and a dead-letter state. Idempotency keys prevent duplicate dispatches.</p>
            <div class="overflow-x-auto">
              <table class="table min-w-[720px]">
                <thead><tr><th>Kind</th><th>Status</th><th>Attempts</th><th>Run at</th><th>Error</th><th /></tr></thead>
                <tbody>
                  <tr v-for="j in jobsData?.jobs ?? []" :key="j.id">
                    <td><span class="mono text-xs">{{ j.kind }}</span><p v-if="j.idempotencyKey" class="text-[11px] text-fg-3 mono truncate max-w-64" :title="j.idempotencyKey">{{ j.idempotencyKey }}</p></td>
                    <td><span class="pill" :class="jobTone[j.status]">{{ j.status }}</span></td>
                    <td class="num text-xs">{{ j.attempts }}/{{ j.maxAttempts }}</td>
                    <td class="text-xs text-fg-3 whitespace-nowrap">{{ fmtDate(j.runAt, 'time') }}<p v-if="j.completedAt">done {{ relTime(j.completedAt) }}</p></td>
                    <td class="text-xs text-garnet-500 max-w-64 truncate" :title="j.lastError ?? ''">{{ j.lastError ?? '' }}</td>
                    <td class="text-right"><button v-if="['failed', 'dead'].includes(j.status)" class="btn btn-secondary btn-sm" :disabled="busy === `job-${j.id}`" @click="retryJob(j.id)">Retry</button></td>
                  </tr>
                  <tr v-if="!jobsData?.jobs.length"><td colspan="6"><EmptyState compact icon="lucide:list-checks" title="No jobs" /></td></tr>
                </tbody>
              </table>
            </div>
          </section>
        </template>

        <!-- Rules -->
        <template v-else-if="section === 'rules'">
          <section v-for="p in data.rulePacks" :key="p.id" class="card">
            <div class="px-5 py-4 border-b border-border"><h2 class="font-semibold">{{ p.id }} <span class="text-fg-3 font-normal text-sm">v{{ p.version }}</span></h2><p class="text-xs text-fg-2 mt-0.5">{{ p.description }}</p><p class="text-[11px] text-fg-3 mt-1">{{ p.disclaimer }}</p></div>
            <ul class="divide-y divide-border">
              <li v-for="r in p.rules" :key="r.id" class="px-5 py-4 text-sm">
                <details>
                  <summary class="cursor-pointer flex flex-wrap items-center gap-2"><span class="font-medium">{{ r.title }}</span><span class="pill bg-surface-3 text-fg-2">{{ ISSUE_CATEGORY_LABEL[r.category] }}</span><span class="pill" :class="TONE_CLASS[r.severity === 'critical' || r.severity === 'high' ? 'danger' : r.severity === 'medium' ? 'warning' : 'neutral']">{{ r.severity }}</span><span class="text-xs text-fg-3 ml-auto">{{ REMEDY_CHANNEL_LABEL[r.channel] }}</span></summary>
                  <div class="mt-3 grid gap-3 sm:grid-cols-2 text-xs">
                    <p class="sm:col-span-2 text-fg-2">{{ r.description }}</p>
                    <div><p class="eyebrow">Disputable when</p><p class="mt-0.5">{{ r.disputableWhen }}</p></div>
                    <div><p class="eyebrow">Not disputable when</p><p class="mt-0.5">{{ r.notDisputableWhen }}</p></div>
                    <div><p class="eyebrow">Evidence requirements</p><ul class="mt-0.5 space-y-0.5"><li v-for="e in r.evidenceRequirements" :key="e">· {{ e }}</li></ul></div>
                    <div><p class="eyebrow">Legal basis (informational)</p><ul class="mt-0.5 space-y-0.5"><li v-for="l in r.legalBasis" :key="l.cite"><span class="font-medium">{{ l.cite }}</span> · {{ l.label }}</li></ul><p class="mt-1 text-fg-3">Base confidence {{ Math.round(r.baseConfidence * 100) }}% · typical window {{ r.typicalReviewWindow }}</p></div>
                  </div>
                </details>
              </li>
            </ul>
          </section>
        </template>

        <!-- System -->
        <template v-else>
          <section class="card">
            <div class="px-5 py-4 border-b border-border"><h2 class="font-semibold">System</h2></div>
            <dl class="px-5 py-4 grid gap-3 sm:grid-cols-2 text-sm">
              <div><dt class="text-xs text-fg-3">Version</dt><dd class="mono">{{ data.app.version }}</dd></div>
              <div><dt class="text-xs text-fg-3">App mode</dt><dd><ModeBadge :mode="data.app.mode" size="sm" /></dd></div>
              <div><dt class="text-xs text-fg-3">Encryption key</dt><dd>{{ data.app.encryptionConfigured ? 'configured' : 'missing — secrets cannot be stored' }}</dd></div>
              <div><dt class="text-xs text-fg-3">Data directory</dt><dd class="mono text-xs">{{ data.app.dataDir }}</dd></div>
              <div class="sm:col-span-2"><dt class="text-xs text-fg-3">Boot</dt><dd><pre class="mono text-xs bg-surface-2 rounded p-2 overflow-x-auto">{{ JSON.stringify(data.app.boot, null, 2) }}</pre></dd></div>
            </dl>
          </section>
        </template>
      </div>
    </div>
  </div>
</template>
