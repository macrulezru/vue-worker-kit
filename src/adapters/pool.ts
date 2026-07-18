import { computed, getCurrentScope, onScopeDispose, ref } from 'vue'
import type { ComputedRef } from 'vue'
import { WorkerUnavailableError, toAbortError } from '../errors'
import { attachActivityBus, createActivityBus } from '../internal/activityBus'
import { createWorkerClient, type WorkerClient } from '../internal/workerClient'
import type { WorkerLike } from '../protocol'
import type { RunOptions, WorkerModuleInput, WorkerModuleOutput } from '../types'

export interface WorkerPoolOptions {
  /**
   * Number of workers to create, lazily, as tasks arrive. Defaults to
   * `navigator.hardwareConcurrency` — the browser's own report of available logical
   * cores/threads — so a pool made without an explicit `size` scales to whatever machine
   * it's actually running on, rather than a number picked at development time. Falls back to
   * `4` where `navigator` doesn't exist (SSR) or doesn't report it.
   */
  size?: number
}

function defaultPoolSize(): number {
  if (typeof navigator !== 'undefined' && typeof navigator.hardwareConcurrency === 'number') {
    return navigator.hardwareConcurrency
  }
  return 4
}

export interface WorkerPoolStats {
  busy: number
  idle: number
  queued: number
}

export interface WorkerMapOptions {
  concurrency?: number
}

export interface WorkerPool<In, Out> {
  run(input: In, options?: RunOptions): Promise<Out>
  map(items: In[], options?: WorkerMapOptions): Promise<Out[]>
  readonly stats: ComputedRef<WorkerPoolStats>
  readonly size: number
  terminate(): void
}

interface QueuedTask {
  input: unknown
  transfer?: Transferable[]
  signal?: AbortSignal
  resolve(output: unknown): void
  reject(error: unknown): void
}

interface Slot {
  worker: WorkerLike
  client: WorkerClient
  busy: boolean
}

/**
 * A pool of lazily-created workers for many small, independent tasks (e.g. resizing
 * hundreds of images). `TModule` is `typeof import('./x.worker')`, same convention as
 * `useWorker`.
 */
export function createWorkerPool<TModule>(
  factory: () => Worker,
  options: WorkerPoolOptions = {},
): WorkerPool<WorkerModuleInput<TModule>, WorkerModuleOutput<TModule>> {
  const size = options.size ?? defaultPoolSize()
  const slots: Slot[] = []
  const queue: QueuedTask[] = []
  const busyCount = ref(0)
  const queuedCount = ref(0)
  const activityBus = createActivityBus()
  let terminated = false

  const stats = computed<WorkerPoolStats>(() => ({
    busy: busyCount.value,
    idle: slots.length - busyCount.value,
    queued: queuedCount.value,
  }))

  function createSlot(): Slot {
    if (typeof Worker === 'undefined') {
      throw new WorkerUnavailableError()
    }
    const worker = factory() as unknown as WorkerLike
    const slot: Slot = { worker, client: createWorkerClient(worker), busy: false }
    slots.push(slot)
    return slot
  }

  function pump(): void {
    while (queue.length > 0) {
      let slot = slots.find((s) => !s.busy)
      if (!slot) {
        if (slots.length >= size) return
        slot = createSlot()
      }
      const task = queue.shift()!
      queuedCount.value--
      dispatch(slot, task)
    }
  }

  function dispatch(slot: Slot, task: QueuedTask): void {
    slot.busy = true
    busyCount.value++

    const internalController = task.signal ? null : new AbortController()
    const signal = task.signal ?? internalController!.signal

    const finish = (): void => {
      // terminate() already zeroed out busyCount/slots synchronously — a settlement arriving
      // afterwards (from a client.dispose()-triggered rejection) must not double-decrement it.
      if (terminated) return
      slot.busy = false
      busyCount.value--
      pump()
    }

    if (signal.aborted) {
      task.reject(toAbortError(signal.reason))
      finish()
      return
    }

    const startedAt = Date.now()
    activityBus.emit.taskStart()
    const { id, promise } = slot.client.send(task.input, task.transfer, undefined)
    const onAbort = (): void => {
      slot.client.cancel(id, signal.reason)
      task.reject(toAbortError(signal.reason))
    }
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort)
        activityBus.emit.taskEnd(Date.now() - startedAt)
        task.resolve(value)
        finish()
      },
      (err) => {
        signal.removeEventListener('abort', onAbort)
        activityBus.emit.taskEnd(Date.now() - startedAt)
        if (!signal.aborted) {
          const workerError = err as Error
          activityBus.emit.taskError({ name: workerError.name, message: workerError.message })
          task.reject(err)
        }
        finish()
      },
    )
  }

  function run(input: unknown, runOptions: RunOptions = {}): Promise<unknown> {
    return new Promise((resolve, reject) => {
      queue.push({ input, transfer: runOptions.transfer, signal: runOptions.signal, resolve, reject })
      queuedCount.value++
      pump()
    })
  }

  async function map(items: unknown[], mapOptions: WorkerMapOptions = {}): Promise<unknown[]> {
    const concurrency = Math.max(1, mapOptions.concurrency ?? size)
    const results: unknown[] = new Array(items.length)
    let nextIndex = 0

    async function worker(): Promise<void> {
      for (;;) {
        const index = nextIndex++
        if (index >= items.length) return
        results[index] = await run(items[index])
      }
    }

    await Promise.all(
      Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
    )
    return results
  }

  function terminate(): void {
    terminated = true
    for (const slot of slots) {
      slot.client.dispose(toAbortError('Worker pool terminated'))
      slot.worker.terminate()
    }
    slots.length = 0
    busyCount.value = 0
    for (const task of queue) task.reject(toAbortError('Worker pool terminated'))
    queue.length = 0
    queuedCount.value = 0
  }

  return attachActivityBus(
    {
      run: run as WorkerPool<WorkerModuleInput<TModule>, WorkerModuleOutput<TModule>>['run'],
      map: map as WorkerPool<WorkerModuleInput<TModule>, WorkerModuleOutput<TModule>>['map'],
      stats,
      size,
      terminate,
    },
    activityBus,
  )
}

/** Same as `createWorkerPool`, but auto-terminates via `onScopeDispose` when used inside `setup()`. */
export function useWorkerPool<TModule>(
  factory: () => Worker,
  options: WorkerPoolOptions = {},
): WorkerPool<WorkerModuleInput<TModule>, WorkerModuleOutput<TModule>> {
  const pool = createWorkerPool<TModule>(factory, options)
  if (getCurrentScope()) {
    onScopeDispose(() => pool.terminate())
  }
  return pool
}
