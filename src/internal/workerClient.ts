import { toRaw } from 'vue'
import { WorkerError, workerErrorFromSerialized } from '../errors'
import { isDevMode } from './isDevMode'
import type { WorkerLike, WorkerToMainMessage } from '../protocol'

interface PendingRequest {
  resolve(output: unknown): void
  reject(error: unknown): void
  onProgress?: (value: number) => void
  onChunk?: (chunk: unknown) => void
  /** Synthetic error created at the `run()` call site — becomes `WorkerError.cause` on failure. */
  callSiteError: Error
  /** Set after the first "chunk dropped" dev-mode warning for this request, so a handler
   *  that calls `ctx.reportChunk()` many times only warns once, not once per chunk. */
  chunkDropWarned?: boolean
}

export interface WorkerClient {
  send(
    input: unknown,
    transfer: Transferable[] | undefined,
    onProgress?: (value: number) => void,
    onChunk?: (chunk: unknown) => void,
  ): {
    id: number
    promise: Promise<unknown>
  }
  cancel(id: number, reason?: unknown): void
  /** Rejects every still-pending request (used when the underlying worker is terminated). */
  dispose(reason: unknown): void
}

/**
 * Correlates `run`/`cancel` requests with `result`/`error`/`progress` responses over a
 * single worker-like transport. Shared by `useWorker()` (one worker) and the pool adapter
 * (one client per pooled worker) so the message-id bookkeeping isn't duplicated.
 *
 * `onCrash`, if given, fires after a `Worker.onerror` event rejects every pending request —
 * lets the caller (e.g. `useWorker()`) null out its own worker/client references so the next
 * call transparently creates a fresh worker, instead of reusing the crashed instance.
 */
export function createWorkerClient(worker: WorkerLike, onCrash?: () => void): WorkerClient {
  let nextId = 1
  const pending = new Map<number, PendingRequest>()

  worker.onmessage = (event: MessageEvent<WorkerToMainMessage>) => {
    const msg = event.data
    const entry = pending.get(msg.id)
    if (!entry) return

    if (msg.type === 'progress') {
      entry.onProgress?.(msg.value)
      return
    }

    if (msg.type === 'chunk') {
      if (entry.onChunk) {
        entry.onChunk(msg.chunk)
      } else if (isDevMode() && !entry.chunkDropWarned) {
        entry.chunkDropWarned = true
        console.warn(
          '[vue-worker-kit] A worker handler called ctx.reportChunk(), but this run has no ' +
            'chunk listener — with useWorker(), that means `streaming` is not enabled ' +
            '(pass `{ streaming: true }`); with a pool, pass `onProgress`/`onChunk` in ' +
            'RunOptions/WorkerMapOptions. The chunk is being silently dropped.',
        )
      }
      return
    }

    pending.delete(msg.id)
    if (msg.type === 'result') {
      entry.resolve(msg.output)
    } else {
      entry.reject(workerErrorFromSerialized(msg.error, entry.callSiteError))
    }
  }

  worker.onerror = (event: ErrorEvent) => {
    const callSiteError = new Error('Worker crashed')
    const err = new WorkerError(event.message || 'Worker crashed', { cause: callSiteError })
    for (const entry of pending.values()) entry.reject(err)
    pending.clear()
    onCrash?.()
  }

  function send(
    input: unknown,
    transfer: Transferable[] | undefined,
    onProgress?: (value: number) => void,
    onChunk?: (chunk: unknown) => void,
  ): { id: number; promise: Promise<unknown> } {
    const id = nextId++
    // Created here (synchronously, at the call site) so a later failure's `.cause` points
    // at where run() was actually called, not at the internal message-handling callback.
    const callSiteError = new Error('vue-worker-kit: run() called from here')

    const promise = new Promise<unknown>((resolve, reject) => {
      pending.set(id, { resolve, reject, onProgress, onChunk, callSiteError })
    })

    try {
      // Reactive proxies (a ref/reactive `.value` passed straight from a component) aren't
      // structured-cloneable — postMessage would throw DataCloneError on the Proxy itself,
      // even though the underlying plain data is perfectly serializable.
      worker.postMessage({ type: 'run', id, input: toRaw(input) }, transfer ?? [])
    } catch (cause) {
      pending.delete(id)
      return {
        id,
        promise: Promise.reject(
          new WorkerError('Failed to clone data for the worker (structured clone failure)', {
            name: 'DataCloneError',
            cause,
          }),
        ),
      }
    }

    return { id, promise }
  }

  function cancel(id: number, reason?: unknown): void {
    worker.postMessage({ type: 'cancel', id, reason })
  }

  function dispose(reason: unknown): void {
    for (const entry of pending.values()) entry.reject(reason)
    pending.clear()
  }

  return { send, cancel, dispose }
}
