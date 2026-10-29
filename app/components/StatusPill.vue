<script setup lang="ts">
import { TONE_CLASS, caseStatusLabel, caseStatusTone, freezeStatusLabel, freezeStatusTone, inboundStatusLabel, inboundStatusTone, outboundStatusLabel, outboundStatusTone, titleize, type Tone } from '~/utils/format'

const props = withDefaults(defineProps<{ status: string; kind?: 'case' | 'freeze' | 'outbound' | 'inbound' | 'raw'; tone?: Tone; dot?: boolean }>(), { kind: 'raw', dot: true })

const label = computed(() => {
  switch (props.kind) {
    case 'case':
      return caseStatusLabel(props.status)
    case 'freeze':
      return freezeStatusLabel(props.status)
    case 'outbound':
      return outboundStatusLabel(props.status)
    case 'inbound':
      return inboundStatusLabel(props.status)
    default:
      return titleize(props.status)
  }
})
const tone = computed<Tone>(() => {
  if (props.tone) return props.tone
  switch (props.kind) {
    case 'case':
      return caseStatusTone(props.status)
    case 'freeze':
      return freezeStatusTone(props.status)
    case 'outbound':
      return outboundStatusTone(props.status)
    case 'inbound':
      return inboundStatusTone(props.status)
    default:
      return 'neutral'
  }
})
</script>

<template>
  <span class="pill" :class="TONE_CLASS[tone]">
    <span v-if="dot" class="size-1.5 rounded-full bg-current opacity-80" />
    {{ label }}
  </span>
</template>
