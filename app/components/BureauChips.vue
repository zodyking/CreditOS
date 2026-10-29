<script setup lang="ts">
import { bureauName } from '~/utils/format'

defineProps<{ bureaus: string[] | null | undefined; size?: 'xs' | 'sm' }>()
const color: Record<string, string> = {
  equifax: 'bg-garnet-500/15 text-garnet-600 dark:text-garnet-300',
  experian: 'bg-azure-500/15 text-azure-600 dark:text-azure-300',
  transunion: 'bg-aurum-500/15 text-aurum-600 dark:text-aurum-300',
}
</script>

<template>
  <span class="inline-flex flex-wrap gap-1">
    <span v-for="b in bureaus ?? []" :key="b" class="pill" :class="[color[b] ?? 'bg-surface-3 text-fg-2', size === 'sm' ? 'text-xs' : '']">{{ bureauName(b) }}</span>
    <span v-if="!bureaus?.length" class="text-xs text-fg-3">—</span>
  </span>
</template>
