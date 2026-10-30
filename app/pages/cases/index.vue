<script setup lang="ts">
import { BUREAUS, ISSUE_CATEGORIES, ISSUE_CATEGORY_LABEL, type IssueCategory } from '#shared/constants'
import { CASE_STATUSES, CASE_OPEN_STATUSES } from '#shared/state-machines'
import { TONE_CLASS, caseStatusLabel, fmtDate, pct, priorityLabel, relTime, titleize } from '~/utils/format'

useHead({ title: 'Cases' })
const route = useRoute()
const router = useRouter()
const toast = useToast()

const q = ref(String(route.query.q ?? ''))
const status = ref(String(route.query.status ?? ''))
const category = ref(String(route.query.category ?? ''))
const bureau = ref(String(route.query.bureau ?? ''))
const openOnly = ref(route.query.open === '1' || route.query.open === 'true')

const query = computed(() => ({
  q: q.value || undefined,
  status: status.value || undefined,
  category: category.value || undefined,
  bureau: bureau.value || undefined,
  open: openOnly.value ? '1' : undefined,
}))
const { data, refresh, pending } = await useFetch('/api/cases', { key: 'cases-list', query })
watch(query, v => router.replace({ query: { ...v, new: route.query.new } }))

const { on } = useLiveEvents()
onMounted(() => on(() => refresh(), ['case.status', 'case.event', 'council.completed']))

const groups = computed(() => {
  const list = data.value?.cases ?? []
  return {
    needsYou: list.filter(c => ['AWAITING_APPROVAL', 'NEEDS_EVIDENCE', 'ESCALATION_REVIEW', 'FOLLOW_UP_RECOMMENDED', 'BLOCKED', 'RESPONSE_RECEIVED'].includes(c.status)),
    working: list.filter(c => ['AGENT_REVIEW', 'PLAN_READY', 'TRIAGE', 'DETECTED', 'RESPONSE_ANALYSIS'].includes(c.status)),
    inFlight: list.filter(c => ['APPROVED', 'QUEUED_FOR_MAIL', 'SENT', 'DELIVERY_CONFIRMED', 'AWAITING_RESPONSE', 'DISPUTED_STATUS_UNKNOWN', 'DELIVERY_FAILED', 'UNDELIVERABLE'].includes(c.status)),
    done: list.filter(c => ['RESOLVED', 'CLOSED', 'CANCELLED', 'DUPLICATE', 'REJECTED_BY_USER'].includes(c.status)),
  }
})
const openCount = computed(() => (data.value?.cases ?? []).filter(c => (CASE_OPEN_STATUSES as readonly string[]).includes(c.status)).length)
const hasFilters = computed(() => !!(q.value || status.value || category.value || bureau.value || openOnly.value))
function clearFilters() {
  q.value = ''
  status.value = ''
  category.value = ''
  bureau.value = ''
  openOnly.value = false
}

