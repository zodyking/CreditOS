<template>
  <div class="min-h-dvh bg-bg text-fg flex">
    <aside class="rail-gradient hidden md:flex w-[240px] shrink-0 flex-col" aria-label="Setup">
      <div class="h-[72px] flex items-center px-5">
        <AppLogo size="sm" theme="dark" tagline />
      </div>
      <nav class="px-3">
        <p class="px-3 mb-1.5 text-[10.5px] font-bold uppercase tracking-[0.16em] text-rail-text-3">Start</p>
        <p class="relative flex items-center gap-3 rounded-md pl-3 h-10 text-[13.5px] font-medium bg-white/10 text-white">
          <span class="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-verdigris-400" aria-hidden="true" />
          <Icon name="lucide:settings-2" class="size-[18px] text-verdigris-300" />
          Setup
        </p>
      </nav>
    </aside>

    <div class="flex-1 min-w-0 flex flex-col">
      <header class="h-14 md:h-[72px] border-b border-border bg-surface flex items-center px-4 sm:px-8">
        <AppLogo size="sm" class="md:hidden" />
        <p class="hidden md:block text-sm font-medium text-fg-2">Setup</p>
      </header>
      <main class="flex-1 px-4 sm:px-8 py-6 sm:py-8 max-w-[1480px] w-full mx-auto">
        <slot />
      </main>
      <footer class="px-4 sm:px-8 py-5 border-t border-border bg-surface">
        <p class="text-xs text-fg-3">CreditOS is a personal credit operations tool, not legal advice. Dispute outcomes are never guaranteed.</p>
      </footer>
    </div>
  </div>
</template>
