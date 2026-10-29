<script setup lang="ts">
import { ISSUE_CATEGORY_LABEL, REMEDY_CHANNEL_LABEL, RESPONSE_CATEGORY_LABEL, type IssueCategory, type RemedyChannel, type ResponseCategory } from '#shared/constants'
import { CASE_PROGRESS_STEPS, CASE_TRANSITIONS, CASE_EXCEPTION_STATUSES, type CaseStatus } from '#shared/state-machines'
import { TONE_CLASS, bureauName, bytes, caseStatusLabel, fmtDate, money, pct, priorityLabel, relTime, titleize } from '~/utils/format'

const route = useRoute()
const toast = useToast()
const api = useApi()
const id = computed(() => String(route.params.id))
const { data, refresh, pending, error } = await useFetch(() => `/api/cases/${id.value}`, { key: `case-${id.value}` })
useHead({ title: () => (data.value ? `${data.value.case.code} · ${data.value.case.title}` : 'Case') })

const { on } = useLiveEvents()
const councilLive = ref<string | null>(null)
onMounted(() =>
  on(
    evt => {
      if (evt.payload.caseId !== id.value) return
      if (evt.type === 'council.progress' || evt.type === 'council.transcript') councilLive.value = String(evt.payload.message ?? evt.payload.stage ?? 'Deliberating…')
      if (evt.type === 'council.completed' || evt.type === 'council.failed') councilLive.value = null
      refresh()
    },
    ['case.status', 'case.event', 'council.started', 'council.progress', 'council.transcript', 'council.completed', 'council.failed', 'mail.status', 'inbound.status'],
  ),
)

const c = computed(() => data.value?.case)
const USER_TRANSITIONS: CaseStatus[] = ['CANCELLED', 'CLOSED', 'RESOLVED', 'AGENT_REVIEW', 'PLAN_READY', 'TRIAGE', 'NEEDS_EVIDENCE', 'RESPONSE_RECEIVED', 'ESCALATION_REVIEW', 'FOLLOW_UP_RECOMMENDED']
const availableTransitions = computed(() => (c.value ? CASE_TRANSITIONS[c.value.status].filter(s => USER_TRANSITIONS.includes(s)) : []))
const isException = computed(() => !!c.value && CASE_EXCEPTION_STATUSES.includes(c.value.status))
const stepIndex = computed(() => (c.value ? CASE_PROGRESS_STEPS.findIndex(s => s.statuses.includes(c.value!.status)) : -1))

const centerTab = ref<'council' | 'timeline' | 'letter'>('council')
const selectedRunId = ref<string | null>(null)
const selectedRun = computed(() => data.value?.runs.find(r => r.id === selectedRunId.value) ?? data.value?.runs[0] ?? null)
const activePlan = computed(() => data.value?.plans.find(p => p.status === 'active') ?? data.value?.plans[0] ?? null)
const latestLetter = computed(() => data.value?.letters[0] ?? null)
const docById = (docId: string | null | undefined) => data.value?.documents.find(d => d.id === docId) ?? null

// ─── Actions ────────────────────────────────────────────────────────────────
const busy = ref<string | null>(null)
async function act<T>(key: string, fn: () => Promise<T>, okTitle?: string): Promise<T | undefined> {
  busy.value = key
  try {
    const r = await fn()
    if (okTitle) toast.success(okTitle)
    await refresh()
    return r
  } catch (e) {
    toast.error('Action failed', errorMessage(e))
  } finally {
    busy.value = null
  }
}

function runCouncil(trigger: 'manual_rerun' | 'new_evidence' | 'initial' = 'manual_rerun') {
  councilLive.value = 'Convening council…'
  return act('council', async () => {
    const r = await api<{ run: { id: string } }>(`/api/cases/${id.value}/council`, { method: 'POST', body: { trigger } })
    selectedRunId.value = r.run.id
    centerTab.value = 'council'
    councilLive.value = null
    return r
  }, 'Council run completed')
}

const transitionOpen = ref(false)
const transitionTo = ref<CaseStatus | null>(null)
const transitionNote = ref('')
function transition() {
  if (!transitionTo.value) return
  return act('transition', () => api(`/api/cases/${id.value}/transition`, { method: 'POST', body: { to: transitionTo.value, note: transitionNote.value || undefined } }), 'Status updated').then(() => {
    transitionOpen.value = false
    transitionNote.value = ''
  })
}

// Evidence
const evidenceOpen = ref(false)
const evKind = ref<'statement' | 'document'>('document')
const evDescription = ref('')
const evTitle = ref('')
const evCredibility = ref<'high' | 'medium' | 'low'>('medium')
const evFile = ref<File | null>(null)
async function addEvidence() {
  await act('evidence', async () => {
    if (evKind.value === 'statement') {
      return api<{ advanced: boolean }>(`/api/cases/${id.value}/evidence`, { method: 'POST', body: { kind: 'user_statement', description: evDescription.value } })
    }
    const fd = new FormData()
    if (!evFile.value) throw new Error('Choose a file')
    fd.append('file', evFile.value)
    fd.append('description', evDescription.value)
    fd.append('documentKind', 'evidence')
    fd.append('credibility', evCredibility.value)
    if (evTitle.value) fd.append('title', evTitle.value)
    const r = await api<{ advanced: boolean }>(`/api/cases/${id.value}/evidence`, { method: 'POST', body: fd })
    if (r.advanced) toast.info('Evidence threshold met', 'The case advanced to council review.')
    return r
  }, 'Evidence added')
  evidenceOpen.value = false
  evDescription.value = ''
  evTitle.value = ''
  evFile.value = null
}

