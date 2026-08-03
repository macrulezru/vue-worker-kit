import type { ComputedRef, ShallowRef } from 'vue';
import { WorkerError } from '../errors';
import type { RunOptions, WorkerModuleInput, WorkerModuleOutput, UseWorkerCacheOptions } from '../types';
export interface UseSharedWorkerOptions {
    /** Milliseconds of idle time before the worker self-terminates; `false` disables it. Default `30000`. */
    idleTimeout?: number | false;
    /** Automatic retries on rejection, not applied to cancellations. Default `0`. */
    retries?: number;
    /** Delay function for exponential backoff. */
    retryDelay?: (attempt: number) => number;
    /** Cache options for memoization. */
    cache?: UseWorkerCacheOptions;
    /** Enable streaming mode with chunked results. */
    streaming?: boolean;
    /** Unique name for the SharedWorker - multiple tabs with same name share the worker */
    name?: string;
}
export interface UseSharedWorkerReturn<In, Out> {
    run(input: In, options?: RunOptions): Promise<Out>;
    isRunning: ComputedRef<boolean>;
    progress: ShallowRef<number>;
    error: ShallowRef<WorkerError | null>;
    cancel(): void;
    warmup(): Promise<void>;
    chunks?: ShallowRef<unknown[]>;
}
/**
 * Composable for SharedWorker - allows reuse of a single worker across multiple browser tabs.
 * Note: Not supported in Safari iOS and Chrome Android.
 */
export declare function useSharedWorker<TModule>(factory: () => SharedWorker, options?: UseSharedWorkerOptions): UseSharedWorkerReturn<WorkerModuleInput<TModule>, WorkerModuleOutput<TModule>>;
//# sourceMappingURL=sharedWorker.d.ts.map