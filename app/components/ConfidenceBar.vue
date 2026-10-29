<script setup lang="ts">
const props = withDefaults(defineProps<{ value: number | string | null | undefined; label?: string; showValue?: boolean }>(), { showValue: true })
const n = computed(() => Math.max(0, Math.min(1, Number(props.value ?? 0))))
const color = computed(() => (n.value >= 0.75 ? 'bg-fern-500' : n.value >= 0.5 ? 'bg-aurum-500' : 'bg-garnet-500'))
</script>

<template>
  <div class="min-w-24">
    <div v-if="label || showValue" class="flex items-center justify-between text-xs mb-1">
      <span class="text-fg-2">{{ label }}</span>
      <span v-if="showValue" class="num font-medium">{{ Math.round(n * 100) }}%</span>
    </div>
    <div class="h-1.5 rounded-full bg-surface-3 overflow-hidden" role="meter" :aria-valuenow="Math.round(n * 100)" aria-valuemin="0" aria-valuemax="100" :aria-label="label ?? 'Confidence'">
      <div class="h-full rounded-full transition-[width]" :class="color" :style="{ width: `${n * 100}%` }" />
    </div>
  </div>
</template>
