export type WorkerRequestId = number

export interface RunRequestMessage {
  readonly type: 'run'
  readonly id: WorkerRequestId
  readonly input: unknown
}

export interface CancelRequestMessage {
  readonly type: 'cancel'
  readonly id: WorkerRequestId
  readonly reason?: unknown
}

/** Sent by `useSharedWorker()`'s `disconnect()` — tells the shared worker this tab's port is going away, so it can update `portCount` for the remaining tabs. A `SharedWorker` has no platform-level way to detect a closed port on its own. */
export interface DisconnectMessage {
  readonly type: 'disconnect'
}

export type MainToWorkerMessage = RunRequestMessage | CancelRequestMessage | DisconnectMessage

export interface SerializedError {
  readonly name: string
  readonly message: string
  readonly stack?: string
}

export interface ResultResponseMessage {
  readonly type: 'result'
  readonly id: WorkerRequestId
  readonly output: unknown
}

export interface ErrorResponseMessage {
  readonly type: 'error'
  readonly id: WorkerRequestId
  readonly error: SerializedError
}

export interface ProgressResponseMessage {
  readonly type: 'progress'
  readonly id: WorkerRequestId
  readonly value: number
}

export interface ChunkResponseMessage {
  readonly type: 'chunk'
  readonly id: WorkerRequestId
  readonly chunk: unknown
}

/** Broadcast to every connected port whenever a tab connects or (cooperatively) disconnects. */
export interface PortCountMessage {
  readonly type: 'portCount'
  readonly count: number
}

/** The id-correlated subset of worker→main messages — every request/response pair `createWorkerClient()` tracks in `pending`. */
export type WorkerToMainMessage = ResultResponseMessage | ErrorResponseMessage | ProgressResponseMessage | ChunkResponseMessage

/** Full wire protocol for a `SharedWorker`'s port — adds the un-correlated `portCount` broadcast, which isn't a response to any particular request and has no `id`. */
export type SharedWorkerToMainMessage = WorkerToMainMessage | PortCountMessage

/** Minimal structural subset of DOM `Worker` — lets tests swap in a fake without a real OS thread. */
export interface WorkerLike {
  postMessage(message: unknown, transfer?: Transferable[]): void
  terminate(): void
  onmessage: ((event: MessageEvent) => void) | null
  onerror: ((event: ErrorEvent) => void) | null
}

/** Minimal structural subset of `DedicatedWorkerGlobalScope` — the worker-side counterpart of `WorkerLike`. */
export interface WorkerScopeLike {
  postMessage(message: unknown, transfer?: Transferable[]): void
  onmessage: ((event: MessageEvent) => void) | null
}

/** Minimal structural subset of DOM `MessagePort` — the worker-side counterpart of a `SharedWorker`'s `.port`. */
export interface MessagePortLike {
  postMessage(message: unknown, transfer?: Transferable[]): void
  close(): void
  start(): void
  onmessage: ((event: MessageEvent) => void) | null
}

/** Minimal structural subset of `SharedWorkerGlobalScope`. */
export interface SharedWorkerScopeLike {
  onconnect: ((event: { ports: readonly MessagePortLike[] }) => void) | null
}

export function serializeError(err: unknown): SerializedError {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack }
  }
  return { name: 'Error', message: typeof err === 'string' ? err : JSON.stringify(err) }
}

const PROGRESS_THROTTLE_MS = 50 // ~20 messages/sec, per spec §3.1

export function createProgressThrottle(emit: (value: number) => void): (value: number) => void {
  let lastSentAt = 0
  return (value: number) => {
    const now = Date.now()
    if (now - lastSentAt < PROGRESS_THROTTLE_MS) return
    lastSentAt = now
    emit(value)
  }
}
