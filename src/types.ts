import type { WorkerHandlerModule } from './worker/defineWorkerHandler'

export interface RunOptions {
  transfer?: Transferable[]
  signal?: AbortSignal
}

/**
 * Extracts the handler's input type from `typeof import('./x.worker')` — the module
 * namespace type, whose `default` export is the `WorkerHandlerModule<In, Out>` returned by
 * `defineWorkerHandler()`. Type-only: nothing here runs, so no worker code reaches the
 * main bundle just because its type is referenced.
 */
export type WorkerModuleInput<T> = T extends { default: WorkerHandlerModule<infer In, unknown> }
  ? In
  : never

export type WorkerModuleOutput<T> = T extends { default: WorkerHandlerModule<unknown, infer Out> }
  ? Out
  : never
