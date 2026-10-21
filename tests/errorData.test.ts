import { describe, expect, test } from 'vitest'
import { useWorker } from '../src/useWorker'
import { useSharedWorker } from '../src/adapters/sharedWorker'
import { WorkerError } from '../src/errors'
import { serializeError } from '../src/protocol'
import { WorkerHandlerError } from '../src/worker/defineWorkerHandler'
import { createTestSharedWorker, createTestWorker, type FixtureModule } from './helpers'

type ThrowModule = FixtureModule<string, never>

describe('errors that carry data (H)', () => {
  test('code and details of a WorkerHandlerError arrive on the main thread', async () => {
    const handler = (): never => {
      throw new WorkerHandlerError('Unexpected token', {
        code: 'E_PARSE',
        details: { start: 12, end: 15, path: ['items', 3] },
      })
    }
    const { run, error } = useWorker<ThrowModule>(() => createTestWorker(handler))

    const rejection = await run('x').catch((caught: WorkerError) => caught)

    expect(rejection).toBeInstanceOf(WorkerError)
    expect(rejection).toMatchObject({
      name: 'WorkerHandlerError',
      message: 'Unexpected token',
      code: 'E_PARSE',
      details: { start: 12, end: 15, path: ['items', 3] },
    })
    expect(error.value?.code).toBe('E_PARSE')
    expect(error.value?.details).toEqual({ start: 12, end: 15, path: ['items', 3] })
  })

  test('a custom name passed to WorkerHandlerError survives', async () => {
    const handler = (): never => {
      throw new WorkerHandlerError('nope', { name: 'ParseError', code: 'X' })
    }
    const { run } = useWorker<ThrowModule>(() => createTestWorker(handler))
    await expect(run('x')).rejects.toMatchObject({ name: 'ParseError', code: 'X' })
  })

  test('details that cannot be cloned are replaced by a description, and the error is still delivered', async () => {
    const handler = (): never => {
      throw new WorkerHandlerError('bad details', {
        code: 'E_DETAILS',
        details: { callback: () => 1 },
      })
    }
    const { run } = useWorker<ThrowModule>(() => createTestWorker(handler))

    const rejection = await run('x').catch((caught: WorkerError) => caught)

    expect(rejection).toMatchObject({
      message: 'bad details',
      code: 'E_DETAILS',
      detailsDropped: true,
    })
    expect(typeof rejection.details).toBe('string')
  })

  test('an ordinary Error behaves exactly as before', async () => {
    const handler = (): never => {
      throw new Error('plain')
    }
    const { run } = useWorker<ThrowModule>(() => createTestWorker(handler))
    const rejection = await run('x').catch((caught: WorkerError) => caught)

    expect(rejection).toMatchObject({ name: 'WorkerError', message: 'plain' })
    expect(rejection.code).toBeUndefined()
    expect(rejection.details).toBeUndefined()
    expect(rejection.detailsDropped).toBeUndefined()
    expect(rejection.workerStack).toBeTruthy()
  })

  test('a thrown plain object with code and details is understood too', async () => {
    const handler = (): never => {
      throw { message: 'object error', code: 'E_OBJ', details: [1, 2] }
    }
    const { run } = useWorker<ThrowModule>(() => createTestWorker(handler))
    await expect(run('x')).rejects.toMatchObject({
      message: 'object error',
      code: 'E_OBJ',
      details: [1, 2],
    })
  })

  test('the cause chain keeps names and messages up to three levels', async () => {
    const handler = (): never => {
      const root = new TypeError('root cause')
      const middle = new Error('middle', { cause: root })
      throw new Error('top', { cause: middle })
    }
    const { run } = useWorker<ThrowModule>(() => createTestWorker(handler))
    const rejection = await run('x').catch((caught: WorkerError) => caught)

    expect(rejection.workerCause).toEqual([
      { name: 'Error', message: 'middle' },
      { name: 'TypeError', message: 'root cause' },
    ])
  })

  test('works through useSharedWorker as well', async () => {
    const handler = (): never => {
      throw new WorkerHandlerError('shared', { code: 'E_SHARED', details: { n: 1 } })
    }
    const { run } = useSharedWorker<ThrowModule>(createTestSharedWorker(handler))
    await expect(run('x')).rejects.toMatchObject({ code: 'E_SHARED', details: { n: 1 } })
  })

  test('serializeError keeps the old shape for errors without extra data', () => {
    const serialized = serializeError(new Error('legacy'))
    expect(serialized).toMatchObject({ name: 'Error', message: 'legacy' })
    expect(serialized.code).toBeUndefined()
    expect(serialized.details).toBeUndefined()
    expect(serializeError('text')).toEqual({ name: 'Error', message: 'text' })
  })
})
