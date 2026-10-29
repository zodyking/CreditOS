<script setup lang="ts">
import { DOCUMENT_KINDS, type DocumentKind } from '#shared/constants'
import { TONE_CLASS, bytes, fmtDate, titleize } from '~/utils/format'

useHead({ title: 'Vault' })
const toast = useToast()
const kind = ref<string>('')
const { data, refresh, pending } = await useFetch('/api/documents', { key: 'documents', query: computed(() => ({ kind: kind.value || undefined })) })
const q = ref('')
const docs = computed(() => (data.value?.documents ?? []).filter(d => !q.value || `${d.filename} ${d.title ?? ''} ${d.case?.code ?? ''}`.toLowerCase().includes(q.value.toLowerCase())))
const totalBytes = computed(() => (data.value?.documents ?? []).reduce((n, d) => n + d.sizeBytes, 0))
const kindIcon: Record<string, string> = { evidence: 'lucide:paperclip', report_import: 'lucide:file-bar-chart', letter_pdf: 'lucide:file-text', inbound_scan: 'lucide:mail-open', inbound_envelope: 'lucide:mail', freeze_confirmation: 'lucide:snowflake', other: 'lucide:file' }

const uploadOpen = ref(false)
const upFile = ref<File | null>(null)
const upKind = ref<DocumentKind>('evidence')
const upTitle = ref('')
const upCase = ref('')
const busy = ref<string | null>(null)
const { data: cases } = await useFetch('/api/cases', { key: 'cases-vault', lazy: true, server: false })
async function upload() {
  if (!upFile.value) return
  busy.value = 'upload'
  try {
    const fd = new FormData()
    fd.append('file', upFile.value)
    fd.append('kind', upKind.value)
    if (upTitle.value) fd.append('title', upTitle.value)
    if (upCase.value) fd.append('caseId', upCase.value)
    await $fetch('/api/documents', { method: 'POST', body: fd })
    toast.success('Stored in vault')
    uploadOpen.value = false
    upFile.value = null
    upTitle.value = ''
    upCase.value = ''
    await refresh()
  } catch (e) {
    toast.error('Upload rejected', errorMessage(e))
  } finally {
    busy.value = null
  }
}
async function remove(id: string, name: string) {
  if (!confirm(`Delete "${name}" from the vault? Letters already mailed keep their hash on the order record.`)) return
  busy.value = id
  try {
    await $fetch(`/api/documents/${id}`, { method: 'DELETE' })
    await refresh()
  } catch (e) {
    toast.error('Could not delete', errorMessage(e))
  } finally {
    busy.value = null
  }
}
</script>

