<script setup lang="ts">
import { BUREAUS } from '#shared/constants'
import { TONE_CLASS, bureauName, fmtDate, relTime, severityTone, titleize } from '~/utils/format'

useHead({ title: 'Monitoring' })
const toast = useToast()
const { data, refresh, pending } = await useFetch('/api/monitoring', { key: 'monitoring' })
const { on } = useLiveEvents()
onMounted(() => on(() => refresh(), ['monitoring.event', 'case.status']))

const statusFilter = ref<'all' | 'new' | 'reviewed' | 'case_created' | 'dismissed' | 'suppressed'>('all')
const bureauFilter = ref<string>('all')
const events = computed(() =>
  (data.value?.events ?? []).filter(e => (statusFilter.value === 'all' || e.status === statusFilter.value) && (bureauFilter.value === 'all' || e.bureau === bureauFilter.value)),
)
const counts = computed(() => {
  const all = data.value?.events ?? []
  return { new: all.filter(e => e.status === 'new').length, total: all.length, dedup: all.reduce((n, e) => n + Math.max(0, e.occurrences - 1), 0) }
})

const polling = ref(false)
async function poll() {
  polling.value = true
  try {
    await $fetch('/api/monitoring/poll', { method: 'POST' })
    toast.info('Check complete', 'Connected sources were polled (respecting cadence) and detection re-ran on stored snapshots.')
    await refresh()
  } catch (e) {
    toast.error('Poll failed', errorMessage(e))
  } finally {
    polling.value = false
  }
}

const busy = ref<string | null>(null)
async function setStatus(id: string, status: 'reviewed' | 'dismissed' | 'suppressed' | 'new') {
  busy.value = id
  try {
    await $fetch(`/api/monitoring/${id}`, { method: 'PATCH', body: { status } })
    await refresh()
  } catch (e) {
    toast.error('Update failed', errorMessage(e))
  } finally {
    busy.value = null
  }
}

const connectionTone: Record<string, string> = {
  connected: TONE_CLASS.live,
  sandbox: TONE_CLASS.demo,
  demo: TONE_CLASS.demo,
  not_connected: TONE_CLASS.neutral,
  error: TONE_CLASS.danger,
  needs_reauth: TONE_CLASS.warning,
  rate_limited: TONE_CLASS.warning,
  disabled: TONE_CLASS.neutral,
}
</script>

