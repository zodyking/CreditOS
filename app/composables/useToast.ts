export interface Toast {
  id: number
  title: string
  body?: string
  kind: 'info' | 'success' | 'error' | 'warning'
  href?: string
  timeout: number
}

let seq = 0

export function useToast() {
  const toasts = useState<Toast[]>('toasts', () => [])

  function push(input: Omit<Toast, 'id' | 'timeout'> & { timeout?: number }) {
    const id = ++seq
    const t: Toast = { id, timeout: input.timeout ?? (input.kind === 'error' ? 8000 : 4500), ...input }
    toasts.value = [...toasts.value, t].slice(-5)
    if (import.meta.client && t.timeout > 0) setTimeout(() => dismiss(id), t.timeout)
    return id
  }

  function dismiss(id: number) {
    toasts.value = toasts.value.filter(t => t.id !== id)
  }

  return {
    toasts,
    push,
    dismiss,
    success: (title: string, body?: string) => push({ kind: 'success', title, body }),
    error: (title: string, body?: string) => push({ kind: 'error', title, body }),
    info: (title: string, body?: string) => push({ kind: 'info', title, body }),
    warning: (title: string, body?: string) => push({ kind: 'warning', title, body }),
  }
}

/** Extract a human-readable message from a $fetch error. */
export function errorMessage(e: unknown): string {
  if (e && typeof e === 'object') {
    const anyE = e as { data?: { statusMessage?: string; message?: string }; statusMessage?: string; message?: string }
    return anyE.data?.statusMessage ?? anyE.data?.message ?? anyE.statusMessage ?? anyE.message ?? 'Something went wrong'
  }
  return String(e)
}
