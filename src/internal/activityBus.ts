/**
 * Internal, subscription-based telemetry channel — lets `devtools/createWorkerActivityMonitor`
 * observe task starts/ends/errors on a `useWorker()`/pool instance without polling and without
 * `useWorker`/`pool` importing anything from `devtools` (which would break tree-shaking of the
 * devtools chunk when it isn't used).
 */
export interface ActivityErrorInfo {
  name: string
  message: string
}

export interface ActivityListener {
  taskStart?(): void
  taskEnd?(durationMs: number): void
  taskError?(error: ActivityErrorInfo): void
}

export interface ActivityBus {
  emit: Required<ActivityListener>
  subscribe(listener: ActivityListener): () => void
}

/** Non-enumerable key devtools-carrying objects (`useWorker`/pool return values) stash their bus under. */
export const ACTIVITY_BUS = Symbol('vue-worker-kit.activityBus')

export function createActivityBus(): ActivityBus {
  const listeners = new Set<ActivityListener>()
  return {
    emit: {
      taskStart() {
        for (const listener of listeners) listener.taskStart?.()
      },
      taskEnd(durationMs) {
        for (const listener of listeners) listener.taskEnd?.(durationMs)
      },
      taskError(error) {
        for (const listener of listeners) listener.taskError?.(error)
      },
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

export function attachActivityBus<T extends object>(target: T, bus: ActivityBus): T {
  Object.defineProperty(target, ACTIVITY_BUS, {
    value: bus,
    enumerable: false,
    configurable: false,
  })
  return target
}

export function readActivityBus(source: object): ActivityBus | undefined {
  return (source as Record<symbol, ActivityBus | undefined>)[ACTIVITY_BUS]
}
