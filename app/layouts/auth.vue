<template>
  <div class="min-h-dvh bg-bg flex flex-col">
    <div class="relative flex-1 grid lg:grid-cols-2">
      <aside class="relative hidden lg:flex flex-col justify-between overflow-hidden bg-ink-900 text-white p-10">
        <div class="absolute inset-0 pointer-events-none" aria-hidden="true">
          <div class="absolute -top-32 -left-24 h-96 w-96 rounded-full bg-verdigris-500/20 blur-3xl" />
          <div class="absolute bottom-0 right-0 h-[28rem] w-[28rem] rounded-full bg-azure-500/10 blur-3xl" />
          <svg class="absolute inset-0 h-full w-full opacity-[0.08]" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
                <path d="M32 0H0V32" fill="none" stroke="currentColor" stroke-width="1" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>
        </div>
        <div class="relative">
          <AppLogo size="lg" theme="dark" />
        </div>
        <div class="relative max-w-md space-y-6">
          <p class="eyebrow text-verdigris-300">Credit intelligence, operated honestly</p>
          <h1 class="text-4xl leading-tight font-semibold tracking-tight">Every claim cited. Every send approved. Every state explicit.</h1>
          <p class="text-ink-200 text-base leading-relaxed">CreditOS compares your three bureau reports, finds verifiable inconsistencies, convenes a multi-agent council that argues with itself before recommending anything, and never mails a letter you haven't approved by hash.</p>
          <ul class="grid grid-cols-2 gap-3 text-sm text-ink-100">
            <li class="flex items-center gap-2"><Icon name="lucide:scale" class="size-4 text-verdigris-400" /> Evidence-gated disputes</li>
            <li class="flex items-center gap-2"><Icon name="lucide:users" class="size-4 text-verdigris-400" /> Recorded council votes</li>
            <li class="flex items-center gap-2"><Icon name="lucide:snowflake" class="size-4 text-verdigris-400" /> 9-agency freeze center</li>
            <li class="flex items-center gap-2"><Icon name="lucide:mailbox" class="size-4 text-verdigris-400" /> Outbound + inbound mailroom</li>
          </ul>
        </div>
        <p class="relative text-xs text-ink-300">Self-hosted · PostgreSQL · OpenRouter · No outcomes guaranteed</p>
      </aside>
      <main class="flex items-center justify-center p-6 sm:p-10">
        <div class="w-full max-w-md">
          <div class="lg:hidden mb-8">
            <AppLogo size="md" />
          </div>
          <slot />
        </div>
      </main>
    </div>
  </div>
</template>
