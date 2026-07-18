import { describe, expect, test } from 'vitest'
import { attachWorkerProtocol, defineWorkerHandler } from '../../src/worker/defineWorkerHandler'
import type { WorkerScopeLike } from '../../src/protocol'

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
})
