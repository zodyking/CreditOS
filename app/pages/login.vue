<script setup lang="ts">
definePageMeta({ layout: 'auth' })
useHead({ title: 'Sign in' })

const route = useRoute()
const { fetch: refreshSession } = useUserSession()
const { data: status, refresh: refreshStatus } = await useAppStatus()
const toast = useToast()

const mode = computed(() => (status.value?.hasUser ? 'login' : 'setup'))
const form = reactive({ email: '', password: '', displayName: '' })
const busy = ref(false)
const error = ref<string | null>(null)
const showPassword = ref(false)

function fillDemo() {
  form.email = 'demo@creditos.local'
  form.password = 'creditos-demo'
}

async function submit() {
  busy.value = true
  error.value = null
  try {
    if (mode.value === 'setup') {
      await $fetch('/api/auth/setup', { method: 'POST', body: { email: form.email, password: form.password, displayName: form.displayName } })
      toast.success('Owner account created', 'Welcome to CreditOS.')
    } else {
      await $fetch('/api/auth/login', { method: 'POST', body: { email: form.email, password: form.password } })
    }
    await refreshSession()
    await refreshStatus()
    navigateTo(typeof route.query.next === 'string' ? route.query.next : '/')
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div>
    <div v-if="status && !status.bootOk" class="card card-pad mb-5 border-garnet-500/40">
      <div class="flex items-start gap-3">
        <Icon name="lucide:database-zap" class="size-5 text-garnet-500 shrink-0 mt-0.5" />
        <div>
          <p class="font-medium">The server could not reach its database</p>
          <p class="text-sm text-fg-2 mt-1">{{ status.bootError }}</p>
          <p class="text-xs text-fg-3 mt-2">Set <code class="mono">DATABASE_URL</code> to an external PostgreSQL connection string and restart the container.</p>
        </div>
      </div>
    </div>

    <div class="mb-6">
      <p class="eyebrow mb-1">{{ mode === 'setup' ? 'First run' : 'Welcome back' }}</p>
      <h1 class="text-2xl">{{ mode === 'setup' ? 'Create the owner account' : 'Sign in to CreditOS' }}</h1>
      <p class="text-sm text-fg-2 mt-1.5">
        <template v-if="mode === 'setup'">This single-tenant instance has no users yet. The first account becomes the owner.</template>
        <template v-else>Sessions last 12 hours. All actions are recorded in the audit log.</template>
      </p>
    </div>

    <div v-if="status?.appMode === 'demo' && status.demoSeeded && mode === 'login'" class="mb-5 rounded-lg border border-orchid-500/30 bg-orchid-500/5 p-3 flex items-center gap-3">
      <ModeBadge mode="demo" size="sm" />
      <p class="text-xs text-fg-2 flex-1">A synthetic demo dataset is loaded. Nothing here is real.</p>
      <button type="button" class="btn btn-secondary btn-sm" @click="fillDemo">Use demo login</button>
    </div>

    <form class="space-y-4" @submit.prevent="submit">
      <div v-if="mode === 'setup'">
        <label for="displayName" class="label">Your name</label>
        <input id="displayName" v-model="form.displayName" class="input" autocomplete="name" required placeholder="Jordan Avery">
      </div>
      <div>
        <label for="email" class="label">Email</label>
        <input id="email" v-model="form.email" type="email" class="input" autocomplete="username" required placeholder="you@example.com">
      </div>
      <div>
        <label for="password" class="label">Password</label>
        <div class="relative">
          <input id="password" v-model="form.password" :type="showPassword ? 'text' : 'password'" class="input pr-11" :autocomplete="mode === 'setup' ? 'new-password' : 'current-password'" required :minlength="mode === 'setup' ? 12 : 1">
          <button type="button" class="absolute right-1 top-1 btn btn-ghost btn-sm !px-2" :aria-label="showPassword ? 'Hide password' : 'Show password'" @click="showPassword = !showPassword">
            <Icon :name="showPassword ? 'lucide:eye-off' : 'lucide:eye'" class="size-4" />
          </button>
        </div>
        <p v-if="mode === 'setup'" class="mt-1.5 text-xs text-fg-3">At least 12 characters. Stored as scrypt; there is no password reset email in this self-hosted build.</p>
      </div>
      <p v-if="error" class="text-sm text-garnet-500 flex items-center gap-1.5" role="alert"><Icon name="lucide:alert-circle" class="size-4" /> {{ error }}</p>
      <button type="submit" class="btn btn-primary w-full" :disabled="busy || (status && !status.bootOk)">
        <Icon v-if="busy" name="lucide:loader-2" class="size-4 animate-spin" />
        {{ mode === 'setup' ? 'Create account' : 'Sign in' }}
      </button>
    </form>
  </div>
</template>
