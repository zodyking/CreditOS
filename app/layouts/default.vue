<script setup lang="ts">
const route = useRoute()
const { user, clear } = useUserSession()
const { data: status } = await useAppStatus()
const { resolved, toggle } = useTheme()
const { data: notif, refresh: refreshNotif, markRead } = useNotifications()
const { connected, on } = useLiveEvents()
const toast = useToast()

const sidebarOpen = ref(false)
const notifOpen = ref(false)

const nav = [
  { to: '/', label: 'Dashboard', icon: 'lucide:layout-dashboard' },
  { to: '/reports', label: 'Reports', icon: 'lucide:file-bar-chart' },
  { to: '/monitoring', label: 'Monitoring', icon: 'lucide:radar' },
  { to: '/cases', label: 'Cases', icon: 'lucide:briefcase' },
  { to: '/approvals', label: 'Approvals', icon: 'lucide:badge-check' },
  { to: '/mailroom', label: 'Mailroom', icon: 'lucide:mailbox' },
  { to: '/freezes', label: 'Freeze center', icon: 'lucide:snowflake' },
  { to: '/vault', label: 'Vault', icon: 'lucide:folder-lock' },
  { to: '/activity', label: 'Activity', icon: 'lucide:scroll-text' },
  { to: '/settings', label: 'Settings', icon: 'lucide:settings-2' },
]

function isActive(to: string) {
  return to === '/' ? route.path === '/' : route.path.startsWith(to)
}

onMounted(() => {
  refreshNotif()
  on(evt => {
    if (evt.type === 'notification') {
      refreshNotif()
      const p = evt.payload as { title?: string; body?: string; severity?: string }
      toast.push({ kind: p.severity === 'high' || p.severity === 'critical' ? 'warning' : 'info', title: p.title ?? 'Update', body: p.body })
    }
  })
})

watch(() => route.path, () => (sidebarOpen.value = false))

async function logout() {
  await $fetch('/api/auth/logout', { method: 'POST' })
  await clear()
  navigateTo('/login')
}
</script>

