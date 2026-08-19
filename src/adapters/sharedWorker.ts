import { computed, getCurrentScope, onScopeDispose, ref, shallowRef } from 'vue'
import type { ComputedRef, Ref, ShallowRef } from 'vue'
import { WorkerError, WorkerUnavailableError, isAbortError, toAbortError } from '../errors'
import { attachActivityBus, createActivityBus } from '../internal/activityBus'
import { createWorkerClient, type WorkerClient } from '../internal/workerClient'
import type { DisconnectMessage, SharedWorkerToMainMessage, WorkerLike } from '../protocol'
import type { RunOptions, WorkerModuleInput, WorkerModuleOutput, UseWorkerCacheOptions } from '../types'

export interface UseSharedWorkerOptions {
  /** Automatic retries on rejection, not applied to cancellations. Default `0`. */
  retries?: number
  /** Delay function for exponential backoff. */
  retryDelay?: (attempt: number) => number
  /** Cache options for memoization. */
  cache?: UseWorkerCacheOptions
  /** Enable streaming mode with chunked results. */
  streaming?: boolean
}

export interface UseSharedWorkerReturn<In, Out> {
  run(input: In, options?: RunOptions): Promise<Out>
  /** Establishes this tab's connection to the shared worker (idempotent). `run()` calls it lazily if you don't. */
  connect(): void
  /** Closes this tab's port without terminating the worker — other tabs stay connected. */
  disconnect(): void
  /** Number of tabs currently connected, as last reported by the worker (see the caveat on `attachSharedWorkerProtocol`: a tab that disappears without calling `disconnect()` — a crash, a force-close — is never subtracted). */
  portCount: Ref<number>
  isRunning: ComputedRef<boolean>
  progress: ShallowRef<number>
  error: ShallowRef<WorkerError | null>
  cancel(): void
  chunks?: ShallowRef<unknown[]>
}

/**
 * Composable for `SharedWorker` — reuses a single worker across every tab/window of the same
 * origin that connects to it, instead of one worker per tab. **Not supported in Safari iOS or
 * Chrome Android** — no `SharedWorker` constructor exists there at all; `connect()`/`run()`
 * throw `WorkerUnavailableError` in that case, the same way `useWorker()` does under SSR.
 *
 * The worker-side file is a normal `defineWorkerHandler()` module — the same file can be used
 * with `useWorker()` (via `new Worker(...)`) or `useSharedWorker()` (via `new SharedWorker(...)`).
 */
export function useSharedWorker<TModule>(
  factory: () => SharedWorker,
  options: UseSharedWorkerOptions = {},
): UseSharedWorkerReturn<WorkerModuleInput<TModule>, WorkerModuleOutput<TModule>> {
  const retries = options.retries ?? 0
  const retryDelay = options.retryDelay
  const cacheOptions = options.cache
  const streaming = options.streaming ?? false

  let worker: SharedWorker | null = null
  let client: WorkerClient | null = null
  const internalControllers = new Set<AbortController>()

  const cache = cacheOptions?.cache === 'lru' ? new Map<string, unknown>() : null
  const maxCacheSize = cacheOptions?.maxCacheSize ?? 50

  const activeCount = ref(0)
  const isRunning = computed(() => activeCount.value > 0)
  const progress = shallowRef(0)
  const error = shallowRef<WorkerError | null>(null)
  const portCount = ref(0)
  const chunks = streaming ? shallowRef<unknown[]>([]) : undefined
  const activityBus = createActivityBus()

  function ensureClient(): WorkerClient {
    if (typeof SharedWorker === 'undefined') {
      throw new WorkerUnavailableError('SharedWorker is not supported in this environment')
    }
    if (client) return client

    worker = factory()
    const activeWorker = worker
    const portLike: WorkerLike = {
      postMessage: (message, transfer) => activeWorker.port.postMessage(message, transfer ?? []),
      // A SharedWorker's port can't be "terminated" from one tab — that would kill it for every
      // other tab still connected. disconnect() is the real, cooperative teardown for this tab.
      terminate: () => {},
      onmessage: null,
      onerror: null,
    }
    client = createWorkerClient(portLike)

    worker.port.onmessage = (event: MessageEvent<SharedWorkerToMainMessage>) => {
      if (event.data.type === 'portCount') {
        portCount.value = event.data.count
        return
      }
      portLike.onmessage?.(event)
    }
    worker.port.start()

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
    }
  }

  function cancel(): void {
    for (const controller of internalControllers) controller.abort()
  }

  function connect(): void {
    ensureClient()
  }

  function disconnect(): void {
    if (!client || !worker) return
    const message: DisconnectMessage = { type: 'disconnect' }
    worker.port.postMessage(message)
    client.dispose(toAbortError('SharedWorker port disconnected'))
    worker.port.close()
    client = null
    worker = null
    portCount.value = 0
  }

  if (getCurrentScope()) {
    onScopeDispose(() => disconnect())
  }

  const result: UseSharedWorkerReturn<WorkerModuleInput<TModule>, WorkerModuleOutput<TModule>> = {
    run: run as UseSharedWorkerReturn<WorkerModuleInput<TModule>, WorkerModuleOutput<TModule>>['run'],
    connect,
    disconnect,
    portCount,
    isRunning,
    progress,
    error,
    cancel,
  }
  if (chunks) {
    result.chunks = chunks as ShallowRef<unknown[]>
  }

  return attachActivityBus(result, activityBus)
}
