<script setup lang="ts">
withDefaults(defineProps<{ title: string; description?: string; icon?: string; compact?: boolean }>(), { icon: 'lucide:inbox' })
</script>

<template>
  <div class="flex flex-col items-center justify-center text-center" :class="compact ? 'py-10 px-4' : 'py-20 px-6'">
    <div class="size-14 rounded-full bg-accent-soft text-accent-strong grid place-items-center mb-4 ring-8 ring-accent-soft/50">
      <Icon :name="icon" class="size-6" />
    </div>
    <p class="font-semibold text-fg">{{ title }}</p>
    <p v-if="description" class="mt-1.5 text-sm text-fg-2 max-w-sm leading-relaxed">{{ description }}</p>
    <div v-if="$slots.default" class="mt-5 flex flex-wrap gap-2 justify-center">
      <slot />
    </div>
  </div>
</template>
