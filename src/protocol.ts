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

export type MainToWorkerMessage = RunRequestMessage | CancelRequestMessage

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

export type WorkerToMainMessage = ResultResponseMessage | ErrorResponseMessage | ProgressResponseMessage

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
