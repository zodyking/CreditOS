<script setup lang="ts">
import type { AppStatus } from '~/composables/useAppStatus'

definePageMeta({ layout: 'auth' })
useHead({ title: 'Set up CreditOS' })

const { data: status, refresh } = await useAppStatus()
const connectionString = ref('')
const mode = ref<'demo' | 'test' | 'live' | ''>('')
const busy = ref(false)
const error = ref<string | null>(null)
const show = ref(true)

const needsDatabase = computed(() => !status.value?.bootOk)
const needsMode = computed(() => !status.value?.modeChosen)

const MODES = [
  { id: 'demo' as const, title: 'Demo', body: 'A synthetic workspace with a ready-made login. The council is simulated and nothing is mailed.' },
  { id: 'test' as const, title: 'Test', body: 'Your own reports and letters. Mail stays in the sandbox. Live AI turns on when you add an OpenRouter key.' },
  { id: 'live' as const, title: 'Live', body: 'Approved letters can be sent through a real mail provider. Use this when you mean to operate for real.' },
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
  <div class="card shadow-2 p-7 sm:p-9">
    <div class="mb-7">
      <p class="eyebrow mb-2">First launch</p>
      <h1 class="text-3xl">{{ needsDatabase && needsMode ? 'Set up this workspace' : needsMode ? 'Choose a mode' : 'Connect your database' }}</h1>
      <p class="text-sm text-fg-2 mt-2 leading-relaxed">
        <template v-if="needsMode">Demo, Test, and Live are chosen here and saved on this server. They are not environment variables.</template>
        <template v-else>Paste a PostgreSQL connection string. CreditOS checks it, runs migrations, and saves it encrypted.</template>
      </p>
    </div>

    <div v-if="status?.bootError && status.databaseConfigured" class="note note-warning mb-6">
      <Icon name="lucide:database-zap" class="size-5 shrink-0 mt-0.5" />
      <div>
        <p class="font-semibold">The saved connection did not come up</p>
        <p class="mt-1">{{ status.bootError }}</p>
      </div>
    </div>

    <form class="space-y-5" @submit.prevent="connect">
      <fieldset v-if="needsMode" class="space-y-2">
        <legend class="label">Workspace mode</legend>
        <label v-for="m in MODES" :key="m.id" class="flex items-start gap-3 rounded-md border p-3 cursor-pointer" :class="mode === m.id ? 'border-accent bg-accent/5' : 'border-border'">
          <input v-model="mode" type="radio" name="mode" class="mt-1" :value="m.id" required>
          <span><span class="font-medium">{{ m.title }}</span><span class="block text-xs text-fg-2 mt-0.5 leading-relaxed">{{ m.body }}</span></span>
        </label>
      </fieldset>

      <div v-if="needsDatabase">
        <label for="connectionString" class="label">PostgreSQL connection string</label>
        <div class="relative">
          <input id="connectionString" v-model="connectionString" :type="show ? 'text' : 'password'" class="input pr-12 font-mono text-[13px]" autocomplete="off" autocapitalize="off" spellcheck="false" required placeholder="postgresql://user:password@host:5432/creditos">
          <button type="button" class="absolute right-1.5 top-1.5 btn btn-ghost btn-xs !px-2" :aria-label="show ? 'Hide connection string' : 'Show connection string'" @click="show = !show">
            <Icon :name="show ? 'lucide:eye-off' : 'lucide:eye'" class="size-4" />
          </button>
        </div>
        <p class="hint">From Dokploy, copy the database service's internal URL. The host must be reachable from this container, not <span class="mono">localhost</span> on your laptop.</p>
      </div>
      <p v-if="error" class="note note-danger !py-2.5 text-sm" role="alert"><Icon name="lucide:alert-circle" class="size-4 shrink-0 mt-0.5" /> {{ error }}</p>
      <button type="submit" class="btn btn-primary btn-lg w-full" :disabled="busy || (needsMode && !mode) || (needsDatabase && connectionString.trim().length < 12)">
        <Icon v-if="busy" name="lucide:loader-2" class="size-4 animate-spin" />
        <Icon v-else name="lucide:arrow-right" class="size-4" />
        {{ busy ? 'Saving' : needsDatabase ? 'Continue' : 'Save mode' }}
      </button>
    </form>
  </div>
</template>
