<script setup lang="ts">
withDefaults(defineProps<{ size?: 'sm' | 'md' | 'lg'; theme?: 'auto' | 'dark' | 'light'; wordmark?: boolean }>(), { size: 'md', theme: 'auto', wordmark: true })
const dims = { sm: 'size-7', md: 'size-9', lg: 'size-12' }
const text = { sm: 'text-[15px]', md: 'text-lg', lg: 'text-2xl' }
</script>

<template>
  <span class="inline-flex items-center gap-2.5">
    <svg :class="dims[size]" viewBox="0 0 64 64" role="img" aria-label="CreditOS">
      <defs>
        <linearGradient id="cos-tile" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#16233D" />
          <stop offset="1" stop-color="#0B1220" />
        </linearGradient>
        <linearGradient id="cos-arc" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#35CCBF" />
          <stop offset="1" stop-color="#12978C" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#cos-tile)" />
      <rect x="0.5" y="0.5" width="63" height="63" rx="15.5" fill="none" stroke="#fff" stroke-opacity="0.08" />
      <path d="M42.93 18.98 A17 17 0 1 0 42.93 45.02" fill="none" stroke="url(#cos-arc)" stroke-width="6" stroke-linecap="round" />
      <path d="M21 32 H27 L30.5 24.5 L34 39.5 L37.5 32 H51" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
    <span v-if="wordmark" class="font-semibold tracking-tight leading-none" :class="[text[size], theme === 'dark' ? 'text-white' : theme === 'light' ? 'text-ink-900' : 'text-fg']">
      Credit<span :class="theme === 'dark' ? 'text-verdigris-400' : 'text-accent'">OS</span>
    </span>
  </span>
</template>
