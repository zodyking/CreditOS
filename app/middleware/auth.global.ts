export default defineNuxtRouteMiddleware(async to => {
  const { loggedIn, fetch } = useUserSession()
  if (import.meta.server || !loggedIn.value) await fetch()
  const publicRoutes = ['/login', '/setup']
  if (!loggedIn.value && !publicRoutes.includes(to.path)) {
    return navigateTo({ path: '/login', query: to.fullPath !== '/' ? { next: to.fullPath } : {} })
  }
  if (loggedIn.value && publicRoutes.includes(to.path)) return navigateTo('/')
})
