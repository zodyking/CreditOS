<script setup lang="ts">
const { toasts, dismiss } = useToast()
const icon = { info: 'lucide:info', success: 'lucide:check-circle-2', error: 'lucide:alert-octagon', warning: 'lucide:alert-triangle' }
const tone = {
  info: 'border-azure-500/40 text-azure-600 dark:text-azure-300',
  success: 'border-fern-500/40 text-fern-600 dark:text-fern-300',
  error: 'border-garnet-500/40 text-garnet-600 dark:text-garnet-300',
  warning: 'border-aurum-500/40 text-aurum-600 dark:text-aurum-300',
}
</script>

<template>
  <div class="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-[22rem] max-w-[calc(100vw-2rem)]" aria-live="polite" role="status">
    <TransitionGroup enter-active-class="transition" enter-from-class="opacity-0 translate-y-2" leave-active-class="transition" leave-to-class="opacity-0 translate-x-4">
      <div v-for="t in toasts" :key="t.id" class="card shadow-3 border-l-4 p-3 flex items-start gap-3" :class="tone[t.kind]">
        <Icon :name="icon[t.kind]" class="size-5 shrink-0 mt-0.5" />
        <div class="min-w-0 flex-1 text-fg">
          <p class="text-sm font-medium leading-snug">{{ t.title }}</p>
          <p v-if="t.body" class="text-xs text-fg-2 mt-0.5 line-clamp-3">{{ t.body }}</p>
          <NuxtLink v-if="t.href" :to="t.href" class="text-xs text-accent hover:underline mt-1 inline-block" @click="dismiss(t.id)">Open</NuxtLink>
        </div>
        <button class="text-fg-3 hover:text-fg rounded-sm" aria-label="Dismiss" @click="dismiss(t.id)">
          <Icon name="lucide:x" class="size-4" />
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>
