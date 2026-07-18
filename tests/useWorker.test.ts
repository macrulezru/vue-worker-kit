import { effectScope } from 'vue'
import { describe, expect, test } from 'vitest'
import { useWorker } from '../src/useWorker'
import { WorkerError, WorkerUnavailableError } from '../src/errors'
import { createTestWorker, waitFor } from './helpers'
import { sortHandler } from './fixtures/sort.worker'
import { asyncEchoHandler } from './fixtures/asyncEcho.worker'
import { throwingHandler } from './fixtures/throwing.worker'
import { delayHandler } from './fixtures/delay.worker'
import { bufferLengthHandler } from './fixtures/bufferLength.worker'
import { transferOutHandler } from './fixtures/transferOut.worker'
import type { WorkerContext } from '../src/worker/defineWorkerHandler'

describe('useWorker — run()', () => {
  // §9 case 1
  test('resolves with a correctly typed result for a sync handler', async () => {
    const { run } = useWorker<typeof import('./fixtures/sort.worker')>(() => createTestWorker(sortHandler))
    const result = await run([3, 1, 2])
    expect(result).toEqual([1, 2, 3])
  })

  // §9 case 2
  test('resolves an async handler only after its internal await completes', async () => {
    const { run } = useWorker<typeof import('./fixtures/asyncEcho.worker')>(() =>
      createTestWorker(asyncEchoHandler),
    )
    const result = await run({ value: 'hello', delayMs: 20 })
    expect(result).toBe('hello')
  })

  // §9 case 3
  test('a handler error rejects with WorkerError carrying workerStack and a call-site cause', async () => {
    const { run, error } = useWorker<typeof import('./fixtures/throwing.worker')>(() =>
      createTestWorker(throwingHandler),
    )
    await expect(run({ message: 'boom' })).rejects.toMatchObject({
      name: 'WorkerError',
      message: 'boom',
    })
    expect(error.value).toBeInstanceOf(WorkerError)
    expect(error.value?.workerStack).toBeTruthy()
    expect(error.value?.cause).toBeInstanceOf(Error)
  })

  // §9 case 4
  test('aborting before completion rejects with AbortError and does not retry', async () => {
    let handlerCalls = 0
    const handler = async (input: { id: number; delayMs: number }) => {
      handlerCalls++
      await new Promise((resolve) => setTimeout(resolve, input.delayMs))
      return input.id
    }
    const { run } = useWorker<typeof import('./fixtures/delay.worker')>(() => createTestWorker(handler), {
      retries: 3,
    })
    const controller = new AbortController()
    const promise = run({ id: 1, delayMs: 200 }, { signal: controller.signal })
    controller.abort()
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' })
    expect(handlerCalls).toBe(1) // no retry attempted for a cancellation
  })

  // §9 case 5
  test('hardCancelOnAbort terminates and transparently recreates the worker', async () => {
    let createCount = 0
    let terminateCount = 0
    const factory = () => {
      createCount++
      return createTestWorker(delayHandler, {
        onTerminate: () => {
          terminateCount++
        },
      })
    }
    const { run, cancel } = useWorker<typeof import('./fixtures/delay.worker')>(factory, {
      hardCancelOnAbort: true,
    })

    const promise = run({ id: 1, delayMs: 200 })
    await waitFor(() => createCount === 1)
    cancel()
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' })
    expect(terminateCount).toBe(1)

    await run({ id: 2, delayMs: 5 })
    expect(createCount).toBe(2) // next run() transparently created a fresh worker
  })

  // §9 case 6
  test('idle timeout terminates the worker; the next run() transparently recreates it', async () => {
    let createCount = 0
    const { run } = useWorker<typeof import('./fixtures/sort.worker')>(
      () => {
        createCount++
        return createTestWorker(sortHandler)
      },
      { idleTimeout: 20 },
    )

    await run([2, 1])
    expect(createCount).toBe(1)

    await new Promise((resolve) => setTimeout(resolve, 60))

    await run([2, 1])
    expect(createCount).toBe(2)
  })

  // §9 case 7
  test('onScopeDispose terminates the worker when the component scope is disposed', async () => {
    let terminateCount = 0
    const scope = effectScope()
    let run!: ReturnType<typeof useWorker<typeof import('./fixtures/sort.worker')>>['run']

    scope.run(() => {
      const composable = useWorker<typeof import('./fixtures/sort.worker')>(() =>
        createTestWorker(sortHandler, { onTerminate: () => terminateCount++ }),
      )
      run = composable.run
    })

    await run([1])
    expect(terminateCount).toBe(0)

    scope.stop()
    expect(terminateCount).toBe(1)
  })

  // §9 case 8
  test('transfer detaches the source ArrayBuffer on the sending side', async () => {
    const { run } = useWorker<typeof import('./fixtures/bufferLength.worker')>(() =>
      createTestWorker(bufferLengthHandler),
    )
    const buffer = new ArrayBuffer(1024)

    const promise = run(buffer, { transfer: [buffer] })
    expect(buffer.byteLength).toBe(0)
    await expect(promise).resolves.toBe(1024)
  })

  test('ctx.transfer() sends the result back without copying, detaching the worker-side buffer', async () => {
    let capturedBuffer: ArrayBuffer | undefined
    const handler = (input: { size: number; fillValue: number }, ctx: WorkerContext) => {
      const result = transferOutHandler(input, ctx)
      capturedBuffer = result
      return result
    }
    const { run } = useWorker<typeof import('./fixtures/transferOut.worker')>(() => createTestWorker(handler))

    const result = await run({ size: 16, fillValue: 42 })
    expect(new Uint8Array(result)[0]).toBe(42)
    expect(result.byteLength).toBe(16)
    // The buffer captured worker-side was the SAME object handed to postMessage's transfer
    // list — once that hop happens it's detached on the sending side, proving zero-copy.
    expect(capturedBuffer?.byteLength).toBe(0)
  })

  // §9 case 11
  test('run() throws WorkerUnavailableError when no global Worker exists (SSR emulation)', async () => {
    const originalWorker = globalThis.Worker
    // @ts-expect-error simulating an SSR environment where `Worker` does not exist
    delete globalThis.Worker
    try {
      const { run } = useWorker<typeof import('./fixtures/sort.worker')>(() => createTestWorker(sortHandler))
      await expect(run([1])).rejects.toBeInstanceOf(WorkerUnavailableError)
    } finally {
      globalThis.Worker = originalWorker
    }
  })

  test('retries automatically re-run a failed task up to the configured count', async () => {
    let attempts = 0
    const handler = (input: { message: string }) => {
      attempts++
      if (attempts < 3) throw new Error(input.message)
      return 'ok'
    }
    const { run } = useWorker<typeof import('./fixtures/throwing.worker')>(
      () => createTestWorker(handler as never),
      { retries: 2 },
    )
    const result = await run({ message: 'transient' })
    expect(result).toBe('ok')
    expect(attempts).toBe(3)
  })

  test('progress reports update the reactive progress ref', async () => {
    const handler = async (input: { steps: number }, ctx: { reportProgress(v: number): void }) => {
      for (let i = 1; i <= input.steps; i++) {
        ctx.reportProgress(i / input.steps)
      }
      return input.steps
    }
    const { run, progress } = useWorker<typeof import('./fixtures/delay.worker')>(() =>
      createTestWorker(handler as never),
    )
    await run({ steps: 3 } as never)
    await waitFor(() => progress.value > 0)
    expect(progress.value).toBeGreaterThan(0)
  })
})

test('a DataCloneError surfaces as a WorkerError, not an unhandled postMessage exception', async () => {
  const { run } = useWorker<typeof import('./fixtures/sort.worker')>(() => {
    const worker = createTestWorker(sortHandler)
    const realPostMessage = worker.postMessage.bind(worker)
    const patchedPostMessage = (message: unknown, transfer?: Transferable[]) => {
      if ((message as { type?: string }).type === 'run') {
        throw new Error('could not be cloned')
      }
      realPostMessage(message as never, transfer as never)
    }
    worker.postMessage = patchedPostMessage as typeof worker.postMessage
    return worker
  })

  await expect(run([1])).rejects.toMatchObject({ name: 'DataCloneError' })
})
