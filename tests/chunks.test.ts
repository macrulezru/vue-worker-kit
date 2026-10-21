import { watch } from 'vue'
import { describe, expect, test } from 'vitest'
import { useWorker } from '../src/useWorker'
import { useSharedWorker } from '../src/adapters/sharedWorker'
import { createTestSharedWorker, createTestWorker, nextTick, type FixtureModule } from './helpers'
import type { WorkerContext } from '../src/worker/defineWorkerHandler'

type ChunkModule = FixtureModule<number, number>

const burstHandler = (count: number, ctx: WorkerContext): number => {
  for (let index = 0; index < count; index++) ctx.reportChunk(index)
  return count
}

const spacedHandler = async (count: number, ctx: WorkerContext): Promise<number> => {
  for (let index = 0; index < count; index++) {
    ctx.reportChunk(index)
    await new Promise((resolve) => setTimeout(resolve, 2))
  }
  return count
}

describe('chunks reactivity — useWorker', () => {
  test('a watcher on chunks fires for chunks that arrive in separate turns', async () => {
    const { run, chunks } = useWorker<ChunkModule>(() => createTestWorker(spacedHandler), {
      streaming: true,
    })
    let triggers = 0
    watch(chunks!, () => triggers++, { flush: 'sync' })

    await run(3)
    await nextTick()

    expect(chunks!.value).toEqual([0, 1, 2])
    expect(triggers).toBeGreaterThanOrEqual(3)
  })

  test('1000 synchronous chunks collapse into a few watcher runs, but all of them are collected', async () => {
    const { run, chunks } = useWorker<ChunkModule>(() => createTestWorker(burstHandler), {
      streaming: true,
    })
    let triggers = 0
    watch(
      chunks!,
      () => {
        if (chunks!.value.length > 0) triggers++
      },
      { flush: 'sync' },
    )

    await run(1000)
    await nextTick()

    expect(chunks!.value.length).toBe(1000)
    expect(triggers).toBeGreaterThan(0)
    expect(triggers).toBeLessThan(10)
  })

  test('the new array assignment at the start of a run still resets chunks', async () => {
    const { run, chunks } = useWorker<ChunkModule>(() => createTestWorker(burstHandler), {
      streaming: true,
    })
    await run(5)
    expect(chunks!.value.length).toBe(5)
    await run(2)
    expect(chunks!.value).toEqual([0, 1])
  })
})

describe('chunks reactivity — useSharedWorker', () => {
  test('1000 synchronous chunks collapse into a few watcher runs, but all of them are collected', async () => {
    const { run, chunks } = useSharedWorker<ChunkModule>(createTestSharedWorker(burstHandler), {
      streaming: true,
    })
    let triggers = 0
    watch(
      chunks!,
      () => {
        if (chunks!.value.length > 0) triggers++
      },
      { flush: 'sync' },
    )

    await run(1000)
    await nextTick()

    expect(chunks!.value.length).toBe(1000)
    expect(triggers).toBeGreaterThan(0)
    expect(triggers).toBeLessThan(10)
  })

  test('a watcher fires for chunks that arrive in separate turns', async () => {
    const { run, chunks } = useSharedWorker<ChunkModule>(createTestSharedWorker(spacedHandler), {
      streaming: true,
    })
    let triggers = 0
    watch(chunks!, () => triggers++, { flush: 'sync' })

    await run(3)
    await nextTick()

    expect(triggers).toBeGreaterThanOrEqual(3)
  })
})
