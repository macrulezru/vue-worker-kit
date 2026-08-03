import type { ComputedRef, ShallowRef } from 'vue';
import { WorkerError } from './errors';
import type { RunOptions, WorkerModuleInput, WorkerModuleOutput, UseWorkerCacheOptions } from './types';
export interface UseWorkerOptions {
    /** Milliseconds of idle time before the worker self-terminates; `false` disables it. Default `30000`. */
    idleTimeout?: number | false;
    /** Automatic retries on rejection, not applied to cancellations. Default `0`. */
    retries?: number;
    /** Delay function for exponential backoff. Default: immediate retry. */
    retryDelay?: (attempt: number) => number;
    /** Terminate & recreate the worker immediately on abort, instead of waiting for cooperative `ctx.signal` handling. Default `false`. */
    hardCancelOnAbort?: boolean;
    /** Cache options for memoization. */
    cache?: UseWorkerCacheOptions;
    /** Enable streaming mode with chunked results. */
    streaming?: boolean;
}
export interface UseWorkerReturn<In, Out> {
    run(input: In, options?: RunOptions): Promise<Out>;
    isRunning: ComputedRef<boolean>;
    progress: ShallowRef<number>;
    error: ShallowRef<WorkerError | null>;
    cancel(): void;
    /** Pre-create the worker without running any task. */
    warmup(): Promise<void>;
    /** Reactive array of chunks for streaming mode. */
    chunks?: ShallowRef<unknown[]>;
}
/**
 * Main-thread composable wrapping a single lazily-created worker. `TModule` is meant to be
 * `typeof import('./x.worker')` — `run()`'s input/output types are read off of it, see
 * `WorkerModuleInput`/`WorkerModuleOutput` in `./types`.
 */
export declare function useWorker<TModule>(factory: () => Worker, options?: UseWorkerOptions): UseWorkerReturn<WorkerModuleInput<TModule>, WorkerModuleOutput<TModule>>;
//# sourceMappingURL=useWorker.d.ts.map