<script setup lang="ts">
import { BUREAUS } from '#shared/constants'
import { TONE_CLASS, bureauName, fmtDate, money, pct, severityTone, titleize } from '~/utils/format'

useHead({ title: 'Reports' })
const toast = useToast()
const { data, refresh, pending } = await useFetch('/api/reports', { key: 'reports' })

type Row = NonNullable<typeof data.value>['comparison']['accounts'][number]
type TL = NonNullable<Row['perBureau']['equifax']>

const onlyDiffs = ref(false)
const selected = ref<Row | null>(null)
const accounts = computed(() => (data.value?.comparison.accounts ?? []).filter(a => !onlyDiffs.value || a.fieldsDiffer.length))
const openDiscrepancies = computed(() => (data.value?.discrepancies ?? []).filter(d => ['open', 'review_suggested'].includes(d.status)))
const otherDiscrepancies = computed(() => (data.value?.discrepancies ?? []).filter(d => !['open', 'review_suggested'].includes(d.status)))

const FIELDS: { key: keyof TL; label: string; fmt?: (v: unknown) => string }[] = [
  { key: 'balance', label: 'Balance', fmt: v => money(v as string) },
  { key: 'creditLimit', label: 'Limit', fmt: v => money(v as string) },
  { key: 'status', label: 'Status', fmt: v => titleize(v as string) },
  { key: 'paymentStatus', label: 'Payment status', fmt: v => titleize(v as string) },
  { key: 'openedDate', label: 'Opened', fmt: v => fmtDate(v as string) },
  { key: 'dateFirstDelinquency', label: 'First delinquency', fmt: v => fmtDate(v as string) },
  { key: 'ownership', label: 'Ownership', fmt: v => titleize(v as string) },
]

function cellTone(row: Row, key: keyof TL) {
  return row.fieldsDiffer.includes(key as string) ? 'bg-aurum-500/10 text-aurum-600 dark:text-aurum-300 font-medium rounded px-1 -mx-1' : ''
}

const detecting = ref(false)
async function detect() {
  detecting.value = true
  try {
    const r = await $fetch('/api/reports/detect', { method: 'POST' })
    toast.success(`Detection complete`, `${r.created.length} new, ${r.existing} already known`)
    await refresh()
  } catch (e) {
    toast.error('Detection failed', errorMessage(e))
  } finally {
    detecting.value = false
  }
}

const busyId = ref<string | null>(null)
async function createCase(id: string) {
  busyId.value = id
  try {
    const r = await $fetch(`/api/reports/discrepancies/${id}/create-case`, { method: 'POST' })
    toast.success(`Case ${r.case.code} opened`, 'Triage complete — see the case for next steps.')
    await refresh()
    navigateTo(`/cases/${r.case.id}`)
  } catch (e) {
    toast.error('Could not open case', errorMessage(e))
  } finally {
    busyId.value = null
  }
}
async function dismiss(id: string) {
  busyId.value = id
  try {
    await $fetch(`/api/reports/discrepancies/${id}/dismiss`, { method: 'POST' })
    await refresh()
  } catch (e) {
    toast.error('Could not dismiss', errorMessage(e))
  } finally {
    busyId.value = null
  }
}

// Manual import
const importOpen = ref(false)
const importJson = ref('')
const importing = ref(false)
const importTemplate = JSON.stringify(
  {
    bureau: 'equifax',
    reportDate: new Date().toISOString().slice(0, 10),
    source: 'manual_import',
    personalInfo: { nameOnFile: 'Your Name', addresses: ['123 Main St, City, ST 00000'] },
    score: { value: 700, model: 'VantageScore 3.0', provider: 'Equifax', asOf: new Date().toISOString().slice(0, 10) },
    tradelines: [{ creditorName: 'Example Bank', accountNumberMasked: '****1234', accountType: 'revolving', status: 'open', paymentStatus: 'current', openedDate: '2020-01-15', balance: 1200, creditLimit: 5000, paymentHistory: [] }],
    inquiries: [],
  },
  null,
  2,
)
async function doImport() {
  importing.value = true
  try {
    const body = JSON.parse(importJson.value)
    const r = await $fetch('/api/reports/import', { method: 'POST', body })
    toast.success(`${bureauName(r.snapshot.bureau)} report imported`, `${r.detection.created} new discrepancies detected`)
    importOpen.value = false
    importJson.value = ''
    await refresh()
  } catch (e) {
    toast.error('Import failed', e instanceof SyntaxError ? 'Invalid JSON' : errorMessage(e))
  } finally {
    importing.value = false
  }
}
</script>

