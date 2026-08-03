import { computed, getCurrentScope, onScopeDispose, ref, shallowRef } from 'vue'
import type { ComputedRef, ShallowRef } from 'vue'
import { WorkerError, WorkerUnavailableError, isAbortError, toAbortError } from '../errors'
import { attachActivityBus, createActivityBus } from '../internal/activityBus'
import { createWorkerClient, type WorkerClient } from '../internal/workerClient'
import type { WorkerLike } from '../protocol'
import type { RunOptions, WorkerModuleInput, WorkerModuleOutput, UseWorkerCacheOptions } from '../types'

export interface UseSharedWorkerOptions {
  /** Milliseconds of idle time before the worker self-terminates; `false` disables it. Default `30000`. */
  idleTimeout?: number | false
  /** Automatic retries on rejection, not applied to cancellations. Default `0`. */
  retries?: number
  /** Delay function for exponential backoff. */
  retryDelay?: (attempt: number) => number
  /** Cache options for memoization. */
  cache?: UseWorkerCacheOptions
  /** Enable streaming mode with chunked results. */
  streaming?: boolean
  /** Unique name for the SharedWorker - multiple tabs with same name share the worker */
  name?: string
}

export interface UseSharedWorkerReturn<In, Out> {
  run(input: In, options?: RunOptions): Promise<Out>
  isRunning: ComputedRef<boolean>
  progress: ShallowRef<number>
  error: ShallowRef<WorkerError | null>
  cancel(): void
  warmup(): Promise<void>
  chunks?: ShallowRef<unknown[]>
}

/**
 * Composable for SharedWorker - allows reuse of a single worker across multiple browser tabs.
 * Note: Not supported in Safari iOS and Chrome Android.
 */
