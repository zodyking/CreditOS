<script setup lang="ts">
import { TONE_CLASS, fmtDate, money, relTime, titleize } from '~/utils/format'

useHead({ title: 'Approvals' })
const route = useRoute()
const toast = useToast()
const { data, refresh, pending } = await useFetch('/api/approvals', { key: 'approvals' })
const { on } = useLiveEvents()
onMounted(() => on(() => refresh(), ['case.status', 'mail.status']))

type Item = NonNullable<typeof data.value>['approvals'][number]
const pendingItems = computed(() => (data.value?.approvals ?? []).filter(a => a.status === 'pending'))
const decided = computed(() => (data.value?.approvals ?? []).filter(a => a.status !== 'pending'))

const focusId = ref<string | null>(route.query.focus ? String(route.query.focus) : null)
const selected = computed<Item | null>(() => (data.value?.approvals ?? []).find(a => a.id === focusId.value) ?? pendingItems.value[0] ?? null)
const confirmChecks = reactive({ reviewed: false, recipient: false, consent: false })
const note = ref('')
watch(selected, () => {
  confirmChecks.reviewed = false
  confirmChecks.recipient = false
  confirmChecks.consent = false
  note.value = ''
})
const canApprove = computed(() => confirmChecks.reviewed && confirmChecks.recipient && confirmChecks.consent)

const busy = ref(false)
async function decide(decision: 'approved' | 'rejected' | 'revoked') {
  if (!selected.value) return
  busy.value = true
  try {
    await $fetch(`/api/approvals/${selected.value.id}/decide`, { method: 'POST', body: { decision, note: note.value || undefined, pdfSha256: decision === 'approved' ? selected.value.bundle.pdfSha256 : undefined } })
    toast.success(decision === 'approved' ? 'Approved — queued for dispatch' : decision === 'rejected' ? 'Rejected' : 'Approval revoked', decision === 'approved' ? 'The order will move to the provider on the next dispatcher tick.' : undefined)
    await refresh()
    focusId.value = null
  } catch (e) {
    toast.error('Decision not recorded', errorMessage(e))
  } finally {
    busy.value = false
  }
}
const statusTone: Record<string, string> = { pending: TONE_CLASS.warning, approved: TONE_CLASS.success, rejected: TONE_CLASS.danger, revoked: TONE_CLASS.neutral, expired: TONE_CLASS.neutral }
</script>

