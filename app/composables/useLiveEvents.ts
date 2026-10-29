export interface LiveEventMessage {
  type: string
  at: string
  payload: Record<string, unknown>
}

type Listener = (evt: LiveEventMessage) => void

/**
 * Single shared SSE connection per tab. Components subscribe with `on()` and
 * get a dispose function; the connection closes when nobody listens.
 */
export function useLiveEvents() {
  const connected = useState<boolean>('sse-connected', () => false)
  const lastEvent = useState<LiveEventMessage | null>('sse-last', () => null)
  const registry = useState<{ listeners: Set<Listener>; source: EventSource | null }>('sse-registry', () => ({ listeners: new Set(), source: null }))

  function ensure() {
    if (!import.meta.client || registry.value.source) return
    const es = new EventSource('/api/events')
    registry.value.source = es
    es.onopen = () => (connected.value = true)
    es.onerror = () => (connected.value = false)
    es.onmessage = e => dispatch(e)
    for (const type of ['case.event', 'case.status', 'council.started', 'council.progress', 'council.transcript', 'council.completed', 'council.failed', 'mail.status', 'inbound.status', 'freeze.status', 'notification', 'monitoring.event', 'audit', 'job.enqueued', 'heartbeat']) {
      es.addEventListener(type, e => dispatch(e as MessageEvent))
    }
  }

  function dispatch(e: MessageEvent) {
    try {
      const parsed = JSON.parse(e.data) as LiveEventMessage
      if (!parsed.type) return
      if (parsed.type !== 'heartbeat') lastEvent.value = parsed
      for (const l of registry.value.listeners) l(parsed)
    } catch {
      /* ignore malformed */
    }
  }

  function on(listener: Listener, types?: string[]) {
    const wrapped: Listener = evt => {
      if (!types || types.includes(evt.type)) listener(evt)
    }
    registry.value.listeners.add(wrapped)
    ensure()
    const dispose = () => {
      registry.value.listeners.delete(wrapped)
      if (registry.value.listeners.size === 0 && registry.value.source) {
        registry.value.source.close()
        registry.value.source = null
        connected.value = false
      }
    }
    if (getCurrentScope()) onScopeDispose(dispose)
    return dispose
  }

  return { connected, lastEvent, on }
}
