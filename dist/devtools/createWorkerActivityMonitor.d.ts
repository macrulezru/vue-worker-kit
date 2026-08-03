import type { ComputedRef } from 'vue';
import type { WorkerPool } from '../adapters/pool';
import type { UseWorkerReturn } from '../useWorker';
export type WorkerActivitySource = WorkerPool<unknown, unknown> | UseWorkerReturn<unknown, unknown>;
export interface WorkerActivityError {
    name: string;
    message: string;
    at: number;
}
export interface WorkerActivitySnapshot {
    busy: number;
    idle: number;
    queued: number;
    averageTaskMs: number | null;
    recentErrors: WorkerActivityError[];
}
export interface WorkerActivityMonitorOptions {
    /** Cap on the retained error history. Default `20`. */
    maxErrors?: number;
    /** Rolling window size used to compute `averageTaskMs`. Default `50`. */
    maxSamples?: number;
}
export interface WorkerActivityMonitor {
    readonly snapshot: ComputedRef<WorkerActivitySnapshot>;
    clearErrors(): void;
    /** Unsubscribes from the underlying pool/worker's activity bus. */
    dispose(): void;
}
/**
 * Builds a reactive activity snapshot for a `createWorkerPool()`/`useWorkerPool()` pool or a
 * single `useWorker()` instance, driven by the internal activity bus (no polling). Does not
 * depend on `@vue/devtools-api` — this is a standalone debug panel, not a browser-extension
 * integration, to keep the package dependency-free.
 */
export declare function createWorkerActivityMonitor(source: WorkerActivitySource, options?: WorkerActivityMonitorOptions): WorkerActivityMonitor;
//# sourceMappingURL=createWorkerActivityMonitor.d.ts.map