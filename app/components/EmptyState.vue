<script setup lang="ts">
withDefaults(defineProps<{ title: string; description?: string; icon?: string; compact?: boolean }>(), { icon: 'lucide:inbox' })
</script>

<template>
  <div class="flex flex-col items-center justify-center text-center" :class="compact ? 'py-8 px-4' : 'py-16 px-6'">
    <div class="size-12 rounded-full bg-surface-3 grid place-items-center text-fg-3 mb-3">
      <Icon :name="icon" class="size-6" />
    </div>
    <p class="font-medium">{{ title }}</p>
    <p v-if="description" class="mt-1 text-sm text-fg-2 max-w-sm">{{ description }}</p>
    <div v-if="$slots.default" class="mt-4 flex flex-wrap gap-2 justify-center">
      <slot />
    </div>
  </div>
</template>
