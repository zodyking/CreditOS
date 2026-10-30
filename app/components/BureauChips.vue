<script setup lang="ts">
import { bureauName } from '~/utils/format'

defineProps<{ bureaus: string[] | null | undefined; size?: 'xs' | 'sm' }>()
const color: Record<string, string> = {
  equifax: 'bg-garnet-100 text-garnet-700 dark:bg-garnet-600/20 dark:text-garnet-300',
  experian: 'bg-azure-100 text-azure-700 dark:bg-azure-600/20 dark:text-azure-300',
  transunion: 'bg-aurum-100 text-aurum-700 dark:bg-aurum-600/20 dark:text-aurum-300',
}
</script>

<template>
  <span class="inline-flex flex-wrap gap-1">
    <span v-for="b in bureaus ?? []" :key="b" class="pill" :class="[color[b] ?? 'bg-surface-3 text-fg-2', size === 'sm' ? 'text-xs' : '']">{{ bureauName(b) }}</span>
    <span v-if="!bureaus?.length" class="text-xs text-fg-3">—</span>
  </span>
</template>
