import { computed, ref, shallowRef, triggerRef } from 'vue'
import type { ComputedRef, Ref, ShallowRef } from 'vue'
import {
  WORKER_SUPERSEDED,
  WorkerError,
  WorkerUnavailableError,
  isAbortError,
  toAbortError,
} from '../errors'
import type { ActivityBus } from './activityBus'
import type { WorkerClient } from './workerClient'
import type { RunOptions, UnwrapMode, UseWorkerCacheOptions, WorkerConcurrency } from '../types'

export interface RunEngineOptions {
  getClient(): WorkerClient
  activityBus: ActivityBus
  concurrency?: WorkerConcurrency
  retries?: number
  retryDelay?: (attempt: number) => number
  cache?: UseWorkerCacheOptions
  streaming?: boolean
  unwrap?: UnwrapMode
  hardCancel?: () => void
  onSettled?: () => void
}

export interface RunEngine {
  run(input: unknown, runOptions?: RunOptions): Promise<unknown>
  cancel(): void
  activeCount: Ref<number>
  isRunning: ComputedRef<boolean>
  progress: ShallowRef<number>
  error: ShallowRef<WorkerError | null>
  chunks: ShallowRef<unknown[]> | undefined
}

interface RunHandle {
  controller: AbortController
  external: boolean
  detach(): void
}

interface SerialEntry {
  start(): Promise<unknown>
  resolve(value: unknown): void
  reject(reason: unknown): void
  started: boolean
  cleanup(): void
}

function cacheKeyFor(input: unknown, op: string | undefined): string {
  return op === undefined ? JSON.stringify(input) : JSON.stringify([op, input])
}

