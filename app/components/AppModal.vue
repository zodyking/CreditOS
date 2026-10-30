<script setup lang="ts">
const props = withDefaults(defineProps<{ open: boolean; title: string; description?: string; size?: 'sm' | 'md' | 'lg' | 'xl' }>(), { size: 'md' })
const emit = defineEmits<{ close: [] }>()
const sizes = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }
const panel = ref<HTMLElement | null>(null)

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}
watch(
  () => props.open,
  open => {
    if (!import.meta.client) return
    if (open) {
      document.addEventListener('keydown', onKey)
      document.body.style.overflow = 'hidden'
      nextTick(() => panel.value?.querySelector<HTMLElement>('input, textarea, select, button')?.focus())
    } else {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  },
)
onBeforeUnmount(() => {
  if (import.meta.client) {
    document.removeEventListener('keydown', onKey)
    document.body.style.overflow = ''
  }
})
</script>

<template>
  <Teleport to="body">
    <Transition enter-active-class="transition" enter-from-class="opacity-0" leave-active-class="transition" leave-to-class="opacity-0">
      <div v-if="open" class="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6 bg-ink-950/55 backdrop-blur-[3px]" @click.self="emit('close')">
        <div ref="panel" role="dialog" aria-modal="true" :aria-label="title" class="card shadow-3 w-full max-h-[92dvh] flex flex-col rounded-b-none sm:rounded-b-lg" :class="sizes[size]">
          <div class="flex items-start gap-3 px-6 py-5 border-b border-border">
            <div class="min-w-0 flex-1">
              <h2 class="text-xl leading-tight">{{ title }}</h2>
              <p v-if="description" class="text-sm text-fg-2 mt-1.5 leading-relaxed">{{ description }}</p>
            </div>
            <button class="btn btn-ghost btn-sm !px-2 -mr-2" aria-label="Close" @click="emit('close')">
              <Icon name="lucide:x" class="size-4" />
            </button>
          </div>
          <div class="px-6 py-5 overflow-y-auto scrollbar-thin flex-1">
            <slot />
          </div>
          <div v-if="$slots.footer" class="px-6 py-4 border-t border-border flex flex-wrap items-center justify-end gap-2.5 bg-surface-2 rounded-b-lg">
            <slot name="footer" />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
