<script setup lang="ts">
import { initials, relTime } from '~/utils/format'

const route = useRoute()
const router = useRouter()
const { user, clear } = useUserSession()
const { data: status } = await useAppStatus()
const { resolved, toggle } = useTheme()
const { data: notif, refresh: refreshNotif, markRead } = useNotifications()
const { connected, on } = useLiveEvents()
const toast = useToast()

const sidebarOpen = ref(false)
const notifOpen = ref(false)
const search = ref('')

const navGroups = [
  {
    label: 'Overview',
    items: [
      { to: '/', label: 'Dashboard', icon: 'lucide:layout-dashboard' },
      { to: '/reports', label: 'Reports', icon: 'lucide:file-bar-chart' },
      { to: '/monitoring', label: 'Monitoring', icon: 'lucide:radar' },
    ],
  },
  {
    label: 'Work',
    items: [
      { to: '/cases', label: 'Cases', icon: 'lucide:briefcase' },
      { to: '/approvals', label: 'Approvals', icon: 'lucide:badge-check', badge: () => notif.value.unread },
      { to: '/mailroom', label: 'Mailroom', icon: 'lucide:mailbox' },
    ],
  },
  {
    label: 'Protection',
    items: [
      { to: '/freezes', label: 'Freeze center', icon: 'lucide:snowflake' },
      { to: '/vault', label: 'Evidence vault', icon: 'lucide:folder-lock' },
    ],
  },
  {
    label: 'Account',
    items: [
      { to: '/activity', label: 'Activity', icon: 'lucide:scroll-text' },
      { to: '/settings', label: 'Settings', icon: 'lucide:settings-2' },
    ],
  },
]

function isActive(to: string) {
  return to === '/' ? route.path === '/' : route.path.startsWith(to)
}

const modeCopy = computed(() => {
  if (status.value?.appMode === 'live') return { title: 'Live mode', body: 'Approvals send real mail through the configured provider.' }
  if (status.value?.appMode === 'test') return { title: 'Test mode', body: 'Live data allowed; mail stays in the sandbox.' }
  return { title: 'Demo workspace', body: 'Synthetic data. No external calls, no real mail, no live AI.' }
})

