<script setup lang="ts">
import { TONE_CLASS, bureauName, fmtDate, freezeStatusLabel, freezeStatusTone, relTime, caseStatusLabel } from '~/utils/format'

useHead({ title: 'Dashboard' })
const { user } = useUserSession()
const { data, refresh, pending } = await useFetch('/api/dashboard', { key: 'dashboard' })
const { on } = useLiveEvents()
onMounted(() => on(() => refresh(), ['case.status', 'mail.status', 'inbound.status', 'freeze.status', 'council.completed', 'monitoring.event']))

const greeting = computed(() => {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
})

const actionItems = computed(() => {
  const c = data.value?.counts
  if (!c) return []
  return [
    { label: 'Approvals waiting for your decision', n: c.awaitingApproval, to: '/approvals', icon: 'lucide:badge-check', tone: 'warning' as const },
    { label: 'Cases that need evidence', n: c.needsEvidence, to: '/cases?status=NEEDS_EVIDENCE', icon: 'lucide:file-question', tone: 'warning' as const },
    { label: 'Responses to review', n: c.responsesToReview, to: '/cases', icon: 'lucide:mail-open', tone: 'info' as const },
    { label: 'Unassigned inbound mail', n: c.unassignedInbound, to: '/mailroom?tab=unassigned', icon: 'lucide:mailbox', tone: 'danger' as const },
    { label: 'Discrepancies not yet cased', n: c.discrepancies, to: '/reports#discrepancies', icon: 'lucide:git-compare', tone: 'info' as const },
    { label: 'New monitoring alerts', n: c.newAlerts, to: '/monitoring', icon: 'lucide:radar', tone: 'info' as const },
  ].filter(i => i.n > 0)
})

