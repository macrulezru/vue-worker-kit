export type WorkerRequestId = number;
export interface RunRequestMessage {
    readonly type: 'run';
    readonly id: WorkerRequestId;
    readonly input: unknown;
}
export interface CancelRequestMessage {
    readonly type: 'cancel';
    readonly id: WorkerRequestId;
    readonly reason?: unknown;
}
export type MainToWorkerMessage = RunRequestMessage | CancelRequestMessage;
export interface SerializedError {
    readonly name: string;
    readonly message: string;
    readonly stack?: string;
}
export interface ResultResponseMessage {
    readonly type: 'result';
    readonly id: WorkerRequestId;
    readonly output: unknown;
}
export interface ErrorResponseMessage {
    readonly type: 'error';
    readonly id: WorkerRequestId;
    readonly error: SerializedError;
}
export interface ProgressResponseMessage {
    readonly type: 'progress';
    readonly id: WorkerRequestId;
    readonly value: number;
}
export interface ChunkResponseMessage {
    readonly type: 'chunk';
    readonly id: WorkerRequestId;
    readonly chunk: unknown;
}
export type WorkerToMainMessage = ResultResponseMessage | ErrorResponseMessage | ProgressResponseMessage | ChunkResponseMessage;
/** Minimal structural subset of DOM `Worker` — lets tests swap in a fake without a real OS thread. */
export interface WorkerLike {
    postMessage(message: unknown, transfer?: Transferable[]): void;
    terminate(): void;
    onmessage: ((event: MessageEvent) => void) | null;
    onerror: ((event: ErrorEvent) => void) | null;
}
/** Minimal structural subset of `DedicatedWorkerGlobalScope` — the worker-side counterpart of `WorkerLike`. */
export interface WorkerScopeLike {
    postMessage(message: unknown, transfer?: Transferable[]): void;
    onmessage: ((event: MessageEvent) => void) | null;
}
export declare function serializeError(err: unknown): SerializedError;
export declare function createProgressThrottle(emit: (value: number) => void): (value: number) => void;
//# sourceMappingURL=protocol.d.ts.map