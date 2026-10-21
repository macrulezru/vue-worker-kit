export interface WorkerHandlerErrorOptions {
  code?: string
  details?: unknown
  name?: string
  cause?: unknown
}

export class WorkerHandlerError extends Error {
  readonly code?: string
  readonly details?: unknown

  constructor(message: string, options: WorkerHandlerErrorOptions = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined)
    this.name = options.name ?? 'WorkerHandlerError'
    if (options.code !== undefined) this.code = options.code
    if (options.details !== undefined) this.details = options.details
  }
}
