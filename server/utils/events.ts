import { EventEmitter } from 'node:events'

export interface LiveEvent {
  id: string
  type: string
  at: string
  userId?: string
  payload: Record<string, unknown>
}

class LiveBus extends EventEmitter {
  private seq = 0
  publish(type: string, payload: Record<string, unknown>, userId?: string): LiveEvent {
    const evt: LiveEvent = {
      id: `${Date.now()}-${++this.seq}`,
      type,
      at: new Date().toISOString(),
      userId,
      payload,
    }
    this.emit('event', evt)
    return evt
  }
}

const g = globalThis as unknown as { __creditosBus?: LiveBus }
export const liveBus: LiveBus = g.__creditosBus ?? (g.__creditosBus = new LiveBus())
liveBus.setMaxListeners(100)
