import { computed, ref } from 'vue'
import type { ComputedRef } from 'vue'
import { readActivityBus } from '../internal/activityBus'
import type { WorkerPool } from '../adapters/pool'
import type { UseWorkerReturn } from '../useWorker'

export type WorkerActivitySource = WorkerPool<unknown, unknown> | UseWorkerReturn<unknown, unknown>

export interface WorkerActivityError {
  name: string
  message: string
  at: number
}

export interface WorkerActivitySnapshot {
  busy: number
  idle: number
  queued: number
  averageTaskMs: number | null
  recentErrors: WorkerActivityError[]
}

export interface WorkerActivityMonitorOptions {
  /** Cap on the retained error history. Default `20`. */
  maxErrors?: number
  /** Rolling window size used to compute `averageTaskMs`. Default `50`. */
  maxSamples?: number
}

export interface WorkerActivityMonitor {
  readonly snapshot: ComputedRef<WorkerActivitySnapshot>
  clearErrors(): void
  /** Unsubscribes from the underlying pool/worker's activity bus. */
  dispose(): void
}

function isPoolSource(source: WorkerActivitySource): source is WorkerPool<unknown, unknown> {
  return 'stats' in source
}

/**
 * Builds a reactive activity snapshot for a `createWorkerPool()`/`useWorkerPool()` pool or a
 * single `useWorker()` instance, driven by the internal activity bus (no polling). Does not
 * depend on `@vue/devtools-api` — this is a standalone debug panel, not a browser-extension
 * integration, to keep the package dependency-free.
 */
export function createWorkerActivityMonitor(
  source: WorkerActivitySource,
  options: WorkerActivityMonitorOptions = {},
): WorkerActivityMonitor {
  const maxErrors = options.maxErrors ?? 20
  const maxSamples = options.maxSamples ?? 50

  const durations: number[] = []
  const averageTaskMs = ref<number | null>(null)
  const recentErrors = ref<WorkerActivityError[]>([])

  const bus = readActivityBus(source)
  const unsubscribe = bus?.subscribe({
    taskEnd(durationMs) {
      durations.push(durationMs)
      if (durations.length > maxSamples) durations.shift()
      averageTaskMs.value = durations.reduce((sum, d) => sum + d, 0) / durations.length
    },
    taskError(error) {
      recentErrors.value = [{ ...error, at: Date.now() }, ...recentErrors.value].slice(0, maxErrors)
    },
  })

  const snapshot = computed<WorkerActivitySnapshot>(() => {
    const stats = isPoolSource(source)
      ? source.stats.value
      : { busy: source.isRunning.value ? 1 : 0, idle: source.isRunning.value ? 0 : 1, queued: 0 }

    return {
      busy: stats.busy,
      idle: stats.idle,
      queued: stats.queued,
      averageTaskMs: averageTaskMs.value,
      recentErrors: recentErrors.value,
    }
  })

  function clearErrors(): void {
    recentErrors.value = []
  }

  function dispose(): void {
    unsubscribe?.()
  }

  return { snapshot, clearErrors, dispose }
}
