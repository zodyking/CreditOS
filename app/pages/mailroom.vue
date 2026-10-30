<script setup lang="ts">
import { RESPONSE_CATEGORY_LABEL, type ResponseCategory } from '#shared/constants'
import { OUTBOUND_TRANSITIONS, type OutboundStatus } from '#shared/state-machines'
import type { InternalApi } from 'nitropack/types'
import { TONE_CLASS, bytes, fmtDate, money, outboundStatusLabel, pct, relTime, titleize } from '~/utils/format'

useHead({ title: 'Mailroom' })
const route = useRoute()
const router = useRouter()
const toast = useToast()

type Tab = 'inbox' | 'unassigned' | 'outbound' | 'upload' | 'providers'
const tab = ref<Tab>((['inbox', 'unassigned', 'outbound', 'upload', 'providers'].includes(String(route.query.tab)) ? String(route.query.tab) : 'inbox') as Tab)
watch(tab, t => router.replace({ query: { ...route.query, tab: t, open: undefined } }))

const [{ data: inbound, refresh: refreshInbound }, { data: outbound, refresh: refreshOutbound }] = await Promise.all([
  useFetch('/api/mail/inbound', { key: 'mail-inbound' }),
  useFetch('/api/mail/outbound', { key: 'mail-outbound' }),
])
const { on } = useLiveEvents()
onMounted(() =>
  on(() => {
    refreshInbound()
    refreshOutbound()
  }, ['mail.status', 'inbound.status', 'case.status']),
)

const unassigned = computed(() => (inbound.value?.items ?? []).filter(i => i.status === 'UNASSIGNED'))
const inboxItems = computed(() => (inbound.value?.items ?? []).filter(i => i.status !== 'UNASSIGNED'))
const unreadCount = computed(() => (inbound.value?.items ?? []).filter(i => i.unread).length)

// Inbound detail
const openId = ref<string | null>(route.query.open ? String(route.query.open) : null)
type InboundDetail = InternalApi['/api/mail/inbound/:id']['get']
const { data: detail, refresh: refreshDetail, pending: detailPending } = await useFetch<InboundDetail>(() => `/api/mail/inbound/${openId.value ?? ''}`, { key: 'mail-inbound-detail', immediate: !!openId.value, watch: false, server: false })
watch(openId, async v => {
  if (v) {
    await refreshDetail()
    await refreshInbound()
  }
})
const assignTo = ref('')
const transcript = ref('')
const busy = ref<string | null>(null)
async function assign(caseId: string) {
  if (!openId.value) return
  busy.value = 'assign'
  try {
    await $fetch(`/api/mail/inbound/${openId.value}/assign`, { method: 'POST', body: { caseId } })
    toast.success('Assigned to case', 'The council will re-assess the case with this response.')
    await Promise.all([refreshDetail(), refreshInbound()])
  } catch (e) {
    toast.error('Could not assign', errorMessage(e))
  } finally {
    busy.value = null
  }
}
async function submitTranscript() {
  if (!openId.value) return
  busy.value = 'transcribe'
  try {
    await $fetch(`/api/mail/inbound/${openId.value}/transcribe`, { method: 'POST', body: { text: transcript.value, caseId: assignTo.value || undefined } })
    toast.success('Transcription saved', 'Extraction and matching were re-run on your text.')
    transcript.value = ''
    await Promise.all([refreshDetail(), refreshInbound()])
  } catch (e) {
    toast.error('Could not save', errorMessage(e))
  } finally {
    busy.value = null
  }
}
const { data: openCases } = await useFetch('/api/cases', { key: 'cases-open-mailroom', query: { open: '1' }, lazy: true, server: false })

