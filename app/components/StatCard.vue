<script setup lang="ts">
import { TONE_CLASS, type Tone } from '~/utils/format'

withDefaults(defineProps<{ label: string; value: string | number; hint?: string; icon?: string; tone?: Tone; to?: string }>(), { tone: 'neutral' })
const NuxtLink = resolveComponent('NuxtLink')
</script>

<template>
  <component :is="to ? NuxtLink : 'div'" :to="to" class="card card-pad flex items-start gap-4 group relative overflow-hidden" :class="to ? 'hover:shadow-2 hover:-translate-y-px transition-all' : ''">
    <span v-if="icon" class="icon-tile size-11 rounded-md" :class="TONE_CLASS[tone]">
      <Icon :name="icon" class="size-5" />
    </span>
    <div class="min-w-0 flex-1">
      <p class="text-sm font-medium text-fg-2">{{ label }}</p>
      <p class="mt-1 text-3xl display font-extrabold tracking-tight num leading-none">{{ value }}</p>
      <p v-if="hint" class="mt-2 text-xs text-fg-3 leading-snug">{{ hint }}</p>
    </div>
    <Icon v-if="to" name="lucide:arrow-up-right" class="size-4 text-fg-3 opacity-0 group-hover:opacity-100 transition-opacity absolute top-4 right-4" />
  </component>
</template>
