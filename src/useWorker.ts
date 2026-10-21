import { getCurrentScope, onScopeDispose } from 'vue'
import type { ComputedRef, ShallowRef } from 'vue'
import { WorkerUnavailableError, toAbortError } from './errors'
import type { WorkerError } from './errors'
import { attachActivityBus, createActivityBus } from './internal/activityBus'
import { createRunEngine } from './internal/runEngine'
import { createWorkerClient, type WorkerClient } from './internal/workerClient'
import type { WorkerLike } from './protocol'
import type { WorkerOperationMap } from './worker/defineWorkerHandler'
import type {
  RunOptions,
  WorkerModuleInput,
  WorkerModuleOperations,
  WorkerModuleOutput,
  WorkerOperationsCaller,
  UseWorkerCacheOptions,
  RetryStrategyOptions,
  StreamingOptions,
  UnwrapOptions,
  ConcurrencyOptions,
} from './types'

export interface UseWorkerOptions
  extends RetryStrategyOptions, StreamingOptions, UnwrapOptions, ConcurrencyOptions {
  /** Milliseconds of idle time before the worker self-terminates; `false` disables it. Default `30000`. */
  idleTimeout?: number | false
  /** Terminate & recreate the worker immediately on abort, instead of waiting for cooperative `ctx.signal` handling. Default `false`. */
  hardCancelOnAbort?: boolean
  /** Cache options for memoization. */
  cache?: UseWorkerCacheOptions
}

export interface UseWorkerCommon {
  isRunning: ComputedRef<boolean>
  progress: ShallowRef<number>
  error: ShallowRef<WorkerError | null>
  cancel(): void
  /** Pre-create the worker without running any task. */
  warmup(): Promise<void>
  /** Terminate the underlying worker immediately (if one exists) — the next `run()`/`warmup()`
   *  transparently creates a fresh one. Reachable before now only via the idle timer,
   *  `hardCancelOnAbort`, or effect-scope disposal — `useWorker()` called outside an active
   *  effect scope (a Pinia store, a plain factory) had no way to terminate on demand at all. */
  terminate(): void
  /** Reactive array of chunks for streaming mode. */
  chunks?: ShallowRef<unknown[]>
}

export interface UseWorkerReturn<In, Out> extends UseWorkerCommon {
  run(input: In, options?: RunOptions): Promise<Out>
}

export interface UseWorkerOperationsReturn<Ops extends WorkerOperationMap>
  extends UseWorkerCommon, WorkerOperationsCaller<Ops> {}

export type UseWorkerResult<TModule> = [WorkerModuleOperations<TModule>] extends [never]
  ? UseWorkerReturn<WorkerModuleInput<TModule>, WorkerModuleOutput<TModule>>
  : UseWorkerOperationsReturn<WorkerModuleOperations<TModule>>

/**
 * Main-thread composable wrapping a single lazily-created worker. `TModule` is meant to be
 * `typeof import('./x.worker')` — `run()`'s input/output types are read off of it, see
 * `WorkerModuleInput`/`WorkerModuleOutput` in `./types`.
 */
export function useWorker<TModule>(
  factory: () => Worker,
  options: UseWorkerOptions = {},
): UseWorkerResult<TModule> {
  const idleTimeout = options.idleTimeout ?? 30_000
  const hardCancelOnAbort = options.hardCancelOnAbort ?? false

  let worker: WorkerLike | null = null
  let client: WorkerClient | null = null
  let idleTimer: ReturnType<typeof setTimeout> | undefined
  const activityBus = createActivityBus()

  function clearIdleTimer(): void {
    if (idleTimer !== undefined) {
      clearTimeout(idleTimer)
      idleTimer = undefined
    }
  }

  function scheduleIdleTimer(): void {
    clearIdleTimer()
    if (idleTimeout === false || engine.activeCount.value > 0) return
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
      client = createWorkerClient(worker, () => {
        clearIdleTimer()
        worker = null
        client = null
      })
    }
    return client
  }

  const engine = createRunEngine({
    getClient: ensureClient,
    activityBus,
    concurrency: options.concurrency,
    retries: options.retries,
    retryDelay: options.retryDelay,
    cache: options.cache,
    streaming: options.streaming,
    unwrap: options.unwrap,
    hardCancel: hardCancelOnAbort ? terminate : undefined,
    onSettled: scheduleIdleTimer,
  })

  async function warmup(): Promise<void> {
    ensureClient()
  }

  function call(name: string, input: unknown, runOptions: RunOptions = {}): Promise<unknown> {
    return engine.run(input, { ...runOptions, op: name })
  }

  if (getCurrentScope()) {
    onScopeDispose(() => terminate())
  }

  const result: Record<string, unknown> = {
    run: engine.run,
    call,
    isRunning: engine.isRunning,
    progress: engine.progress,
    error: engine.error,
    cancel: engine.cancel,
    warmup,
    terminate,
  }
  if (engine.chunks) {
    result.chunks = engine.chunks
  }

  return attachActivityBus(result, activityBus) as unknown as UseWorkerResult<TModule>
}