// Upload
const upFile = ref<File | null>(null)
const upForm = reactive({ senderName: '', caseId: '', receivedAt: '' })
async function upload() {
  if (!upFile.value) return
  busy.value = 'upload'
  try {
    const fd = new FormData()
    fd.append('file', upFile.value)
    if (upForm.senderName) fd.append('senderName', upForm.senderName)
    if (upForm.caseId) fd.append('caseId', upForm.caseId)
    if (upForm.receivedAt) fd.append('receivedAt', upForm.receivedAt)
    const r = await $fetch<{ mail: { id: string; status: string } }>('/api/mail/inbound/upload', { method: 'POST', body: fd })
    toast.success('Letter ingested', `Status: ${titleize(r.mail.status)}`)
    upFile.value = null
    upForm.senderName = ''
    upForm.caseId = ''
    upForm.receivedAt = ''
    await refreshInbound()
    tab.value = r.mail.status === 'UNASSIGNED' ? 'unassigned' : 'inbox'
    openId.value = r.mail.id
  } catch (e) {
    toast.error('Upload rejected', errorMessage(e))
  } finally {
    busy.value = null
  }
}

// Outbound simulate
const simOpen = ref<string | null>(null)
const simStatus = ref<OutboundStatus | null>(null)
const simTracking = ref('')
const simOrder = computed(() => outbound.value?.orders.find(o => o.id === simOpen.value) ?? null)
const simTargetsFor = (status: string) => OUTBOUND_TRANSITIONS[status as OutboundStatus] ?? []
const simTargets = computed(() => (simOrder.value ? simTargetsFor(simOrder.value.status) : []))
async function simulate() {
  if (!simOpen.value || !simStatus.value) return
  busy.value = 'sim'
  try {
    await $fetch(`/api/mail/outbound/${simOpen.value}/simulate`, { method: 'POST', body: { status: simStatus.value, trackingNumber: simTracking.value || undefined } })
    toast.success('Sandbox webhook delivered', `Signed event applied: ${outboundStatusLabel(simStatus.value)}`)
    simOpen.value = null
    simStatus.value = null
    await refreshOutbound()
  } catch (e) {
    toast.error('Simulation failed', errorMessage(e))
  } finally {
    busy.value = null
  }
}
const catTone: Record<string, string> = { corrected: TONE_CLASS.success, deleted: TONE_CLASS.success, partially_updated: TONE_CLASS.info, verified_no_change: TONE_CLASS.warning, more_information_requested: TONE_CLASS.warning, rerouted_other_channel: TONE_CLASS.info, undeliverable: TONE_CLASS.danger, no_response: TONE_CLASS.danger, unclear: TONE_CLASS.neutral }
</script>

