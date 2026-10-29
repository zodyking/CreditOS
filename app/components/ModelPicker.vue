<script setup lang="ts">
import { money } from '~/utils/format'

interface Model {
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

withDefaults(defineProps<{ label: string; hint?: string; allowEmpty?: boolean; emptyLabel?: string; id: string }>(), { allowEmpty: false, emptyLabel: 'Use default model' })
const model = defineModel<string>({ default: '' })

const open = ref(false)
const q = ref('')
const provider = ref('')
const structuredOnly = ref(true)
const loading = ref(false)
const error = ref<string | null>(null)
const models = ref<Model[]>([])
const providers = ref<string[]>([])
const total = ref(0)
const fetchedAt = ref<string | null>(null)
let timer: ReturnType<typeof setTimeout> | null = null

async function load(refresh = false) {
  loading.value = true
  error.value = null
  try {
    const r = await $fetch<{ models: Model[]; total: number; providers: string[]; fetchedAt: string }>('/api/settings/ai/models', { query: { q: q.value || undefined, provider: provider.value || undefined, structured: structuredOnly.value ? '1' : undefined, refresh: refresh ? '1' : undefined } })
    models.value = r.models
    providers.value = r.providers
    total.value = r.total
    fetchedAt.value = r.fetchedAt
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    loading.value = false
  }
}
watch([q, provider, structuredOnly], () => {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => load(), 250)
})
watch(open, v => {
  if (v && !models.value.length) load()
})
function pick(id: string) {
  model.value = id
  open.value = false
}
const perM = (n: number) => (n ? `${money(n * 1_000_000)}/M` : 'free')
const ctx = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n))
</script>

<template>
  <div>
    <label class="label" :for="id">{{ label }}</label>
    <div class="flex gap-2">
      <input :id="id" v-model.trim="model" class="input mono text-sm flex-1" :placeholder="allowEmpty ? emptyLabel : 'provider/model'" spellcheck="false" autocomplete="off">
      <button type="button" class="btn btn-secondary shrink-0" :aria-expanded="open" @click="open = !open"><Icon name="lucide:list-filter" class="size-4" /> Browse</button>
    </div>
    <p v-if="hint" class="text-xs text-fg-3 mt-1">{{ hint }}</p>

    <div v-if="open" class="mt-2 rounded-lg border border-border bg-surface shadow-2 overflow-hidden">
      <div class="p-2 border-b border-border flex flex-wrap gap-2 items-center">
        <label class="relative flex-1 min-w-40"><Icon name="lucide:search" class="size-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-3" /><input v-model.trim="q" type="search" class="input !h-9 pl-8 text-sm" placeholder="Search models…" aria-label="Search models"></label>
        <select v-model="provider" class="input !h-9 w-auto text-sm" aria-label="Provider"><option value="">All providers</option><option v-for="p in providers" :key="p" :value="p">{{ p }}</option></select>
        <label class="inline-flex items-center gap-1.5 text-xs cursor-pointer"><input v-model="structuredOnly" type="checkbox" class="size-3.5 accent-[var(--accent)]"> Structured output only</label>
        <button type="button" class="btn btn-ghost btn-sm" :disabled="loading" title="Refresh catalogue" @click="load(true)"><Icon name="lucide:refresh-cw" class="size-3.5" :class="loading && 'animate-spin'" /></button>
      </div>
      <p v-if="error" class="px-3 py-3 text-sm text-garnet-500">{{ error }}</p>
      <div v-else-if="loading && !models.length" class="p-3 space-y-2"><div class="skeleton h-10" /><div class="skeleton h-10" /><div class="skeleton h-10" /></div>
      <ul v-else class="max-h-72 overflow-y-auto scrollbar-thin divide-y divide-border" role="listbox">
        <li v-if="allowEmpty"><button type="button" role="option" :aria-selected="model === ''" class="w-full text-left px-3 py-2 text-sm hover:bg-surface-2" :class="model === '' ? 'bg-accent/10' : ''" @click="pick('')">{{ emptyLabel }}</button></li>
        <li v-for="m in models" :key="m.id">
          <button type="button" role="option" :aria-selected="model === m.id" class="w-full text-left px-3 py-2 hover:bg-surface-2" :class="model === m.id ? 'bg-accent/10' : ''" @click="pick(m.id)">
            <div class="flex items-center gap-2"><span class="font-medium text-sm truncate">{{ m.name }}</span><span v-if="m.supportsStructuredOutput" class="pill !py-0 bg-fern-500/15 text-fern-600 dark:text-fern-300" title="Supports JSON-schema structured output">JSON</span><span v-if="m.supportsTools" class="pill !py-0 bg-surface-3 text-fg-2">tools</span><span v-if="m.inputModalities.includes('image')" class="pill !py-0 bg-surface-3 text-fg-2">vision</span></div>
            <div class="flex items-center gap-3 text-[11px] text-fg-3 mt-0.5"><span class="mono truncate">{{ m.id }}</span><span class="num shrink-0">ctx {{ ctx(m.contextLength) }}</span><span class="num shrink-0">in {{ perM(m.pricing.prompt) }} · out {{ perM(m.pricing.completion) }}</span></div>
          </button>
        </li>
        <li v-if="!models.length" class="px-3 py-6 text-sm text-fg-3 text-center">No models match.</li>
      </ul>
      <p class="px-3 py-1.5 text-[11px] text-fg-3 border-t border-border">{{ total }} models · catalogue from openrouter.ai, cached 10 min</p>
    </div>
  </div>
</template>