export function createRunEngine(options: RunEngineOptions): RunEngine {
  const mode = options.concurrency ?? 'parallel'
  const retries = options.retries ?? 0
  const retryDelay = options.retryDelay
  const streaming = options.streaming ?? false
  const defaultUnwrap = options.unwrap ?? 'shallow'
  const cache = options.cache?.cache === 'lru' ? new Map<string, unknown>() : null
  const maxCacheSize = options.cache?.maxCacheSize ?? 50

  const activeCount = ref(0)
  const isRunning = computed(() => activeCount.value > 0)
  const progress = shallowRef(0)
  const error = shallowRef<WorkerError | null>(null)
  const chunks = streaming ? shallowRef<unknown[]>([]) : undefined

  const handles = new Set<RunHandle>()
  const serialQueue: SerialEntry[] = []
  let serialActive = false
  let latestHandle: RunHandle | null = null
  let chunkFlushScheduled = false

  function flushChunks(): void {
    if (!chunkFlushScheduled || !chunks) return
    chunkFlushScheduled = false
    triggerRef(chunks)
  }

  function scheduleChunkFlush(): void {
    if (!chunks || chunkFlushScheduled) return
    chunkFlushScheduled = true
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(flushChunks)
    } else {
      queueMicrotask(flushChunks)
    }
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

  function makeHandle(runOptions: RunOptions): RunHandle {
    const controller = new AbortController()
    const callerSignal = runOptions.signal
    let detach = (): void => {}
    if (callerSignal) {
      if (callerSignal.aborted) {
        controller.abort(callerSignal.reason)
      } else {
        const onAbort = (): void => controller.abort(callerSignal.reason)
        callerSignal.addEventListener('abort', onAbort, { once: true })
        detach = () => callerSignal.removeEventListener('abort', onAbort)
      }
    }
    const handle: RunHandle = {
      controller,
      external: callerSignal !== undefined,
      detach: () => detach(),
    }
    handles.add(handle)
    return handle
  }

  function releaseHandle(handle: RunHandle): void {
    handle.detach()
    handles.delete(handle)
  }

  function runOnce(
    input: unknown,
    transfer: Transferable[] | undefined,
    signal: AbortSignal,
    onProgress: (value: number) => void,
    onChunk: ((chunk: unknown) => void) | undefined,
    sendOptions: { op?: string; unwrap: UnwrapMode },
  ): Promise<unknown> {
    const activeClient = options.getClient()
    const { id, promise } = activeClient.send(input, transfer, onProgress, onChunk, sendOptions)

    if (signal.aborted) {
      activeClient.cancel(id, signal.reason)
      return Promise.reject(toAbortError(signal.reason))
    }

    return new Promise((resolve, reject) => {
      const onAbort = (): void => {
        activeClient.cancel(id, signal.reason)
        options.hardCancel?.()
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

  async function execute(
    handle: RunHandle,
    input: unknown,
    runOptions: RunOptions,
    cacheKey: string | null,
  ): Promise<unknown> {
    const signal = handle.controller.signal
    if (mode !== 'parallel') latestHandle = handle
    const isCurrent = (): boolean => mode === 'parallel' || latestHandle === handle

    progress.value = 0
    error.value = null
    if (chunks) chunks.value = []
    const startedAt = Date.now()
    options.activityBus.emit.taskStart()

    const accumulate = streaming && chunks !== undefined
    const onProgress = (value: number): void => {
      if (isCurrent()) progress.value = value
      runOptions.onProgress?.(value)
    }
    const onChunk =
      accumulate || runOptions.onChunk
        ? (chunk: unknown): void => {
            if (accumulate && chunks && isCurrent()) {
              chunks.value.push(chunk)
              scheduleChunkFlush()
            }
            runOptions.onChunk?.(chunk)
          }
        : undefined
    const sendOptions = { op: runOptions.op, unwrap: runOptions.unwrap ?? defaultUnwrap }

    try {
      let attempt = 0
      for (;;) {
        try {
          const result = await runOnce(
            input,
            runOptions.transfer,
            signal,
            onProgress,
            onChunk,
            sendOptions,
          )
          if (cacheKey !== null) setCachedResult(cacheKey, result)
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
          options.activityBus.emit.taskError({
            name: workerError.name,
            message: workerError.message,
          })
          throw workerError
        }
      }
    } finally {
      flushChunks()
      options.activityBus.emit.taskEnd(Date.now() - startedAt)
    }
  }

  function drainSerial(): void {
    if (serialActive) return
    const entry = serialQueue.shift()
    if (!entry) return
    serialActive = true
    entry.started = true
    entry.cleanup()
    entry
      .start()
      .then(entry.resolve, entry.reject)
      .finally(() => {
        serialActive = false
        drainSerial()
      })
  }

  function enqueueSerial(handle: RunHandle, start: () => Promise<unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const signal = handle.controller.signal
      if (signal.aborted) {
        reject(toAbortError(signal.reason))
        return
      }
      const entry: SerialEntry = { start, resolve, reject, started: false, cleanup: () => {} }
      const onQueuedAbort = (): void => {
        if (entry.started) return
        const index = serialQueue.indexOf(entry)
        if (index >= 0) serialQueue.splice(index, 1)
        reject(toAbortError(signal.reason))
      }
      signal.addEventListener('abort', onQueuedAbort, { once: true })
      entry.cleanup = () => signal.removeEventListener('abort', onQueuedAbort)
      serialQueue.push(entry)
      drainSerial()
    })
  }

  function supersedeAll(): void {
    for (const handle of Array.from(handles)) handle.controller.abort(WORKER_SUPERSEDED)
  }

  function runUnsafe(input: unknown, runOptions: RunOptions): Promise<unknown> {
    if (mode === 'latest') supersedeAll()

    const cacheKey = cache ? cacheKeyFor(input, runOptions.op) : null
    if (cacheKey !== null) {
      const cachedResult = getCachedResult(cacheKey)
      if (cachedResult !== undefined) return Promise.resolve(cachedResult)
    }

    const handle = makeHandle(runOptions)
    activeCount.value++

    const settle = (): void => {
      releaseHandle(handle)
      if (latestHandle === handle) latestHandle = null
      activeCount.value--
      options.onSettled?.()
    }

    const start = (): Promise<unknown> => execute(handle, input, runOptions, cacheKey)
    const promise = mode === 'serial' ? enqueueSerial(handle, start) : start()
    return promise.finally(settle)
  }

  function run(input: unknown, runOptions: RunOptions = {}): Promise<unknown> {
    try {
      return runUnsafe(input, runOptions)
    } catch (err) {
      return Promise.reject(err)
    }
  }

  function cancel(): void {
    for (const handle of Array.from(handles)) {
      if (mode === 'parallel' && handle.external) continue
      handle.controller.abort()
    }
  }

  return { run, cancel, activeCount, isRunning, progress, error, chunks }
}