<template>
  <div class="min-h-dvh bg-bg text-fg flex">
    <!-- Mobile scrim -->
    <Transition enter-active-class="transition-opacity" leave-active-class="transition-opacity" enter-from-class="opacity-0" leave-to-class="opacity-0">
      <button v-if="sidebarOpen" class="fixed inset-0 z-30 bg-ink-950/60 lg:hidden" aria-label="Close navigation" @click="sidebarOpen = false" />
    </Transition>

    <!-- Sidebar -->
    <aside
      class="fixed inset-y-0 left-0 z-40 w-64 shrink-0 border-r border-border bg-surface flex flex-col transition-transform lg:static lg:translate-x-0"
      :class="sidebarOpen ? 'translate-x-0' : '-translate-x-full'"
      aria-label="Primary"
    >
      <div class="h-16 flex items-center px-5 border-b border-border">
        <NuxtLink to="/" class="flex items-center gap-2.5 rounded-md">
          <AppLogo size="sm" />
        </NuxtLink>
      </div>
      <nav class="flex-1 overflow-y-auto scrollbar-thin px-3 py-4 space-y-0.5">
        <NuxtLink
          v-for="item in nav"
          :key="item.to"
          :to="item.to"
          class="group flex items-center gap-3 rounded-md px-3 h-10 text-sm font-medium transition-colors"
          :class="isActive(item.to) ? 'bg-accent/12 text-fg' : 'text-fg-2 hover:bg-surface-3 hover:text-fg'"
          :aria-current="isActive(item.to) ? 'page' : undefined"
        >
          <Icon :name="item.icon" class="size-[18px] shrink-0" :class="isActive(item.to) ? 'text-accent' : 'text-fg-3 group-hover:text-fg-2'" />
          <span class="truncate">{{ item.label }}</span>
          <span v-if="item.to === '/approvals' && notif.unread" class="sr-only">has updates</span>
        </NuxtLink>
      </nav>
      <div class="p-3 border-t border-border space-y-3">
        <div class="rounded-md border border-border bg-surface-2 p-3">
          <div class="flex items-center justify-between">
            <span class="eyebrow">Mode</span>
            <ModeBadge :mode="status?.appMode === 'live' ? 'live' : status?.appMode === 'test' ? 'test' : 'demo'" />
          </div>
          <p class="mt-1.5 text-xs text-fg-3 leading-snug">
            <template v-if="status?.appMode === 'demo'">Synthetic data. No external calls, no real mail, no live AI.</template>
            <template v-else-if="status?.appMode === 'test'">Test mode: live data allowed, mail stays in sandbox.</template>
            <template v-else>Live mode: approvals send real mail via the configured provider.</template>
          </p>
        </div>
        <div class="flex items-center gap-2 px-1">
          <div class="size-8 rounded-full bg-accent/15 text-accent grid place-items-center text-xs font-semibold">{{ initials(user?.displayName ?? 'U') }}</div>
          <div class="min-w-0 flex-1">
            <p class="text-sm font-medium truncate">{{ user?.displayName }}</p>
            <p class="text-xs text-fg-3 truncate">{{ user?.email }}</p>
          </div>
          <button class="btn btn-ghost btn-sm !px-2" title="Sign out" aria-label="Sign out" @click="logout">
            <Icon name="lucide:log-out" class="size-4" />
          </button>
        </div>
      </div>
    </aside>

    <!-- Main -->
    <div class="flex-1 min-w-0 flex flex-col">
      <header class="sticky top-0 z-20 h-16 border-b border-border bg-bg/85 backdrop-blur flex items-center gap-3 px-4 sm:px-6">
        <button class="btn btn-ghost !px-2 lg:hidden" aria-label="Open navigation" @click="sidebarOpen = true">
          <Icon name="lucide:menu" class="size-5" />
        </button>
        <div class="flex-1 min-w-0">
          <slot name="header" />
        </div>
        <div class="flex items-center gap-1.5">
          <span class="hidden sm:inline-flex items-center gap-1.5 text-xs text-fg-3 mr-1" :title="connected ? 'Live updates connected' : 'Live updates reconnecting'">
            <span class="size-2 rounded-full" :class="connected ? 'bg-fern-500 live-dot' : 'bg-aurum-500'" />
            {{ connected ? 'Live' : 'Reconnecting' }}
          </span>
          <button class="btn btn-ghost !px-2" :aria-label="resolved === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'" @click="toggle">
            <Icon :name="resolved === 'dark' ? 'lucide:sun' : 'lucide:moon'" class="size-[18px]" />
          </button>
          <div class="relative">
            <button class="btn btn-ghost !px-2 relative" aria-label="Notifications" :aria-expanded="notifOpen" @click="notifOpen = !notifOpen">
              <Icon name="lucide:bell" class="size-[18px]" />
              <span v-if="notif.unread" class="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-garnet-500 text-white text-[10px] font-bold grid place-items-center">{{ notif.unread > 9 ? '9+' : notif.unread }}</span>
            </button>
            <Transition enter-active-class="transition" enter-from-class="opacity-0 translate-y-1" leave-active-class="transition" leave-to-class="opacity-0 translate-y-1">
              <div v-if="notifOpen" class="absolute right-0 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] card shadow-3 z-30 overflow-hidden">
                <div class="flex items-center justify-between px-4 py-3 border-b border-border">
                  <p class="text-sm font-semibold">Notifications</p>
                  <button class="text-xs text-accent hover:underline" :disabled="!notif.unread" @click="markRead()">Mark all read</button>
                </div>
                <ul class="max-h-96 overflow-y-auto scrollbar-thin divide-y divide-border">
                  <li v-if="!notif.notifications.length" class="px-4 py-8 text-center text-sm text-fg-3">You're all caught up.</li>
                  <li v-for="n in notif.notifications" :key="n.id" class="px-4 py-3 text-sm" :class="!n.readAt ? 'bg-accent/5' : ''">
                    <NuxtLink :to="n.href ?? '#'" class="block" @click="notifOpen = false; markRead([n.id])">
                      <div class="flex items-start gap-2">
                        <span class="mt-1.5 size-1.5 rounded-full shrink-0" :class="n.readAt ? 'bg-transparent' : 'bg-accent'" />
                        <div class="min-w-0">
                          <p class="font-medium leading-snug">{{ n.title }}</p>
                          <p v-if="n.body" class="text-xs text-fg-2 mt-0.5 line-clamp-2">{{ n.body }}</p>
                          <p class="text-[11px] text-fg-3 mt-1">{{ relTime(n.createdAt) }}</p>
                        </div>
                      </div>
                    </NuxtLink>
                  </li>
                </ul>
              </div>
            </Transition>
          </div>
        </div>
      </header>
      <main class="flex-1 px-4 sm:px-6 py-6 max-w-[1600px] w-full mx-auto">
        <slot />
      </main>
      <footer class="px-6 py-4 text-[11px] text-fg-3 border-t border-border flex flex-wrap gap-x-4 gap-y-1 items-center">
        <span>CreditOS is a personal operating tool, not legal advice. Dispute outcomes are never guaranteed.</span>
        <span class="ml-auto">v{{ $config.public.appVersion }}</span>
      </footer>
    </div>
  </div>
</template>
