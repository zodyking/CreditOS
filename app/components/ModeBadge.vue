<script setup lang="ts">
import { TONE_CLASS, modeLabel, modeTone } from '~/utils/format'

const props = withDefaults(defineProps<{ mode: string | null | undefined; size?: 'xs' | 'sm'; label?: string }>(), { size: 'xs' })
const title = computed(() => {
  if (props.mode === 'live') return 'Live: real data and real external actions'
  if (props.mode === 'sandbox') return 'Sandbox: provider accepts orders but nothing is physically mailed'
  if (props.mode === 'test') return 'Test: real data allowed, external actions stay in sandbox'
  return 'Demo: synthetic data, deterministic simulation, no external calls'
})
</script>

<template>
  <span class="pill" :class="[TONE_CLASS[modeTone(mode)], size === 'sm' ? 'text-xs px-2.5 py-1' : '']" :title="title">
    <Icon :name="mode === 'live' ? 'lucide:radio' : mode === 'sandbox' ? 'lucide:flask-conical' : 'lucide:sparkles'" class="size-3" />
    {{ label ?? modeLabel(mode) }}
  </span>
</template>
