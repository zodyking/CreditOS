import { requireUser } from '../utils/auth'
import { liveBus, type LiveEvent } from '../utils/events'

/** Server-sent events: only events for the authenticated user (or global ones) are forwarded. */
export default defineEventHandler(async event => {
  const user = await requireUser(event)
  const stream = createEventStream(event)
  const onEvent = (evt: LiveEvent) => {
    if (evt.userId && evt.userId !== user.id) return
    void stream.push({ id: evt.id, event: evt.type, data: JSON.stringify({ type: evt.type, at: evt.at, payload: evt.payload }) })
  }
  liveBus.on('event', onEvent)
  // Flush headers immediately so EventSource fires `open` without waiting for the first event.
  void stream.push({ event: 'heartbeat', data: JSON.stringify({ type: 'heartbeat', at: new Date().toISOString(), payload: { connected: true } }) })
  const heartbeat = setInterval(() => void stream.push({ event: 'heartbeat', data: JSON.stringify({ type: 'heartbeat', at: new Date().toISOString(), payload: {} }) }), 25_000)
  stream.onClosed(async () => {
    clearInterval(heartbeat)
    liveBus.off('event', onEvent)
    await stream.close()
  })
  return stream.send()
})