<template>
  <div>
    <PageHeader title="Vault" eyebrow="Documents & evidence" description="Every file CreditOS holds: uploaded evidence, rendered letters, inbound scans and freeze confirmations. Files are validated by content, hashed with SHA-256 and stored outside the web root.">
      <template #actions>
        <button class="btn btn-primary" @click="uploadOpen = true"><Icon name="lucide:upload" class="size-4" /> Upload</button>
      </template>
    </PageHeader>

    <div class="card card-pad flex flex-wrap items-center gap-2 mb-6">
      <label class="relative flex-1 min-w-56"><Icon name="lucide:search" class="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-fg-3" /><input v-model.trim="q" type="search" class="input pl-9" placeholder="Search filename, title, case…" aria-label="Search documents"></label>
      <select v-model="kind" class="input w-auto" aria-label="Kind"><option value="">All kinds</option><option v-for="k in DOCUMENT_KINDS" :key="k" :value="k">{{ titleize(k) }}</option></select>
      <span class="text-xs text-fg-3 px-2">{{ data?.documents.length ?? 0 }} files · {{ bytes(totalBytes) }}</span>
    </div>

    <div v-if="pending && !data" class="skeleton h-64" />
    <div v-else class="card">
      <div class="overflow-x-auto">
        <table class="table min-w-[760px]">
          <thead><tr><th>File</th><th>Kind</th><th>Case</th><th>Size</th><th>SHA-256</th><th>Added</th><th /></tr></thead>
          <tbody>
            <tr v-for="d in docs" :key="d.id">
              <td><div class="flex items-center gap-2"><Icon :name="kindIcon[d.kind] ?? 'lucide:file'" class="size-4 text-fg-3 shrink-0" /><div class="min-w-0"><p class="font-medium truncate max-w-72">{{ d.title ?? d.filename }}</p><p class="text-xs text-fg-3 truncate max-w-72">{{ d.filename }} · {{ d.mimeType }}<span v-if="d.pageCount"> · {{ d.pageCount }} pp</span></p></div></div></td>
              <td><div class="flex items-center gap-1.5"><span class="pill bg-surface-3 text-fg-2">{{ titleize(d.kind) }}</span><span v-if="d.sensitivity === 'sensitive'" class="pill" :class="TONE_CLASS.warning" title="Contains personal data">sensitive</span><ModeBadge :mode="d.mode" /></div></td>
              <td><NuxtLink v-if="d.case" :to="`/cases/${d.case.id}`" class="mono text-xs hover:underline">{{ d.case.code }}</NuxtLink><span v-else class="text-xs text-fg-3">—</span></td>
              <td class="text-xs num">{{ bytes(d.sizeBytes) }}</td>
              <td class="mono text-[11px] text-fg-3" :title="d.sha256">{{ d.sha256.slice(0, 16) }}…</td>
              <td class="text-xs text-fg-3 whitespace-nowrap">{{ fmtDate(d.createdAt) }}</td>
              <td class="text-right whitespace-nowrap"><a :href="`/api/documents/${d.id}/download?inline=1`" target="_blank" rel="noopener" class="btn btn-ghost btn-sm" aria-label="Open"><Icon name="lucide:eye" class="size-3.5" /></a><a :href="`/api/documents/${d.id}/download`" class="btn btn-ghost btn-sm" aria-label="Download"><Icon name="lucide:download" class="size-3.5" /></a><button class="btn btn-ghost btn-sm text-garnet-500" aria-label="Delete" :disabled="busy === d.id" @click="remove(d.id, d.filename)"><Icon name="lucide:trash-2" class="size-3.5" /></button></td>
            </tr>
            <tr v-if="!docs.length"><td colspan="7"><EmptyState compact icon="lucide:folder-lock" title="Vault is empty" description="Uploads from cases, the mailroom and the freeze center land here." /></td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <AppModal :open="uploadOpen" title="Upload to vault" description="PDF, JPEG or PNG up to 25 MB. Content is verified by signature; PDFs with active content are rejected." @close="uploadOpen = false">
      <div class="space-y-3">
        <FileDrop v-model="upFile" />
        <div class="grid gap-3 sm:grid-cols-2">
          <div><label class="label" for="v-kind">Kind</label><select id="v-kind" v-model="upKind" class="input"><option v-for="k in DOCUMENT_KINDS.filter(k => !['letter_pdf', 'inbound_envelope'].includes(k))" :key="k" :value="k">{{ titleize(k) }}</option></select></div>
          <div><label class="label" for="v-case">Case (optional)</label><select id="v-case" v-model="upCase" class="input"><option value="">None</option><option v-for="c in cases?.cases ?? []" :key="c.id" :value="c.id">{{ c.code }} · {{ c.title }}</option></select></div>
        </div>
        <div><label class="label" for="v-title">Title (optional)</label><input id="v-title" v-model="upTitle" class="input"></div>
      </div>
      <template #footer>
        <button class="btn btn-ghost" @click="uploadOpen = false">Cancel</button>
        <button class="btn btn-primary" :disabled="!upFile || busy === 'upload'" @click="upload">Store</button>
      </template>
    </AppModal>
  </div>
</template>