<template>
  <div>
    <PageHeader title="Reports" eyebrow="Three-bureau comparison" description="Side-by-side view of your latest Equifax, Experian and TransUnion snapshots. Accounts are matched by creditor brand + last four digits; differing fields are highlighted and become discrepancies you can turn into cases.">
      <template #actions>
        <button class="btn btn-secondary" @click="importOpen = true"><Icon name="lucide:file-json-2" class="size-4" /> Import report</button>
        <button class="btn btn-primary" :disabled="detecting" @click="detect"><Icon :name="detecting ? 'lucide:loader-2' : 'lucide:git-compare'" class="size-4" :class="detecting && 'animate-spin'" /> Run detection</button>
      </template>
    </PageHeader>

    <div v-if="pending && !data" class="skeleton h-64" />
    <template v-else-if="data">
      <!-- Snapshot header -->
      <section class="grid gap-4 md:grid-cols-3">
        <div v-for="b in BUREAUS" :key="b" class="card card-pad">
          <div class="flex items-center justify-between">
            <p class="font-semibold">{{ bureauName(b) }}</p>
            <ModeBadge v-if="data.snapshots[b]" :mode="data.snapshots[b]!.mode" />
          </div>
          <template v-if="data.snapshots[b]">
            <p class="text-xs text-fg-3 mt-1">Report dated {{ fmtDate(data.snapshots[b]!.reportDate) }} · {{ data.snapshots[b]!.source.replace(/_/g, ' ') }}</p>
            <dl class="mt-3 grid grid-cols-3 gap-2 text-xs">
              <div><dt class="text-fg-3">Score</dt><dd class="num font-semibold text-lg">{{ data.snapshots[b]!.score?.value ?? '—' }}</dd></div>
              <div><dt class="text-fg-3">Accounts</dt><dd class="num font-semibold text-lg">{{ (data.snapshots[b]!.summary as { tradelineCount?: number }).tradelineCount ?? 0 }}</dd></div>
              <div><dt class="text-fg-3">Utilization</dt><dd class="num font-semibold text-lg">{{ (data.snapshots[b]!.summary as { utilization?: number }).utilization ?? '—' }}<span v-if="(data.snapshots[b]!.summary as { utilization?: number }).utilization != null" class="text-xs">%</span></dd></div>
            </dl>
            <p class="mt-2 text-xs text-fg-2">On file as <span class="font-medium">{{ data.snapshots[b]!.personalInfo.nameOnFile }}</span></p>
          </template>
          <EmptyState v-else compact icon="lucide:file-x-2" title="No snapshot" description="Import a report for this bureau." />
        </div>
      </section>

      <!-- Comparison table -->
      <section class="card mt-6">
        <div class="px-5 py-4 border-b border-border flex flex-wrap items-center gap-3">
          <h2 class="font-semibold">Account comparison</h2>
          <span class="text-xs text-fg-3">{{ accounts.length }} account{{ accounts.length === 1 ? '' : 's' }}</span>
          <label class="ml-auto inline-flex items-center gap-2 text-sm cursor-pointer">
            <input v-model="onlyDiffs" type="checkbox" class="size-4 accent-[var(--accent)]"> Only show differences
          </label>
        </div>
        <div class="overflow-x-auto">
          <table class="table min-w-[860px]">
            <thead>
              <tr>
                <th>Account</th>
                <th v-for="b in BUREAUS" :key="b">{{ bureauName(b) }}</th>
                <th class="text-right">Differences</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in accounts" :key="row.accountKey" class="hover:bg-surface-2 cursor-pointer" @click="selected = row">
                <td>
                  <p class="font-medium">{{ row.creditorName }}</p>
                  <p class="text-xs text-fg-3 mono">{{ row.accountNumberMasked }} · {{ titleize(row.accountType) }}</p>
                </td>
                <td v-for="b in BUREAUS" :key="b" class="text-xs">
                  <template v-if="row.perBureau[b]">
                    <p :class="cellTone(row, 'balance')">{{ money(row.perBureau[b]!.balance) }}</p>
                    <p class="text-fg-2" :class="cellTone(row, 'paymentStatus')">{{ titleize(row.perBureau[b]!.paymentStatus) }}</p>
                    <p class="text-fg-3" :class="cellTone(row, 'status')">{{ titleize(row.perBureau[b]!.status) }}</p>
                  </template>
                  <span v-else class="text-fg-3 italic">not reported</span>
                </td>
                <td class="text-right">
                  <span v-if="row.fieldsDiffer.length" class="pill" :class="TONE_CLASS.warning">{{ row.fieldsDiffer.length }} field{{ row.fieldsDiffer.length === 1 ? '' : 's' }}</span>
                  <span v-else class="pill" :class="TONE_CLASS.success">consistent</span>
                </td>
              </tr>
              <tr v-if="!accounts.length">
                <td colspan="5"><EmptyState compact title="Nothing to compare" description="Import at least one report." /></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- Discrepancies -->
      <section id="discrepancies" class="mt-6 grid gap-6 lg:grid-cols-3">
        <div class="card lg:col-span-2">
          <div class="px-5 py-4 border-b border-border flex items-center justify-between">
            <h2 class="font-semibold">Detected discrepancies</h2>
            <span class="text-xs text-fg-3">{{ openDiscrepancies.length }} open</span>
          </div>
          <ul v-if="openDiscrepancies.length" class="divide-y divide-border">
            <li v-for="d in openDiscrepancies" :key="d.id" class="px-5 py-4">
              <div class="flex flex-wrap items-start gap-3">
                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="pill" :class="TONE_CLASS[severityTone(d.severity)]">{{ d.severity }}</span>
                    <span class="pill bg-surface-3 text-fg-2">{{ titleize(d.category) }}</span>
                    <span v-if="d.status === 'review_suggested'" class="pill" :class="TONE_CLASS.info">review suggested</span>
                    <ModeBadge :mode="d.mode" />
                  </div>
                  <p class="font-medium mt-1.5">{{ d.title }}</p>
                  <p class="text-sm text-fg-2 mt-0.5">{{ d.summary }}</p>
                  <div class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-3">
                    <span>Field <span class="mono text-fg-2">{{ d.field }}</span></span>
                    <span>Confidence <span class="num text-fg-2">{{ pct(d.confidence) }}</span></span>
                    <span>Detected {{ fmtDate(d.detectedAt) }}</span>
                  </div>
                </div>
                <div class="flex gap-2 shrink-0">
                  <button class="btn btn-ghost btn-sm" :disabled="busyId === d.id" @click="dismiss(d.id)">Dismiss</button>
                  <button class="btn btn-primary btn-sm" :disabled="busyId === d.id" @click="createCase(d.id)">
                    <Icon v-if="busyId === d.id" name="lucide:loader-2" class="size-3.5 animate-spin" />
                    Open case
                  </button>
                </div>
              </div>
            </li>
          </ul>
          <EmptyState v-else compact icon="lucide:check-check" title="No open discrepancies" description="Run detection after importing new snapshots." />
          <details v-if="otherDiscrepancies.length" class="border-t border-border">
            <summary class="px-5 py-3 text-sm text-fg-2 cursor-pointer hover:text-fg">{{ otherDiscrepancies.length }} resolved / dismissed / cased</summary>
            <ul class="divide-y divide-border">
              <li v-for="d in otherDiscrepancies" :key="d.id" class="px-5 py-2.5 text-sm flex items-center gap-3">
                <span class="pill bg-surface-3 text-fg-2">{{ titleize(d.status) }}</span>
                <span class="flex-1 truncate">{{ d.title }}</span>
                <NuxtLink v-if="d.caseId" :to="`/cases/${d.caseId}`" class="text-xs text-accent hover:underline">Open case</NuxtLink>
              </li>
            </ul>
          </details>
        </div>

        <div class="card">
          <div class="px-5 py-4 border-b border-border"><h2 class="font-semibold">Snapshot history</h2></div>
          <ul class="divide-y divide-border max-h-[32rem] overflow-y-auto scrollbar-thin">
            <li v-for="s in data.history" :key="s.id" class="px-5 py-3 text-sm flex items-center gap-3">
              <span class="pill bg-surface-3 text-fg-2 w-24 justify-center">{{ bureauName(s.bureau) }}</span>
              <div class="flex-1 min-w-0">
                <p class="font-medium">{{ fmtDate(s.reportDate) }}</p>
                <p class="text-xs text-fg-3">{{ s.source.replace(/_/g, ' ') }} · pulled {{ fmtDate(s.pulledAt, 'short') }}</p>
              </div>
              <span class="num text-sm">{{ s.score?.value ?? '—' }}</span>
              <ModeBadge :mode="s.mode" />
            </li>
            <li v-if="!data.history.length" class="px-5 py-8 text-sm text-fg-3 text-center">No snapshots yet.</li>
          </ul>
        </div>
      </section>
    </template>

    <!-- Account drawer -->
    <AppModal :open="!!selected" :title="selected?.creditorName ?? ''" :description="selected ? `${selected.accountNumberMasked} · ${titleize(selected.accountType)} · matched by brand + last four` : ''" size="xl" @close="selected = null">
      <div v-if="selected" class="overflow-x-auto">
        <table class="table min-w-[640px]">
          <thead>
            <tr>
              <th>Field</th>
              <th v-for="b in BUREAUS" :key="b">{{ bureauName(b) }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="f in FIELDS" :key="f.key as string" :class="selected.fieldsDiffer.includes(f.key as string) ? 'bg-aurum-500/5' : ''">
              <td class="font-medium">{{ f.label }}<Icon v-if="selected.fieldsDiffer.includes(f.key as string)" name="lucide:triangle-alert" class="size-3.5 inline ml-1.5 text-aurum-500" /></td>
              <td v-for="b in BUREAUS" :key="b" class="num">{{ selected.perBureau[b] ? (f.fmt ? f.fmt(selected.perBureau[b]![f.key]) : String(selected.perBureau[b]![f.key] ?? '—')) : '—' }}</td>
            </tr>
            <tr>
              <td class="font-medium">Payment history (last 12)</td>
              <td v-for="b in BUREAUS" :key="b">
                <div v-if="selected.perBureau[b]" class="flex flex-wrap gap-0.5">
                  <span v-for="m in selected.perBureau[b]!.paymentHistory.slice(-12)" :key="m.month" class="size-5 rounded-sm grid place-items-center text-[9px] font-bold" :class="m.status === 'OK' ? 'bg-fern-500/20 text-fern-600 dark:text-fern-300' : m.status === 'ND' ? 'bg-surface-3 text-fg-3' : 'bg-garnet-500/20 text-garnet-600 dark:text-garnet-300'" :title="`${m.month}: ${m.status}`">{{ m.status === 'OK' ? '✓' : m.status }}</span>
                </div>
                <span v-else>—</span>
              </td>
            </tr>
            <tr>
              <td class="font-medium">Remarks</td>
              <td v-for="b in BUREAUS" :key="b" class="text-xs text-fg-2">{{ selected.perBureau[b]?.remarks.join('; ') || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </AppModal>

    <!-- Import modal -->
    <AppModal :open="importOpen" title="Import a report" description="Paste a normalized CreditOS report JSON. Imports from your own bureau downloads are treated as live data; in Demo mode they are stored as sandbox data." size="lg" @close="importOpen = false">
      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <label for="importJson" class="label !mb-0">Report JSON</label>
          <button class="text-xs text-accent hover:underline" @click="importJson = importTemplate">Insert template</button>
        </div>
        <textarea id="importJson" v-model="importJson" class="textarea mono text-xs min-h-72" spellcheck="false" placeholder="{ &quot;bureau&quot;: &quot;equifax&quot;, ... }" />
        <p class="text-xs text-fg-3">No bureau API is wired in this build; the normalized format is documented in <span class="mono">INTEGRATIONS.md</span>. Provider adapters should produce this same shape.</p>
      </div>
      <template #footer>
        <button class="btn btn-ghost" @click="importOpen = false">Cancel</button>
        <button class="btn btn-primary" :disabled="importing || !importJson.trim()" @click="doImport"><Icon v-if="importing" name="lucide:loader-2" class="size-4 animate-spin" /> Import</button>
      </template>
    </AppModal>
  </div>
</template>