<template>
  <div>
    <PageHeader title="Approvals" eyebrow="Human in the loop" description="Nothing leaves CreditOS without your explicit approval of the exact bundle: the rendered PDF (identified by hash), its exhibits, the recipient, the provider and the cost. Approving a changed letter from a stale screen is refused.">
      <template #meta>
        <p class="mt-3 text-xs"><span class="pill" :class="pendingItems.length ? TONE_CLASS.warning : TONE_CLASS.success">{{ pendingItems.length }} pending</span></p>
      </template>
    </PageHeader>

    <div v-if="pending && !data" class="skeleton h-64" />
    <div v-else-if="data" class="grid gap-6 lg:grid-cols-5">
      <div class="lg:col-span-2 space-y-6">
        <div class="card">
          <div class="px-4 py-3 border-b border-border"><h2 class="font-semibold text-sm">Awaiting your decision</h2></div>
          <ul class="divide-y divide-border">
            <li v-for="a in pendingItems" :key="a.id">
              <button type="button" class="w-full text-left px-4 py-3 hover:bg-surface-2" :class="selected?.id === a.id ? 'bg-surface-2' : ''" @click="focusId = a.id">
                <div class="flex items-center gap-2"><span class="pill" :class="statusTone[a.status]">{{ titleize(a.kind) }}</span><span class="text-xs text-fg-3 ml-auto">{{ relTime(a.createdAt) }}</span></div>
                <p class="font-medium text-sm mt-1.5">{{ a.bundle.title }}</p>
                <p v-if="a.case" class="text-xs text-fg-3"><span class="mono">{{ a.case.code }}</span> · {{ a.case.title }}</p>
              </button>
            </li>
            <li v-if="!pendingItems.length"><EmptyState compact icon="lucide:badge-check" title="Nothing to approve" description="Requests appear here when a case is ready to mail." /></li>
          </ul>
        </div>
        <div v-if="decided.length" class="card">
          <div class="px-4 py-3 border-b border-border"><h2 class="font-semibold text-sm">History</h2></div>
          <ul class="divide-y divide-border max-h-96 overflow-y-auto scrollbar-thin">
            <li v-for="a in decided" :key="a.id">
              <button type="button" class="w-full text-left px-4 py-2.5 hover:bg-surface-2 text-sm" :class="selected?.id === a.id ? 'bg-surface-2' : ''" @click="focusId = a.id">
                <div class="flex items-center gap-2"><span class="pill" :class="statusTone[a.status]">{{ a.status }}</span><span class="truncate text-xs flex-1">{{ a.bundle.title }}</span><span class="text-xs text-fg-3">{{ fmtDate(a.decidedAt ?? a.createdAt, 'short') }}</span></div>
              </button>
            </li>
          </ul>
        </div>
      </div>

      <div class="lg:col-span-3">
        <EmptyState v-if="!selected" icon="lucide:file-signature" title="Select an approval" description="The full bundle will be shown for review." />
        <div v-else class="card">
          <div class="px-5 py-4 border-b border-border">
            <div class="flex flex-wrap items-center gap-2"><span class="pill" :class="statusTone[selected.status]">{{ selected.status }}</span><span class="pill bg-surface-3 text-fg-2">{{ titleize(selected.kind) }}</span><ModeBadge :mode="selected.bundle.providerMode" size="sm" /><span class="text-xs text-fg-3 ml-auto">Requested {{ fmtDate(selected.createdAt, 'time') }}</span></div>
            <h2 class="font-semibold text-lg mt-2">{{ selected.bundle.title }}</h2>
            <NuxtLink v-if="selected.case" :to="`/cases/${selected.case.id}`" class="text-sm text-accent hover:underline"><span class="mono">{{ selected.case.code }}</span> · {{ selected.case.title }}</NuxtLink>
          </div>

          <div class="px-5 py-4 grid gap-4 sm:grid-cols-2 text-sm">
            <div class="rounded-md bg-surface-2 p-3"><p class="eyebrow mb-1">Recipient</p><template v-if="selected.order"><p class="font-medium">{{ selected.order.recipient.name }}</p><p class="text-xs text-fg-2">{{ selected.order.recipient.line1 }}<br><template v-if="selected.order.recipient.line2">{{ selected.order.recipient.line2 }}<br></template>{{ selected.order.recipient.city }}, {{ selected.order.recipient.state }} {{ selected.order.recipient.postalCode }}</p></template><p v-else class="font-medium">{{ selected.bundle.target }}</p></div>
            <div class="rounded-md bg-surface-2 p-3"><p class="eyebrow mb-1">Provider & cost</p><p class="font-medium">{{ titleize(selected.bundle.provider) }} <span class="text-xs text-fg-3">({{ selected.bundle.providerMode }})</span></p><p class="text-xs text-fg-2">{{ titleize(selected.bundle.mailClass ?? 'first_class') }} · est. {{ money(selected.bundle.costEstimateCents, { cents: true }) }}</p></div>
            <div class="rounded-md bg-surface-2 p-3 sm:col-span-2">
              <p class="eyebrow mb-1">Letter</p>
              <div class="flex flex-wrap items-center gap-2"><span>Version {{ selected.bundle.letterVersion }}</span><a v-if="selected.caseId && selected.bundle.letterId" :href="`/api/cases/${selected.caseId}/letters/${selected.bundle.letterId}/pdf`" target="_blank" rel="noopener" class="btn btn-secondary btn-sm"><Icon name="lucide:file-text" class="size-3.5" /> Open the exact PDF</a></div>
              <p class="mt-2 text-xs text-fg-3">PDF SHA-256</p><p class="mono text-xs break-all">{{ selected.bundle.pdfSha256 ?? 'not rendered' }}</p>
            </div>
            <div class="sm:col-span-2"><p class="eyebrow mb-1">Exhibits</p><ul v-if="selected.bundle.exhibits.length" class="text-xs space-y-0.5"><li v-for="x in selected.bundle.exhibits" :key="x">· {{ x }}</li></ul><p v-else class="text-xs text-fg-3">No exhibits attached.</p></div>
            <div class="sm:col-span-2"><p class="eyebrow mb-1">Consequences</p><ul class="text-xs space-y-0.5"><li v-for="x in selected.bundle.consequences" :key="x" class="flex gap-1.5"><Icon name="lucide:corner-down-right" class="size-3 mt-0.5 text-fg-3 shrink-0" />{{ x }}</li></ul></div>
            <div class="sm:col-span-2 rounded-md border border-border p-3"><p class="eyebrow mb-1">Consent statement <span class="normal-case tracking-normal text-fg-3 mono">hash {{ selected.consentTextHash.slice(0, 12) }}</span></p><p class="text-xs text-fg-2 whitespace-pre-wrap">{{ selected.bundle.consentText }}</p></div>
          </div>

          <div v-if="selected.status === 'pending'" class="px-5 py-4 border-t border-border space-y-3">
            <label class="flex items-start gap-2 text-sm cursor-pointer"><input v-model="confirmChecks.reviewed" type="checkbox" class="size-4 mt-0.5 accent-[var(--accent)]"> I opened and read the exact PDF identified by the hash above.</label>
            <label class="flex items-start gap-2 text-sm cursor-pointer"><input v-model="confirmChecks.recipient" type="checkbox" class="size-4 mt-0.5 accent-[var(--accent)]"> The recipient address and my return address are correct.</label>
            <label class="flex items-start gap-2 text-sm cursor-pointer"><input v-model="confirmChecks.consent" type="checkbox" class="size-4 mt-0.5 accent-[var(--accent)]"> I understand the consequences and authorise this {{ selected.bundle.providerMode === 'live' ? 'physical mailing' : 'sandbox send (nothing is physically mailed)' }}.</label>
            <div><label class="label" for="ap-note">Note (optional)</label><input id="ap-note" v-model="note" class="input" placeholder="Why you approved or rejected"></div>
            <div class="flex flex-wrap justify-end gap-2">
              <button class="btn btn-ghost" :disabled="busy" @click="decide('rejected')"><Icon name="lucide:x" class="size-4" /> Reject</button>
              <button class="btn btn-primary" :disabled="busy || !canApprove" @click="decide('approved')"><Icon :name="busy ? 'lucide:loader-2' : 'lucide:badge-check'" class="size-4" :class="busy && 'animate-spin'" /> Approve and send</button>
            </div>
          </div>
          <div v-else class="px-5 py-4 border-t border-border text-sm flex flex-wrap items-center gap-3">
            <p class="text-fg-2">Decided {{ fmtDate(selected.decidedAt, 'time') }}<span v-if="selected.decisionNote"> · “{{ selected.decisionNote }}”</span></p>
            <StatusPill v-if="selected.order" kind="outbound" :status="selected.order.status" class="ml-auto" />
            <button v-if="selected.status === 'approved' && selected.order && ['APPROVED', 'QUEUED'].includes(selected.order.status)" class="btn btn-ghost btn-sm" :disabled="busy" @click="decide('revoked')">Revoke before dispatch</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
