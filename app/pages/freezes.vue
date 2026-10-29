<script setup lang="ts">
import { FREEZE_AGENCY_CATEGORY_LABEL, type FreezeAgencyCategory } from '#shared/constants'
import { FREEZE_TRANSITIONS, FREEZE_EVIDENCE_REQUIRED, type FreezeStatus } from '#shared/state-machines'
import { TONE_CLASS, fmtDate, freezeStatusLabel, relTime, titleize } from '~/utils/format'

useHead({ title: 'Freeze center' })
const toast = useToast()
const { data, refresh, pending } = await useFetch('/api/freezes', { key: 'freezes' })
const { on } = useLiveEvents()
onMounted(() => on(() => refresh(), ['freeze.status']))

type Row = NonNullable<typeof data.value>['matrix'][number]
const grouped = computed(() => {
  const out = new Map<string, Row[]>()
  for (const r of data.value?.matrix ?? []) {
    const k = r.agency.category
    if (!out.has(k)) out.set(k, [])
    out.get(k)!.push(r)
  }
  return [...out.entries()]
})
const summary = computed(() => {
  const m = data.value?.matrix ?? []
  return {
    frozen: m.filter(r => r.effectiveStatus === 'CONFIRMED_FROZEN').length,
    pending: m.filter(r => ['REQUEST_PREPARED', 'SUBMITTED', 'PENDING_VERIFICATION', 'LIFT_REQUESTED', 'ACTION_REQUIRED'].includes(r.effectiveStatus)).length,
    unknown: m.filter(r => ['UNKNOWN', 'NOT_STARTED'].includes(r.effectiveStatus)).length,
    total: m.length,
  }
})

const selected = ref<Row | null>(null)
watch(data, d => {
  if (selected.value) selected.value = d?.matrix.find(r => r.agency.slug === selected.value!.agency.slug) ?? null
})

// Start a request
const startOpen = ref(false)
const startForm = reactive({ action: 'freeze' as 'freeze' | 'lift_temporary' | 'lift_permanent', method: 'online' as 'online' | 'phone' | 'mail', liftStartAt: '', liftEndAt: '', notes: '' })
const busy = ref(false)
async function start() {
  if (!selected.value) return
  busy.value = true
  try {
    await $fetch('/api/freezes/requests', {
      method: 'POST',
      body: { agencySlug: selected.value.agency.slug, action: startForm.action, method: startForm.method, liftStartAt: startForm.liftStartAt || undefined, liftEndAt: startForm.liftEndAt || undefined, notes: startForm.notes || undefined },
    })
    toast.success('Request recorded', 'Submit it to the agency yourself, then record the outcome here.')
    startOpen.value = false
    await refresh()
  } catch (e) {
    toast.error('Could not start request', errorMessage(e))
  } finally {
    busy.value = false
  }
}

// Transition
const transOpen = ref(false)
const transTo = ref<FreezeStatus | null>(null)
const transForm = reactive({ note: '', requestRef: '', confirmationRef: '' })
const transFile = ref<File | null>(null)
const currentTransitions = computed(() => (selected.value?.current ? FREEZE_TRANSITIONS[selected.value.current.status] : []))
const needsEvidence = computed(() => !!transTo.value && FREEZE_EVIDENCE_REQUIRED.includes(transTo.value))
async function applyTransition() {
  if (!selected.value?.current || !transTo.value) return
  busy.value = true
  try {
    const fd = new FormData()
    fd.append('to', transTo.value)
    if (transForm.note) fd.append('note', transForm.note)
    if (transForm.requestRef) fd.append('requestRef', transForm.requestRef)
    if (transForm.confirmationRef) fd.append('confirmationRef', transForm.confirmationRef)
    if (transFile.value) fd.append('file', transFile.value)
    await $fetch(`/api/freezes/requests/${selected.value.current.id}/transition`, { method: 'POST', body: fd })
    toast.success(`Marked ${freezeStatusLabel(transTo.value)}`)
    transOpen.value = false
    transTo.value = null
    transForm.note = ''
    transForm.requestRef = ''
    transForm.confirmationRef = ''
    transFile.value = null
    await refresh()
  } catch (e) {
    toast.error('Transition refused', errorMessage(e))
  } finally {
    busy.value = false
  }
}
const canStart = computed(() => !selected.value?.current || ['NOT_STARTED', 'CONFIRMED_UNFROZEN', 'REJECTED', 'FAILED', 'UNKNOWN'].includes(selected.value.current.status))
const canLift = computed(() => selected.value?.current?.status === 'CONFIRMED_FROZEN')
const statusIcon: Record<string, string> = { CONFIRMED_FROZEN: 'lucide:snowflake', CONFIRMED_UNFROZEN: 'lucide:sun', UNKNOWN: 'lucide:circle-help', NOT_STARTED: 'lucide:circle-dashed', REJECTED: 'lucide:circle-x', FAILED: 'lucide:circle-x' }
</script>

