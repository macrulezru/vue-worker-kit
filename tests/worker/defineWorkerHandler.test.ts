import { describe, expect, test } from 'vitest'
import { attachSharedWorkerProtocol, attachWorkerProtocol, defineWorkerHandler } from '../../src/worker/defineWorkerHandler'
import type { MessagePortLike, SharedWorkerScopeLike, WorkerScopeLike } from '../../src/protocol'

describe('defineWorkerHandler', () => {
  test('is inert when evaluated outside a real WorkerGlobalScope', () => {
    expect(typeof WorkerGlobalScope).toBe('undefined')
    const handlerModule = defineWorkerHandler((input: number) => input)
    // Phantom-typed marker only — no runtime fields, no message loop was attached anywhere.
    expect(handlerModule).toEqual({})
  })
})

describe('attachWorkerProtocol', () => {
  test('wires run/cancel messages onto an explicit scope, bypassing the WorkerGlobalScope check', async () => {
    const posted: unknown[] = []
    const scope: WorkerScopeLike = {
      onmessage: null,
      postMessage(message) {
        posted.push(message)
      },
    }

    attachWorkerProtocol((input: number) => input * 2, scope)
    scope.onmessage!({ data: { type: 'run', id: 1, input: 21 } } as MessageEvent)

    await new Promise((resolve) => setTimeout(resolve, 0))
    // A final, unthrottled `progress: 1` always precedes `result` — see progress completion
    // test below for why (a throttled ctx.reportProgress(1) call can get dropped).
    expect(posted).toEqual([
      { type: 'progress', id: 1, value: 1 },
      { type: 'result', id: 1, output: 42 },
    ])
  })

  test('always reports final progress of 1 before the result, even if the handler never calls reportProgress', async () => {
    const posted: unknown[] = []
    const scope: WorkerScopeLike = {
      onmessage: null,
      postMessage(message) {
        posted.push(message)
      },
    }

    attachWorkerProtocol(async (input: number, ctx) => {
      ctx.reportProgress(0.1) // an early, throttled checkpoint — not close to 1
      return input
    }, scope)
    scope.onmessage!({ data: { type: 'run', id: 1, input: 5 } } as MessageEvent)

    await new Promise((resolve) => setTimeout(resolve, 0))
    const progressMessages = posted.filter((m) => (m as { type: string }).type === 'progress')
    expect(progressMessages[progressMessages.length - 1]).toEqual({ type: 'progress', id: 1, value: 1 })
  })

  test('a thrown handler error is serialized into an `error` message', async () => {
    const posted: unknown[] = []
    const scope: WorkerScopeLike = {
      onmessage: null,
      postMessage(message) {
        posted.push(message)
      },
    }

    attachWorkerProtocol(() => {
      throw new Error('worker-side failure')
    }, scope)
    scope.onmessage!({ data: { type: 'run', id: 7, input: undefined } } as MessageEvent)

    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(posted).toEqual([
      {
        type: 'error',
        id: 7,
        error: expect.objectContaining({ name: 'Error', message: 'worker-side failure' }),
      },
    ])
  })

  test('a message type other than run/cancel is ignored, not misread as a run request', async () => {
    const posted: unknown[] = []
    const handlerCalls: unknown[] = []
    const scope: WorkerScopeLike = {
      onmessage: null,
      postMessage(message) {
        posted.push(message)
      },
    }

    attachWorkerProtocol((input: unknown) => {
      handlerCalls.push(input)
      return input
    }, scope)
    // A shared-worker 'disconnect' message (or any message type this build doesn't know about)
    // has no `id`/`input` — misreading it as 'run' would call the handler with `undefined`.
    scope.onmessage!({ data: { type: 'disconnect' } } as unknown as MessageEvent)

    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(handlerCalls).toEqual([])
    expect(posted).toEqual([])
  })
})

describe('attachSharedWorkerProtocol', () => {
  function createPortPair(): { clientPort: MessagePortLike; workerPort: MessagePortLike } {
    const clientPort: MessagePortLike = {
      onmessage: null,
      postMessage: (message) => queueMicrotask(() => workerPort.onmessage?.({ data: message } as MessageEvent)),
      close() {},
      start() {},
    }
    const workerPort: MessagePortLike = {
      onmessage: null,
      postMessage: (message) => queueMicrotask(() => clientPort.onmessage?.({ data: message } as MessageEvent)),
      close() {},
      start() {},
    }
    return { clientPort, workerPort }
  }

  test('runs a task over a connected port, isolated by its own id space', async () => {
    const scope: SharedWorkerScopeLike = { onconnect: null }
    attachSharedWorkerProtocol((input: number) => input * 2, scope)

    const { clientPort, workerPort } = createPortPair()
    scope.onconnect!({ ports: [workerPort] })

    const received: unknown[] = []
    clientPort.onmessage = (event) => received.push(event.data)
    clientPort.postMessage({ type: 'run', id: 1, input: 10 })

    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(received).toContainEqual({ type: 'result', id: 1, output: 20 })
  })

  test('broadcasts portCount to every connected tab on connect and on cooperative disconnect', async () => {
    const scope: SharedWorkerScopeLike = { onconnect: null }
    attachSharedWorkerProtocol((input: number) => input, scope)

    const tabA = createPortPair()
    const receivedA: unknown[] = []
    tabA.clientPort.onmessage = (event) => receivedA.push(event.data)
    scope.onconnect!({ ports: [tabA.workerPort] })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(receivedA).toContainEqual({ type: 'portCount', count: 1 })

    const tabB = createPortPair()
    const receivedB: unknown[] = []
    tabB.clientPort.onmessage = (event) => receivedB.push(event.data)
    scope.onconnect!({ ports: [tabB.workerPort] })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(receivedA).toContainEqual({ type: 'portCount', count: 2 })
    expect(receivedB).toContainEqual({ type: 'portCount', count: 2 })

    receivedA.length = 0
    tabB.clientPort.postMessage({ type: 'disconnect' })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(receivedA).toContainEqual({ type: 'portCount', count: 1 })
  })

  test('cancelling a task on one tab does not affect another tab\'s in-flight request with the same id', async () => {
    const scope: SharedWorkerScopeLike = { onconnect: null }
    attachSharedWorkerProtocol(async (input: number, ctx) => {
      await new Promise((resolve) => setTimeout(resolve, 10))
      if (ctx.signal.aborted) throw ctx.signal.reason
      return input
    }, scope)

    const tabA = createPortPair()
    const receivedA: unknown[] = []
    tabA.clientPort.onmessage = (event) => receivedA.push(event.data)
    scope.onconnect!({ ports: [tabA.workerPort] })

    const tabB = createPortPair()
    const receivedB: unknown[] = []
    tabB.clientPort.onmessage = (event) => receivedB.push(event.data)
    scope.onconnect!({ ports: [tabB.workerPort] })

    tabA.clientPort.postMessage({ type: 'run', id: 1, input: 1 })
    tabB.clientPort.postMessage({ type: 'run', id: 1, input: 2 })
    tabA.clientPort.postMessage({ type: 'cancel', id: 1 })

    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(receivedA.some((m) => (m as { type: string }).type === 'result')).toBe(false)
    expect(receivedB).toContainEqual({ type: 'result', id: 1, output: 2 })
  })
})
