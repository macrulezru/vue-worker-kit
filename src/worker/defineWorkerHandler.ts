import {
  createProgressThrottle,
  serializeError,
  type MainToWorkerMessage,
  type MessagePortLike,
  type PortCountMessage,
  type SharedWorkerScopeLike,
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
  /**
   * Sends a chunk of results for streaming mode. Chunks are accumulated in `chunks.value` on the
   * main thread and can be consumed incrementally without waiting for the full result.
   */
  reportChunk(chunk: unknown): void
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

function isDedicatedWorkerScope(): boolean {
  return (
    typeof DedicatedWorkerGlobalScope !== 'undefined' &&
    typeof self !== 'undefined' &&
    self instanceof DedicatedWorkerGlobalScope
  )
}

function isSharedWorkerScope(): boolean {
  return (
    typeof SharedWorkerGlobalScope !== 'undefined' &&
    typeof self !== 'undefined' &&
    self instanceof SharedWorkerGlobalScope
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

    // Anything other than 'run' (e.g. a shared-worker 'disconnect', or a future message type
    // this build doesn't know about yet) must be ignored here, not misread as a run request —
    // it would otherwise invoke the handler with `input: undefined` under a bogus `id`.
    if (msg.type !== 'run') return

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
      reportChunk(chunk) {
        scope.postMessage({ type: 'chunk', id: msg.id, chunk })
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
 * Wires the same `run`/`cancel` protocol onto a `SharedWorkerGlobalScope`. A shared worker
 * never receives messages on `self.onmessage` — the platform only fires `self.onconnect` once
 * per connecting tab, handing over a dedicated `MessagePort` for that tab. Each port gets its
 * own `attachWorkerProtocol()` instance (its own `controllers` map, its own request-id space)
 * so cancelling a task from one tab can never touch another tab's in-flight request.
 *
 * `portCount` is broadcast to every connected port on connect and on a cooperative `disconnect`
 * message (see `DisconnectMessage` in protocol.ts) — there is no platform-level notification
 * when a tab's port goes away without sending one (e.g. a crashed/force-closed tab), so a count
 * that only ever grew would be a lie; the count is simply not decremented for those.
 */
export function attachSharedWorkerProtocol<In, Out>(
  handler: WorkerHandlerFn<In, Out>,
  scope: SharedWorkerScopeLike = self as unknown as SharedWorkerScopeLike,
): void {
  const ports = new Set<MessagePortLike>()

  function broadcastPortCount(): void {
    const message: PortCountMessage = { type: 'portCount', count: ports.size }
    for (const port of ports) port.postMessage(message)
  }

  scope.onconnect = (event) => {
    const port = event.ports[0]
    ports.add(port)
    broadcastPortCount()

    const portScope: WorkerScopeLike = {
      postMessage: (message, transfer) => port.postMessage(message, transfer),
      onmessage: null,
    }
    attachWorkerProtocol(handler, portScope)

    port.onmessage = (messageEvent: MessageEvent<MainToWorkerMessage>) => {
      if (messageEvent.data.type === 'disconnect') {
        ports.delete(port)
        port.close()
        broadcastPortCount()
        return
      }
      portScope.onmessage?.(messageEvent)
    }
    port.start()
  }
}

/**
 * Declares the worker-side handler for a `.worker.ts` file. Only actually starts a message
 * loop when evaluated inside a real dedicated- or shared-worker global scope — importing the
 * file anywhere else (e.g. accidentally from the main bundle) is inert. The same handler works
 * for both `new Worker(...)` (via `useWorker`/`createWorkerPool`) and `new SharedWorker(...)`
 * (via `useSharedWorker`) without the file itself needing to know which one it's running under.
 */
export function defineWorkerHandler<In, Out>(
  handler: WorkerHandlerFn<In, Out>,
): WorkerHandlerModule<In, Out> {
  if (isSharedWorkerScope()) {
    attachSharedWorkerProtocol(handler)
  } else if (isDedicatedWorkerScope()) {
    attachWorkerProtocol(handler)
  }
  return {} as WorkerHandlerModule<In, Out>
}
