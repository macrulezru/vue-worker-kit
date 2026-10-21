import type {
  WorkerHandlerModule,
  WorkerOperationMap,
  WorkerOperationsModule,
} from './worker/defineWorkerHandler'

export type UnwrapMode = 'shallow' | 'deep'

export type WorkerConcurrency = 'parallel' | 'latest' | 'serial'

export interface RunOptions {
  transfer?: Transferable[]
  signal?: AbortSignal
  /** Per-run progress reporting — see `WorkerContext.reportProgress`. Called in addition to the
   *  shared `progress` ref of `useWorker()`/`useSharedWorker()`, and as the only channel for pool tasks. */
  onProgress?: (value: number) => void
  /** Per-run streamed chunks — see `WorkerContext.reportChunk`. Called in addition to the shared
   *  `chunks` ref (which is gated by the `streaming` option), and as the only channel for pool tasks. */
  onChunk?: (chunk: unknown) => void
  unwrap?: UnwrapMode
  op?: string
  hardCancelOnAbort?: boolean
  affinity?: string | number
}

export interface WorkerMapOptions<T = unknown> {
  /** Number of concurrent tasks. Defaults to pool size. */
  concurrency?: number
  /** Global abort signal for all items. */
  signal?: AbortSignal
  /** Per-item transfer list function for zero-copy transfers. */
  transfer?: (item: T) => Transferable[]
  /** Per-task progress reporting, shared across every item — see `RunOptions.onProgress`. */
  onProgress?: (value: number) => void
  /** Per-task streamed chunks, shared across every item — see `RunOptions.onChunk`. */
  onChunk?: (chunk: unknown) => void
  hardCancelOnAbort?: boolean
  unwrap?: UnwrapMode
}

export interface UseWorkerCacheOptions {
  /** Enable LRU cache for results. */
  cache?: 'lru'
  /** Maximum cache size. Default `50`. */
  maxCacheSize?: number
}

export interface RetryStrategyOptions {
  /** Number of retries. Default `0`. */
  retries?: number
  /** Delay function for exponential backoff. Default: immediate retry. */
  retryDelay?: (attempt: number) => number
}

export interface StreamingOptions {
  /** Enable streaming mode with chunked results. */
  streaming?: boolean
}

export interface UnwrapOptions {
  unwrap?: UnwrapMode
}

export interface ConcurrencyOptions {
  concurrency?: WorkerConcurrency
}

/**
 * Extracts the handler's input type from `typeof import('./x.worker')` — the module
 * namespace type, whose `default` export is the `WorkerHandlerModule<In, Out>` returned by
 * `defineWorkerHandler()`. Type-only: nothing here runs, so no worker code reaches the
 * main bundle just because its type is referenced.
 */
export type WorkerModuleInput<T> = T extends { default: WorkerHandlerModule<infer In, unknown> }
  ? In
  : never

export type WorkerModuleOutput<T> = T extends { default: WorkerHandlerModule<unknown, infer Out> }
  ? Out
  : never

export type WorkerModuleOperations<T> = T extends { default: WorkerOperationsModule<infer Ops> }
  ? Ops
  : never

export type WorkerOperationName<T> = Extract<keyof WorkerModuleOperations<T>, string>

export type WorkerOperationInput<T, K extends WorkerOperationName<T>> = Parameters<
  WorkerModuleOperations<T>[K]
>[0]

export type WorkerOperationOutput<T, K extends WorkerOperationName<T>> = Awaited<
  ReturnType<WorkerModuleOperations<T>[K]>
>

export type OperationInput<Ops extends WorkerOperationMap, K extends keyof Ops> = Parameters<
  Ops[K]
>[0]

export type OperationOutput<Ops extends WorkerOperationMap, K extends keyof Ops> = Awaited<
  ReturnType<Ops[K]>
>

export interface WorkerOperationsCaller<Ops extends WorkerOperationMap> {
  call<K extends Extract<keyof Ops, string>>(
    name: K,
    input: OperationInput<Ops, K>,
    options?: RunOptions,
  ): Promise<OperationOutput<Ops, K>>
}

export type IsOperationsModule<T> = [WorkerModuleOperations<T>] extends [never] ? false : true

/** Simple hash function for cache keys */
export function createCacheKey(input: unknown): string {
  return JSON.stringify(input)
}
