import { computed, getCurrentScope, onScopeDispose, ref } from 'vue'
import type { ComputedRef } from 'vue'
import { WorkerError, WorkerUnavailableError, toAbortError } from '../errors'
import { attachActivityBus, createActivityBus } from '../internal/activityBus'
import { createWorkerClient, type WorkerClient } from '../internal/workerClient'
import type { WorkerLike } from '../protocol'
import type { WorkerOperationMap } from '../worker/defineWorkerHandler'
import type {
  RunOptions,
  UnwrapMode,
  UnwrapOptions,
  WorkerMapOptions,
  WorkerModuleInput,
  WorkerModuleOperations,
  WorkerModuleOutput,
  WorkerOperationsCaller,
} from '../types'

export type AffinityMode = 'prefer' | 'strict'

export interface WorkerPoolOptions extends UnwrapOptions {
  /**
   * Number of workers to create, lazily, as tasks arrive. Defaults to
   * `navigator.hardwareConcurrency` — the browser's own report of available logical
   * cores/threads — so a pool made without an explicit `size` scales to whatever machine
   * it's actually running on, rather than a number picked at development time. Falls back to
   * `4` where `navigator` doesn't exist (SSR) or doesn't report it.
   */
  size?: number
  hardCancelOnAbort?: boolean
  idleTimeout?: number | false
  affinityMode?: AffinityMode
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

export interface WorkerPoolCommon {
  readonly stats: ComputedRef<WorkerPoolStats>
  readonly size: number
  terminate(): void
  restart(): void
  /** Pre-create all workers up to `size` without running any tasks. */
  warmup(): Promise<void>
}

export interface WorkerPool<In, Out> extends WorkerPoolCommon {
  run(input: In, options?: RunOptions): Promise<Out>
  map(items: In[], options?: WorkerMapOptions<In>): Promise<Out[]>
}

export interface WorkerPoolOperations<Ops extends WorkerOperationMap>
  extends WorkerPoolCommon, WorkerOperationsCaller<Ops> {}

export type WorkerPoolFor<TModule> = [WorkerModuleOperations<TModule>] extends [never]
  ? WorkerPool<WorkerModuleInput<TModule>, WorkerModuleOutput<TModule>>
  : WorkerPoolOperations<WorkerModuleOperations<TModule>>

interface QueuedTask {
  input: unknown
  transfer?: Transferable[]
  signal?: AbortSignal
  onProgress?: (value: number) => void
  onChunk?: (chunk: unknown) => void
  op?: string
  unwrap: UnwrapMode
  hardCancel: boolean
  affinity?: string | number
  detachQueuedAbort?: () => void
  resolve(output: unknown): void
  reject(error: unknown): void
}

interface Slot {
  worker: WorkerLike
  client: WorkerClient
  busy: boolean
  dead: boolean
  idleTimer?: ReturnType<typeof setTimeout>
}

/**
 * A pool of lazily-created workers for many small, independent tasks (e.g. resizing
 * hundreds of images). `TModule` is `typeof import('./x.worker')`, same convention as
 * `useWorker`.
 */
export function createWorkerPool<TModule>(
  factory: () => Worker,
  options: WorkerPoolOptions = {},
): WorkerPoolFor<TModule> {
  const size = options.size ?? defaultPoolSize()
  const hardCancelDefault = options.hardCancelOnAbort ?? false
  const idleTimeout = options.idleTimeout ?? false
  const affinityMode = options.affinityMode ?? 'prefer'
  const defaultUnwrap = options.unwrap ?? 'shallow'
  const slots: Slot[] = []
  const queue: QueuedTask[] = []
  const affinitySlots = new Map<string | number, Slot>()
  const busyCount = ref(0)
  const queuedCount = ref(0)
  const slotCount = ref(0)
  const activityBus = createActivityBus()
  let terminated = false

  const stats = computed<WorkerPoolStats>(() => ({
    busy: busyCount.value,
    idle: slotCount.value - busyCount.value,
    queued: queuedCount.value,
  }))

  function clearSlotTimer(slot: Slot): void {
    if (slot.idleTimer !== undefined) {
      clearTimeout(slot.idleTimer)
      slot.idleTimer = undefined
    }
  }

  function scheduleSlotIdle(slot: Slot): void {
    clearSlotTimer(slot)
    if (idleTimeout === false || slot.dead || slot.busy) return
    slot.idleTimer = setTimeout(() => {
      slot.idleTimer = undefined
      if (!slot.busy) removeSlot(slot)
    }, idleTimeout)
  }

  function removeSlot(slot: Slot, reason?: Error): void {
    if (slot.dead) return
    slot.dead = true
    clearSlotTimer(slot)
    const index = slots.indexOf(slot)
    if (index >= 0) {
      slots.splice(index, 1)
      slotCount.value = slots.length
    }
    if (slot.busy) {
      slot.busy = false
      busyCount.value--
    }
    for (const [key, owner] of Array.from(affinitySlots)) {
      if (owner === slot) affinitySlots.delete(key)
    }
    slot.client.dispose(reason ?? toAbortError('Worker slot terminated'))
    slot.worker.terminate()
  }

  function createSlot(): Slot {
    if (typeof Worker === 'undefined') {
      throw new WorkerUnavailableError()
    }
    const worker = factory() as unknown as WorkerLike
    const slot = { worker, busy: false, dead: false } as Slot
    slot.client = createWorkerClient(worker, () => {
      removeSlot(slot)
      pump()
    })
    slots.push(slot)
    slotCount.value = slots.length
    return slot
  }

  function pickSlot(task: QueuedTask): Slot | undefined {
    const preferred = task.affinity !== undefined ? affinitySlots.get(task.affinity) : undefined
    if (preferred && !preferred.busy) return preferred
    if (preferred && affinityMode === 'strict') return undefined
    const free = slots.find((candidate) => !candidate.busy)
    if (free) return free
    if (slots.length >= size) return undefined
    return createSlot()
  }

  function pump(): void {
    let index = 0
    while (index < queue.length) {
      const task = queue[index]
      const slot = pickSlot(task)
      if (!slot) {
        index++
        continue
      }
      queue.splice(index, 1)
      queuedCount.value--
      task.detachQueuedAbort?.()
      dispatch(slot, task)
    }
  }

  function dispatch(slot: Slot, task: QueuedTask): void {
    clearSlotTimer(slot)
    slot.busy = true
    busyCount.value++
    if (task.affinity !== undefined && !affinitySlots.has(task.affinity)) {
      affinitySlots.set(task.affinity, slot)
    }

    const signal = task.signal

    const finish = (): void => {
      if (!slot.dead) {
        slot.busy = false
        busyCount.value--
        scheduleSlotIdle(slot)
      }
      pump()
    }

    if (signal?.aborted) {
      task.reject(toAbortError(signal.reason))
      finish()
      return
    }

    const startedAt = Date.now()
    activityBus.emit.taskStart()
    const { id, promise } = slot.client.send(
      task.input,
      task.transfer,
      task.onProgress,
      task.onChunk,
      {
        op: task.op,
        unwrap: task.unwrap,
      },
    )
    const onAbort = (): void => {
      slot.client.cancel(id, signal?.reason)
      task.reject(toAbortError(signal?.reason))
      if (task.hardCancel) removeSlot(slot)
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    promise.then(
      (value) => {
        signal?.removeEventListener('abort', onAbort)
        activityBus.emit.taskEnd(Date.now() - startedAt)
        task.resolve(value)
        finish()
      },
      (err) => {
        signal?.removeEventListener('abort', onAbort)
        activityBus.emit.taskEnd(Date.now() - startedAt)
        if (!signal?.aborted) {
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
      if (terminated) {
        reject(createTerminatedError())
        return
      }
      const signal = runOptions.signal
      if (signal?.aborted) {
        reject(toAbortError(signal.reason))
        return
      }
      const task: QueuedTask = {
        input,
        transfer: runOptions.transfer,
        signal,
        onProgress: runOptions.onProgress,
        onChunk: runOptions.onChunk,
        op: runOptions.op,
        unwrap: runOptions.unwrap ?? defaultUnwrap,
        hardCancel: runOptions.hardCancelOnAbort ?? hardCancelDefault,
        affinity: runOptions.affinity,
        resolve,
        reject,
      }
      if (signal) {
        const onQueuedAbort = (): void => {
          const index = queue.indexOf(task)
          if (index < 0) return
          queue.splice(index, 1)
          queuedCount.value--
          reject(toAbortError(signal.reason))
        }
        signal.addEventListener('abort', onQueuedAbort, { once: true })
        task.detachQueuedAbort = () => signal.removeEventListener('abort', onQueuedAbort)
      }
      queue.push(task)
      queuedCount.value++
      pump()
    })
  }

  function call(name: string, input: unknown, runOptions: RunOptions = {}): Promise<unknown> {
    return run(input, { ...runOptions, op: name })
  }

  async function map(items: unknown[], mapOptions: WorkerMapOptions = {}): Promise<unknown[]> {
    const concurrency = Math.max(1, mapOptions.concurrency ?? size)
    const results: unknown[] = new Array(items.length)
    let nextIndex = 0
    const globalSignal = mapOptions.signal

    async function worker(): Promise<void> {
      for (;;) {
        const index = nextIndex++
        if (index >= items.length) return
        const item = items[index]
        const transfer = mapOptions.transfer ? mapOptions.transfer(item) : undefined
        results[index] = await run(item, {
          transfer,
          signal: globalSignal,
          onProgress: mapOptions.onProgress,
          onChunk: mapOptions.onChunk,
          hardCancelOnAbort: mapOptions.hardCancelOnAbort,
          unwrap: mapOptions.unwrap,
        })
      }
    }

    await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()))
    return results
  }

  async function warmup(): Promise<void> {
    if (terminated) return
    while (slots.length < size) scheduleSlotIdle(createSlot())
  }

  function createTerminatedError(): WorkerError {
    return new WorkerError('Worker pool terminated', { code: 'POOL_TERMINATED' })
  }

  function restart(): void {
    terminated = false
  }

  function terminate(): void {
    terminated = true
    for (const slot of Array.from(slots)) removeSlot(slot, createTerminatedError())
    slots.length = 0
    slotCount.value = 0
    affinitySlots.clear()
    busyCount.value = 0
    for (const task of queue) {
      task.detachQueuedAbort?.()
      task.reject(createTerminatedError())
    }
    queue.length = 0
    queuedCount.value = 0
  }

  return attachActivityBus(
    { run, call, map, stats, size, terminate, restart, warmup },
    activityBus,
  ) as unknown as WorkerPoolFor<TModule>
}

/** Same as `createWorkerPool`, but auto-terminates via `onScopeDispose` when used inside `setup()`. */
export function useWorkerPool<TModule>(
  factory: () => Worker,
  options: WorkerPoolOptions = {},
): WorkerPoolFor<TModule> {
  const pool = createWorkerPool<TModule>(factory, options)
  if (getCurrentScope()) {
    onScopeDispose(() => pool.terminate())
  }
  return pool
}