<template>
  <div>
    <PageHeader title="Freeze center" eyebrow="Security freezes & specialty agencies" description="Track freezes across the three nationwide bureaus and six specialty agencies. A freeze is only shown as confirmed when you have uploaded the agency's confirmation; everything else is labelled for exactly what it is.">
      <template #meta>
        <div class="mt-3 flex flex-wrap gap-2 text-xs">
          <span class="pill" :class="TONE_CLASS.success"><Icon name="lucide:snowflake" class="size-3" /> {{ summary.frozen }} confirmed frozen</span>
          <span class="pill" :class="TONE_CLASS.warning">{{ summary.pending }} in progress</span>
          <span class="pill" :class="TONE_CLASS.neutral">{{ summary.unknown }} unknown / not started</span>
        </div>
      </template>
    </PageHeader>

    <div v-if="pending && !data" class="skeleton h-64" />
    <template v-else-if="data">
      <div class="card card-pad mb-6 text-sm flex gap-3 items-start">
        <Icon name="lucide:info" class="size-4 text-accent mt-0.5 shrink-0" />
        <p class="text-fg-2">No agency in this list offers a public API for consumer freezes. CreditOS prepares the request, keeps the record and the proof, and tells you exactly where you are. It never claims a freeze is in place without a confirmation reference or document from the agency.</p>
      </div>

      <section v-for="[cat, rows] in grouped" :key="cat" class="mb-6">
        <h2 class="eyebrow mb-2">{{ FREEZE_AGENCY_CATEGORY_LABEL[cat as FreezeAgencyCategory] ?? titleize(cat) }}</h2>
        <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <button v-for="r in rows" :key="r.agency.slug" type="button" class="card card-pad text-left hover:border-border-strong transition-colors" :class="r.effectiveStatus === 'CONFIRMED_FROZEN' ? 'border-fern-500/40' : ''" @click="selected = r">
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <p class="font-semibold">{{ r.agency.name }}</p>
                <p class="text-xs text-fg-3 line-clamp-2 mt-0.5">{{ r.agency.description }}</p>
              </div>
              <Icon :name="statusIcon[r.effectiveStatus] ?? 'lucide:clock'" class="size-5 shrink-0" :class="r.effectiveStatus === 'CONFIRMED_FROZEN' ? 'text-fern-500' : ['UNKNOWN', 'NOT_STARTED'].includes(r.effectiveStatus) ? 'text-fg-3' : 'text-aurum-500'" />
            </div>
            <div class="mt-3 flex items-center gap-2 flex-wrap">
              <StatusPill kind="freeze" :status="r.effectiveStatus" />
              <ModeBadge v-if="r.current" :mode="r.current.mode" />
              <span v-if="r.current" class="text-xs text-fg-3 ml-auto">{{ relTime(r.current.updatedAt) }}</span>
            </div>
            <p v-if="r.current?.confirmationRef" class="text-xs text-fg-3 mt-2 mono">conf. {{ r.current.confirmationRef }}</p>
            <p v-else-if="r.current?.status === 'PENDING_VERIFICATION'" class="text-xs text-aurum-600 dark:text-aurum-300 mt-2">Awaiting your confirmation upload</p>
          </button>
        </div>
      </section>
    </template>

    <!-- Agency drawer -->
    <AppModal :open="!!selected" :title="selected?.agency.name ?? ''" :description="selected?.agency.description" size="xl" @close="selected = null">
      <div v-if="selected" class="grid gap-6 md:grid-cols-5">
        <div class="md:col-span-2 space-y-4 text-sm">
          <div>
            <p class="eyebrow mb-1">Current state</p>
            <div class="flex items-center gap-2"><StatusPill kind="freeze" :status="selected.effectiveStatus" /><ModeBadge v-if="selected.current" :mode="selected.current.mode" /></div>
            <p v-if="selected.current" class="text-xs text-fg-3 mt-1">{{ titleize(selected.current.action) }} via {{ selected.current.requestMethod ?? '—' }}<span v-if="selected.current.requestRef"> · ref <span class="mono">{{ selected.current.requestRef }}</span></span><span v-if="selected.current.submittedAt"> · submitted {{ fmtDate(selected.current.submittedAt) }}</span><span v-if="selected.current.confirmedAt"> · confirmed {{ fmtDate(selected.current.confirmedAt) }}</span></p>
            <p v-if="selected.current?.lastError" class="text-xs text-garnet-500 mt-1">{{ selected.current.lastError }}</p>
            <a v-if="selected.current?.confirmationDocumentId" :href="`/api/documents/${selected.current.confirmationDocumentId}/download?inline=1`" target="_blank" rel="noopener" class="inline-flex items-center gap-1 text-xs text-accent hover:underline mt-1"><Icon name="lucide:file-check" class="size-3" /> Confirmation document</a>
          </div>
          <div>
            <p class="eyebrow mb-1">How to request</p>
            <ul class="space-y-1 text-xs">
              <li v-if="selected.agency.portalUrl" class="flex items-center gap-1.5"><Icon name="lucide:globe" class="size-3.5 text-fg-3" /><a :href="selected.agency.portalUrl" target="_blank" rel="noopener" class="text-accent hover:underline truncate">{{ selected.agency.portalUrl }}</a></li>
              <li v-if="selected.agency.phone" class="flex items-center gap-1.5"><Icon name="lucide:phone" class="size-3.5 text-fg-3" /> {{ selected.agency.phone }}</li>
              <li v-if="selected.agency.mailAddress" class="flex items-start gap-1.5"><Icon name="lucide:mail" class="size-3.5 text-fg-3 mt-0.5" /><span>{{ selected.agency.mailAddress.name }}, {{ selected.agency.mailAddress.line1 }}, {{ selected.agency.mailAddress.city }}, {{ selected.agency.mailAddress.state }} {{ selected.agency.mailAddress.postalCode }}</span></li>
              <li class="text-fg-3">Methods: {{ selected.agency.requestMethods.join(', ') || 'see agency' }} · API: {{ selected.agency.supportsApi ? 'available' : 'none' }}</li>
            </ul>
          </div>
          <div v-if="selected.agency.requiredEvidence.length">
            <p class="eyebrow mb-1">Typically required</p>
            <ul class="text-xs space-y-0.5"><li v-for="e in selected.agency.requiredEvidence" :key="e">· {{ e }}</li></ul>
          </div>
          <p v-if="selected.agency.notes" class="text-xs text-fg-2">{{ selected.agency.notes }}</p>
          <p v-if="selected.agency.lastVerifiedAt" class="text-[11px] text-fg-3">Contact details last verified {{ fmtDate(selected.agency.lastVerifiedAt) }}. Verify before relying on them.</p>
          <div class="flex flex-wrap gap-2 pt-2 border-t border-border">
            <button v-if="canStart" class="btn btn-primary btn-sm" @click="startForm.action = 'freeze'; startOpen = true"><Icon name="lucide:snowflake" class="size-3.5" /> Start freeze request</button>
            <button v-if="canLift" class="btn btn-secondary btn-sm" @click="startForm.action = 'lift_temporary'; startOpen = true"><Icon name="lucide:sun" class="size-3.5" /> Request lift</button>
            <button v-if="selected.current && currentTransitions.length" class="btn btn-secondary btn-sm" @click="transOpen = true"><Icon name="lucide:route" class="size-3.5" /> Record outcome</button>
          </div>
        </div>
        <div class="md:col-span-3">
          <p class="eyebrow mb-2">History</p>
          <ol v-if="selected.history.length" class="relative border-l border-border ml-2 space-y-4">
            <template v-for="h in selected.history" :key="h.id">
              <li v-for="ev in [...h.events].reverse()" :key="ev.id" class="pl-5 relative text-sm">
                <span class="absolute -left-[5px] top-1.5 size-2.5 rounded-full ring-2 ring-surface" :class="ev.toStatus === 'CONFIRMED_FROZEN' ? 'bg-fern-500' : ['REJECTED', 'FAILED'].includes(ev.toStatus) ? 'bg-garnet-500' : 'bg-azure-500'" />
                <div class="flex flex-wrap items-center gap-2 text-xs text-fg-3"><span>{{ fmtDate(ev.occurredAt, 'time') }}</span><span>· {{ titleize(ev.actor) }}</span></div>
                <p class="font-medium mt-0.5"><span v-if="ev.fromStatus" class="text-fg-3 font-normal">{{ freezeStatusLabel(ev.fromStatus) }} → </span>{{ freezeStatusLabel(ev.toStatus) }}</p>
                <p v-if="ev.note" class="text-xs text-fg-2">{{ ev.note }}</p>
                <a v-if="ev.evidenceDocumentId" :href="`/api/documents/${ev.evidenceDocumentId}/download?inline=1`" target="_blank" rel="noopener" class="text-xs text-accent hover:underline">Evidence document</a>
              </li>
            </template>
          </ol>
          <EmptyState v-else compact icon="lucide:circle-dashed" title="No requests yet" description="Start a request to begin tracking." />
        </div>
      </div>
    </AppModal>

    <!-- Start request -->
    <AppModal :open="startOpen" :title="startForm.action === 'freeze' ? 'Start a freeze request' : 'Request a lift'" description="CreditOS records the request and tells you what to do. You submit to the agency; then record the outcome and upload the confirmation." @close="startOpen = false">
      <div class="space-y-3">
        <div v-if="startForm.action !== 'freeze'"><label class="label" for="f-action">Lift type</label><select id="f-action" v-model="startForm.action" class="input"><option value="lift_temporary">Temporary lift (date range)</option><option value="lift_permanent">Permanent removal</option></select></div>
        <div><label class="label" for="f-method">Method</label><select id="f-method" v-model="startForm.method" class="input"><option v-for="m in selected?.agency.requestMethods ?? ['online', 'phone', 'mail']" :key="m" :value="m">{{ titleize(m) }}</option></select></div>
        <div v-if="startForm.action === 'lift_temporary'" class="grid grid-cols-2 gap-3"><div><label class="label" for="f-ls">Lift from</label><input id="f-ls" v-model="startForm.liftStartAt" type="date" class="input"></div><div><label class="label" for="f-le">Lift until</label><input id="f-le" v-model="startForm.liftEndAt" type="date" class="input"></div></div>
        <div><label class="label" for="f-notes">Notes</label><textarea id="f-notes" v-model="startForm.notes" class="textarea min-h-16" /></div>
      </div>
      <template #footer>
        <button class="btn btn-ghost" @click="startOpen = false">Cancel</button>
        <button class="btn btn-primary" :disabled="busy" @click="start">Record request</button>
      </template>
    </AppModal>

    <!-- Transition -->
    <AppModal :open="transOpen" title="Record outcome" description="Only transitions allowed by the freeze state machine are offered. Confirmed states require the agency's confirmation reference or document." size="lg" @close="transOpen = false">
      <div class="space-y-3">
        <div class="grid gap-2 sm:grid-cols-2">
          <button v-for="s in currentTransitions" :key="s" type="button" class="rounded-md border px-3 py-2 text-left" :class="transTo === s ? 'border-accent bg-accent/10' : 'border-border hover:bg-surface-2'" @click="transTo = s"><StatusPill kind="freeze" :status="s" /><span v-if="FREEZE_EVIDENCE_REQUIRED.includes(s)" class="block text-[11px] text-fg-3 mt-1">requires confirmation</span></button>
        </div>
        <div class="grid gap-3 sm:grid-cols-2">
          <div><label class="label" for="t-req">Request / ticket reference</label><input id="t-req" v-model="transForm.requestRef" class="input mono"></div>
          <div><label class="label" for="t-conf">Confirmation reference <span v-if="needsEvidence" class="text-garnet-500">*</span></label><input id="t-conf" v-model="transForm.confirmationRef" class="input mono"></div>
        </div>
        <div><p class="label">Confirmation document <span v-if="needsEvidence" class="text-fg-3 font-normal">(PDF or image from the agency; required if no reference)</span></p><FileDrop v-model="transFile" /></div>
        <div><label class="label" for="t-note">Note</label><textarea id="t-note" v-model="transForm.note" class="textarea min-h-16" /></div>
      </div>
      <template #footer>
        <button class="btn btn-ghost" @click="transOpen = false">Cancel</button>
        <button class="btn btn-primary" :disabled="!transTo || busy || (needsEvidence && !transForm.confirmationRef && !transFile)" @click="applyTransition"><Icon v-if="busy" name="lucide:loader-2" class="size-4 animate-spin" /> Apply</button>
      </template>
    </AppModal>
  </div>
</template>
