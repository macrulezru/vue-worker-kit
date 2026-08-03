import { type WorkerScopeLike } from '../protocol';
export interface WorkerContext {
    readonly signal: AbortSignal;
    reportProgress(value: number): void;
    /**
     * Marks one or more `Transferable`s (e.g. an `ArrayBuffer`) to be sent back with the result
     * via zero-copy transfer instead of structured-clone copying — the mirror of `RunOptions.transfer`
     * on the way in. Safe to call more than once; every transferable passed across all calls is
     * included. The objects don't need to be part of the returned value itself.
     */
    transfer(...transferables: Transferable[]): void;
    /**
     * Sends a chunk of results for streaming mode. Chunks are accumulated in `chunks.value` on the
     * main thread and can be consumed incrementally without waiting for the full result.
     */
    reportChunk(chunk: unknown): void;
}
/**
 * Phantom-typed marker returned by `defineWorkerHandler()`. `__input`/`__output` never exist
 * at runtime — they only give `useWorker<typeof import('./x.worker')>()` something to read
 * `In`/`Out` off of via a conditional type, without a manual generic on either side.
 */
export interface WorkerHandlerModule<In = unknown, Out = unknown> {
    readonly __input?: In;
    readonly __output?: Out;
}
export type WorkerHandlerFn<In, Out> = (input: In, ctx: WorkerContext) => Out | Promise<Out>;
/**
 * Wires the `run`/`cancel` protocol onto a worker-global-like scope. Split out from
 * `defineWorkerHandler` so tests can drive it against a fake scope directly, instead of
 * needing a real `WorkerGlobalScope` (which only exists inside an actual worker thread).
 */
export declare function attachWorkerProtocol<In, Out>(handler: WorkerHandlerFn<In, Out>, scope?: WorkerScopeLike): void;
/**
 * Declares the worker-side handler for a `.worker.ts` file. Only actually starts the
 * `postMessage` message loop when evaluated inside a real `WorkerGlobalScope` — importing
 * the file anywhere else (e.g. accidentally from the main bundle) is inert.
 */
export declare function defineWorkerHandler<In, Out>(handler: WorkerHandlerFn<In, Out>): WorkerHandlerModule<In, Out>;
//# sourceMappingURL=defineWorkerHandler.d.ts.map