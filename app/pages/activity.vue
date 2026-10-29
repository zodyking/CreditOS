<script setup lang="ts">
import { TONE_CLASS, fmtDate, titleize } from '~/utils/format'

useHead({ title: 'Activity' })
const { data, refresh, pending } = await useFetch('/api/activity', { key: 'activity', query: { limit: 300 } })
const { on } = useLiveEvents()
onMounted(() => on(() => refresh(), ['audit', 'case.event', 'case.status']))

const source = ref<'all' | 'audit' | 'case'>('all')
const actor = ref<string>('')
const q = ref('')
const actors = computed(() => [...new Set((data.value?.feed ?? []).map(f => f.actor))].sort())
const feed = computed(() =>
  (data.value?.feed ?? []).filter(f => (source.value === 'all' || f.source === source.value) && (!actor.value || f.actor === actor.value) && (!q.value || `${f.title} ${f.detail ?? ''} ${f.caseCode ?? ''}`.toLowerCase().includes(q.value.toLowerCase()))),
)
const byDay = computed(() => {
  const map = new Map<string, typeof feed.value>()
  for (const f of feed.value) {
    const day = new Date(f.at).toDateString()
    if (!map.has(day)) map.set(day, [])
    map.get(day)!.push(f)
  }
  return [...map.entries()]
})
const actorTone: Record<string, string> = { user: TONE_CLASS.info, system: TONE_CLASS.neutral, agent: TONE_CLASS.demo, council: TONE_CLASS.demo, provider: TONE_CLASS.live, webhook: TONE_CLASS.live, scheduler: TONE_CLASS.neutral }
const expanded = ref<Record<string, boolean>>({})
</script>

<template>
  <div>
    <PageHeader title="Activity" eyebrow="Audit trail" description="Append-only record of what happened and who did it: your actions (with IP), scheduler runs, provider webhooks and every case event. Facts and AI interpretations are marked separately.">
      <template #actions><button class="btn btn-secondary" @click="refresh()"><Icon name="lucide:refresh-cw" class="size-4" /> Refresh</button></template>
    </PageHeader>

    <div class="card card-pad flex flex-wrap items-center gap-2 mb-6">
      <label class="relative flex-1 min-w-56"><Icon name="lucide:search" class="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-fg-3" /><input v-model.trim="q" type="search" class="input pl-9" placeholder="Search…" aria-label="Search activity"></label>
      <select v-model="source" class="input w-auto" aria-label="Source"><option value="all">All sources</option><option value="audit">Audit log</option><option value="case">Case events</option></select>
      <select v-model="actor" class="input w-auto" aria-label="Actor"><option value="">Any actor</option><option v-for="a in actors" :key="a" :value="a">{{ titleize(a) }}</option></select>
      <span class="text-xs text-fg-3 px-2">{{ feed.length }} entries</span>
    </div>

    <div v-if="pending && !data" class="skeleton h-64" />
    <EmptyState v-else-if="!feed.length" icon="lucide:scroll-text" title="No activity" description="Actions you take will be recorded here." />
    <div v-else class="space-y-6">
      <section v-for="[day, items] in byDay" :key="day">
        <h2 class="eyebrow mb-2 sticky top-14 bg-bg/90 backdrop-blur py-1 z-10">{{ fmtDate(items[0]!.at, 'long') }}</h2>
        <ol class="card divide-y divide-border">
          <li v-for="f in items" :key="`${f.source}-${f.id}`" class="px-4 py-2.5 text-sm">
            <div class="flex items-start gap-3">
              <span class="mt-1.5 size-2 rounded-full shrink-0" :class="f.factual ? 'bg-verdigris-500' : 'bg-orchid-500'" :title="f.factual ? 'Factual event' : 'Interpretation / AI output'" />
              <span class="text-xs text-fg-3 num w-16 shrink-0 mt-0.5">{{ fmtDate(f.at, 'time').split(', ')[1] ?? fmtDate(f.at, 'time') }}</span>
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-2">
                  <span class="pill !py-0" :class="actorTone[f.actor] ?? TONE_CLASS.neutral">{{ titleize(f.actor) }}</span>
                  <span class="font-medium" :class="f.source === 'audit' ? 'mono text-xs' : ''">{{ f.source === 'audit' ? f.title : f.title }}</span>
                  <NuxtLink v-if="f.caseId" :to="`/cases/${f.caseId}`" class="mono text-[11px] text-accent hover:underline">{{ f.caseCode }}</NuxtLink>
                  <span v-if="f.ip" class="text-[11px] text-fg-3 mono ml-auto">{{ f.ip }}</span>
                </div>
                <p v-if="f.detail" class="text-xs text-fg-2 mt-0.5 whitespace-pre-wrap">{{ f.detail }}</p>
                <button v-if="f.meta && Object.keys(f.meta).length" class="text-[11px] text-accent hover:underline mt-0.5" @click="expanded[`${f.source}-${f.id}`] = !expanded[`${f.source}-${f.id}`]">{{ expanded[`${f.source}-${f.id}`] ? 'Hide' : 'Show' }} metadata</button>
                <pre v-if="expanded[`${f.source}-${f.id}`]" class="mt-1 text-[11px] mono bg-surface-2 rounded p-2 overflow-x-auto">{{ JSON.stringify(f.meta, null, 2) }}</pre>
              </div>
            </div>
          </li>
        </ol>
      </section>
    </div>
  </div>
</template>
