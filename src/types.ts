import type { WorkerHandlerModule } from './worker/defineWorkerHandler'

export interface RunOptions {
  transfer?: Transferable[]
  signal?: AbortSignal
}

export interface WorkerMapOptions<T = unknown> {
  /** Number of concurrent tasks. Defaults to pool size. */
  concurrency?: number
  /** Global abort signal for all items. */
  signal?: AbortSignal
  /** Per-item transfer list function for zero-copy transfers. */
  transfer?: (item: T) => Transferable[]
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

/** Simple hash function for cache keys */
export function createCacheKey(input: unknown): string {
  return JSON.stringify(input)
}