<template>
  <div>
    <PageHeader title="Mailroom" eyebrow="Correspondence" description="Everything that leaves or arrives on paper. Outbound letters only move after an explicit approval; inbound letters are extracted, matched to a case by code, sender or account, and routed to the council for reassessment.">
      <template #actions>
        <button class="btn btn-primary" @click="tab = 'upload'"><Icon name="lucide:upload" class="size-4" /> Upload a letter</button>
      </template>
    </PageHeader>

    <div class="border-b border-border mb-6 flex flex-wrap gap-1 overflow-x-auto" role="tablist">
      <button v-for="t in [
        { k: 'inbox', l: 'Inbox', n: unreadCount, i: 'lucide:inbox' },
        { k: 'unassigned', l: 'Unassigned', n: unassigned.length, i: 'lucide:mail-question' },
        { k: 'outbound', l: 'Outbound', n: (outbound?.orders ?? []).filter(o => !['DELIVERY_CONFIRMED', 'CANCELLED', 'FAILED', 'RETURNED'].includes(o.status)).length, i: 'lucide:send' },
        { k: 'upload', l: 'Upload', n: 0, i: 'lucide:upload' },
        { k: 'providers', l: 'Providers', n: 0, i: 'lucide:plug' },
      ]" :key="t.k" role="tab" :aria-selected="tab === t.k" class="tab-underline" @click="tab = t.k as Tab">
        <Icon :name="t.i" class="size-4" /> {{ t.l }} <span v-if="t.n" class="pill !py-0" :class="t.k === 'unassigned' ? TONE_CLASS.warning : TONE_CLASS.info">{{ t.n }}</span>
      </button>
    </div>

    <!-- Inbox / Unassigned -->
    <div v-if="tab === 'inbox' || tab === 'unassigned'" class="grid gap-6 lg:grid-cols-5 items-start">
      <div class="card lg:col-span-2">
        <div class="card-head !py-3">
          <h2>{{ tab === 'inbox' ? 'Inbox' : 'Unassigned letters' }}</h2>
          <span class="text-xs text-fg-3">{{ (tab === 'inbox' ? inboxItems : unassigned).length }} letter{{ (tab === 'inbox' ? inboxItems : unassigned).length === 1 ? '' : 's' }}</span>
        </div>
        <ul class="divide-y divide-border max-h-[70vh] overflow-y-auto scrollbar-thin">
          <li v-for="m in tab === 'inbox' ? inboxItems : unassigned" :key="m.id">
            <button type="button" class="w-full text-left px-4 py-3.5 hover:bg-surface-2 border-l-2 transition-colors" :class="openId === m.id ? 'bg-accent-soft/60 border-accent' : 'border-transparent'" @click="openId = m.id">
              <div class="flex items-center gap-2">
                <span v-if="m.unread" class="size-2 rounded-full bg-accent shrink-0" aria-label="Unread" />
                <p class="font-medium text-sm truncate" :class="m.unread ? '' : 'text-fg-2'">{{ m.senderName ?? m.extraction?.senderGuess ?? 'Unknown sender' }}</p>
                <span class="text-xs text-fg-3 ml-auto shrink-0">{{ relTime(m.receivedAt) }}</span>
              </div>
              <div class="mt-1 flex flex-wrap items-center gap-1.5">
                <StatusPill kind="inbound" :status="m.status" />
                <span v-if="m.case" class="mono text-[11px] text-fg-2">{{ m.case.code }}</span>
                <span v-if="m.analysis" class="pill !py-0" :class="catTone[m.analysis.category]">{{ RESPONSE_CATEGORY_LABEL[m.analysis.category] }}</span>
                <ModeBadge :mode="m.mode" />
              </div>
            </button>
          </li>
          <li v-if="!(tab === 'inbox' ? inboxItems : unassigned).length"><EmptyState compact :icon="tab === 'inbox' ? 'lucide:inbox' : 'lucide:mail-check'" :title="tab === 'inbox' ? 'Inbox is empty' : 'Nothing to triage'" :description="tab === 'inbox' ? 'Upload a scanned letter to get started.' : 'Every letter is matched to a case.'" /></li>
        </ul>
      </div>

      <div class="card lg:col-span-3 min-h-96">
        <EmptyState v-if="!openId" icon="lucide:mail-open" title="Select a letter" description="Extracted text, match candidates and the council's assessment appear here." />
        <div v-else-if="detailPending && !detail" class="skeleton h-64 m-4" />
        <div v-else-if="detail" class="divide-y divide-border">
          <div class="px-5 py-4">
            <div class="flex flex-wrap items-center gap-2">
              <StatusPill kind="inbound" :status="detail.mail.status" />
              <ModeBadge :mode="detail.mail.mode" />
              <span class="text-xs text-fg-3">via {{ titleize(detail.mail.provider) }} · received {{ fmtDate(detail.mail.receivedAt) }}</span>
              <span v-if="detail.document" class="text-xs text-fg-3 ml-auto">{{ detail.document.pageCount ?? '?' }} pp · {{ bytes(detail.document.sizeBytes) }}</span>
            </div>
            <h2 class="font-semibold mt-2">{{ detail.mail.senderName ?? detail.mail.extraction?.senderGuess ?? 'Unknown sender' }}</h2>
            <p v-if="detail.case" class="text-sm text-fg-2 mt-0.5">Matched to <NuxtLink :to="`/cases/${detail.case.id}`" class="text-accent hover:underline"><span class="mono">{{ detail.case.code }}</span> {{ detail.case.title }}</NuxtLink> · {{ titleize(detail.mail.matchMethod ?? 'manual') }} <span class="num">{{ pct(detail.mail.matchConfidence) }}</span></p>
            <div class="mt-2 flex gap-2">
              <a v-if="detail.document" :href="`/api/documents/${detail.document.id}/download?inline=1`" target="_blank" rel="noopener" class="btn btn-secondary btn-sm"><Icon name="lucide:file" class="size-3.5" /> Open scan</a>
            </div>
          </div>

          <div v-if="detail.mail.extraction" class="px-5 py-4 text-sm">
            <p class="eyebrow mb-2">Extraction <span class="normal-case tracking-normal text-fg-3">· {{ detail.mail.extraction.engine }} · confidence {{ pct(detail.mail.extraction.confidence) }}</span></p>
            <dl class="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <div><dt class="text-fg-3">Case codes</dt><dd class="mono">{{ detail.mail.extraction.caseCodes.join(', ') || '—' }}</dd></div>
              <div><dt class="text-fg-3">Account refs</dt><dd class="mono">{{ detail.mail.extraction.accountRefs.join(', ') || '—' }}</dd></div>
              <div><dt class="text-fg-3">Classified as</dt><dd><span v-if="detail.mail.extraction.responseCategory" class="pill !py-0" :class="catTone[detail.mail.extraction.responseCategory]">{{ RESPONSE_CATEGORY_LABEL[detail.mail.extraction.responseCategory as ResponseCategory] }}</span><span v-else>—</span></dd></div>
              <div><dt class="text-fg-3">Dates mentioned</dt><dd>{{ detail.mail.extraction.datesMentioned.join(', ') || '—' }}</dd></div>
            </dl>
            <ul v-if="detail.mail.extraction.warnings.length" class="mt-2 text-xs text-aurum-600 dark:text-aurum-300 space-y-0.5"><li v-for="w in detail.mail.extraction.warnings" :key="w"><Icon name="lucide:triangle-alert" class="size-3 inline" /> {{ w }}</li></ul>
          </div>

          <div v-if="detail.analysis" class="px-5 py-4 text-sm">
            <p class="eyebrow mb-2">Council assessment</p>
            <div class="rounded-md bg-surface-2 p-3">
              <div class="flex items-center gap-2 flex-wrap"><span class="pill" :class="catTone[detail.analysis.category]">{{ RESPONSE_CATEGORY_LABEL[detail.analysis.category] }}</span><span v-if="detail.analysis.matchedScenarioKey" class="text-xs text-fg-3">matched a planned scenario</span></div>
              <p class="mt-2">{{ detail.analysis.summary }}</p>
              <p class="mt-2 text-fg-2"><span class="font-medium text-fg">Recommended next step:</span> {{ detail.analysis.recommendedNextAction }}<span v-if="detail.analysis.requiresApproval" class="text-fg-3"> — requires your approval</span></p>
            </div>
          </div>

          <div v-if="detail.mail.status === 'UNASSIGNED' || !detail.case" class="px-5 py-4 text-sm">
            <p class="eyebrow mb-2">Assign to a case</p>
            <ul v-if="detail.candidates.length" class="space-y-1.5 mb-3">
              <li v-for="cand in detail.candidates" :key="cand.caseId" class="flex items-center gap-2 rounded-md border border-border px-3 py-2">
                <span class="mono text-xs">{{ cand.code }}</span><span class="truncate text-xs flex-1">{{ cand.title }}</span><span class="text-xs text-fg-3">{{ titleize(cand.method) }} · {{ pct(cand.confidence) }}</span>
                <button class="btn btn-primary btn-sm" :disabled="busy === 'assign'" @click="assign(cand.caseId)">Assign</button>
              </li>
            </ul>
            <div class="flex gap-2">
              <select v-model="assignTo" class="input flex-1" aria-label="Choose a case"><option value="">Choose a case…</option><option v-for="c in openCases?.cases ?? []" :key="c.id" :value="c.id">{{ c.code }} · {{ c.title }}</option></select>
              <button class="btn btn-secondary" :disabled="!assignTo || busy === 'assign'" @click="assign(assignTo)">Assign</button>
            </div>
          </div>

          <div class="px-5 py-4 text-sm">
            <details :open="!detail.text">
              <summary class="eyebrow cursor-pointer">Extracted text</summary>
              <pre v-if="detail.text" class="mt-2 whitespace-pre-wrap text-xs mono bg-surface-2 rounded-md p-3 max-h-80 overflow-y-auto scrollbar-thin">{{ detail.text }}</pre>
              <div v-else class="mt-2">
                <p class="text-xs text-fg-3 mb-2">No text layer could be extracted (image scan or empty PDF). Transcribe the letter so it can be classified and matched. OCR is not bundled in this build.</p>
                <textarea v-model="transcript" class="textarea min-h-32 text-sm" placeholder="Type or paste the letter's text…" />
                <div class="mt-2 flex justify-end"><button class="btn btn-primary btn-sm" :disabled="transcript.length < 10 || busy === 'transcribe'" @click="submitTranscript">Save transcription</button></div>
              </div>
            </details>
          </div>
        </div>
      </div>
    </div>

    <!-- Outbound -->
    <div v-else-if="tab === 'outbound'" class="space-y-4">
      <div class="card card-pad flex flex-wrap items-center gap-3 text-sm">
        <Icon name="lucide:plug-zap" class="size-4 text-accent" />
        <p>Active provider <span class="font-medium">{{ outbound?.activeProvider.label }}</span></p>
        <ModeBadge :mode="outbound?.activeProvider.mode" size="sm" />
        <p class="text-xs text-fg-3">{{ outbound?.activeProvider.mode === 'live' ? 'Orders are physically printed and mailed.' : 'Orders are accepted and tracked but nothing is physically mailed. Use "Simulate event" to replay signed webhooks.' }}</p>
      </div>
      <div class="card">
        <div class="overflow-x-auto">
          <table class="table min-w-[900px]">
            <thead><tr><th>Case</th><th>Recipient</th><th>Status</th><th>Provider</th><th>Tracking</th><th>Cost</th><th>Timeline</th><th /></tr></thead>
            <tbody>
              <tr v-for="o in outbound?.orders ?? []" :key="o.id">
                <td><NuxtLink v-if="o.case" :to="`/cases/${o.case.id}`" class="hover:underline"><span class="mono text-xs">{{ o.case.code }}</span><br><span class="text-xs text-fg-2">{{ o.case.title }}</span></NuxtLink></td>
                <td class="text-xs"><p class="font-medium">{{ o.recipient.name }}</p><p class="text-fg-3">{{ o.recipient.city }}, {{ o.recipient.state }} · {{ titleize(o.mailClass) }}</p></td>
                <td><StatusPill kind="outbound" :status="o.status" /><p v-if="o.lastError" class="text-[11px] text-garnet-500 mt-1 max-w-48 truncate" :title="o.lastError">{{ o.lastError }}</p></td>
                <td class="text-xs"><div class="flex items-center gap-1.5">{{ titleize(o.provider) }} <ModeBadge :mode="o.mode" /></div><p v-if="o.providerOrderId" class="mono text-fg-3 truncate max-w-32" :title="o.providerOrderId">{{ o.providerOrderId }}</p></td>
                <td class="text-xs mono">{{ o.trackingNumber ?? (o.trackingSupported ? 'pending' : 'n/a') }}</td>
                <td class="text-xs num">{{ money(o.costActualCents ?? o.costEstimateCents, { cents: true }) }}</td>
                <td class="text-xs text-fg-3 whitespace-nowrap"><p v-if="o.submittedAt">Submitted {{ fmtDate(o.submittedAt, 'short') }}</p><p v-if="o.mailedAt">Mailed {{ fmtDate(o.mailedAt, 'short') }}</p><p v-if="o.deliveredAt">Delivered {{ fmtDate(o.deliveredAt, 'short') }}</p><p v-if="o.expectedDeliveryDate && !o.deliveredAt">Expected {{ fmtDate(o.expectedDeliveryDate, 'short') }}</p><details class="mt-1"><summary class="cursor-pointer text-accent">{{ o.events.length }} events</summary><ul class="mt-1 space-y-0.5"><li v-for="ev in o.events" :key="ev.id" class="flex items-center gap-1"><Icon :name="ev.signatureValid ? 'lucide:shield-check' : 'lucide:shield-alert'" class="size-3" :class="ev.signatureValid ? 'text-fern-500' : 'text-garnet-500'" />{{ ev.toStatus ? outboundStatusLabel(ev.toStatus) : 'event' }} <span v-if="!ev.applied" class="text-fg-3">(duplicate, ignored)</span><span class="ml-auto">{{ fmtDate(ev.receivedAt, 'time') }}</span></li></ul></details></td>
                <td class="text-right"><button v-if="o.provider === 'sandbox' && simTargetsFor(o.status).length" class="btn btn-ghost btn-sm" @click="simOpen = o.id; simStatus = null">Simulate event</button></td>
              </tr>
              <tr v-if="!outbound?.orders.length"><td colspan="8"><EmptyState compact icon="lucide:send" title="No outbound mail" description="Letters appear here after you approve them." /></td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Upload -->
    <div v-else-if="tab === 'upload'" class="grid gap-6 lg:grid-cols-3">
      <div class="card card-pad lg:col-span-2 space-y-4">
        <h2 class="font-semibold">Upload a received letter</h2>
        <FileDrop v-model="upFile" label="Drop the scanned letter here (PDF, JPEG, PNG)" />
        <div class="grid gap-3 sm:grid-cols-3">
          <div><label class="label" for="u-sender">Sender (optional)</label><input id="u-sender" v-model="upForm.senderName" class="input" placeholder="Experian"></div>
          <div><label class="label" for="u-case">Case (optional)</label><select id="u-case" v-model="upForm.caseId" class="input"><option value="">Let CreditOS match</option><option v-for="c in openCases?.cases ?? []" :key="c.id" :value="c.id">{{ c.code }} · {{ c.title }}</option></select></div>
          <div><label class="label" for="u-date">Received on</label><input id="u-date" v-model="upForm.receivedAt" type="date" class="input"></div>
        </div>
        <div class="flex justify-end"><button class="btn btn-primary" :disabled="!upFile || busy === 'upload'" @click="upload"><Icon :name="busy === 'upload' ? 'lucide:loader-2' : 'lucide:upload'" class="size-4" :class="busy === 'upload' && 'animate-spin'" /> Ingest letter</button></div>
      </div>
      <div class="card card-pad text-sm text-fg-2 space-y-2">
        <p class="font-medium text-fg">What happens next</p>
        <ol class="list-decimal pl-4 space-y-1">
          <li>The file is validated by content signature (not extension) and scanned for active PDF content.</li>
          <li>Text is extracted from the PDF text layer; images need a manual transcription.</li>
          <li>Case codes, account references and response language are extracted and classified.</li>
          <li>The letter is matched to a case or placed in Unassigned for you to triage.</li>
          <li>Once matched, the council re-assesses the case with the response as new evidence.</li>
        </ol>
      </div>
    </div>

    <!-- Providers -->
    <div v-else class="grid gap-6 lg:grid-cols-2">
      <div class="card">
        <div class="px-5 py-4 border-b border-border"><h2 class="font-semibold">Outbound providers</h2><p class="text-xs text-fg-3">Set <span class="mono">MAIL_OUTBOUND_PROVIDER</span> and the provider's API key to switch. Live providers only activate when <span class="mono">APP_MODE=live</span>.</p></div>
        <ul class="divide-y divide-border">
          <li v-for="p in outbound?.providers ?? []" :key="p.slug" class="px-5 py-4 text-sm">
            <div class="flex items-center gap-2 flex-wrap"><p class="font-medium">{{ p.label }}</p><ModeBadge :mode="p.mode" /><span v-if="p.active" class="pill" :class="TONE_CLASS.live">active</span><span class="pill" :class="p.configured ? TONE_CLASS.success : TONE_CLASS.neutral">{{ p.configured ? 'configured' : 'not configured' }}</span></div>
            <div class="mt-2 flex flex-wrap gap-1.5 text-[11px]"><span v-for="(v, k) in p.implemented" :key="k" class="pill !py-0" :class="v ? TONE_CLASS.success : TONE_CLASS.neutral">{{ titleize(String(k)) }}: {{ v ? 'implemented' : 'missing' }}</span></div>
            <div class="mt-1.5 flex flex-wrap gap-1.5 text-[11px]"><span v-for="(v, k) in p.capabilities" :key="k" class="pill !py-0 bg-surface-3">{{ titleize(String(k)) }}: {{ typeof v === 'boolean' ? (v ? 'yes' : 'no') : v }}</span></div>
            <p class="text-xs text-fg-3 mt-2">{{ p.configurationHelp }}</p>
          </li>
        </ul>
      </div>
      <div class="card">
        <div class="px-5 py-4 border-b border-border"><h2 class="font-semibold">Inbound providers</h2><p class="text-xs text-fg-3">Manual upload is always available. Virtual-mailbox connectors are scaffolds until API access is confirmed.</p></div>
        <ul class="divide-y divide-border">
          <li v-for="p in inbound?.providers ?? []" :key="p.slug" class="px-5 py-4 text-sm">
            <div class="flex items-center gap-2 flex-wrap"><p class="font-medium">{{ p.label }}</p><ModeBadge :mode="p.mode" /><span v-if="inbound?.activeProvider.slug === p.slug" class="pill" :class="TONE_CLASS.live">active</span><span class="pill" :class="p.configured ? TONE_CLASS.success : TONE_CLASS.neutral">{{ p.configured ? 'configured' : 'not configured' }}</span></div>
            <div class="mt-2 flex flex-wrap gap-1.5 text-[11px]"><span v-for="(v, k) in p.implemented" :key="k" class="pill !py-0" :class="v ? TONE_CLASS.success : TONE_CLASS.neutral">{{ titleize(String(k)) }}: {{ v ? 'implemented' : 'missing' }}</span></div>
            <p class="text-xs text-fg-3 mt-2">{{ p.configurationHelp }}</p>
            <p class="text-xs text-fg-2 mt-1">{{ p.notes }}</p>
          </li>
        </ul>
      </div>
    </div>

    <AppModal :open="!!simOpen" title="Simulate a provider event" description="Builds a webhook payload, signs it with the sandbox secret and posts it through the same verification path a real provider would use. Replays of the same event id are ignored." @close="simOpen = null">
      <div v-if="simOrder" class="space-y-3">
        <p class="text-sm">Order currently <StatusPill kind="outbound" :status="simOrder.status" /></p>
        <div class="grid gap-2 sm:grid-cols-2"><button v-for="s in simTargets" :key="s" type="button" class="rounded-md border px-3 py-2 text-left" :class="simStatus === s ? 'border-accent bg-accent/10' : 'border-border hover:bg-surface-2'" @click="simStatus = s"><StatusPill kind="outbound" :status="s" /></button></div>
        <div><label class="label" for="sim-track">Tracking number (optional)</label><input id="sim-track" v-model="simTracking" class="input mono" placeholder="9400 1000 0000 0000 0000 00"></div>
      </div>
      <template #footer>
        <button class="btn btn-ghost" @click="simOpen = null">Cancel</button>
        <button class="btn btn-primary" :disabled="!simStatus || busy === 'sim'" @click="simulate">Send signed webhook</button>
      </template>
    </AppModal>
  </div>
</template>