import type { WorkerLike } from '../protocol';
export interface WorkerClient {
    send(input: unknown, transfer: Transferable[] | undefined, onProgress?: (value: number) => void, onChunk?: (chunk: unknown) => void): {
        id: number;
        promise: Promise<unknown>;
    };
    cancel(id: number, reason?: unknown): void;
    /** Rejects every still-pending request (used when the underlying worker is terminated). */
    dispose(reason: unknown): void;
}
/**
 * Correlates `run`/`cancel` requests with `result`/`error`/`progress` responses over a
 * single worker-like transport. Shared by `useWorker()` (one worker) and the pool adapter
 * (one client per pooled worker) so the message-id bookkeeping isn't duplicated.
 */
export declare function createWorkerClient(worker: WorkerLike): WorkerClient;
//# sourceMappingURL=workerClient.d.ts.map