export function useSharedWorker<TModule>(
  factory: () => SharedWorker,
  options: UseSharedWorkerOptions = {},
): UseSharedWorkerReturn<WorkerModuleInput<TModule>, WorkerModuleOutput<TModule>> {
  const idleTimeout = options.idleTimeout ?? 30_000
  const retries = options.retries ?? 0
  const retryDelay = options.retryDelay
  const cacheOptions = options.cache
  const streaming = options.streaming ?? false

  let worker: SharedWorker | null = null
  let client: WorkerClient | null = null
  let idleTimer: ReturnType<typeof setTimeout> | undefined
  const internalControllers = new Set<AbortController>()

  // LRU cache for memoization
  const cache = cacheOptions?.cache === 'lru' ? new Map<string, unknown>() : null
  const maxCacheSize = cacheOptions?.maxCacheSize ?? 50

  const activeCount = ref(0)
  const isRunning = computed(() => activeCount.value > 0)
  const progress = shallowRef(0)
  const error = shallowRef<WorkerError | null>(null)
  const chunks = streaming ? shallowRef<unknown[]>([]) : undefined
  const activityBus = createActivityBus()

  function clearIdleTimer(): void {
    if (idleTimer !== undefined) {
      clearTimeout(idleTimer)
      idleTimer = undefined
    }
  }

  function scheduleIdleTimer(): void {
    clearIdleTimer()
    if (idleTimeout === false || activeCount.value > 0) return
    idleTimer = setTimeout(() => terminate(), idleTimeout)
  }

  function terminate(): void {
    clearIdleTimer()
    client?.dispose(toAbortError('SharedWorker terminated'))
    if (worker) {
      worker.port.postMessage({ type: 'terminate' })
      worker.port.close()
    }
    worker = null
    client = null
  }

  function ensureClient(): WorkerClient {
    if (typeof SharedWorker === 'undefined') {
      throw new WorkerUnavailableError('SharedWorker is not supported in this environment')
    }
    clearIdleTimer()
    if (!client) {
      worker = factory()
      // SharedWorker uses port for communication
      const portLike: WorkerLike = {
        postMessage: (message, transfer) => worker!.port.postMessage(message, transfer ?? []),
        terminate: () => worker!.port.close(),
        onmessage: null,
        onerror: null,
      }
      client = createWorkerClient(portLike)
      // Forward messages from port to client
      worker.port.onmessage = (event) => {
        if (client && portLike.onmessage) {
          portLike.onmessage(event as MessageEvent)
        }
      }
    }
    return client
  }

  function pruneCache(): void {
    if (!cache || cache.size <= maxCacheSize) return
    const keys = Array.from(cache.keys())
    for (let i = 0; i < keys.length - maxCacheSize; i++) {
      cache.delete(keys[i])
    }
  }

  function getCachedResult(key: string): unknown | undefined {
    if (!cache) return undefined
    const result = cache.get(key)
    if (result !== undefined) {
      cache.delete(key)
      cache.set(key, result)
    }
    return result
  }

  function setCachedResult(key: string, result: unknown): void {
    if (!cache) return
    cache.delete(key)
    cache.set(key, result)
    pruneCache()
  }

  function runOnce(
    input: unknown,
    transfer: Transferable[] | undefined,
    signal: AbortSignal,
    onProgress: (value: number) => void,
    onChunk: ((chunk: unknown) => void) | undefined,
  ): Promise<unknown> {
    const activeClient = ensureClient()
    const { id, promise } = activeClient.send(input, transfer, onProgress, onChunk)

    if (signal.aborted) {
      activeClient.cancel(id, signal.reason)
      return Promise.reject(toAbortError(signal.reason))
    }

    return new Promise((resolve, reject) => {
      const onAbort = (): void => {
        activeClient.cancel(id, signal.reason)
        reject(toAbortError(signal.reason))
      }
      signal.addEventListener('abort', onAbort, { once: true })
      promise.then(
        (value) => {
          signal.removeEventListener('abort', onAbort)
          resolve(value)
        },
        (err) => {
          signal.removeEventListener('abort', onAbort)
          reject(err)
        },
      )
    })
  }

  async function run(input: unknown, runOptions: RunOptions = {}): Promise<unknown> {
    const cacheKey = cache ? JSON.stringify(input) : null
    if (cacheKey !== null) {
      const cachedResult = getCachedResult(cacheKey)
      if (cachedResult !== undefined) {
        return cachedResult
      }
    }

    const internalController = runOptions.signal ? null : new AbortController()
    if (internalController) internalControllers.add(internalController)
    const signal = runOptions.signal ?? internalController!.signal

    activeCount.value++
    progress.value = 0
    error.value = null
    if (chunks) chunks.value = []
    const startedAt = Date.now()
    activityBus.emit.taskStart()

    try {
      let attempt = 0
      for (;;) {
        try {
          const result = await runOnce(
            input,
            runOptions.transfer,
            signal,
            (value) => {
              progress.value = value
            },
            streaming && chunks
              ? (chunk) => {
                  chunks.value.push(chunk)
                }
              : undefined,
          )
          if (cacheKey !== null) {
            setCachedResult(cacheKey, result)
          }
          return result
        } catch (err) {
          if (isAbortError(err) || err instanceof WorkerUnavailableError) throw err
          if (attempt < retries) {
            attempt++
            if (retryDelay) {
              const delay = retryDelay(attempt)
              await new Promise((resolve) => setTimeout(resolve, delay))
            }
            continue
          }
          const workerError = err instanceof WorkerError ? err : new WorkerError(String(err))
          error.value = workerError
          activityBus.emit.taskError({ name: workerError.name, message: workerError.message })
          throw workerError
        }
      }
    } finally {
      activeCount.value--
      activityBus.emit.taskEnd(Date.now() - startedAt)
      if (internalController) internalControllers.delete(internalController)
      scheduleIdleTimer()
    }
  }

  function cancel(): void {
    for (const controller of internalControllers) controller.abort()
  }

  async function warmup(): Promise<void> {
    ensureClient()
  }

  if (getCurrentScope()) {
    onScopeDispose(() => terminate())
  }

  const result: UseSharedWorkerReturn<WorkerModuleInput<TModule>, WorkerModuleOutput<TModule>> = {
    run: run as UseSharedWorkerReturn<WorkerModuleInput<TModule>, WorkerModuleOutput<TModule>>['run'],
    isRunning,
    progress,
    error,
    cancel,
    warmup,
  }
  if (chunks) {
    result.chunks = chunks as ShallowRef<unknown[]>
  }

  return attachActivityBus(result, activityBus)
}
