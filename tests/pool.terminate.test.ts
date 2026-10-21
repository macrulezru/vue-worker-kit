import { describe, expect, test } from 'vitest'
import { createWorkerPool } from '../src/adapters/pool'
import { WorkerError } from '../src/errors'
import { createTestWorker, waitFor, type FixtureModule } from './helpers'

type NumberModule = FixtureModule<number, number>

const slowDouble = async (input: number): Promise<number> => {
  await new Promise((resolve) => setTimeout(resolve, 20))
  return input * 2
}

describe('pool terminate() / restart()', () => {
  test('run() after terminate() rejects with POOL_TERMINATED, not an AbortError', async () => {
    const pool = createWorkerPool<NumberModule>(() => createTestWorker(slowDouble), { size: 2 })
    expect(await pool.run(1)).toBe(2)

    pool.terminate()

    const rejection = await pool.run(1).catch((caught: unknown) => caught)
    expect(rejection).toBeInstanceOf(WorkerError)
    expect(rejection).toMatchObject({ code: 'POOL_TERMINATED' })
    expect((rejection as Error).name).not.toBe('AbortError')
  })

  test('map() after terminate() rejects with POOL_TERMINATED and creates no workers', async () => {
    let created = 0
    const pool = createWorkerPool<NumberModule>(
      () => {
        created++
        return createTestWorker(slowDouble)
      },
      { size: 2 },
    )
    pool.terminate()

    await expect(pool.map([1, 2, 3])).rejects.toMatchObject({ code: 'POOL_TERMINATED' })
    expect(created).toBe(0)
  })

  test('warmup() after terminate() still does nothing', async () => {
    let created = 0
    const pool = createWorkerPool<NumberModule>(
      () => {
        created++
        return createTestWorker(slowDouble)
      },
      { size: 2 },
    )
    pool.terminate()
    await pool.warmup()
    expect(created).toBe(0)
  })

  test('restart() makes the pool usable again', async () => {
    const pool = createWorkerPool<NumberModule>(() => createTestWorker(slowDouble), { size: 2 })
    pool.terminate()
    await expect(pool.run(1)).rejects.toMatchObject({ code: 'POOL_TERMINATED' })

    pool.restart()

    await expect(pool.run(4)).resolves.toBe(8)
    await expect(pool.map([1, 2, 3])).resolves.toEqual([2, 4, 6])
  })

  test('terminate() during map() rejects the running and the remaining items', async () => {
    const pool = createWorkerPool<NumberModule>(() => createTestWorker(slowDouble), { size: 2 })

    const settled = pool
      .map([1, 2, 3, 4, 5, 6], { concurrency: 2 })
      .catch((caught: unknown) => caught)
    await waitFor(() => pool.stats.value.busy === 2)

    pool.terminate()

    expect(await settled).toMatchObject({ code: 'POOL_TERMINATED' })
    expect(pool.stats.value).toEqual({ busy: 0, idle: 0, queued: 0 })
    await expect(pool.run(1)).rejects.toMatchObject({ code: 'POOL_TERMINATED' })
  })

  test('queued tasks are rejected with POOL_TERMINATED too', async () => {
    const pool = createWorkerPool<NumberModule>(() => createTestWorker(slowDouble), { size: 1 })
    const running = pool.run(1).catch((caught: unknown) => caught)
    const queued = pool.run(2).catch((caught: unknown) => caught)
    await waitFor(() => pool.stats.value.queued === 1)

    pool.terminate()

    expect(await running).toMatchObject({ code: 'POOL_TERMINATED' })
    expect(await queued).toMatchObject({ code: 'POOL_TERMINATED' })
  })
})
