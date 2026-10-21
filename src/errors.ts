import type { SerializedError } from './protocol'

export const WORKER_SUPERSEDED = 'superseded'

export interface WorkerErrorCause {
  readonly name: string
  readonly message: string
}

export interface WorkerErrorOptions {
  name?: string
  workerStack?: string
  cause?: unknown
  code?: string
  details?: unknown
  detailsDropped?: boolean
  workerCause?: readonly WorkerErrorCause[]
}

/**
 * Rejection type for a failed `run()`. `.stack`/`.cause` point at the `run()` call site
 * (the synthetic error is created there, before crossing into the worker), while
 * `.workerStack` carries the original stack captured inside the worker — so both ends
 * of the failure are visible together in the console/Sentry.
 */
export class WorkerError extends Error {
  readonly workerStack?: string
  readonly code?: string
  readonly details?: unknown
  readonly detailsDropped?: boolean
  readonly workerCause?: readonly WorkerErrorCause[]

  constructor(message: string, options: WorkerErrorOptions = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined)
    this.name = options.name ?? 'WorkerError'
    this.workerStack = options.workerStack
    if (options.code !== undefined) this.code = options.code
    if (options.details !== undefined) this.details = options.details
    if (options.detailsDropped) this.detailsDropped = true
    if (options.workerCause !== undefined) this.workerCause = options.workerCause
  }
}

export function workerErrorFromSerialized(
  serialized: SerializedError,
  callSiteError: Error,
): WorkerError {
  return new WorkerError(serialized.message, {
    name: serialized.name === 'Error' ? 'WorkerError' : serialized.name,
    workerStack: serialized.stack,
    cause: callSiteError,
    code: serialized.code,
    details: serialized.details,
    detailsDropped: serialized.detailsDropped,
    workerCause: serialized.cause,
  })
}

/**
 * Thrown instead of a raw `ReferenceError: Worker is not defined` when `run()` is invoked
 * where the global `Worker` constructor does not exist (typically during SSR).
 */
export class WorkerUnavailableError extends Error {
  constructor(
    message = 'vue-worker-kit: Worker is not available in this environment (no global `Worker`). ' +
      'This usually means run() was called during SSR — guard it with a client-only check or <ClientOnly>.',
  ) {
    super(message)
    this.name = 'WorkerUnavailableError'
  }
}

export function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError'
}

export function isSupersededError(err: unknown): boolean {
  return isAbortError(err) && (err as { reason?: unknown }).reason === WORKER_SUPERSEDED
}

function createSupersededError(): Error {
  const message = 'The run was superseded by a newer run.'
  let err: Error
  if (typeof DOMException !== 'undefined') {
    err = new DOMException(message, 'AbortError')
  } else {
    err = new Error(message)
    err.name = 'AbortError'
  }
  Object.defineProperty(err, 'reason', { value: WORKER_SUPERSEDED, enumerable: true })
  return err
}

export function toAbortError(reason: unknown): Error {
  if (reason === WORKER_SUPERSEDED) return createSupersededError()
  if (reason instanceof Error) return reason
  if (typeof DOMException !== 'undefined') {
    return new DOMException(
      typeof reason === 'string' ? reason : 'The operation was aborted.',
      'AbortError',
    )
  }
  const err = new Error(typeof reason === 'string' ? reason : 'The operation was aborted.')
  err.name = 'AbortError'
  return err
}
