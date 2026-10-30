<template>
  <div class="min-h-dvh bg-bg flex flex-col">
    <div class="relative flex-1 grid lg:grid-cols-[1.05fr_1fr]">
      <aside class="rail-gradient relative hidden lg:flex flex-col justify-between overflow-hidden text-white p-12 xl:p-16">
        <div class="absolute inset-0 pointer-events-none" aria-hidden="true">
          <div class="absolute -top-40 -left-24 h-[30rem] w-[30rem] rounded-full bg-verdigris-500/20 blur-3xl" />
          <div class="absolute bottom-0 right-0 h-[28rem] w-[28rem] rounded-full bg-azure-500/10 blur-3xl" />
          <svg class="absolute inset-0 h-full w-full opacity-[0.07]" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="auth-grid" width="36" height="36" patternUnits="userSpaceOnUse">
                <path d="M36 0H0V36" fill="none" stroke="currentColor" stroke-width="1" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#auth-grid)" />
          </svg>
        </div>

        <div class="relative">
          <AppLogo size="lg" theme="dark" tagline />
        </div>

        <div class="relative max-w-xl space-y-8">
          <div>
            <p class="eyebrow !text-verdigris-300 mb-4">Credit intelligence, under your control</p>
            <h1 class="!text-white text-4xl xl:text-5xl leading-[1.08]">Every claim cited.<br>Every letter approved.<br>Every state explicit.</h1>
            <p class="mt-5 text-rail-text-2 text-lg leading-relaxed">CreditOS compares your three bureau reports, finds verifiable inconsistencies, convenes a council of specialist agents that debate before recommending anything, and never mails a letter you have not approved.</p>
          </div>
          <ul class="grid grid-cols-2 gap-3">
            <li v-for="f in features" :key="f.label" class="rounded-md border border-rail-border bg-white/[0.05] p-4">
              <span class="icon-tile size-9 rounded-sm bg-verdigris-500/20 text-verdigris-300 mb-3"><Icon :name="f.icon" class="size-[18px]" /></span>
              <p class="text-sm font-semibold text-white">{{ f.label }}</p>
              <p class="text-xs text-rail-text-2 mt-1 leading-snug">{{ f.body }}</p>
            </li>
          </ul>
        </div>

        <div class="relative flex items-center gap-4 text-xs text-rail-text-3">
          <span class="flex items-center gap-1.5"><Icon name="lucide:server" class="size-3.5" /> Self-hosted</span>
          <span class="flex items-center gap-1.5"><Icon name="lucide:database" class="size-3.5" /> Your PostgreSQL</span>
          <span class="flex items-center gap-1.5"><Icon name="lucide:shield-check" class="size-3.5" /> Encrypted secrets</span>
          <span class="flex items-center gap-1.5"><Icon name="lucide:scale" class="size-3.5" /> No outcomes guaranteed</span>
        </div>
      </aside>

      <main class="flex items-center justify-center p-6 sm:p-12">
        <div class="w-full max-w-[440px]">
          <div class="lg:hidden mb-10">
            <AppLogo size="md" tagline />
          </div>
          <slot />
          <p class="mt-10 text-center text-xs text-fg-3">CreditOS is a personal credit operations tool, not legal advice.</p>
        </div>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
const features = [
  { icon: 'lucide:git-compare', label: 'Three-bureau comparison', body: 'Side-by-side facts with source and report date.' },
  { icon: 'lucide:users-round', label: 'Recorded council votes', body: 'Six specialist agents, three rounds, hard gates.' },
  { icon: 'lucide:badge-check', label: 'Approval-gated mail', body: 'Exact PDF hash confirmed before anything is sent.' },
  { icon: 'lucide:snowflake', label: 'Nine-agency freeze center', body: 'Honest states; confirmed only with evidence.' },
]
</script>
