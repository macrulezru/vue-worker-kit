import { getCurrentScope, onScopeDispose, ref } from 'vue'
import type { ComputedRef, Ref, ShallowRef } from 'vue'
import { WorkerUnavailableError, toAbortError } from '../errors'
import type { WorkerError } from '../errors'
import { attachActivityBus, createActivityBus } from '../internal/activityBus'
import { createRunEngine } from '../internal/runEngine'
import { createWorkerClient, type WorkerClient } from '../internal/workerClient'
import type { DisconnectMessage, SharedWorkerToMainMessage, WorkerLike } from '../protocol'
import type { WorkerOperationMap } from '../worker/defineWorkerHandler'
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
} from '../types'

export interface UseSharedWorkerOptions
  extends RetryStrategyOptions, StreamingOptions, UnwrapOptions, ConcurrencyOptions {
  /** Cache options for memoization. */
  cache?: UseWorkerCacheOptions
}

export interface UseSharedWorkerCommon {
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

export interface UseSharedWorkerReturn<In, Out> extends UseSharedWorkerCommon {
  run(input: In, options?: RunOptions): Promise<Out>
}

export interface UseSharedWorkerOperationsReturn<Ops extends WorkerOperationMap>
  extends UseSharedWorkerCommon, WorkerOperationsCaller<Ops> {}

export type UseSharedWorkerResult<TModule> = [WorkerModuleOperations<TModule>] extends [never]
  ? UseSharedWorkerReturn<WorkerModuleInput<TModule>, WorkerModuleOutput<TModule>>
  : UseSharedWorkerOperationsReturn<WorkerModuleOperations<TModule>>

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
): UseSharedWorkerResult<TModule> {
  let worker: SharedWorker | null = null
  let client: WorkerClient | null = null

  const portCount = ref(0)
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

  const engine = createRunEngine({
    getClient: ensureClient,
    activityBus,
    concurrency: options.concurrency,
    retries: options.retries,
    retryDelay: options.retryDelay,
    cache: options.cache,
    streaming: options.streaming,
    unwrap: options.unwrap,
  })

  function call(name: string, input: unknown, runOptions: RunOptions = {}): Promise<unknown> {
    return engine.run(input, { ...runOptions, op: name })
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

  const result: Record<string, unknown> = {
    run: engine.run,
    call,
    connect,
    disconnect,
    portCount,
    isRunning: engine.isRunning,
    progress: engine.progress,
    error: engine.error,
    cancel: engine.cancel,
  }
  if (engine.chunks) {
    result.chunks = engine.chunks
  }

  return attachActivityBus(result, activityBus) as unknown as UseSharedWorkerResult<TModule>
}