// Create case
const createOpen = ref(route.query.new === '1')
watch(createOpen, v => {
  if (!v && route.query.new) router.replace({ query: { ...route.query, new: undefined } })
})
const form = reactive({ title: '', category: 'factual_inaccuracy' as IssueCategory, summary: '', bureaus: [] as string[], creditorName: '', statement: '' })
const creating = ref(false)
function toggleBureau(b: string) {
  form.bureaus = form.bureaus.includes(b) ? form.bureaus.filter(x => x !== b) : [...form.bureaus, b]
}
async function createCase() {
  creating.value = true
  try {
    const r = await $fetch('/api/cases', {
      method: 'POST',
      body: { title: form.title, category: form.category, summary: form.summary, bureaus: form.bureaus, creditorName: form.creditorName || undefined, statement: form.statement || undefined },
    })
    toast.success(`Case ${r.case.code} created`, `Triaged as ${caseStatusLabel(r.case.status)}.`)
    createOpen.value = false
    navigateTo(`/cases/${r.case.id}`)
  } catch (e) {
    toast.error('Could not create case', errorMessage(e))
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <div>
    <PageHeader title="Cases" eyebrow="Dispute workspace" description="One case per contested fact. Each row shows where the case is in its state machine, who owes the next action and when the next review point lands.">
      <template #actions>
        <button class="btn btn-primary" @click="createOpen = true"><Icon name="lucide:plus" class="size-4" /> New case</button>
      </template>
    </PageHeader>

    <!-- Filters -->
    <div class="card card-pad flex flex-wrap items-center gap-2 mb-6">
      <label class="relative flex-1 min-w-56">
        <Icon name="lucide:search" class="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-fg-3" />
        <input v-model.trim="q" type="search" class="input pl-9" placeholder="Search code, title, creditor…" aria-label="Search cases">
      </label>
      <select v-model="status" class="input w-auto" aria-label="Status">
        <option value="">Any status</option>
        <option v-for="s in CASE_STATUSES" :key="s" :value="s">{{ caseStatusLabel(s) }}</option>
      </select>
      <select v-model="category" class="input w-auto" aria-label="Category">
        <option value="">Any category</option>
        <option v-for="c in ISSUE_CATEGORIES" :key="c" :value="c">{{ ISSUE_CATEGORY_LABEL[c] }}</option>
      </select>
      <select v-model="bureau" class="input w-auto" aria-label="Bureau">
        <option value="">Any bureau</option>
        <option v-for="b in BUREAUS" :key="b" :value="b">{{ titleize(b) }}</option>
      </select>
      <label class="inline-flex items-center gap-2 text-sm px-2 cursor-pointer">
        <input v-model="openOnly" type="checkbox" class="size-4 accent-[var(--accent)]"> Open only
      </label>
      <button v-if="hasFilters" class="btn btn-ghost btn-sm" @click="clearFilters"><Icon name="lucide:x" class="size-3.5" /> Clear</button>
    </div>

    <div v-if="pending && !data" class="skeleton h-64" />
    <template v-else-if="data">
      <EmptyState v-if="!data.cases.length" icon="lucide:briefcase" title="No cases found" :description="hasFilters ? 'Try clearing a filter.' : 'Open a case from a detected discrepancy on the Reports page, or create one manually.'">
        <NuxtLink to="/reports#discrepancies" class="btn btn-secondary">Review discrepancies</NuxtLink>
        <button class="btn btn-primary" @click="createOpen = true">New case</button>
      </EmptyState>

      <template v-for="group in [
        { key: 'needsYou', label: 'Needs you', hint: 'Approval, evidence or a decision is waiting on you', items: groups.needsYou, tone: 'warning' },
        { key: 'working', label: 'In review', hint: 'Triage, council deliberation or plan drafting', items: groups.working, tone: 'info' },
        { key: 'inFlight', label: 'In flight', hint: 'Mailed and waiting on the recipient', items: groups.inFlight, tone: 'live' },
        { key: 'done', label: 'Closed', hint: 'Resolved, closed or cancelled', items: groups.done, tone: 'neutral' },
      ]" :key="group.key">
        <section v-if="group.items.length" class="card mb-6">
          <div class="card-head !items-center">
            <div class="flex items-center gap-3 min-w-0">
              <span class="pill" :class="TONE_CLASS[group.tone as keyof typeof TONE_CLASS]">{{ group.items.length }}</span>
              <h2>{{ group.label }}</h2>
              <span class="text-xs text-fg-3 hidden sm:inline">{{ group.hint }}</span>
            </div>
          </div>

          <!-- Desktop table -->
          <div class="hidden md:block overflow-x-auto">
            <table class="table table-fixed w-full min-w-[880px]">
              <colgroup>
                <col class="w-[35%]">
                <col class="w-[14%]">
                <col class="w-[13%]">
                <col class="w-[10%]">
                <col class="w-[17%]">
                <col class="w-[11%]">
              </colgroup>
              <thead>
                <tr>
                  <th>Case</th>
                  <th>Status</th>
                  <th>Bureaus</th>
                  <th>Confidence</th>
                  <th>Next action</th>
                  <th class="text-right">Updated</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="c in group.items" :key="c.id" class="hover:bg-surface-2 cursor-pointer" @click="navigateTo(`/cases/${c.id}`)">
                  <td>
                    <NuxtLink :to="`/cases/${c.id}`" class="font-semibold text-fg hover:text-accent-strong line-clamp-2 leading-snug">{{ c.title }}</NuxtLink>
                    <p class="text-xs text-fg-3 mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1">
                      <span class="mono">{{ c.code }}</span>
                      <span aria-hidden="true">·</span>
                      <span>{{ ISSUE_CATEGORY_LABEL[c.category] ?? titleize(c.category) }}</span>
                      <template v-if="c.creditorName"><span aria-hidden="true">·</span><span class="truncate">{{ c.creditorName }}</span></template>
                      <span aria-hidden="true">·</span>
                      <span class="whitespace-nowrap">{{ priorityLabel(c.priority) }}</span>
                      <ModeBadge :mode="c.mode" size="xs" />
                    </p>
                  </td>
                  <td><StatusPill kind="case" :status="c.status" /></td>
                  <td><BureauChips :bureaus="c.bureaus" /></td>
                  <td class="num text-sm">{{ pct(c.confidence) }}</td>
                  <td class="text-xs">
                    <p class="truncate" :title="c.nextAction ?? ''">{{ c.nextAction ?? '—' }}</p>
                    <p v-if="c.nextActionDueAt" class="text-fg-3">due {{ fmtDate(c.nextActionDueAt, 'short') }}</p>
                  </td>
                  <td class="text-right text-xs text-fg-3 whitespace-nowrap">{{ relTime(c.updatedAt) }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Stacked list for small screens -->
          <ul class="md:hidden divide-y divide-border">
            <li v-for="c in group.items" :key="c.id">
              <NuxtLink :to="`/cases/${c.id}`" class="block px-5 py-4 hover:bg-surface-2">
                <div class="flex items-start justify-between gap-3">
                  <p class="font-semibold text-fg leading-snug">{{ c.title }}</p>
                  <StatusPill kind="case" :status="c.status" class="shrink-0" />
                </div>
                <p class="text-xs text-fg-3 mt-1.5"><span class="mono">{{ c.code }}</span> · {{ ISSUE_CATEGORY_LABEL[c.category] ?? titleize(c.category) }} · {{ priorityLabel(c.priority) }} · {{ pct(c.confidence) }}</p>
                <div class="mt-2.5 flex flex-wrap items-center gap-2">
                  <BureauChips :bureaus="c.bureaus" />
                  <ModeBadge :mode="c.mode" size="xs" />
                  <span class="ml-auto text-xs text-fg-3">{{ relTime(c.updatedAt) }}</span>
                </div>
                <p v-if="c.nextAction" class="mt-2.5 text-sm text-fg-2 flex items-start gap-1.5"><Icon name="lucide:corner-down-right" class="size-3.5 mt-0.5 text-fg-3 shrink-0" /><span>{{ c.nextAction }}<span v-if="c.nextActionDueAt" class="text-fg-3"> · due {{ fmtDate(c.nextActionDueAt, 'short') }}</span></span></p>
              </NuxtLink>
            </li>
          </ul>
        </section>
      </template>
      <p v-if="data.cases.length" class="text-xs text-fg-3">{{ data.cases.length }} case{{ data.cases.length === 1 ? '' : 's' }} · {{ openCount }} open</p>
    </template>

    <!-- Create modal -->
    <AppModal :open="createOpen" title="New case" description="Describe the fact you believe is wrong. The rules engine triages it immediately; the council only convenes once the minimum evidence is present." size="lg" @close="createOpen = false">
      <form id="createCase" class="space-y-4" @submit.prevent="createCase">
        <div>
          <label class="label" for="c-title">Title</label>
          <input id="c-title" v-model="form.title" class="input" required minlength="3" placeholder="e.g. Chase card shows a 30-day late that never happened">
        </div>
        <div class="grid gap-4 sm:grid-cols-2">
          <div>
            <label class="label" for="c-cat">Category</label>
            <select id="c-cat" v-model="form.category" class="input">
              <option v-for="c in ISSUE_CATEGORIES" :key="c" :value="c">{{ ISSUE_CATEGORY_LABEL[c] }}</option>
            </select>
          </div>
          <div>
            <label class="label" for="c-cred">Creditor / furnisher (optional)</label>
            <input id="c-cred" v-model="form.creditorName" class="input" placeholder="Chase, Midland Credit…">
          </div>
        </div>
        <fieldset>
          <legend class="label">Bureaus affected</legend>
          <div class="flex flex-wrap gap-2">
            <button v-for="b in BUREAUS" :key="b" type="button" class="btn btn-sm" :class="form.bureaus.includes(b) ? 'btn-primary' : 'btn-secondary'" :aria-pressed="form.bureaus.includes(b)" @click="toggleBureau(b)">{{ titleize(b) }}</button>
          </div>
        </fieldset>
        <div>
          <label class="label" for="c-sum">What is reported, and why you believe it is wrong</label>
          <textarea id="c-sum" v-model="form.summary" class="textarea min-h-28" required minlength="10" placeholder="Be specific: which field, which value, what the correct value is." />
        </div>
        <div>
          <label class="label" for="c-stmt">Your statement (optional, becomes evidence)</label>
          <textarea id="c-stmt" v-model="form.statement" class="textarea min-h-20" placeholder="First-person account of what happened. Treated as low-credibility evidence until documents back it." />
        </div>
      </form>
      <template #footer>
        <button class="btn btn-ghost" type="button" @click="createOpen = false">Cancel</button>
        <button class="btn btn-primary" type="submit" form="createCase" :disabled="creating || !form.bureaus.length || form.title.length < 3 || form.summary.length < 10"><Icon v-if="creating" name="lucide:loader-2" class="size-4 animate-spin" /> Create case</button>
      </template>
    </AppModal>
  </div>
</template>
