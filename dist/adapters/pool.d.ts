import type { ComputedRef } from 'vue';
import type { RunOptions, WorkerModuleInput, WorkerModuleOutput, WorkerBatchOptions } from '../types';
export interface WorkerPoolOptions {
    /**
     * Number of workers to create, lazily, as tasks arrive. Defaults to
     * `navigator.hardwareConcurrency` — the browser's own report of available logical
     * cores/threads — so a pool made without an explicit `size` scales to whatever machine
     * it's actually running on, rather than a number picked at development time. Falls back to
     * `4` where `navigator` doesn't exist (SSR) or doesn't report it.
     */
    size?: number;
}
export interface WorkerPoolStats {
    busy: number;
    idle: number;
    queued: number;
}
export interface WorkerMapOptions<T = unknown> {
    /** Number of concurrent tasks. Defaults to pool size. */
    concurrency?: number;
    /** Global abort signal for all items. */
    signal?: AbortSignal;
    /** Per-item transfer list function for zero-copy transfers. */
    transfer?: (item: T) => Transferable[];
}
export interface WorkerPool<In, Out> {
    run(input: In, options?: RunOptions): Promise<Out>;
    map(items: In[], options?: WorkerMapOptions<In>): Promise<Out[]>;
    /** Run items in batches to reduce postMessage overhead for many small tasks. */
    runBatch(items: In[], options?: WorkerBatchOptions): Promise<Out[]>;
    readonly stats: ComputedRef<WorkerPoolStats>;
    readonly size: number;
    terminate(): void;
    /** Pre-create all workers up to `size` without running any tasks. */
    warmup(): Promise<void>;
}
/**
 * A pool of lazily-created workers for many small, independent tasks (e.g. resizing
 * hundreds of images). `TModule` is `typeof import('./x.worker')`, same convention as
 * `useWorker`.
 */
export declare function createWorkerPool<TModule>(factory: () => Worker, options?: WorkerPoolOptions): WorkerPool<WorkerModuleInput<TModule>, WorkerModuleOutput<TModule>>;
/** Same as `createWorkerPool`, but auto-terminates via `onScopeDispose` when used inside `setup()`. */
export declare function useWorkerPool<TModule>(factory: () => Worker, options?: WorkerPoolOptions): WorkerPool<WorkerModuleInput<TModule>, WorkerModuleOutput<TModule>>;
//# sourceMappingURL=pool.d.ts.map