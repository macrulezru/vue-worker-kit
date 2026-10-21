import { watch } from 'vue'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { useWorker } from '../src/useWorker'
import { createTestWorker, type FixtureModule } from './helpers'
import type { WorkerContext } from '../src/worker/defineWorkerHandler'

type ChunkModule = FixtureModule<number, number>

const burstHandler = (count: number, ctx: WorkerContext): number => {
  for (let index = 0; index < count; index++) ctx.reportChunk(index)
  return count
}

let release: () => void = () => undefined

const heldBurstHandler = async (count: number, ctx: WorkerContext): Promise<number> => {
  for (let index = 0; index < count; index++) ctx.reportChunk(index)
  await new Promise<void>((resolve) => {
    release = resolve
  })
  return count
}

function stubDocument(visibilityState: 'visible' | 'hidden'): void {
  vi.stubGlobal('document', { visibilityState })
}

function countTriggers(chunks: { value: unknown[] }): { count(): number } {
  let triggers = 0
  watch(
    chunks as never,
    () => {
      if (chunks.value.length > 0) triggers++
    },
    { flush: 'sync' },
  )
  return { count: () => triggers }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('chunks flush in a hidden tab', () => {
  test('a hidden document never waits for requestAnimationFrame: one flush by timer, all 100 chunks', async () => {
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.push(callback)
      return frames.length
    })
    stubDocument('hidden')

    const { run, chunks } = useWorker<ChunkModule>(() => createTestWorker(heldBurstHandler), {
      streaming: true,
    })
    const triggers = countTriggers(chunks!)

    const pending = run(100)
    await new Promise((resolve) => setTimeout(resolve, 5))
    expect(chunks!.value.length).toBe(100)
    expect(triggers.count()).toBe(0)
    await new Promise((resolve) => setTimeout(resolve, 70))

    expect(frames.length).toBe(0)
    expect(triggers.count()).toBe(1)
    release()
    await pending
  })

  test('a hidden document without requestAnimationFrame behaves the same', async () => {
    vi.stubGlobal('requestAnimationFrame', undefined)
    stubDocument('hidden')

    const { run, chunks } = useWorker<ChunkModule>(() => createTestWorker(burstHandler), {
      streaming: true,
    })
    const triggers = countTriggers(chunks!)

    await run(100)

    expect(chunks!.value.length).toBe(100)
    expect(triggers.count()).toBeGreaterThanOrEqual(1)
    expect(triggers.count()).toBeLessThan(5)
  })

  test('a visible document still flushes on the next animation frame', async () => {
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.push(callback)
      return frames.length
    })
    stubDocument('visible')

    const { run, chunks } = useWorker<ChunkModule>(() => createTestWorker(heldBurstHandler), {
      streaming: true,
    })
    const triggers = countTriggers(chunks!)

    const pending = run(100)
    await new Promise((resolve) => setTimeout(resolve, 5))

    expect(frames.length).toBe(1)
    expect(triggers.count()).toBe(0)
    frames[0](0)
    expect(triggers.count()).toBe(1)
    expect(chunks!.value.length).toBe(100)
    release()
    await pending
  })
})
