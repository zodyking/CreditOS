export type ThemeMode = 'dark' | 'light' | 'system'

const STORAGE_KEY = 'creditos-theme'

export function useTheme() {
  const mode = useState<ThemeMode>('theme-mode', () => 'light')
  const resolved = useState<'dark' | 'light'>('theme-resolved', () => 'light')

  function apply() {
    if (!import.meta.client) return
    const system = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    resolved.value = mode.value === 'system' ? system : mode.value
    document.documentElement.classList.toggle('dark', resolved.value === 'dark')
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved.value === 'dark' ? '#0B1220' : '#F5F7FB')
  }

  function init() {
    if (!import.meta.client) return
    const stored = localStorage.getItem(STORAGE_KEY) as ThemeMode | null
    mode.value = stored ?? 'light'
    apply()
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => mode.value === 'system' && apply())
  }

  function set(next: ThemeMode) {
    mode.value = next
    if (import.meta.client) localStorage.setItem(STORAGE_KEY, next)
    apply()
  }

  function toggle() {
    set(resolved.value === 'dark' ? 'light' : 'dark')
  }

  return { mode, resolved, init, set, toggle }
}