function submitSearch() {
  const q = search.value.trim()
  router.push({ path: '/cases', query: q ? { q } : {} })
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
      <button v-if="sidebarOpen" class="fixed inset-0 z-30 bg-ink-950/50 backdrop-blur-[2px] lg:hidden" aria-label="Close navigation" @click="sidebarOpen = false" />
    </Transition>

    <!-- Brand rail -->
    <aside
      class="rail-gradient fixed inset-y-0 left-0 z-40 w-[272px] shrink-0 flex flex-col text-rail-text transition-transform lg:static lg:translate-x-0"
      :class="sidebarOpen ? 'translate-x-0' : '-translate-x-full'"
      aria-label="Primary"
    >
      <div class="h-[72px] flex items-center justify-between px-5">
        <NuxtLink to="/" class="rounded-md">
          <AppLogo size="sm" theme="dark" tagline />
        </NuxtLink>
        <button class="btn btn-rail btn-sm !px-2 lg:hidden" aria-label="Close navigation" @click="sidebarOpen = false">
          <Icon name="lucide:x" class="size-5" />
        </button>
      </div>

      <nav class="flex-1 overflow-y-auto scrollbar-thin px-3 pb-4 space-y-5">
        <div v-for="g in navGroups" :key="g.label">
          <p class="px-3 mb-1.5 text-[10.5px] font-bold uppercase tracking-[0.16em] text-rail-text-3">{{ g.label }}</p>
          <ul class="space-y-0.5">
            <li v-for="item in g.items" :key="item.to">
              <NuxtLink
                :to="item.to"
                class="group relative flex items-center gap-3 rounded-md pl-3 pr-2.5 h-10 text-[13.5px] font-medium transition-colors"
                :class="isActive(item.to) ? 'bg-white/10 text-white' : 'text-rail-text-2 hover:bg-white/6 hover:text-white'"
                :aria-current="isActive(item.to) ? 'page' : undefined"
              >
                <span v-if="isActive(item.to)" class="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-verdigris-400" aria-hidden="true" />
                <Icon :name="item.icon" class="size-[18px] shrink-0" :class="isActive(item.to) ? 'text-verdigris-300' : 'text-rail-text-3 group-hover:text-rail-text-2'" />
                <span class="truncate">{{ item.label }}</span>
                <span v-if="item.badge && item.badge()" class="ml-auto min-w-5 h-5 px-1.5 rounded-full bg-aurum-500 text-ink-900 text-[11px] font-bold grid place-items-center">{{ item.badge() }}</span>
              </NuxtLink>
            </li>
          </ul>
        </div>
      </nav>

      <div class="p-3 space-y-3 border-t border-rail-border">
        <div class="rounded-md border border-rail-border bg-white/[0.04] p-3.5">
          <div class="flex items-center justify-between">
            <p class="text-[13px] font-semibold text-white">{{ modeCopy.title }}</p>
            <ModeBadge :mode="status?.appMode === 'live' ? 'live' : status?.appMode === 'test' ? 'test' : 'demo'" />
          </div>
          <p class="mt-1 text-xs text-rail-text-2 leading-snug">{{ modeCopy.body }}</p>
        </div>
        <div class="flex items-center gap-3 px-1">
          <div class="size-9 rounded-full bg-verdigris-500/20 text-verdigris-300 grid place-items-center text-xs font-bold ring-1 ring-verdigris-400/30">{{ initials(user?.displayName ?? 'U') }}</div>
          <div class="min-w-0 flex-1">
            <p class="text-[13px] font-semibold text-white truncate">{{ user?.displayName }}</p>
            <p class="text-xs text-rail-text-3 truncate">{{ user?.email }}</p>
          </div>
          <button class="btn btn-rail btn-sm !px-2" title="Sign out" aria-label="Sign out" @click="logout">
            <Icon name="lucide:log-out" class="size-4" />
          </button>
        </div>
      </div>
    </aside>

    <!-- Main -->
    <div class="flex-1 min-w-0 flex flex-col">
      <header class="sticky top-0 z-20 h-[72px] border-b border-border bg-surface/90 backdrop-blur flex items-center gap-3 px-4 sm:px-8">
        <button class="btn btn-ghost !px-2 lg:hidden" aria-label="Open navigation" @click="sidebarOpen = true">
          <Icon name="lucide:menu" class="size-5" />
        </button>
        <NuxtLink to="/" class="lg:hidden rounded-md"><AppLogo size="sm" /></NuxtLink>

        <form class="hidden md:flex flex-1 max-w-md items-center" role="search" @submit.prevent="submitSearch">
          <label class="relative w-full">
            <span class="sr-only">Search cases</span>
            <Icon name="lucide:search" class="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-fg-3" />
            <input v-model="search" type="search" class="input !h-10 !pl-10 !shadow-none bg-surface-2 border-transparent focus:bg-surface" placeholder="Search cases, creditors, case codes…">
          </label>
        </form>

        <div class="flex-1 md:hidden min-w-0"><slot name="header" /></div>

        <div class="ml-auto flex items-center gap-1.5">
          <span class="hidden sm:inline-flex items-center gap-2 text-xs font-medium text-fg-2 mr-2 rounded-full border border-border bg-surface px-3 h-8" :title="connected ? 'Live updates connected' : 'Live updates reconnecting'">
            <span class="size-2 rounded-full" :class="connected ? 'bg-fern-500 live-dot' : 'bg-aurum-500'" />
            {{ connected ? 'Live updates' : 'Reconnecting' }}
          </span>
          <NuxtLink to="/cases?new=1" class="btn btn-primary btn-sm hidden sm:inline-flex"><Icon name="lucide:plus" class="size-4" /> New case</NuxtLink>
          <button class="btn btn-ghost !px-2.5" :aria-label="resolved === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'" @click="toggle">
            <Icon :name="resolved === 'dark' ? 'lucide:sun' : 'lucide:moon'" class="size-[18px]" />
          </button>
          <div class="relative">
            <button class="btn btn-ghost !px-2.5 relative" aria-label="Notifications" :aria-expanded="notifOpen" @click="notifOpen = !notifOpen">
              <Icon name="lucide:bell" class="size-[18px]" />
              <span v-if="notif.unread" class="absolute top-1 right-1 min-w-4 h-4 px-1 rounded-full bg-garnet-500 text-white text-[10px] font-bold grid place-items-center ring-2 ring-surface">{{ notif.unread > 9 ? '9+' : notif.unread }}</span>
            </button>
            <Transition enter-active-class="transition" enter-from-class="opacity-0 translate-y-1" leave-active-class="transition" leave-to-class="opacity-0 translate-y-1">
              <div v-if="notifOpen" class="absolute right-0 mt-2 w-[24rem] max-w-[calc(100vw-2rem)] card shadow-3 z-30 overflow-hidden">
                <div class="card-head !py-3 items-center">
                  <div>
                    <h2 class="!text-sm">Notifications</h2>
                    <p class="text-xs text-fg-3">{{ notif.unread ? `${notif.unread} unread` : 'All caught up' }}</p>
                  </div>
                  <button class="btn btn-ghost btn-xs" :disabled="!notif.unread" @click="markRead()">Mark all read</button>
                </div>
                <ul class="max-h-96 overflow-y-auto scrollbar-thin divide-y divide-border">
                  <li v-if="!notif.notifications.length" class="px-4 py-10 text-center text-sm text-fg-3">You're all caught up.</li>
                  <li v-for="n in notif.notifications" :key="n.id" class="text-sm" :class="!n.readAt ? 'bg-accent-soft/60' : ''">
                    <NuxtLink :to="n.href ?? '#'" class="block px-4 py-3 hover:bg-surface-2" @click="notifOpen = false; markRead([n.id])">
                      <div class="flex items-start gap-3">
                        <span class="mt-1.5 size-2 rounded-full shrink-0" :class="n.readAt ? 'bg-transparent' : 'bg-accent'" />
                        <div class="min-w-0">
                          <p class="font-semibold leading-snug">{{ n.title }}</p>
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

      <main class="flex-1 px-4 sm:px-8 py-6 sm:py-8 max-w-[1480px] w-full mx-auto">
        <slot />
      </main>

      <footer class="px-4 sm:px-8 py-5 border-t border-border bg-surface">
        <div class="max-w-[1480px] mx-auto flex flex-wrap gap-x-6 gap-y-2 items-center text-xs text-fg-3">
          <AppLogo size="sm" :wordmark="true" />
          <span class="hidden sm:inline h-4 w-px bg-border" />
          <span>CreditOS is a personal credit operations tool, not legal advice. Dispute outcomes are never guaranteed.</span>
          <span class="ml-auto flex items-center gap-4">
            <NuxtLink to="/settings?s=system" class="hover:text-fg">System</NuxtLink>
            <span class="mono">v{{ $config.public.appVersion }}</span>
          </span>
        </div>
      </footer>
    </div>
  </div>
</template>