// Letter editor
const letterDraft = reactive({ subject: '', body: '', enclosures: '' })
const letterDirty = ref(false)
watch(
  latestLetter,
  l => {
    if (l && !letterDirty.value) {
      letterDraft.subject = l.subject
      letterDraft.body = l.body
      letterDraft.enclosures = l.enclosures.join('\n')
    }
  },
  { immediate: true },
)
const letterLocked = computed(() => !!c.value && ['AWAITING_APPROVAL', 'APPROVED', 'QUEUED_FOR_MAIL', 'SENT'].includes(c.value.status))
function saveLetter() {
  if (!latestLetter.value) return
  return act('letter', () => api(`/api/cases/${id.value}/letters/${latestLetter.value!.id}`, { method: 'PATCH', body: { subject: letterDraft.subject, body: letterDraft.body, enclosures: letterDraft.enclosures.split('\n').map(s => s.trim()).filter(Boolean) } }), 'Letter saved').then(() => (letterDirty.value = false))
}

// Approval
const approvalOpen = ref(false)
const mailClass = ref<'first_class' | 'standard' | 'certified'>('first_class')
function requestApproval() {
  return act('approval', () => api<{ approvalId: string }>(`/api/cases/${id.value}/request-approval`, { method: 'POST', body: { letterId: latestLetter.value?.id, mailClass: mailClass.value } }), 'Approval requested').then(r => {
    approvalOpen.value = false
    if (r) navigateTo(`/approvals?focus=${r.approvalId}`)
  })
}

// Link / merge
const linkOpen = ref(false)
const linkCode = ref('')
const linkAction = ref<'link' | 'merge_into'>('link')
const { data: allCases } = await useFetch('/api/cases', { key: 'cases-for-link', query: { open: '1' }, lazy: true, server: false })
function doLink() {
  const other = allCases.value?.cases.find(x => x.code === linkCode.value.trim().toUpperCase())
  if (!other) return toast.warning('Unknown case code')
  return act('link', () => api(`/api/cases/${id.value}/link`, { method: 'POST', body: { otherCaseId: other.id, action: linkAction.value } }), linkAction.value === 'link' ? 'Cases linked' : 'Case merged').then(() => (linkOpen.value = false))
}

const scenarioTone: Record<string, string> = { corrected: TONE_CLASS.success, deleted: TONE_CLASS.success, partially_updated: TONE_CLASS.info, verified_no_change: TONE_CLASS.warning, more_information_requested: TONE_CLASS.warning, rerouted_other_channel: TONE_CLASS.info, undeliverable: TONE_CLASS.danger, no_response: TONE_CLASS.danger, unclear: TONE_CLASS.neutral }
const openScenario = ref<string | null>(null)
const eventIcon: Record<string, string> = { status: 'lucide:git-commit-horizontal', council: 'lucide:users-round', evidence: 'lucide:paperclip', rules: 'lucide:scale', mail: 'lucide:send', inbound: 'lucide:mail-open', approval: 'lucide:badge-check', created: 'lucide:sparkles', letter: 'lucide:file-text', link: 'lucide:link' }
</script>

