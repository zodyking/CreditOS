import type { AppStatus } from '~/composables/useAppStatus'

export default defineNuxtRouteMiddleware(async to => {
  const { loggedIn, fetch } = useUserSession()
  if (import.meta.server || !loggedIn.value) await fetch()
  const gate = useState<AppStatus | null>('app-status-gate', () => null)
  if (!gate.value || to.path === '/setup') gate.value = await $fetch<AppStatus>('/api/auth/status')
  if (!gate.value.bootOk) {
    if (to.path !== '/setup') return navigateTo('/setup')
    return
  }
  if (!loggedIn.value && to.path !== '/login') {
    return navigateTo({ path: '/login', query: to.fullPath !== '/' ? { next: to.fullPath } : {} })
  }
  if (loggedIn.value && (to.path === '/login' || to.path === '/setup')) return navigateTo('/')
})
