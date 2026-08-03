import type { WorkerError } from '../errors';
import type { WorkerModuleInput, WorkerModuleOutput } from '../types';
export interface UseWorkerComputedOptions {
    /** Milliseconds to wait after the source stops changing before firing the worker. Default `0`. */
    debounce?: number;
}
export interface WorkerComputedResult<Out> {
    readonly value: Out | undefined;
    readonly isRunning: boolean;
    readonly error: WorkerError | null;
}
/**
 * A `computed()` that recalculates inside a worker whenever its reactive source changes,
 * discarding stale/superseded results by generation number rather than by cancelling the
 * worker outright — see the module doc in the README for the race-condition mechanics.
 */
export declare function useWorkerComputed<TModule>(factory: () => Worker, source: () => WorkerModuleInput<TModule>, options?: UseWorkerComputedOptions): WorkerComputedResult<WorkerModuleOutput<TModule>>;
//# sourceMappingURL=computed.d.ts.map