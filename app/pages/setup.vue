<script setup lang="ts">
import type { AppStatus } from '~/composables/useAppStatus'

definePageMeta({ layout: 'auth' })
useHead({ title: 'Connect PostgreSQL' })

const { data: status, refresh } = await useAppStatus()
const connectionString = ref('')
const busy = ref(false)
const error = ref<string | null>(null)
const show = ref(true)

async function connect() {
  busy.value = true
  error.value = null
  try {
    await $fetch('/api/setup/database', { method: 'POST', body: { connectionString: connectionString.value } })
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
      <h1 class="text-3xl">Connect your database</h1>
      <p class="text-sm text-fg-2 mt-2 leading-relaxed">Paste a PostgreSQL connection string. CreditOS checks it, runs migrations, and saves it encrypted on this server. You can change it later in Settings.</p>
    </div>

    <div v-if="status?.bootError && status.databaseConfigured" class="note note-warning mb-6">
      <Icon name="lucide:database-zap" class="size-5 shrink-0 mt-0.5" />
      <div>
        <p class="font-semibold">The saved connection did not come up</p>
        <p class="mt-1">{{ status.bootError }}</p>
      </div>
    </div>

    <form class="space-y-5" @submit.prevent="connect">
      <div>
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
      <button type="submit" class="btn btn-primary btn-lg w-full" :disabled="busy || connectionString.trim().length < 12">
        <Icon v-if="busy" name="lucide:loader-2" class="size-4 animate-spin" />
        <Icon v-else name="lucide:database" class="size-4" />
        {{ busy ? 'Connecting' : 'Connect and save' }}
      </button>
    </form>
  </div>
</template>
