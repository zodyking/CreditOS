<script setup lang="ts">
withDefaults(defineProps<{ size?: 'sm' | 'md' | 'lg' | 'xl'; theme?: 'auto' | 'dark' | 'light'; wordmark?: boolean; tagline?: boolean }>(), { size: 'md', theme: 'auto', wordmark: true, tagline: false })
const dims = { sm: 'size-8', md: 'size-10', lg: 'size-12', xl: 'size-16' }
const text = { sm: 'text-[17px]', md: 'text-xl', lg: 'text-2xl', xl: 'text-3xl' }
const uid = `cos-${useId()}`
</script>

<template>
  <span class="inline-flex items-center gap-3">
    <svg :class="dims[size]" viewBox="0 0 64 64" role="img" aria-label="CreditOS">
      <defs>
        <linearGradient :id="`${uid}-tile`" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#1C2D4D" />
          <stop offset="1" stop-color="#0B1220" />
        </linearGradient>
        <linearGradient :id="`${uid}-arc`" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#35CCBF" />
          <stop offset="1" stop-color="#0F8A80" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="18" :fill="`url(#${uid}-tile)`" />
      <rect x="0.5" y="0.5" width="63" height="63" rx="17.5" fill="none" stroke="#fff" stroke-opacity="0.1" />
      <path d="M42.93 18.98 A17 17 0 1 0 42.93 45.02" fill="none" :stroke="`url(#${uid}-arc)`" stroke-width="6" stroke-linecap="round" />
      <path d="M21 32 H27 L30.5 24.5 L34 39.5 L37.5 32 H51" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
    <span v-if="wordmark" class="flex flex-col leading-none">
      <span class="display font-extrabold tracking-[-0.03em]" :class="[text[size], theme === 'dark' ? 'text-white' : theme === 'light' ? 'text-ink-900' : 'text-fg']">
        Credit<span :class="theme === 'dark' ? 'text-verdigris-400' : 'text-accent'">OS</span>
      </span>
      <span v-if="tagline" class="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em]" :class="theme === 'dark' ? 'text-rail-text-3' : 'text-fg-3'">Credit operations suite</span>
    </span>
  </span>
</template>
