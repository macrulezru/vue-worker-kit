import { describe, expect, test } from 'vitest'
import { createWorkerPool, useWorkerPool } from '../src/adapters/pool'
import { createTestWorker, type FixtureModule } from './helpers'

interface Item {
  id: number
  delayMs: number
}

describe('createWorkerPool', () => {
  // §9 case 9
  test('map() respects the concurrency limit and preserves result order', async () => {
    let current = 0
    let maxConcurrent = 0
    const handler = async (input: Item): Promise<number> => {
      current++
      maxConcurrent = Math.max(maxConcurrent, current)
      await new Promise((resolve) => setTimeout(resolve, input.delayMs))
      current--
      return input.id
    }

    const pool = createWorkerPool<FixtureModule<Item, number>>(() => createTestWorker(handler), {
      size: 4,
    })

    const items: Item[] = Array.from({ length: 10 }, (_, i) => ({ id: i, delayMs: 15 }))
    const results = await pool.map(items, { concurrency: 2 })

    expect(results).toEqual(items.map((item) => item.id))
    expect(maxConcurrent).toBeLessThanOrEqual(2)
  })

  test('size defaults to navigator.hardwareConcurrency when not specified', () => {
    const pool = createWorkerPool<FixtureModule<undefined, number>>(() => createTestWorker(() => 1), {})
    expect(pool.size).toBe(navigator.hardwareConcurrency)
    expect(pool.size).toBeGreaterThan(0)
  })

  test('size falls back to 4 when navigator is unavailable (SSR emulation)', () => {
    const originalNavigator = globalThis.navigator
    // @ts-expect-error simulating an SSR environment where `navigator` does not exist
    delete globalThis.navigator
    try {
      const pool = createWorkerPool<FixtureModule<undefined, number>>(() => createTestWorker(() => 1), {})
      expect(pool.size).toBe(4)
    } finally {
      globalThis.navigator = originalNavigator
    }
  })

  test('lazily creates workers up to `size`, not all at once', async () => {
    let createCount = 0
    const handler = async (input: Item) => {
      await new Promise((resolve) => setTimeout(resolve, input.delayMs))
      return input.id
    }
    const pool = createWorkerPool<FixtureModule<Item, number>>(
      () => {
        createCount++
        return createTestWorker(handler)
      },
      { size: 3 },
    )

    expect(createCount).toBe(0)
    await pool.run({ id: 1, delayMs: 5 })
    expect(createCount).toBe(1)
  })

  test('stats reflect busy/idle/queued counts', async () => {
    let release: (() => void) | undefined
    const handler = () =>
      new Promise<number>((resolve) => {
        release = () => resolve(1)
      })

    const pool = createWorkerPool<FixtureModule<undefined, number>>(() => createTestWorker(handler), {
      size: 1,
    })

    const p1 = pool.run(undefined)
    const p2 = pool.run(undefined)
    await new Promise((resolve) => setTimeout(resolve, 5))

    expect(pool.stats.value.busy).toBe(1)
    expect(pool.stats.value.queued).toBe(1)

    release?.()
    await p1
    await new Promise((resolve) => setTimeout(resolve, 5))
    release?.()
    await p2

    expect(pool.stats.value.busy).toBe(0)
    expect(pool.stats.value.queued).toBe(0)
  })

  test('terminate() rejects queued and in-flight tasks and resets stats', async () => {
    const handler = () => new Promise<number>(() => {}) // never resolves
    const pool = createWorkerPool<FixtureModule<undefined, number>>(() => createTestWorker(handler), {
      size: 1,
    })

    const p1 = pool.run(undefined)
    const p2 = pool.run(undefined) // queued, size is 1
    await new Promise((resolve) => setTimeout(resolve, 5))

    pool.terminate()

    await expect(p1).rejects.toBeTruthy()
    await expect(p2).rejects.toBeTruthy()
    expect(pool.stats.value).toEqual({ busy: 0, idle: 0, queued: 0 })
  })
})

test('useWorkerPool() auto-terminates its workers via onScopeDispose', async () => {
  const { effectScope } = await import('vue')
  let terminated = false
  const scope = effectScope()
  let pool!: ReturnType<typeof useWorkerPool<FixtureModule<undefined, number>>>

  scope.run(() => {
    pool = useWorkerPool<FixtureModule<undefined, number>>(
      () =>
        createTestWorker(() => 1, {
          onTerminate: () => {
            terminated = true
          },
        }),
      { size: 1 },
    )
  })

  await pool.run(undefined) // materializes the (lazily-created) pooled worker
  expect(terminated).toBe(false)

  scope.stop()
  expect(terminated).toBe(true)
})
