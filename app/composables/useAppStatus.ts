export interface AppStatus {
  hasUser: boolean
  appMode: 'demo' | 'test' | 'live'
  demoSeeded: boolean
  bootOk: boolean
  bootError: string | null
}

export function useAppStatus() {
  const fallback: AppStatus = { hasUser: true, appMode: 'demo', demoSeeded: false, bootOk: true, bootError: null }
  return useAsyncData<AppStatus>('app-status', () => $fetch<AppStatus>('/api/auth/status'), { default: () => fallback })
}

export function useNotifications() {
  const data = useState<{ unread: number; notifications: Array<{ id: string; title: string; body: string | null; href: string | null; severity: string; readAt: string | null; createdAt: string; kind: string }> }>('notifications', () => ({ unread: 0, notifications: [] }))
  async function refresh() {
    try {
      data.value = (await $fetch('/api/notifications')) as unknown as typeof data.value
    } catch {
      /* unauthenticated or offline */
    }
  }
  async function markRead(ids?: string[]) {
    await $fetch('/api/notifications/read', { method: 'POST', body: ids ? { ids } : { all: true } })
    await refresh()
  }
  return { data, refresh, markRead }
}
