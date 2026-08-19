import {
  attachSharedWorkerProtocol,
  attachWorkerProtocol,
  type WorkerHandlerFn,
  type WorkerHandlerModule,
} from '../src/worker/defineWorkerHandler'
import type { MessagePortLike, SharedWorkerScopeLike, WorkerScopeLike } from '../src/protocol'

/** `typeof import('./x.worker')` shape, built from a raw handler function's In/Out types. */
export type FixtureModule<In, Out> = { default: WorkerHandlerModule<In, Out> }

export interface TestWorkerHooks {
  onTerminate?: () => void
}

/**
 * In-process stand-in for a real `Worker` + `WorkerGlobalScope` pair.
 *
 * The handler runs in the same thread as the test (no real OS worker thread), but every
 * `postMessage` still crosses through a real `structuredClone(..., { transfer })` call, so
 * serialization and ArrayBuffer-transfer/detachment behave exactly as they would with a real
 * worker — the fake only skips actual thread isolation, not the message-passing contract.
 */
export function createTestWorker<In, Out>(
  handler: WorkerHandlerFn<In, Out>,
  hooks: TestWorkerHooks = {},
): Worker {
  const workerScope: WorkerScopeLike = {
    onmessage: null,
    postMessage(message, transfer) {
      const cloned = structuredClone(message, transfer?.length ? { transfer } : undefined)
      queueMicrotask(() => fakeWorker.onmessage?.({ data: cloned } as MessageEvent))
    },
  }

  attachWorkerProtocol(handler, workerScope)

  const fakeWorker = {
    onmessage: null as ((event: MessageEvent) => void) | null,
    onerror: null as ((event: ErrorEvent) => void) | null,
    postMessage(message: unknown, transfer?: Transferable[]) {
      const cloned = structuredClone(message, transfer?.length ? { transfer } : undefined)
      queueMicrotask(() => workerScope.onmessage?.({ data: cloned } as MessageEvent))
    },
    terminate() {
      hooks.onTerminate?.()
    },
  }

  return fakeWorker as unknown as Worker
}

/** A `Worker` factory whose worker-side crashes immediately (top-level throw), for onerror tests. */
export function createCrashingTestWorker(message: string): Worker {
  const fakeWorker = {
    onmessage: null as ((event: MessageEvent) => void) | null,
    onerror: null as ((event: ErrorEvent) => void) | null,
    postMessage() {
      queueMicrotask(() => fakeWorker.onerror?.({ message } as ErrorEvent))
    },
    terminate() {},
  }
  return fakeWorker as unknown as Worker
}

/**
 * In-process stand-in for a `SharedWorker` + `SharedWorkerGlobalScope` pair. `scope.onconnect`
 * is invoked once, synchronously, per call to the returned factory — mirroring one browser tab
 * each calling `new SharedWorker(...)` and getting back its own `MessagePort` to the one shared
 * worker-global instance behind `handler`. Every `postMessage` crosses through a real
 * `structuredClone`, same rationale as `createTestWorker`.
 */
export function createTestSharedWorker<In, Out>(handler: WorkerHandlerFn<In, Out>): () => SharedWorker {
  const scope: SharedWorkerScopeLike = { onconnect: null }
  attachSharedWorkerProtocol(handler, scope)

  return function factory(): SharedWorker {
    const clientPort: MessagePortLike = {
      onmessage: null,
      postMessage(message, transfer) {
        const cloned = structuredClone(message, transfer?.length ? { transfer } : undefined)
        queueMicrotask(() => workerPort.onmessage?.({ data: cloned } as MessageEvent))
      },
      close() {},
      start() {},
    }
    const workerPort: MessagePortLike = {
      onmessage: null,
      postMessage(message, transfer) {
        const cloned = structuredClone(message, transfer?.length ? { transfer } : undefined)
        queueMicrotask(() => clientPort.onmessage?.({ data: cloned } as MessageEvent))
      },
      close() {},
      start() {},
    }

    scope.onconnect?.({ ports: [workerPort] })

    return { port: clientPort } as unknown as SharedWorker
  }
}

export function nextTick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

export function waitFor(condition: () => boolean, timeoutMs = 1000): Promise<void> {
  const start = Date.now()
  return new Promise((resolve, reject) => {
    const check = () => {
      if (condition()) return resolve()
      if (Date.now() - start > timeoutMs) return reject(new Error('waitFor: timed out'))
      setTimeout(check, 5)
    }
    check()
  })
}
