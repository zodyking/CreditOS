<script setup lang="ts">
const props = withDefaults(defineProps<{ accept?: string; maxMb?: number; label?: string; hint?: string; disabled?: boolean }>(), {
  accept: 'application/pdf,image/jpeg,image/png',
  maxMb: 25,
  label: 'Drop a PDF, JPEG or PNG here, or click to choose',
  hint: 'Files are validated by content signature. PDFs with scripts, launch actions or embedded files are rejected.',
})
const file = defineModel<File | null>({ default: null })
const input = ref<HTMLInputElement | null>(null)
const over = ref(false)
const error = ref<string | null>(null)

function pick(f: File | undefined) {
  error.value = null
  if (!f) return
  if (f.size > props.maxMb * 1024 * 1024) {
    error.value = `File is larger than ${props.maxMb} MB`
    return
  }
  file.value = f
}
function onDrop(e: DragEvent) {
  over.value = false
  if (props.disabled) return
  pick(e.dataTransfer?.files?.[0])
}
</script>

<template>
  <div>
    <button
      type="button"
      class="w-full rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors focus-visible:outline-2 bg-surface-2"
      :class="[over ? 'border-ring bg-accent/5' : 'border-border-strong hover:border-ring/60', disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer']"
      :disabled="disabled"
      @click="input?.click()"
      @dragover.prevent="over = true"
      @dragleave="over = false"
      @drop.prevent="onDrop"
    >
      <span class="icon-tile size-12 rounded-full bg-accent-soft text-accent-strong mx-auto"><Icon name="lucide:upload-cloud" class="size-6" /></span>
      <p class="mt-3 text-sm font-semibold">{{ file ? file.name : label }}</p>
      <p class="mt-1 text-xs text-fg-3">{{ file ? `${(file.size / 1024).toFixed(0)} KB · click to replace` : hint }}</p>
    </button>
    <input ref="input" type="file" class="sr-only" :accept="accept" @change="pick(($event.target as HTMLInputElement).files?.[0])">
    <p v-if="error" class="mt-1.5 text-xs text-garnet-500">{{ error }}</p>
  </div>
</template>
