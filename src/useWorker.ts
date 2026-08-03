import { computed, getCurrentScope, onScopeDispose, ref, shallowRef } from 'vue'
import type { ComputedRef, ShallowRef } from 'vue'
import { WorkerError, WorkerUnavailableError, isAbortError, toAbortError } from './errors'
import { attachActivityBus, createActivityBus } from './internal/activityBus'
import { createWorkerClient, type WorkerClient } from './internal/workerClient'
import type { WorkerLike } from './protocol'
import type { RunOptions, WorkerModuleInput, WorkerModuleOutput, UseWorkerCacheOptions } from './types'

export interface UseWorkerOptions {
  /** Milliseconds of idle time before the worker self-terminates; `false` disables it. Default `30000`. */
  idleTimeout?: number | false
  /** Automatic retries on rejection, not applied to cancellations. Default `0`. */
  retries?: number
  /** Delay function for exponential backoff. Default: immediate retry. */
  retryDelay?: (attempt: number) => number
  /** Terminate & recreate the worker immediately on abort, instead of waiting for cooperative `ctx.signal` handling. Default `false`. */
  hardCancelOnAbort?: boolean
  /** Cache options for memoization. */
  cache?: UseWorkerCacheOptions
  /** Enable streaming mode with chunked results. */
  streaming?: boolean
}

export interface UseWorkerReturn<In, Out> {
  run(input: In, options?: RunOptions): Promise<Out>
  isRunning: ComputedRef<boolean>
  progress: ShallowRef<number>
  error: ShallowRef<WorkerError | null>
  cancel(): void
  /** Pre-create the worker without running any task. */
  warmup(): Promise<void>
  /** Reactive array of chunks for streaming mode. */
  chunks?: ShallowRef<unknown[]>
}

/**
 * Main-thread composable wrapping a single lazily-created worker. `TModule` is meant to be
 * `typeof import('./x.worker')` — `run()`'s input/output types are read off of it, see
 * `WorkerModuleInput`/`WorkerModuleOutput` in `./types`.
 */
export function useWorker<TModule>(
  factory: () => Worker,
  options: UseWorkerOptions = {},
): UseWorkerReturn<WorkerModuleInput<TModule>, WorkerModuleOutput<TModule>> {
  const idleTimeout = options.idleTimeout ?? 30_000
  const retries = options.retries ?? 0
  const retryDelay = options.retryDelay
  const hardCancelOnAbort = options.hardCancelOnAbort ?? false
  const cacheOptions = options.cache
  const streaming = options.streaming ?? false

  let worker: WorkerLike | null = null
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
    client?.dispose(toAbortError('Worker terminated'))
    worker?.terminate()
    worker = null
    client = null
  }

  function ensureClient(): WorkerClient {
    if (typeof Worker === 'undefined') {
      throw new WorkerUnavailableError()
    }
    clearIdleTimer()
    if (!client) {
      worker = factory() as unknown as WorkerLike
      client = createWorkerClient(worker)
    }
    return client
  }

  function pruneCache(): void {
    if (!cache || cache.size <= maxCacheSize) return
    // Remove oldest entries (first inserted)
    const keys = Array.from(cache.keys())
    for (let i = 0; i < keys.length - maxCacheSize; i++) {
      cache.delete(keys[i])
    }
  }

  function getCachedResult(key: string): unknown | undefined {
    if (!cache) return undefined
    const result = cache.get(key)
    if (result !== undefined) {
      // Move to end (most recently used)
      cache.delete(key)
      cache.set(key, result)
    }
    return result
  }

  function setCachedResult(key: string, result: unknown): void {
    if (!cache) return
    cache.delete(key) // Remove old entry if exists
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
        if (hardCancelOnAbort) terminate()
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
    // Check cache first if enabled
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
          // Cache the result if enabled
          if (cacheKey !== null) {
            setCachedResult(cacheKey, result)
          }
          return result
        } catch (err) {
          if (isAbortError(err) || err instanceof WorkerUnavailableError) throw err
          if (attempt < retries) {
            attempt++
            // Apply exponential backoff if retryDelay is provided
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

  const result: UseWorkerReturn<WorkerModuleInput<TModule>, WorkerModuleOutput<TModule>> = {
    run: run as UseWorkerReturn<WorkerModuleInput<TModule>, WorkerModuleOutput<TModule>>['run'],
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
