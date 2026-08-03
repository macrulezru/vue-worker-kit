import type { SerializedError } from './protocol';
export interface WorkerErrorOptions {
    name?: string;
    workerStack?: string;
    cause?: unknown;
}
/**
 * Rejection type for a failed `run()`. `.stack`/`.cause` point at the `run()` call site
 * (the synthetic error is created there, before crossing into the worker), while
 * `.workerStack` carries the original stack captured inside the worker — so both ends
 * of the failure are visible together in the console/Sentry.
 */
export declare class WorkerError extends Error {
    readonly workerStack?: string;
    constructor(message: string, options?: WorkerErrorOptions);
}
export declare function workerErrorFromSerialized(serialized: SerializedError, callSiteError: Error): WorkerError;
/**
 * Thrown instead of a raw `ReferenceError: Worker is not defined` when `run()` is invoked
 * where the global `Worker` constructor does not exist (typically during SSR).
 */
export declare class WorkerUnavailableError extends Error {
    constructor(message?: string);
}
export declare function isAbortError(err: unknown): boolean;
export declare function toAbortError(reason: unknown): Error;
//# sourceMappingURL=errors.d.ts.map