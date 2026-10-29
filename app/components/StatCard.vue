<script setup lang="ts">
import { TONE_CLASS, type Tone } from '~/utils/format'

withDefaults(defineProps<{ label: string; value: string | number; hint?: string; icon?: string; tone?: Tone; to?: string }>(), { tone: 'neutral' })
const NuxtLink = resolveComponent('NuxtLink')
</script>

<template>
  <component :is="to ? NuxtLink : 'div'" :to="to" class="card card-pad flex items-start gap-3 group" :class="to ? 'hover:border-border-strong transition-colors' : ''">
    <div v-if="icon" class="size-9 rounded-md grid place-items-center shrink-0" :class="TONE_CLASS[tone]">
      <Icon :name="icon" class="size-[18px]" />
    </div>
    <div class="min-w-0">
      <p class="text-xs font-medium text-fg-2">{{ label }}</p>
      <p class="mt-0.5 text-2xl font-semibold tracking-tight num leading-none">{{ value }}</p>
      <p v-if="hint" class="mt-1.5 text-xs text-fg-3 leading-snug">{{ hint }}</p>
    </div>
    <Icon v-if="to" name="lucide:arrow-up-right" class="ml-auto size-4 text-fg-3 opacity-0 group-hover:opacity-100 transition-opacity" />
  </component>
</template>
