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
  <div class="card shadow-2 p-7 sm:p-9">
    <div v-if="status && !status.bootOk" class="note note-danger mb-6">
      <Icon name="lucide:database-zap" class="size-5 shrink-0 mt-0.5" />
      <div>
        <p class="font-semibold">The server could not reach its database</p>
        <p class="mt-1 opacity-90">{{ status.bootError }}</p>
        <p class="text-xs mt-2 opacity-80">Set <code class="mono">DATABASE_URL</code> to an external PostgreSQL connection string and restart the container.</p>
      </div>
    </div>

    <div class="mb-7">
      <p class="eyebrow mb-2">{{ mode === 'setup' ? 'First run' : 'Welcome back' }}</p>
      <h1 class="text-3xl">{{ mode === 'setup' ? 'Create the owner account' : 'Sign in to your workspace' }}</h1>
      <p class="text-sm text-fg-2 mt-2 leading-relaxed">
        <template v-if="mode === 'setup'">This instance has no users yet. The first account becomes the owner and controls every integration.</template>
        <template v-else>Sessions last 12 hours and every action is recorded in your audit log.</template>
      </p>
    </div>

    <div v-if="status?.appMode === 'demo' && status.demoSeeded && mode === 'login'" class="note note-demo mb-6 items-center">
      <ModeBadge mode="demo" size="sm" />
      <p class="text-xs flex-1 leading-snug">A synthetic demo workspace is loaded. Nothing in it is real.</p>
      <button type="button" class="btn btn-secondary btn-sm" @click="fillDemo">Use demo login</button>
    </div>

    <form class="space-y-5" @submit.prevent="submit">
      <div v-if="mode === 'setup'">
        <label for="displayName" class="label">Your name</label>
        <input id="displayName" v-model="form.displayName" class="input" autocomplete="name" required placeholder="Jordan Avery">
      </div>
      <div>
        <label for="email" class="label">Email address</label>
        <input id="email" v-model="form.email" type="email" class="input" autocomplete="username" required placeholder="you@example.com">
      </div>
      <div>
        <label for="password" class="label">Password</label>
        <div class="relative">
          <input id="password" v-model="form.password" :type="showPassword ? 'text' : 'password'" class="input pr-12" :autocomplete="mode === 'setup' ? 'new-password' : 'current-password'" required :minlength="mode === 'setup' ? 12 : 1">
          <button type="button" class="absolute right-1.5 top-1.5 btn btn-ghost btn-xs !px-2" :aria-label="showPassword ? 'Hide password' : 'Show password'" @click="showPassword = !showPassword">
            <Icon :name="showPassword ? 'lucide:eye-off' : 'lucide:eye'" class="size-4" />
          </button>
        </div>
        <p v-if="mode === 'setup'" class="hint">At least 12 characters. Stored with scrypt; this self-hosted build has no password-reset email.</p>
      </div>
      <p v-if="error" class="note note-danger !py-2.5 text-sm" role="alert"><Icon name="lucide:alert-circle" class="size-4 shrink-0 mt-0.5" /> {{ error }}</p>
      <button type="submit" class="btn btn-primary btn-lg w-full" :disabled="busy || (status && !status.bootOk)">
        <Icon v-if="busy" name="lucide:loader-2" class="size-4 animate-spin" />
        {{ mode === 'setup' ? 'Create account' : 'Sign in' }}
        <Icon v-if="!busy" name="lucide:arrow-right" class="size-4" />
      </button>
    </form>
  </div>
</template>
