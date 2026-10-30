<script setup lang="ts">
import { TONE_CLASS, type Tone } from '~/utils/format'

withDefaults(defineProps<{ title: string; eyebrow?: string; description?: string; icon?: string; tone?: Tone; crumbs?: { label: string; to?: string }[] }>(), { tone: 'live' })
</script>

<template>
  <header class="mb-8">
    <nav v-if="crumbs?.length" aria-label="Breadcrumb" class="mb-3 flex items-center gap-1.5 text-sm text-fg-3">
      <template v-for="(c, i) in crumbs" :key="i">
        <NuxtLink v-if="c.to" :to="c.to" class="hover:text-fg">{{ c.label }}</NuxtLink>
        <span v-else class="text-fg-2 font-medium">{{ c.label }}</span>
        <Icon v-if="i < crumbs.length - 1" name="lucide:chevron-right" class="size-3.5" />
      </template>
    </nav>
    <div class="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
      <div class="flex items-start gap-4 min-w-0">
        <span v-if="icon" class="icon-tile size-12 rounded-lg shadow-1 hidden sm:inline-grid" :class="TONE_CLASS[tone]">
          <Icon :name="icon" class="size-6" />
        </span>
        <div class="min-w-0">
          <p v-if="eyebrow" class="eyebrow mb-1.5">{{ eyebrow }}</p>
          <h1 class="text-3xl sm:text-4xl">{{ title }}</h1>
          <p v-if="description" class="mt-2 text-base text-fg-2 max-w-3xl leading-relaxed">{{ description }}</p>
          <slot name="meta" />
        </div>
      </div>
      <div v-if="$slots.actions" class="flex flex-wrap items-center gap-2.5 shrink-0">
        <slot name="actions" />
      </div>
    </div>
  </header>
</template>