const scoreSeries = computed(() => {
  const out: Record<string, { date: string; score: number }[]> = {}
  for (const h of data.value?.history ?? []) {
    if (!h.score) continue
    ;(out[h.bureau] ??= []).push({ date: String(h.reportDate), score: (h.score as { value: number }).value })
  }
  return out
})
const bureauStroke: Record<string, string> = { equifax: '#E5484D', experian: '#4C8DFF', transunion: '#E9A23B' }
function sparkline(points: { date: string; score: number }[], w = 120, h = 36) {
  if (points.length < 2) return ''
  const xs = points.map(p => new Date(p.date).getTime())
  const ys = points.map(p => p.score)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs) || minX + 1
  const minY = Math.min(...ys) - 5
  const maxY = Math.max(...ys) + 5
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${(((xs[i]! - minX) / (maxX - minX || 1)) * (w - 4) + 2).toFixed(1)},${(h - 2 - ((ys[i]! - minY) / (maxY - minY || 1)) * (h - 4)).toFixed(1)}`).join(' ')
}

const summaryLine = computed(() => {
  const c = data.value?.counts
  if (!c) return ''
  const parts: string[] = []
  const needs = actionItems.value.reduce((n, a) => n + a.n, 0)
  parts.push(needs ? `${needs} item${needs === 1 ? '' : 's'} need${needs === 1 ? 's' : ''} your attention` : 'Nothing is waiting on you right now')
  if (c.openCases) parts.push(`${c.openCases} open case${c.openCases === 1 ? '' : 's'}`)
  if (c.lettersSent) parts.push(`${c.lettersSent} letter${c.lettersSent === 1 ? '' : 's'} in flight`)
  return parts.join(' · ') + '.'
})
const bureauTile: Record<string, string> = { equifax: 'bg-garnet-100 text-garnet-700', experian: 'bg-azure-100 text-azure-700', transunion: 'bg-aurum-100 text-aurum-700' }
</script>

<template>
  <div>
    <!-- Welcome band -->
    <section class="card brand-band overflow-hidden mb-8">
      <div class="card-pad sm:!p-8 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div class="min-w-0">
          <div class="flex items-center gap-2 mb-3">
            <ModeBadge :mode="data?.appMode" size="sm" />
            <span class="text-xs text-fg-3">{{ fmtDate(new Date(), 'long') }}</span>
          </div>
          <h1 class="text-3xl sm:text-4xl">{{ greeting }}, {{ user?.displayName?.split(' ')[0] ?? 'there' }}.</h1>
          <p class="lead mt-2 max-w-2xl">{{ summaryLine || 'Loading your workspace…' }}</p>
        </div>
        <div class="flex flex-wrap gap-2.5 shrink-0">
          <NuxtLink to="/reports" class="btn btn-secondary"><Icon name="lucide:file-bar-chart" class="size-4" /> Compare reports</NuxtLink>
          <NuxtLink to="/cases?new=1" class="btn btn-primary"><Icon name="lucide:plus" class="size-4" /> New case</NuxtLink>
        </div>
      </div>
    </section>

    <div v-if="pending && !data" class="grid gap-5 md:grid-cols-3">
      <div v-for="i in 3" :key="i" class="skeleton h-44" />
    </div>

    <template v-else-if="data">
      <!-- Bureau cards -->
      <section aria-labelledby="bureaus">
        <div class="flex items-end justify-between mb-3">
          <div>
            <h2 id="bureaus" class="text-xl">Your three bureau files</h2>
            <p class="text-sm text-fg-2">Latest snapshot from each bureau, with its source and freeze state.</p>
          </div>
          <NuxtLink to="/reports" class="text-sm font-semibold text-accent-strong hover:underline hidden sm:inline">Side-by-side comparison →</NuxtLink>
        </div>
        <div class="grid gap-5 md:grid-cols-3">
          <article v-for="b in data.bureaus" :key="b.bureau" class="card card-pad relative">
            <div class="flex items-start justify-between gap-3">
              <div class="flex items-center gap-3">
                <span class="icon-tile size-11 rounded-md text-lg font-extrabold display" :class="bureauTile[b.bureau]">{{ bureauName(b.bureau).charAt(0) }}</span>
                <div>
                  <h3 class="text-base">{{ bureauName(b.bureau) }}</h3>
                  <p class="text-xs text-fg-3">Report dated {{ fmtDate(b.snapshot?.reportDate) }}</p>
                </div>
              </div>
              <ModeBadge :mode="b.snapshot?.mode" />
            </div>

            <div class="mt-5 flex items-end justify-between gap-3">
              <div>
                <p class="eyebrow">Score</p>
                <p v-if="(b.snapshot?.score as { value?: number } | null)?.value" class="mt-1 flex items-baseline gap-2 flex-wrap">
                  <span class="text-4xl display font-extrabold num leading-none tracking-tight">{{ (b.snapshot?.score as { value?: number } | null)?.value }}</span>
                  <span class="text-xs text-fg-3 font-medium whitespace-nowrap">{{ (b.snapshot?.score as { model?: string } | null)?.model }}</span>
                </p>
                <p v-else class="mt-1 text-sm text-fg-2 leading-snug">Not supplied by this source.<br><span class="text-xs text-fg-3">We never estimate a score.</span></p>
              </div>
              <svg v-if="scoreSeries[b.bureau]?.length" width="120" height="36" class="shrink-0" aria-hidden="true">
                <path :d="sparkline(scoreSeries[b.bureau]!)" fill="none" :stroke="bureauStroke[b.bureau]" stroke-width="2.5" stroke-linecap="round" />
              </svg>
            </div>

            <dl class="mt-5 grid grid-cols-2 gap-3 text-sm">
              <div class="well !p-3">
                <dt class="text-xs text-fg-3">Freeze</dt>
                <dd class="mt-1"><span class="pill" :class="TONE_CLASS[freezeStatusTone(b.freeze)]">{{ freezeStatusLabel(b.freeze) }}</span></dd>
              </div>
              <div class="well !p-3">
                <dt class="text-xs text-fg-3">Accounts</dt>
                <dd class="mt-1 font-semibold num">{{ (b.snapshot?.summary as { tradelineCount?: number } | null)?.tradelineCount ?? '—' }} <span class="text-fg-3 font-normal text-xs">· {{ (b.snapshot?.summary as { derogatoryCount?: number } | null)?.derogatoryCount ?? 0 }} negative</span></dd>
              </div>
            </dl>
            <p class="mt-4 text-xs text-fg-3 flex items-center gap-1.5">
              <Icon name="lucide:clock" class="size-3.5" />
              <template v-if="b.connection?.status === 'not_connected'">No licensed bureau connection — import reports manually.</template>
              <template v-else-if="b.connection?.lastCheckedAt">Checked {{ relTime(b.connection.lastCheckedAt) }} · next check {{ fmtDate(b.connection.nextEligibleCheckAt, 'short') }}</template>
              <template v-else>Monitoring not yet checked.</template>
            </p>
          </article>
        </div>
      </section>

      <!-- Counts -->
      <section class="mt-8 grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard label="Open cases" :value="data.counts.openCases" icon="lucide:briefcase" tone="info" to="/cases?open=1" />
        <StatCard label="Awaiting your approval" :value="data.counts.awaitingApproval" icon="lucide:badge-check" tone="warning" to="/approvals" />
        <StatCard label="Awaiting a response" :value="data.counts.awaitingResponse" icon="lucide:hourglass" tone="neutral" hint="Letters mailed; bureau is reinvestigating" to="/cases" />
        <StatCard label="Letters in flight" :value="data.counts.lettersSent" icon="lucide:send" tone="success" to="/mailroom?tab=outbound" />
      </section>

      <div class="mt-8 grid gap-6 xl:grid-cols-3">
        <!-- Action items -->
        <section class="card xl:col-span-1 min-w-0 flex flex-col">
          <div class="card-head">
            <div>
              <h2>Needs you</h2>
              <p class="sub">Decisions and evidence only you can provide.</p>
            </div>
            <span class="pill" :class="actionItems.length ? TONE_CLASS.warning : TONE_CLASS.success">{{ actionItems.length }} item{{ actionItems.length === 1 ? '' : 's' }}</span>
          </div>
          <ul v-if="actionItems.length" class="divide-y divide-border">
            <li v-for="a in actionItems" :key="a.label">
              <NuxtLink :to="a.to" class="flex items-center gap-3.5 px-5 sm:px-6 py-3.5 hover:bg-surface-2 transition-colors">
                <span class="icon-tile size-10 rounded-md" :class="TONE_CLASS[a.tone]"><Icon :name="a.icon" class="size-[18px]" /></span>
                <span class="flex-1 text-sm font-medium">{{ a.label }}</span>
                <span class="num text-base font-bold">{{ a.n }}</span>
                <Icon name="lucide:chevron-right" class="size-4 text-fg-3" />
              </NuxtLink>
            </li>
          </ul>
          <EmptyState v-else compact icon="lucide:check-circle-2" title="Nothing waiting on you" description="New alerts, approvals and responses will appear here." />

          <div class="card-foot mt-auto">
            <h3 class="eyebrow mb-3">Connected services</h3>
            <ul class="space-y-2.5 text-sm">
              <li class="flex items-center justify-between gap-2">
                <span class="text-fg-2">Outbound mail</span>
                <span class="flex items-center gap-1.5 font-semibold">{{ data.providers.outbound.label.split(' (')[0] }} <ModeBadge :mode="data.providers.outbound.mode" /></span>
              </li>
              <li class="flex items-center justify-between gap-2">
                <span class="text-fg-2">Inbound mail</span>
                <span class="font-semibold">{{ data.providers.inbound.label.split(' (')[0] }}</span>
              </li>
              <li class="flex items-center justify-between gap-2">
                <span class="text-fg-2">AI council</span>
                <span class="flex items-center gap-1.5 font-semibold">
                  <template v-if="data.providers.ai.configured && data.providers.ai.liveEnabled && data.appMode !== 'demo'">{{ data.providers.ai.model }} <ModeBadge mode="live" /></template>
                  <template v-else>Simulator <ModeBadge mode="demo" /></template>
                </span>
              </li>
            </ul>
            <ul v-if="data.blocked.length" class="mt-3 space-y-1.5">
              <li v-for="b in data.blocked" :key="b.provider" class="text-xs text-fg-3 flex items-start gap-1.5">
                <Icon name="lucide:alert-triangle" class="size-3.5 text-aurum-500 shrink-0 mt-0.5" />
                <span><span class="font-semibold text-fg-2">{{ b.provider }}</span>: {{ b.error ?? b.status }}</span>
              </li>
            </ul>
          </div>
        </section>

        <!-- Recent cases + timeline -->
        <section class="xl:col-span-2 space-y-6 min-w-0">
          <div class="card">
            <div class="card-head items-center">
              <div>
                <h2>Recent cases</h2>
                <p class="sub">Every actionable discrepancy becomes a case with a plan and a paper trail.</p>
              </div>
              <NuxtLink to="/cases" class="btn btn-secondary btn-sm">View all</NuxtLink>
            </div>
            <div class="overflow-x-auto">
              <table class="table min-w-[640px]">
                <thead>
                  <tr>
                    <th>Case</th>
                    <th>Status</th>
                    <th>Bureaus</th>
                    <th>Next action</th>
                    <th class="text-right">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="c in data.recentCases" :key="c.id" class="hover:bg-surface-2">
                    <td>
                      <NuxtLink :to="`/cases/${c.id}`" class="block">
                        <span class="mono text-xs text-fg-3">{{ c.code }}</span>
                        <span class="block font-semibold leading-snug">{{ c.title }}</span>
                      </NuxtLink>
                    </td>
                    <td><StatusPill :status="c.status" kind="case" /></td>
                    <td><BureauChips :bureaus="c.bureaus" /></td>
                    <td class="text-fg-2 max-w-[240px] truncate">{{ c.nextAction ?? '—' }}</td>
                    <td class="text-right text-fg-3 whitespace-nowrap">{{ relTime(c.updatedAt) }}</td>
                  </tr>
                  <tr v-if="!data.recentCases.length">
                    <td colspan="5"><EmptyState compact title="No cases yet" description="Import reports to detect discrepancies, or open a case manually." /></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div class="grid gap-6 md:grid-cols-2">
            <div class="card">
              <div class="card-head"><div><h2>Upcoming review points</h2><p class="sub">When to expect a bureau reply.</p></div></div>
              <ul v-if="data.deadlines.length" class="divide-y divide-border">
                <li v-for="d in data.deadlines" :key="d.id" class="px-5 sm:px-6 py-3.5">
                  <NuxtLink :to="`/cases/${d.id}`" class="block">
                    <div class="flex items-center justify-between gap-2">
                      <span class="mono text-xs text-fg-3">{{ d.code }}</span>
                      <span class="text-xs font-semibold" :class="new Date(d.nextActionDueAt!).getTime() < Date.now() ? 'text-garnet-600' : 'text-fg-2'">{{ fmtDate(d.nextActionDueAt) }}</span>
                    </div>
                    <p class="text-sm font-semibold leading-snug mt-0.5 truncate">{{ d.title }}</p>
                    <p class="text-xs text-fg-2 mt-0.5 truncate">{{ d.nextAction ?? caseStatusLabel(d.status) }}</p>
                  </NuxtLink>
                </li>
              </ul>
              <EmptyState v-else compact icon="lucide:calendar-check" title="No review points scheduled" />
            </div>
            <div class="card">
              <div class="card-head"><div><h2>Recent activity</h2><p class="sub">Facts in teal, interpretations in violet.</p></div></div>
              <ol class="px-5 sm:px-6 py-4 space-y-3.5 max-h-[22rem] overflow-y-auto scrollbar-thin">
                <li v-for="t in data.timeline" :key="t.id" class="flex gap-3 text-sm">
                  <span class="mt-1.5 size-2 rounded-full shrink-0" :class="t.factual ? 'bg-accent' : 'bg-orchid-500'" :title="t.factual ? 'Factual event' : 'Interpretation / recommendation'" />
                  <div class="min-w-0 flex-1">
                    <p class="leading-snug"><NuxtLink :to="`/cases/${t.caseId}`" class="mono text-xs text-fg-3 hover:text-accent">{{ t.caseCode }}</NuxtLink> {{ t.title }}</p>
                    <p class="text-[11px] text-fg-3 mt-0.5">{{ t.actor }} · {{ relTime(t.occurredAt) }}</p>
                  </div>
                </li>
                <li v-if="!data.timeline.length" class="text-sm text-fg-3 py-4 text-center">No activity yet.</li>
              </ol>
            </div>
          </div>
        </section>
      </div>
    </template>
  </div>
</template>
