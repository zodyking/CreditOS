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
  <form class="max-w-3xl" @submit.prevent="connect">
    <header class="mb-6">
      <h1>Set up CreditOS</h1>
      <p class="mt-2 text-sm text-fg-2 max-w-2xl">
        <template v-if="needsMode && needsDatabase">Choose Demo, Test, or Live, then connect PostgreSQL. The mode can be changed later in Settings.</template>
        <template v-else-if="needsMode">Choose Demo, Test, or Live. This can be changed later in Settings.</template>
        <template v-else>The saved database connection did not open. Paste a new one.</template>
      </p>
    </header>

    <div class="space-y-6">
      <section v-if="needsMode" class="card">
        <div class="card-head">
          <div>
            <h2>Mode</h2>
            <p class="sub">Demo includes sample reports. Test and Live start empty.</p>
          </div>
        </div>
        <fieldset>
          <legend class="sr-only">Mode</legend>
          <div class="divide-y divide-border">
            <label v-for="m in MODES" :key="m.id" class="relative flex items-start gap-4 px-5 sm:px-6 py-4 cursor-pointer" :class="mode === m.id ? 'bg-surface-2' : 'hover:bg-surface-2/70'">
              <span v-if="mode === m.id" class="absolute left-0 top-3 bottom-3 w-[3px] rounded-r-full bg-accent" aria-hidden="true" />
              <input v-model="mode" type="radio" name="mode" class="mt-1 accent-[var(--accent)]" :value="m.id" required>
              <span>
                <span class="block text-sm font-semibold">{{ m.title }}</span>
                <span class="block text-sm text-fg-2 mt-0.5">{{ m.body }}</span>
              </span>
            </label>
          </div>
        </fieldset>
      </section>

      <section v-if="needsDatabase" class="card">
        <div class="card-head">
          <div>
            <h2>PostgreSQL</h2>
            <p class="sub">Paste a connection string this server can reach. It is stored encrypted.</p>
          </div>
        </div>
        <div class="px-5 sm:px-6 py-5">
          <p v-if="status?.bootError && status.databaseConfigured" class="mb-4 text-sm text-garnet-600" role="alert">{{ status.bootError }}</p>
          <label for="connectionString" class="label">Connection string</label>
          <div class="relative">
            <input id="connectionString" v-model="connectionString" :type="show ? 'text' : 'password'" class="input pr-12 font-mono text-[13px]" autocomplete="off" autocapitalize="off" spellcheck="false" required placeholder="postgresql://user:password@db:5432/creditos">
            <button type="button" class="absolute right-1.5 top-1.5 btn btn-ghost btn-xs !px-2" :aria-label="show ? 'Hide connection string' : 'Show connection string'" @click="show = !show">
              <Icon :name="show ? 'lucide:eye-off' : 'lucide:eye'" class="size-4" />
            </button>
          </div>
          <p class="hint">On Dokploy, use the Postgres service's internal address, not localhost.</p>
        </div>
      </section>
    </div>

    <div class="mt-6 flex flex-wrap items-center justify-end gap-4">
      <p v-if="error" class="mr-auto text-sm text-garnet-600" role="alert">{{ error }}</p>
      <button type="submit" class="btn btn-primary" :disabled="busy || (needsMode && !mode) || (needsDatabase && connectionString.trim().length < 12)">
        <Icon v-if="busy" name="lucide:loader-2" class="size-4 animate-spin" />
        {{ busy ? 'Saving' : 'Continue' }}
      </button>
    </div>
  </form>
</template>
