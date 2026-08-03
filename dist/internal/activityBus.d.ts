/**
 * Internal, subscription-based telemetry channel — lets `devtools/createWorkerActivityMonitor`
 * observe task starts/ends/errors on a `useWorker()`/pool instance without polling and without
 * `useWorker`/`pool` importing anything from `devtools` (which would break tree-shaking of the
 * devtools chunk when it isn't used).
 */
export interface ActivityErrorInfo {
    name: string;
    message: string;
}
export interface ActivityListener {
    taskStart?(): void;
    taskEnd?(durationMs: number): void;
    taskError?(error: ActivityErrorInfo): void;
}
export interface ActivityBus {
    emit: Required<ActivityListener>;
    subscribe(listener: ActivityListener): () => void;
}
/** Non-enumerable key devtools-carrying objects (`useWorker`/pool return values) stash their bus under. */
export declare const ACTIVITY_BUS: unique symbol;
export declare function createActivityBus(): ActivityBus;
export declare function attachActivityBus<T extends object>(target: T, bus: ActivityBus): T;
export declare function readActivityBus(source: object): ActivityBus | undefined;
//# sourceMappingURL=activityBus.d.ts.map