<template>
  <div>
    <PageHeader title="Monitoring" eyebrow="Change detection" description="Every new snapshot is diffed against the previous one per bureau. Alerts are deduplicated by fingerprint, so a repeating condition increments its counter instead of spamming you.">
      <template #actions>
        <button class="btn btn-primary" :disabled="polling" @click="poll"><Icon :name="polling ? 'lucide:loader-2' : 'lucide:refresh-cw'" class="size-4" :class="polling && 'animate-spin'" /> Check now</button>
      </template>
    </PageHeader>

    <div v-if="pending && !data" class="skeleton h-64" />
    <template v-else-if="data">
      <section class="grid gap-4 sm:grid-cols-3">
        <StatCard label="New alerts" :value="counts.new" icon="lucide:bell-ring" :tone="counts.new ? 'warning' : 'success'" hint="Awaiting your review" />
        <StatCard label="Total alerts" :value="counts.total" icon="lucide:radar" tone="info" hint="Across all bureaus" />
        <StatCard label="Suppressed duplicates" :value="counts.dedup" icon="lucide:copy-minus" tone="neutral" hint="Repeat occurrences folded into existing alerts" />
      </section>

      <section class="mt-6 grid gap-6 lg:grid-cols-3">
        <div class="card lg:col-span-2">
          <div class="px-5 py-4 border-b border-border flex flex-wrap items-center gap-3">
            <h2 class="font-semibold">Alerts</h2>
            <div class="ml-auto flex flex-wrap gap-2">
              <select v-model="bureauFilter" class="input !py-1.5 !h-auto text-sm w-auto" aria-label="Filter by bureau">
                <option value="all">All bureaus</option>
                <option v-for="b in BUREAUS" :key="b" :value="b">{{ bureauName(b) }}</option>
              </select>
              <select v-model="statusFilter" class="input !py-1.5 !h-auto text-sm w-auto" aria-label="Filter by status">
                <option value="all">All statuses</option>
                <option value="new">New</option>
                <option value="reviewed">Reviewed</option>
                <option value="case_created">Case created</option>
                <option value="dismissed">Dismissed</option>
                <option value="suppressed">Suppressed</option>
              </select>
            </div>
          </div>
          <ul v-if="events.length" class="divide-y divide-border">
            <li v-for="e in events" :key="e.id" class="px-5 py-4" :class="e.status === 'new' ? '' : 'opacity-80'">
              <div class="flex flex-wrap items-start gap-3">
                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="pill" :class="TONE_CLASS[severityTone(e.severity)]">{{ e.severity }}</span>
                    <span v-if="e.bureau" class="pill bg-surface-3 text-fg-2">{{ bureauName(e.bureau) }}</span>
                    <span class="pill bg-surface-3 text-fg-2">{{ titleize(e.kind) }}</span>
                    <span v-if="e.status !== 'new'" class="pill" :class="e.status === 'case_created' ? TONE_CLASS.info : TONE_CLASS.neutral">{{ titleize(e.status) }}</span>
                    <span v-if="e.occurrences > 1" class="pill" :class="TONE_CLASS.warning" :title="`Seen ${e.occurrences} times; first ${fmtDate(e.firstSeenAt)}`">×{{ e.occurrences }}</span>
                    <ModeBadge :mode="e.mode" />
                  </div>
                  <p class="font-medium mt-1.5">{{ e.title }}</p>
                  <p class="text-sm text-fg-2 mt-0.5">{{ e.detail }}</p>
                  <p class="mt-2 text-xs text-fg-3">Last seen {{ relTime(e.lastSeenAt) }} · first seen {{ fmtDate(e.firstSeenAt) }}</p>
                </div>
                <div class="flex gap-2 shrink-0">
                  <NuxtLink v-if="e.caseId" :to="`/cases/${e.caseId}`" class="btn btn-secondary btn-sm">Open case</NuxtLink>
                  <template v-else-if="e.status === 'new'">
                    <button class="btn btn-ghost btn-sm" :disabled="busy === e.id" @click="setStatus(e.id, 'dismissed')">Dismiss</button>
                    <button class="btn btn-secondary btn-sm" :disabled="busy === e.id" @click="setStatus(e.id, 'reviewed')">Mark reviewed</button>
                  </template>
                  <button v-else-if="e.status !== 'case_created'" class="btn btn-ghost btn-sm" :disabled="busy === e.id" @click="setStatus(e.id, 'new')">Reopen</button>
                </div>
              </div>
            </li>
          </ul>
          <EmptyState v-else compact icon="lucide:shield-check" title="No alerts match" description="Import a newer snapshot or relax the filters." />
        </div>

        <div class="space-y-6">
          <div class="card">
            <div class="px-5 py-4 border-b border-border"><h2 class="font-semibold">Data sources</h2></div>
            <ul class="divide-y divide-border">
              <li v-for="c in data.connections" :key="c.id" class="px-5 py-3">
                <div class="flex items-center justify-between gap-2">
                  <p class="font-medium text-sm">{{ titleize(c.provider) }}</p>
                  <span class="pill" :class="connectionTone[c.status] ?? TONE_CLASS.neutral">{{ titleize(c.status) }}</span>
                </div>
                <p class="text-xs text-fg-3 mt-1">
                  <span v-if="c.lastCheckedAt">Checked {{ relTime(c.lastCheckedAt) }}</span><span v-else>Never checked</span>
                  <span v-if="c.nextEligibleCheckAt"> · next eligible {{ relTime(c.nextEligibleCheckAt) }}</span>
                </p>
                <p v-if="c.lastError" class="text-xs text-garnet-500 mt-1">{{ c.lastError }}</p>
              </li>
              <li v-if="!data.connections.length" class="px-5 py-6 text-sm text-fg-3 text-center">No credit-data connection configured. Manual import is the only source in this build.</li>
            </ul>
          </div>
          <div class="card card-pad text-sm text-fg-2 space-y-2">
            <p class="font-medium text-fg">How polling works</p>
            <p>Polling respects each provider's cadence and backoff; a manual check will not bypass a rate limit. In Demo mode "Check now" re-runs detection on the stored synthetic snapshots.</p>
            <p>No consumer bureau offers a public monitoring API, so this build ships manual import plus the connector contract documented in <span class="mono">INTEGRATIONS.md</span>.</p>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>
