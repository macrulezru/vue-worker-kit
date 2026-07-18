import {
  createProgressThrottle,
  serializeError,
  type MainToWorkerMessage,
  type WorkerScopeLike,
} from '../protocol'

export interface WorkerContext {
  readonly signal: AbortSignal
  reportProgress(value: number): void
  /**
   * Marks one or more `Transferable`s (e.g. an `ArrayBuffer`) to be sent back with the result
   * via zero-copy transfer instead of structured-clone copying — the mirror of `RunOptions.transfer`
   * on the way in. Safe to call more than once; every transferable passed across all calls is
   * included. The objects don't need to be part of the returned value itself.
   */
  transfer(...transferables: Transferable[]): void
}

/**
 * Phantom-typed marker returned by `defineWorkerHandler()`. `__input`/`__output` never exist
 * at runtime — they only give `useWorker<typeof import('./x.worker')>()` something to read
 * `In`/`Out` off of via a conditional type, without a manual generic on either side.
 */
export interface WorkerHandlerModule<In = unknown, Out = unknown> {
  readonly __input?: In
  readonly __output?: Out
}

export type WorkerHandlerFn<In, Out> = (input: In, ctx: WorkerContext) => Out | Promise<Out>

function isWorkerScope(): boolean {
  return (
    typeof WorkerGlobalScope !== 'undefined' &&
    typeof self !== 'undefined' &&
    self instanceof WorkerGlobalScope
  )
}

/**
 * Wires the `run`/`cancel` protocol onto a worker-global-like scope. Split out from
 * `defineWorkerHandler` so tests can drive it against a fake scope directly, instead of
 * needing a real `WorkerGlobalScope` (which only exists inside an actual worker thread).
 */
export function attachWorkerProtocol<In, Out>(
  handler: WorkerHandlerFn<In, Out>,
  scope: WorkerScopeLike = self as unknown as WorkerScopeLike,
): void {
  const controllers = new Map<number, AbortController>()

  scope.onmessage = (event: MessageEvent<MainToWorkerMessage>) => {
    const msg = event.data

    if (msg.type === 'cancel') {
      controllers.get(msg.id)?.abort(msg.reason)
      return
    }

    const controller = new AbortController()
    controllers.set(msg.id, controller)
    const outgoingTransfer: Transferable[] = []

    const ctx: WorkerContext = {
      signal: controller.signal,
      reportProgress: createProgressThrottle((value) => {
        scope.postMessage({ type: 'progress', id: msg.id, value })
      }),
      transfer(...transferables) {
        outgoingTransfer.push(...transferables)
      },
    }

    Promise.resolve()
      .then(() => handler(msg.input as In, ctx))
      .then((output) => {
        controllers.delete(msg.id)
        // Unthrottled, unlike ctx.reportProgress — a handler that only reports progress at
        // periodic checkpoints (e.g. every 5%) would otherwise leave the main thread's
        // `progress` stuck below 1 forever, since the checkpoint closest to the end can land
        // inside the throttle window of the previous one and simply get dropped.
        scope.postMessage({ type: 'progress', id: msg.id, value: 1 })
        scope.postMessage({ type: 'result', id: msg.id, output }, outgoingTransfer)
      })
      .catch((err) => {
        controllers.delete(msg.id)
        scope.postMessage({ type: 'error', id: msg.id, error: serializeError(err) })
      })
  }
}

/**
 * Declares the worker-side handler for a `.worker.ts` file. Only actually starts the
 * `postMessage` message loop when evaluated inside a real `WorkerGlobalScope` — importing
 * the file anywhere else (e.g. accidentally from the main bundle) is inert.
 */
export function defineWorkerHandler<In, Out>(
  handler: WorkerHandlerFn<In, Out>,
): WorkerHandlerModule<In, Out> {
  if (isWorkerScope()) {
    attachWorkerProtocol(handler)
  }
  return {} as WorkerHandlerModule<In, Out>
}
