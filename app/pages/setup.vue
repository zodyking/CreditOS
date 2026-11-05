<script setup lang="ts">
import type { AppStatus } from '~/composables/useAppStatus'

definePageMeta({ layout: 'setup' })
useHead({ title: 'Setup' })

const { data: status, refresh } = await useAppStatus()
const connectionString = ref('')
const mode = ref<'demo' | 'test' | 'live' | ''>('')
const busy = ref(false)
const error = ref<string | null>(null)
const show = ref(true)

const needsDatabase = computed(() => !status.value?.bootOk)
const needsMode = computed(() => !status.value?.modeChosen)

const MODES = [
  { id: 'demo' as const, title: 'Demo', body: 'Sample reports and the demo login. Nothing is mailed.' },
  { id: 'test' as const, title: 'Test', body: 'Your reports. Letters stay on this server.' },
  { id: 'live' as const, title: 'Live', body: 'Your reports. Approved letters can be mailed.' },
]

async function connect() {
  busy.value = true
  error.value = null
  try {
    await $fetch('/api/setup/database', {
      method: 'POST',
      body: {
        ...(needsMode.value ? { mode: mode.value } : {}),
        ...(needsDatabase.value ? { connectionString: connectionString.value } : {}),
      },
    })
    const gate = useState<AppStatus | null>('app-status-gate', () => null)
    gate.value = await $fetch<AppStatus>('/api/auth/status')
    await refresh()
    connectionString.value = ''
    await navigateTo('/login')
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div>
    <h1 class="text-[1.75rem] font-semibold tracking-[-0.02em]">{{ needsDatabase && needsMode ? 'Setup' : needsMode ? 'Mode' : 'Database' }}</h1>
    <p class="mt-2 text-sm text-fg-2 leading-relaxed max-w-md">
      <template v-if="needsDatabase && needsMode">Pick a mode, then paste the Postgres connection string.</template>
      <template v-else-if="needsMode">Saved on this server. You can change it in Settings.</template>
      <template v-else>The last connection did not open. Paste a new one.</template>
    </p>

    <p v-if="status?.bootError && status.databaseConfigured" class="mt-6 text-sm text-garnet-600" role="alert">{{ status.bootError }}</p>

    <form class="mt-8 space-y-8" @submit.prevent="connect">
      <fieldset v-if="needsMode">
        <legend :class="needsDatabase ? 'text-sm font-medium' : 'sr-only'">Mode</legend>
        <div class="mt-3 border-t border-border">
          <label v-for="m in MODES" :key="m.id" class="flex items-baseline gap-3 py-3 border-b border-border cursor-pointer">
            <input v-model="mode" type="radio" name="mode" class="accent-[var(--accent)]" :value="m.id" required>
            <span class="w-14 shrink-0 text-sm font-medium">{{ m.title }}</span>
            <span class="text-sm text-fg-2">{{ m.body }}</span>
          </label>
        </div>
      </fieldset>

      <div v-if="needsDatabase">
        <label for="connectionString" class="label">PostgreSQL</label>
        <div class="relative">
          <input id="connectionString" v-model="connectionString" :type="show ? 'text' : 'password'" class="input pr-12 font-mono text-[13px]" autocomplete="off" autocapitalize="off" spellcheck="false" required placeholder="postgresql://user:password@db:5432/creditos">
          <button type="button" class="absolute right-1.5 top-1.5 btn btn-ghost btn-xs !px-2" :aria-label="show ? 'Hide connection string' : 'Show connection string'" @click="show = !show">
            <Icon :name="show ? 'lucide:eye-off' : 'lucide:eye'" class="size-4" />
          </button>
        </div>
        <p class="hint">Use an address this server can reach. On Dokploy that is the database service, not localhost.</p>
      </div>

      <p v-if="error" class="text-sm text-garnet-600" role="alert">{{ error }}</p>

      <button type="submit" class="btn btn-primary" :disabled="busy || (needsMode && !mode) || (needsDatabase && connectionString.trim().length < 12)">
        <Icon v-if="busy" name="lucide:loader-2" class="size-4 animate-spin" />
        {{ busy ? 'Saving' : 'Continue' }}
      </button>
    </form>

    <p class="mt-16 text-xs text-fg-3">Not legal advice. Results are not guaranteed.</p>
  </div>
</template>
