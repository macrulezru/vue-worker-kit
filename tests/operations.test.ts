import { describe, expect, test } from 'vitest'
import { useWorker } from '../src/useWorker'
import { useSharedWorker } from '../src/adapters/sharedWorker'
import { createWorkerPool } from '../src/adapters/pool'
import { WorkerHandlerError, type WorkerContext } from '../src/worker/defineWorkerHandler'
import {
  createTestSharedWorker,
  createTestWorker,
  type FixtureModule,
  type OperationsFixtureModule,
} from './helpers'

const operations = {
  parse(input: { text: string }) {
    return { length: input.text.length, ok: true }
  },
  async format(input: { value: number }, ctx: WorkerContext) {
    ctx.reportProgress(0.5)
    return `v=${input.value}`
  },
  fail(input: { reason: string }): never {
    throw new WorkerHandlerError(input.reason, {
      code: 'E_FAIL',
      details: { reason: input.reason },
    })
  },
  same(input: { n: number }) {
    return input.n
  },
  other(input: { n: number }) {
    return input.n * 100
  },
}

type OperationsModule = OperationsFixtureModule<typeof operations>

describe('typed operations (G)', () => {
  test('call() runs the named operation and returns its own result', async () => {
    const worker = useWorker<OperationsModule>(() => createTestWorker(operations))

    const parsed = await worker.call('parse', { text: 'hello' })
    const formatted = await worker.call('format', { value: 5 })

    expect(parsed).toEqual({ length: 5, ok: true })
    expect(formatted).toBe('v=5')
  })

  test('an unknown operation fails with UNKNOWN_OPERATION and the worker keeps serving', async () => {
    const worker = useWorker<OperationsModule>(() => createTestWorker(operations))
    const callUnknown = worker.call as unknown as (name: string, input: unknown) => Promise<unknown>

    const rejection = await callUnknown('missing', {}).catch((caught: Error) => caught)

    expect(rejection).toMatchObject({ code: 'UNKNOWN_OPERATION' })
    expect((rejection as { details?: { available?: string[] } }).details?.available).toContain(
      'parse',
    )
    await expect(worker.call('parse', { text: 'ok' })).resolves.toEqual({ length: 2, ok: true })
  })

  test('errors with data come through call()', async () => {
    const worker = useWorker<OperationsModule>(() => createTestWorker(operations))
    await expect(worker.call('fail', { reason: 'boom' })).rejects.toMatchObject({
      code: 'E_FAIL',
      details: { reason: 'boom' },
    })
  })

  test('progress and cancellation work like for a single handler', async () => {
    const worker = useWorker<OperationsModule>(() => createTestWorker(operations))
    const seen: number[] = []
    await worker.call('format', { value: 1 }, { onProgress: (value) => seen.push(value) })
    expect(seen).toContain(0.5)
    expect(worker.progress.value).toBe(1)

    const controller = new AbortController()
    controller.abort()
    await expect(
      worker.call('parse', { text: 'x' }, { signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' })
  })

  test('the cache key includes the operation name', async () => {
    const worker = useWorker<OperationsModule>(() => createTestWorker(operations), {
      cache: { cache: 'lru' },
    })
    expect(await worker.call('same', { n: 3 })).toBe(3)
    expect(await worker.call('other', { n: 3 })).toBe(300)
    expect(await worker.call('same', { n: 3 })).toBe(3)
  })

  test('works through a pool', async () => {
    const pool = createWorkerPool<OperationsModule>(() => createTestWorker(operations), { size: 2 })
    const results = await Promise.all([
      pool.call('parse', { text: 'ab' }),
      pool.call('format', { value: 2 }),
      pool.call('same', { n: 9 }),
    ])
    expect(results).toEqual([{ length: 2, ok: true }, 'v=2', 9])
  })

  test('works through useSharedWorker', async () => {
    const worker = useSharedWorker<OperationsModule>(createTestSharedWorker(operations))
    await expect(worker.call('parse', { text: 'abc' })).resolves.toEqual({ length: 3, ok: true })
    await expect(worker.call('other', { n: 2 })).resolves.toBe(200)
  })

  test('a single-handler module keeps working and rejects named operations', async () => {
    type SingleModule = FixtureModule<number, number>
    const worker = useWorker<SingleModule>(() => createTestWorker((input: number) => input + 1))
    await expect(worker.run(1)).resolves.toBe(2)

    const callNamed = worker as unknown as {
      run(input: unknown, options: { op: string }): Promise<unknown>
    }
    await expect(callNamed.run(1, { op: 'x' })).rejects.toMatchObject({ code: 'UNKNOWN_OPERATION' })
  })

  test('calling an operations worker without a name is an error', async () => {
    const worker = useWorker<OperationsModule>(() => createTestWorker(operations))
    const runUnnamed = worker as unknown as { run(input: unknown): Promise<unknown> }
    await expect(runUnnamed.run({})).rejects.toMatchObject({ code: 'UNKNOWN_OPERATION' })
  })
})
