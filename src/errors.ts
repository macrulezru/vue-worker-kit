import type { SerializedError } from './protocol'

export interface WorkerErrorOptions {
  name?: string
  workerStack?: string
  cause?: unknown
}

/**
 * Rejection type for a failed `run()`. `.stack`/`.cause` point at the `run()` call site
 * (the synthetic error is created there, before crossing into the worker), while
 * `.workerStack` carries the original stack captured inside the worker — so both ends
 * of the failure are visible together in the console/Sentry.
 */
export class WorkerError extends Error {
  readonly workerStack?: string

  constructor(message: string, options: WorkerErrorOptions = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined)
    this.name = options.name ?? 'WorkerError'
    this.workerStack = options.workerStack
  }
}

export function workerErrorFromSerialized(serialized: SerializedError, callSiteError: Error): WorkerError {
  return new WorkerError(serialized.message, {
    name: serialized.name === 'Error' ? 'WorkerError' : serialized.name,
    workerStack: serialized.stack,
    cause: callSiteError,
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

export function toAbortError(reason: unknown): Error {
  if (reason instanceof Error) return reason
  if (typeof DOMException !== 'undefined') {
    return new DOMException(typeof reason === 'string' ? reason : 'The operation was aborted.', 'AbortError')
  }
  const err = new Error(typeof reason === 'string' ? reason : 'The operation was aborted.')
  err.name = 'AbortError'
  return err
}
