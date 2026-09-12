import type { WorkerHandlerModule } from './worker/defineWorkerHandler'

export interface RunOptions {
  transfer?: Transferable[]
  signal?: AbortSignal
  /** Per-task progress reporting — see `WorkerContext.reportProgress`. Only meaningful for
   *  `createWorkerPool`/`useWorkerPool`'s `run()`/`map()`; `useWorker()` exposes its own
   *  persistent `progress` ref instead and ignores this. */
  onProgress?: (value: number) => void
  /** Per-task streamed chunks — see `WorkerContext.reportChunk`. Only meaningful for
   *  `createWorkerPool`/`useWorkerPool`'s `run()`/`map()`; `useWorker()` exposes its own
   *  persistent `chunks` ref (gated by its `streaming` option) instead and ignores this. */
  onChunk?: (chunk: unknown) => void
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
