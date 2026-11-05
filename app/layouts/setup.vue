<template>
  <div class="min-h-dvh bg-bg text-fg">
    <header class="h-14 flex items-center px-6 sm:px-10 border-b border-border">
      <AppLogo size="sm" />
    </header>
    <main class="px-6 sm:px-10 py-12 sm:py-16">
      <div class="max-w-lg">
        <slot />
      </div>
    </main>
  </div>
</template>