<template>
  <div>
    <div v-if="pending && !data" class="skeleton h-96" />
    <EmptyState v-else-if="error || !data || !c" icon="lucide:file-question" title="Case not found" description="It may have been merged or you may not have access.">
      <NuxtLink to="/cases" class="btn btn-secondary">Back to cases</NuxtLink>
    </EmptyState>

    <template v-else>
      <!-- Header -->
      <nav class="text-xs text-fg-3 mb-3 flex items-center gap-1.5" aria-label="Breadcrumb"><NuxtLink to="/cases" class="hover:text-fg">Cases</NuxtLink><Icon name="lucide:chevron-right" class="size-3" /><span class="mono text-fg-2">{{ c.code }}</span></nav>
      <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between mb-5">
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2 mb-2">
            <StatusPill kind="case" :status="c.status" />
            <ModeBadge :mode="c.mode" size="sm" />
            <span class="pill bg-surface-3 text-fg-2">{{ ISSUE_CATEGORY_LABEL[c.category as IssueCategory] ?? titleize(c.category) }}</span>
            <span class="pill bg-surface-3 text-fg-2">{{ priorityLabel(c.priority) }}</span>
            <span v-if="c.mergedIntoCaseId" class="pill" :class="TONE_CLASS.neutral">merged</span>
          </div>
          <h1 class="text-2xl sm:text-3xl leading-tight">{{ c.title }}</h1>
          <p class="mt-1.5 text-sm text-fg-2 max-w-3xl">{{ c.summary }}</p>
          <div class="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-fg-3">
            <span v-if="c.creditorName" class="flex items-center gap-1.5"><Icon name="lucide:building-2" class="size-3.5" /> {{ c.creditorName }}</span>
            <span class="flex items-center gap-1.5"><Icon name="lucide:landmark" class="size-3.5" /><BureauChips :bureaus="c.bureaus" /></span>
            <span class="flex items-center gap-1.5"><Icon name="lucide:gauge" class="size-3.5" /> Confidence <span class="num text-fg-2">{{ pct(c.confidence) }}</span></span>
            <span class="flex items-center gap-1.5"><Icon name="lucide:calendar" class="size-3.5" /> Opened {{ fmtDate(c.createdAt) }}</span>
            <span v-if="c.sourceReportDate" class="flex items-center gap-1.5"><Icon name="lucide:file-clock" class="size-3.5" /> Source report {{ fmtDate(c.sourceReportDate) }}</span>
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-2 shrink-0">
          <button class="btn btn-secondary" :disabled="busy === 'council' || !!councilLive" @click="runCouncil()"><Icon :name="busy === 'council' ? 'lucide:loader-2' : 'lucide:users-round'" class="size-4" :class="busy === 'council' && 'animate-spin'" /> {{ data.runs.length ? 'Re-run council' : 'Run council' }}</button>
          <button v-if="['PLAN_READY', 'FOLLOW_UP_RECOMMENDED', 'DELIVERY_FAILED', 'UNDELIVERABLE'].includes(c.status) && latestLetter" class="btn btn-primary" @click="approvalOpen = true"><Icon name="lucide:badge-check" class="size-4" /> Request approval to mail</button>
          <NuxtLink v-else-if="c.status === 'AWAITING_APPROVAL'" :to="`/approvals`" class="btn btn-primary"><Icon name="lucide:badge-check" class="size-4" /> Review approval</NuxtLink>
          <button v-if="availableTransitions.length" class="btn btn-ghost" @click="transitionOpen = true"><Icon name="lucide:route" class="size-4" /> Change status</button>
        </div>
      </div>

      <!-- Blockers / next action -->
      <div v-if="c.blockers.length" class="card border-garnet-500/40 bg-garnet-500/5 card-pad mb-5">
        <p class="font-semibold text-sm flex items-center gap-2 text-garnet-600 dark:text-garnet-300"><Icon name="lucide:octagon-alert" class="size-4" /> Blocked — this case cannot move forward until the following is addressed</p>
        <ul class="mt-2 space-y-1 text-sm">
          <li v-for="b in c.blockers" :key="b.code" class="flex items-start gap-2"><span class="mono text-xs px-1.5 py-0.5 rounded bg-surface-3 shrink-0">{{ b.code }}</span><span>{{ b.message }} <span class="text-fg-3">· since {{ fmtDate(b.since) }}{{ b.resolvable ? '' : ' · not resolvable in-app' }}</span></span></li>
        </ul>
      </div>
      <div v-else-if="c.nextAction" class="card card-pad mb-5 flex flex-wrap items-center gap-3" :class="isException ? 'border-aurum-500/40 bg-aurum-500/5' : ''">
        <Icon name="lucide:flag" class="size-4 text-accent" />
        <p class="text-sm"><span class="font-medium">Next action:</span> {{ c.nextAction }}</p>
        <span v-if="c.nextActionDueAt" class="text-xs text-fg-3 ml-auto">Review point {{ fmtDate(c.nextActionDueAt) }} ({{ relTime(c.nextActionDueAt) }})</span>
      </div>

      <!-- Progress rail -->
      <ol class="card card-pad mb-6 grid grid-cols-4 md:grid-cols-8 gap-2" aria-label="Case progress">
        <li v-for="(s, i) in CASE_PROGRESS_STEPS" :key="s.key" class="flex flex-col gap-1.5 min-w-0">
          <div class="h-1.5 rounded-full" :class="i < stepIndex ? 'bg-verdigris-500' : i === stepIndex ? (isException ? 'bg-garnet-500' : 'bg-accent') : 'bg-surface-3'" />
          <span class="text-[11px] leading-tight truncate" :class="i === stepIndex ? 'font-semibold text-fg' : 'text-fg-3'">{{ s.label }}</span>
        </li>
      </ol>

      <div class="grid gap-6 xl:grid-cols-12">
        <!-- LEFT: what is contested, rules, evidence -->
        <div class="space-y-6 xl:col-span-3">
          <section class="card">
            <div class="px-4 py-3 border-b border-border"><h2 class="font-semibold text-sm">Contested fact</h2></div>
            <div class="px-4 py-3 text-sm space-y-2">
              <p><span class="text-fg-3 text-xs uppercase tracking-wide">Field</span><br><span class="mono">{{ c.contestedField ?? '—' }}</span></p>
              <div v-if="Object.keys(c.contestedValues).length">
                <p class="text-fg-3 text-xs uppercase tracking-wide mb-1">Reported values</p>
                <ul class="space-y-1">
                  <li v-for="(v, b) in c.contestedValues" :key="b" class="flex items-center justify-between gap-2 rounded bg-surface-2 px-2 py-1"><span class="text-xs">{{ bureauName(String(b)) }}</span><span class="mono text-xs truncate">{{ typeof v === 'object' ? JSON.stringify(v) : String(v ?? 'not reported') }}</span></li>
                </ul>
              </div>
              <p v-if="c.desiredCorrection"><span class="text-fg-3 text-xs uppercase tracking-wide">Correction sought</span><br>{{ c.desiredCorrection }}</p>
            </div>
          </section>

          <section class="card">
            <div class="px-4 py-3 border-b border-border flex items-center justify-between"><h2 class="font-semibold text-sm">Why this is questionable</h2><span v-if="data.rules" class="pill" :class="data.rules.disputable === 'yes' ? TONE_CLASS.success : data.rules.disputable === 'no' ? TONE_CLASS.danger : TONE_CLASS.warning">{{ data.rules.disputable === 'yes' ? 'Disputable' : data.rules.disputable === 'no' ? 'Not disputable' : 'Uncertain' }}</span></div>
            <div v-if="data.rules" class="px-4 py-3 text-sm space-y-3">
              <div><p class="eyebrow">Reported fact</p><p class="mt-0.5">{{ data.rules.explanation.reportedFact }}</p></div>
              <div><p class="eyebrow">Why it is questionable</p><p class="mt-0.5">{{ data.rules.explanation.whyQuestionable }}</p></div>
              <div><p class="eyebrow">Outcome sought</p><p class="mt-0.5">{{ data.rules.explanation.outcomeSought }}</p></div>
              <div><p class="eyebrow">Uncertainty</p><p class="mt-0.5 text-fg-2">{{ data.rules.explanation.uncertainty }}</p></div>
              <div><p class="eyebrow">If not corrected</p><p class="mt-0.5 text-fg-2">{{ data.rules.explanation.ifNotCorrected }}</p></div>
              <div v-if="data.rules.evidenceGaps.length" class="rounded-md bg-aurum-500/10 p-2.5">
                <p class="text-xs font-semibold text-aurum-600 dark:text-aurum-300 mb-1">Evidence gaps</p>
                <ul class="text-xs space-y-0.5"><li v-for="g in data.rules.evidenceGaps" :key="g">· {{ g }}</li></ul>
              </div>
              <div v-if="data.rules.legalBasis.length"><p class="eyebrow">Legal basis (informational)</p>
                <ul class="mt-1 space-y-1"><li v-for="l in data.rules.legalBasis" :key="l.cite" class="text-xs"><span class="font-medium">{{ l.cite }}</span> · {{ l.label }} — {{ l.summary }}</li></ul>
              </div>
              <p class="text-[11px] text-fg-3 border-t border-border pt-2">Rule {{ data.rules.ruleId }} v{{ data.rules.ruleVersion }} · typical review window {{ data.rules.reviewWindow }} · {{ data.rules.disclaimer }}</p>
            </div>
            <p v-else class="px-4 py-3 text-sm text-fg-3">No rule evaluation available.</p>
          </section>

          <section class="card">
            <div class="px-4 py-3 border-b border-border flex items-center justify-between"><h2 class="font-semibold text-sm">Evidence <span class="text-fg-3 font-normal">({{ data.evidence.length }})</span></h2><button class="btn btn-secondary btn-sm" @click="evidenceOpen = true"><Icon name="lucide:plus" class="size-3.5" /> Add</button></div>
            <ul class="divide-y divide-border">
              <li v-for="e in data.evidence" :key="e.id" class="px-4 py-2.5 text-sm">
                <div class="flex items-center gap-2">
                  <span class="mono text-[10px] px-1.5 py-0.5 rounded bg-surface-3">{{ e.label }}</span>
                  <span class="text-xs text-fg-3">{{ titleize(e.kind) }}</span>
                  <span class="pill !py-0 ml-auto" :class="e.credibility === 'high' ? TONE_CLASS.success : e.credibility === 'low' ? TONE_CLASS.warning : TONE_CLASS.neutral">{{ e.credibility }}</span>
                </div>
                <p class="mt-1 text-fg-2 text-xs">{{ e.description }}</p>
                <a v-if="e.documentId && docById(e.documentId)" :href="`/api/documents/${e.documentId}/download?inline=1`" target="_blank" rel="noopener" class="mt-1 inline-flex items-center gap-1 text-xs text-accent hover:underline"><Icon name="lucide:file" class="size-3" /> {{ docById(e.documentId)!.filename }} · {{ bytes(docById(e.documentId)!.sizeBytes) }}</a>
              </li>
              <li v-if="!data.evidence.length" class="px-4 py-6 text-xs text-fg-3 text-center">No evidence attached yet.</li>
            </ul>
          </section>
        </div>

        <!-- CENTER: council / timeline / letter -->
        <div class="xl:col-span-6 space-y-4">
          <div class="card">
            <div class="px-4 pt-3 border-b border-border flex flex-wrap items-center gap-1" role="tablist">
              <button v-for="t in [{ k: 'council', l: 'Council transcript', i: 'lucide:users-round' }, { k: 'timeline', l: 'Timeline', i: 'lucide:history' }, { k: 'letter', l: 'Letter', i: 'lucide:file-text' }]" :key="t.k" role="tab" :aria-selected="centerTab === t.k" class="px-3 py-2 text-sm font-medium border-b-2 -mb-px flex items-center gap-1.5 transition-colors" :class="centerTab === t.k ? 'border-accent text-fg' : 'border-transparent text-fg-3 hover:text-fg'" @click="centerTab = t.k as typeof centerTab"><Icon :name="t.i" class="size-4" /> {{ t.l }}</button>
              <div v-if="centerTab === 'council' && data.runs.length > 1" class="ml-auto pb-2">
                <select v-model="selectedRunId" class="input !py-1 !h-auto text-xs w-auto" aria-label="Select council run">
                  <option v-for="(r, i) in data.runs" :key="r.id" :value="r.id">Run {{ data.runs.length - i }} · {{ titleize(r.trigger) }} · {{ fmtDate(r.createdAt, 'time') }}</option>
                </select>
              </div>
            </div>

            <!-- Council -->
            <div v-if="centerTab === 'council'" class="p-4">
              <div v-if="councilLive" class="mb-4 rounded-md bg-orchid-500/10 px-3 py-2 text-sm flex items-center gap-2"><Icon name="lucide:loader-2" class="size-4 animate-spin text-orchid-500" /> {{ councilLive }}</div>
              <CouncilTranscript v-if="selectedRun" :run="selectedRun" />
              <EmptyState v-else compact icon="lucide:users-round" title="The council has not convened" :description="c.status === 'NEEDS_EVIDENCE' ? 'Add the missing evidence first; the council will not deliberate on an unsupported claim.' : 'Run the council to get a multi-agent review with recorded votes.'">
                <button class="btn btn-primary btn-sm" :disabled="busy === 'council'" @click="runCouncil('initial')">Run council</button>
              </EmptyState>
            </div>

            <!-- Timeline -->
            <div v-else-if="centerTab === 'timeline'" class="p-4">
              <p class="text-xs text-fg-3 mb-3 flex items-center gap-3"><span class="flex items-center gap-1"><span class="size-2 rounded-full bg-verdigris-500" /> Factual event</span><span class="flex items-center gap-1"><span class="size-2 rounded-full bg-orchid-500" /> Interpretation / AI output</span></p>
              <ol class="relative border-l border-border ml-2 space-y-4">
                <li v-for="e in [...data.events].reverse()" :key="e.id" class="pl-5 relative">
                  <span class="absolute -left-[5px] top-1.5 size-2.5 rounded-full ring-2 ring-surface" :class="e.factual ? 'bg-verdigris-500' : 'bg-orchid-500'" />
                  <div class="flex flex-wrap items-center gap-2 text-xs text-fg-3"><Icon :name="eventIcon[e.kind] ?? 'lucide:dot'" class="size-3.5" /><span>{{ fmtDate(e.occurredAt, 'time') }}</span><span>· {{ titleize(e.actor) }}</span><span v-if="e.toStatus" class="pill !py-0 bg-surface-3">{{ e.fromStatus ? caseStatusLabel(e.fromStatus) + ' → ' : '' }}{{ caseStatusLabel(e.toStatus) }}</span></div>
                  <p class="text-sm font-medium mt-0.5">{{ e.title }}</p>
                  <p v-if="e.detail" class="text-sm text-fg-2 whitespace-pre-wrap">{{ e.detail }}</p>
                </li>
              </ol>
            </div>

            <!-- Letter -->
            <div v-else class="p-4">
              <template v-if="latestLetter">
                <div class="flex flex-wrap items-center gap-2 text-xs text-fg-2 mb-3">
                  <span class="pill bg-surface-3">v{{ latestLetter.version }} · {{ latestLetter.status }}</span>
                  <span class="pill bg-surface-3">{{ REMEDY_CHANNEL_LABEL[latestLetter.letterType as RemedyChannel] ?? titleize(latestLetter.letterType) }}</span>
                  <span>To {{ latestLetter.recipient.name }} ({{ latestLetter.recipientType }})</span>
                  <span v-if="latestLetter.pdfSha256" class="mono" :title="latestLetter.pdfSha256">pdf sha256 {{ latestLetter.pdfSha256.slice(0, 10) }}…</span>
                  <a :href="`/api/cases/${c.id}/letters/${latestLetter.id}/pdf`" target="_blank" rel="noopener" class="btn btn-secondary btn-sm ml-auto"><Icon name="lucide:file-down" class="size-3.5" /> Preview PDF</a>
                </div>
                <p v-if="letterLocked" class="text-xs rounded-md bg-aurum-500/10 px-3 py-2 mb-3">This letter is in an approval or mailing flow and is locked. Reject or revoke the approval to edit it.</p>
                <div class="grid gap-3 sm:grid-cols-2 text-xs mb-3">
                  <div class="rounded-md bg-surface-2 p-3"><p class="eyebrow mb-1">Recipient</p><p class="font-medium">{{ latestLetter.recipient.name }}</p><p>{{ latestLetter.recipient.line1 }}<br v-if="latestLetter.recipient.line2">{{ latestLetter.recipient.line2 }}<br>{{ latestLetter.recipient.city }}, {{ latestLetter.recipient.state }} {{ latestLetter.recipient.postalCode }}</p></div>
                  <div class="rounded-md bg-surface-2 p-3"><p class="eyebrow mb-1">Sender (you)</p><p class="font-medium">{{ latestLetter.sender.name || '—' }}</p><p>{{ latestLetter.sender.line1 || 'Set your return address in Settings' }}<br>{{ latestLetter.sender.city }}<template v-if="latestLetter.sender.state">, {{ latestLetter.sender.state }} {{ latestLetter.sender.postalCode }}</template></p></div>
                </div>
                <label class="label" for="l-subject">Subject</label>
                <input id="l-subject" v-model="letterDraft.subject" class="input mb-3" :disabled="letterLocked" @input="letterDirty = true">
                <label class="label" for="l-body">Body</label>
                <textarea id="l-body" v-model="letterDraft.body" class="textarea min-h-[28rem] font-[family-name:var(--font-sans)] text-sm leading-relaxed" :disabled="letterLocked" @input="letterDirty = true" />
                <label class="label mt-3" for="l-enc">Enclosures (one per line)</label>
                <textarea id="l-enc" v-model="letterDraft.enclosures" class="textarea min-h-16 text-sm" :disabled="letterLocked" @input="letterDirty = true" />
                <div class="mt-3 flex items-center justify-end gap-2">
                  <span v-if="letterDirty" class="text-xs text-fg-3 mr-auto">Unsaved changes</span>
                  <button class="btn btn-primary btn-sm" :disabled="!letterDirty || letterLocked || busy === 'letter'" @click="saveLetter"><Icon v-if="busy === 'letter'" name="lucide:loader-2" class="size-3.5 animate-spin" /> Save letter</button>
                </div>
                <details v-if="data.letters.length > 1" class="mt-4 text-xs"><summary class="cursor-pointer text-fg-2">{{ data.letters.length - 1 }} earlier version{{ data.letters.length > 2 ? 's' : '' }}</summary>
                  <ul class="mt-2 space-y-1"><li v-for="l in data.letters.slice(1)" :key="l.id" class="flex items-center gap-2"><span class="pill bg-surface-3">v{{ l.version }}</span><span class="truncate">{{ l.subject }}</span><span class="text-fg-3 ml-auto">{{ fmtDate(l.createdAt) }}</span><a :href="`/api/cases/${c.id}/letters/${l.id}/pdf`" target="_blank" rel="noopener" class="text-accent hover:underline">PDF</a></li></ul>
                </details>
              </template>
              <EmptyState v-else compact icon="lucide:file-text" title="No letter drafted" description="A letter is drafted when the council decides to proceed." />
            </div>
          </div>
        </div>

        <!-- RIGHT: plan, scenarios, correspondence -->
        <div class="space-y-6 xl:col-span-3">
          <section class="card">
            <div class="px-4 py-3 border-b border-border flex items-center justify-between"><h2 class="font-semibold text-sm">Plan</h2><span v-if="activePlan" class="pill bg-surface-3 text-fg-2">v{{ activePlan.version }} · {{ activePlan.status }}</span></div>
            <div v-if="activePlan" class="px-4 py-3 text-sm space-y-3">
              <div><p class="eyebrow">Channel</p><p class="font-medium mt-0.5">{{ REMEDY_CHANNEL_LABEL[activePlan.strategy.channel] ?? titleize(activePlan.strategy.channel) }}</p><p class="text-xs text-fg-3">to {{ activePlan.strategy.recipients.join(', ') || activePlan.strategy.recipientType }}</p></div>
              <div><p class="eyebrow">Approach</p><p class="mt-0.5 text-fg-2">{{ activePlan.strategy.approach }}</p></div>
              <div><p class="eyebrow">Requested outcome</p><p class="mt-0.5">{{ activePlan.strategy.requestedOutcome }}</p></div>
              <div class="grid grid-cols-2 gap-2 text-xs">
                <div class="rounded-md bg-fern-500/10 p-2"><p class="font-semibold text-fern-600 dark:text-fern-300 mb-1">Pros</p><ul class="space-y-0.5"><li v-for="p in activePlan.strategy.pros" :key="p">· {{ p }}</li></ul></div>
                <div class="rounded-md bg-garnet-500/10 p-2"><p class="font-semibold text-garnet-600 dark:text-garnet-300 mb-1">Cons / risks</p><ul class="space-y-0.5"><li v-for="p in [...activePlan.strategy.cons, ...activePlan.strategy.risks]" :key="p">· {{ p }}</li></ul></div>
              </div>
              <div v-if="activePlan.strategy.proofRequirements.length"><p class="eyebrow">Proof requirements</p><ul class="mt-1 text-xs space-y-0.5"><li v-for="p in activePlan.strategy.proofRequirements" :key="p">· {{ p }}</li></ul></div>
              <p class="text-xs text-fg-3">Timeline {{ activePlan.strategy.estimatedTimeline }} · {{ activePlan.strategy.requiresUserApproval ? 'requires your approval before any send' : 'no external action' }}</p>
              <div v-if="Object.keys(c.estimatedDates).length" class="text-xs border-t border-border pt-2"><p class="eyebrow mb-1">Estimated dates</p><ul class="space-y-0.5"><li v-for="(v, k) in c.estimatedDates" :key="k" class="flex justify-between"><span class="text-fg-2">{{ titleize(String(k)) }}</span><span class="num">{{ fmtDate(v) }}</span></li></ul></div>
            </div>
            <p v-else class="px-4 py-3 text-sm text-fg-3">No plan yet. The council produces one when it convenes.</p>
          </section>

          <section v-if="activePlan?.scenarios.length" class="card">
            <div class="px-4 py-3 border-b border-border"><h2 class="font-semibold text-sm">Response scenarios</h2><p class="text-[11px] text-fg-3 mt-0.5"><Icon name="lucide:info" class="size-3 inline" /> Illustrative only — not predictions. Each branch shows what evidence would matter and the next recommended step.</p></div>
            <ul class="divide-y divide-border">
              <li v-for="s in activePlan.scenarios" :key="s.key">
                <button class="w-full px-4 py-2.5 text-left flex items-center gap-2 hover:bg-surface-2" :aria-expanded="openScenario === s.key" @click="openScenario = openScenario === s.key ? null : s.key">
                  <span class="pill !py-0" :class="scenarioTone[s.key] ?? TONE_CLASS.neutral">{{ RESPONSE_CATEGORY_LABEL[s.key as ResponseCategory] ?? titleize(s.key) }}</span>
                  <span class="text-xs text-fg-3 ml-auto">→ {{ caseStatusLabel(s.statusImpact) }}</span>
                  <Icon :name="openScenario === s.key ? 'lucide:chevron-up' : 'lucide:chevron-down'" class="size-3.5 text-fg-3" />
                </button>
                <div v-if="openScenario === s.key" class="px-4 pb-3 text-xs space-y-2">
                  <p class="text-fg-2">{{ s.whyPlausible }}</p>
                  <div><p class="eyebrow">Evidence that would matter</p><ul class="mt-0.5 space-y-0.5"><li v-for="e in s.evidenceThatMatters" :key="e">· {{ e }}</li></ul></div>
                  <div><p class="eyebrow">Recommended next step</p><p class="mt-0.5">{{ s.recommendedNextStep }} <span v-if="s.requiresApproval" class="text-fg-3">(requires your approval)</span></p></div>
                </div>
              </li>
            </ul>
          </section>

          <section class="card">
            <div class="px-4 py-3 border-b border-border"><h2 class="font-semibold text-sm">Correspondence</h2></div>
            <div class="divide-y divide-border text-sm">
              <div v-for="o in data.mailOrders" :key="o.id" class="px-4 py-3">
                <div class="flex items-center gap-2 flex-wrap"><Icon name="lucide:send" class="size-3.5 text-fg-3" /><StatusPill kind="outbound" :status="o.status" /><ModeBadge :mode="o.mode" /><span class="text-xs text-fg-3 ml-auto">{{ titleize(o.provider) }}</span></div>
                <p class="text-xs text-fg-2 mt-1">{{ titleize(o.mailClass) }} to {{ o.recipient.name }}<span v-if="o.trackingNumber"> · tracking <span class="mono">{{ o.trackingNumber }}</span></span><span v-if="o.costActualCents ?? o.costEstimateCents"> · {{ money(o.costActualCents ?? o.costEstimateCents, { cents: true }) }}</span></p>
                <p class="text-xs text-fg-3 mt-0.5"><span v-if="o.mailedAt">Mailed {{ fmtDate(o.mailedAt) }}</span><span v-else-if="o.submittedAt">Submitted {{ fmtDate(o.submittedAt) }}</span><span v-else>Created {{ fmtDate(o.createdAt) }}</span><span v-if="o.expectedDeliveryDate"> · expected {{ fmtDate(o.expectedDeliveryDate) }}</span></p>
                <p v-if="o.lastError" class="text-xs text-garnet-500 mt-1">{{ o.lastError }}</p>
                <NuxtLink to="/mailroom?tab=outbound" class="text-xs text-accent hover:underline">{{ o.events.length }} provider event{{ o.events.length === 1 ? '' : 's' }}</NuxtLink>
              </div>
              <div v-for="m in data.inboundMail" :key="m.id" class="px-4 py-3">
                <div class="flex items-center gap-2 flex-wrap"><Icon name="lucide:mail-open" class="size-3.5 text-fg-3" /><StatusPill kind="inbound" :status="m.status" /><span class="text-xs text-fg-3 ml-auto">{{ fmtDate(m.receivedAt) }}</span></div>
                <p class="text-xs text-fg-2 mt-1">From {{ m.senderName ?? 'unknown sender' }} · matched by {{ titleize(m.matchMethod ?? 'manual') }} ({{ pct(m.matchConfidence) }})</p>
                <template v-for="a in data.responseAnalyses.filter(x => x.inboundMailId === m.id)" :key="a.id">
                  <div class="mt-2 rounded-md bg-surface-2 p-2 text-xs">
                    <div class="flex items-center gap-2"><span class="pill !py-0" :class="scenarioTone[a.category] ?? TONE_CLASS.neutral">{{ RESPONSE_CATEGORY_LABEL[a.category] }}</span><span v-if="a.matchedScenarioKey" class="text-fg-3">matched scenario</span></div>
                    <p class="mt-1">{{ a.summary }}</p>
                    <p class="mt-1 text-fg-2"><span class="font-medium">Next:</span> {{ a.recommendedNextAction }}<span v-if="a.requiresApproval" class="text-fg-3"> (needs approval)</span></p>
                  </div>
                </template>
                <NuxtLink :to="`/mailroom?tab=inbox&open=${m.id}`" class="text-xs text-accent hover:underline">Open in mailroom</NuxtLink>
              </div>
              <p v-if="!data.mailOrders.length && !data.inboundMail.length" class="px-4 py-6 text-xs text-fg-3 text-center">Nothing sent or received yet.</p>
            </div>
          </section>

          <section v-if="data.approvals.length" class="card">
            <div class="px-4 py-3 border-b border-border"><h2 class="font-semibold text-sm">Approvals</h2></div>
            <ul class="divide-y divide-border text-sm">
              <li v-for="a in data.approvals" :key="a.id" class="px-4 py-2.5 flex items-center gap-2">
                <span class="pill" :class="a.status === 'approved' ? TONE_CLASS.success : a.status === 'pending' ? TONE_CLASS.warning : TONE_CLASS.neutral">{{ a.status }}</span>
                <span class="truncate text-xs">{{ a.bundle.title }}</span>
                <NuxtLink :to="`/approvals?focus=${a.id}`" class="text-xs text-accent hover:underline ml-auto">View</NuxtLink>
              </li>
            </ul>
          </section>

          <section class="card">
            <div class="px-4 py-3 border-b border-border flex items-center justify-between"><h2 class="font-semibold text-sm">Linked cases</h2><button class="btn btn-ghost btn-sm" @click="linkOpen = true"><Icon name="lucide:link" class="size-3.5" /> Link</button></div>
            <ul class="divide-y divide-border text-sm">
              <li v-for="l in data.linkedCases" :key="l.id" class="px-4 py-2.5 flex items-center gap-2"><NuxtLink :to="`/cases/${l.id}`" class="mono text-xs hover:underline">{{ l.code }}</NuxtLink><span class="truncate text-xs">{{ l.title }}</span><StatusPill kind="case" :status="l.status" class="ml-auto" /></li>
              <li v-if="!data.linkedCases.length" class="px-4 py-4 text-xs text-fg-3 text-center">No linked cases.</li>
            </ul>
          </section>
        </div>
      </div>
    </template>

    <!-- Modals -->
    <AppModal :open="transitionOpen" title="Change case status" description="Only transitions allowed by the case state machine are offered. Every change is recorded with your identity and a timestamp." @close="transitionOpen = false">
      <div class="space-y-3">
        <div class="grid gap-2 sm:grid-cols-2">
          <button v-for="s in availableTransitions" :key="s" type="button" class="rounded-md border px-3 py-2 text-left text-sm" :class="transitionTo === s ? 'border-accent bg-accent/10' : 'border-border hover:bg-surface-2'" @click="transitionTo = s"><StatusPill kind="case" :status="s" /></button>
        </div>
        <div><label class="label" for="t-note">Note (optional)</label><textarea id="t-note" v-model="transitionNote" class="textarea min-h-20" /></div>
      </div>
      <template #footer>
        <button class="btn btn-ghost" @click="transitionOpen = false">Cancel</button>
        <button class="btn btn-primary" :disabled="!transitionTo || busy === 'transition'" @click="transition">Apply</button>
      </template>
    </AppModal>

    <AppModal :open="evidenceOpen" title="Add evidence" description="Documents are scanned by content signature before storage. Your statement is accepted as low-credibility evidence until documents back it." size="lg" @close="evidenceOpen = false">
      <div class="space-y-4">
        <div class="flex gap-2">
          <button type="button" class="btn btn-sm" :class="evKind === 'document' ? 'btn-primary' : 'btn-secondary'" @click="evKind = 'document'">Document</button>
          <button type="button" class="btn btn-sm" :class="evKind === 'statement' ? 'btn-primary' : 'btn-secondary'" @click="evKind = 'statement'">Written statement</button>
        </div>
        <template v-if="evKind === 'document'">
          <FileDrop v-model="evFile" />
          <div class="grid gap-3 sm:grid-cols-2">
            <div><label class="label" for="ev-title">Title (optional)</label><input id="ev-title" v-model="evTitle" class="input" placeholder="Bank statement March 2025"></div>
            <div><label class="label" for="ev-cred">Credibility</label><select id="ev-cred" v-model="evCredibility" class="input"><option value="high">High — issued by a bank, court or agency</option><option value="medium">Medium — statement, receipt, screenshot</option><option value="low">Low — self-authored or unverifiable</option></select></div>
          </div>
        </template>
        <div><label class="label" for="ev-desc">{{ evKind === 'document' ? 'What does this document show?' : 'Your statement' }}</label><textarea id="ev-desc" v-model="evDescription" class="textarea min-h-24" :placeholder="evKind === 'document' ? 'Statement shows the March payment posted on 03/02, four days before the due date.' : 'In my own words…'" /></div>
      </div>
      <template #footer>
        <button class="btn btn-ghost" @click="evidenceOpen = false">Cancel</button>
        <button class="btn btn-primary" :disabled="busy === 'evidence' || evDescription.length < 5 || (evKind === 'document' && !evFile)" @click="addEvidence"><Icon v-if="busy === 'evidence'" name="lucide:loader-2" class="size-4 animate-spin" /> Add evidence</button>
      </template>
    </AppModal>

    <AppModal :open="approvalOpen" title="Request approval to mail" description="This prepares an approval bundle (letter PDF, exhibits, recipient, provider, cost). Nothing is sent until you approve the bundle on the Approvals page." @close="approvalOpen = false">
      <div class="space-y-3 text-sm">
        <div><label class="label" for="mc">Mail class</label><select id="mc" v-model="mailClass" class="input"><option value="first_class">First class</option><option value="certified">Certified (if provider supports)</option><option value="standard">Standard</option></select></div>
        <p class="text-xs text-fg-3">Letter v{{ latestLetter?.version }} will be rendered to PDF and hashed. The approval screen shows the exact hash you are approving.</p>
      </div>
      <template #footer>
        <button class="btn btn-ghost" @click="approvalOpen = false">Cancel</button>
        <button class="btn btn-primary" :disabled="busy === 'approval'" @click="requestApproval"><Icon v-if="busy === 'approval'" name="lucide:loader-2" class="size-4 animate-spin" /> Prepare bundle</button>
      </template>
    </AppModal>

    <AppModal :open="linkOpen" title="Link or merge cases" description="Link related cases (e.g. the same account across bureaus) or merge this case into another to avoid duplicate disputes." @close="linkOpen = false">
      <div class="space-y-3">
        <div><label class="label" for="lk-code">Other case code</label><input id="lk-code" v-model="linkCode" class="input mono" list="case-codes" placeholder="CR-0003"><datalist id="case-codes"><option v-for="x in (allCases?.cases ?? []).filter(x => x.id !== c?.id)" :key="x.id" :value="x.code">{{ x.title }}</option></datalist></div>
        <div class="flex gap-2"><button type="button" class="btn btn-sm" :class="linkAction === 'link' ? 'btn-primary' : 'btn-secondary'" @click="linkAction = 'link'">Link</button><button type="button" class="btn btn-sm" :class="linkAction === 'merge_into' ? 'btn-primary' : 'btn-secondary'" @click="linkAction = 'merge_into'">Merge this case into it</button></div>
        <p v-if="linkAction === 'merge_into'" class="text-xs text-aurum-600 dark:text-aurum-300">Merging marks this case as a duplicate and moves its evidence references. This cannot be undone.</p>
      </div>
      <template #footer>
        <button class="btn btn-ghost" @click="linkOpen = false">Cancel</button>
        <button class="btn btn-primary" :disabled="!linkCode || busy === 'link'" @click="doLink">{{ linkAction === 'link' ? 'Link' : 'Merge' }}</button>
      </template>
    </AppModal>
  </div>
</template>
