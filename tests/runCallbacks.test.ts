import { describe, expect, test, vi } from 'vitest'
import { useWorker } from '../src/useWorker'
import { useSharedWorker } from '../src/adapters/sharedWorker'
import { createTestSharedWorker, createTestWorker, type FixtureModule } from './helpers'
import type { WorkerContext } from '../src/worker/defineWorkerHandler'

type TaggedModule = FixtureModule<string, string>

const taggedHandler = async (tag: string, ctx: WorkerContext): Promise<string> => {
  ctx.reportProgress(tag === 'A' ? 0.25 : 0.75)
  ctx.reportChunk(`chunk-${tag}`)
  await new Promise((resolve) => setTimeout(resolve, 20))
  return tag
}

describe('per-run onProgress / onChunk (E) — useWorker', () => {
  test('two parallel runs receive their own progress and chunks', async () => {
    const { run } = useWorker<TaggedModule>(() => createTestWorker(taggedHandler))
    const progressA: number[] = []
    const progressB: number[] = []
    const chunksA: unknown[] = []
    const chunksB: unknown[] = []

    await Promise.all([
      run('A', {
        onProgress: (value) => progressA.push(value),
        onChunk: (chunk) => chunksA.push(chunk),
      }),
      run('B', {
        onProgress: (value) => progressB.push(value),
        onChunk: (chunk) => chunksB.push(chunk),
      }),
    ])

    expect(progressA).toContain(0.25)
    expect(progressA).not.toContain(0.75)
    expect(progressB).toContain(0.75)
    expect(progressB).not.toContain(0.25)
    expect(chunksA).toEqual(['chunk-A'])
    expect(chunksB).toEqual(['chunk-B'])
  })

  test('onChunk without streaming gives no warning and fills no chunks ref', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const composable = useWorker<TaggedModule>(() => createTestWorker(taggedHandler))
    const received: unknown[] = []

    await composable.run('A', { onChunk: (chunk) => received.push(chunk) })

    expect(received).toEqual(['chunk-A'])
    expect(warnSpy).not.toHaveBeenCalled()
    expect(composable.chunks).toBeUndefined()
    warnSpy.mockRestore()
  })

  test('with streaming enabled both the chunks ref and onChunk are fed', async () => {
    const composable = useWorker<TaggedModule>(() => createTestWorker(taggedHandler), {
      streaming: true,
    })
    const received: unknown[] = []

    await composable.run('B', { onChunk: (chunk) => received.push(chunk) })

    expect(received).toEqual(['chunk-B'])
    expect(composable.chunks?.value).toEqual(['chunk-B'])
  })

  test('the shared progress ref keeps working next to onProgress', async () => {
    const composable = useWorker<TaggedModule>(() => createTestWorker(taggedHandler))
    const seen: number[] = []
    await composable.run('A', { onProgress: (value) => seen.push(value) })
    expect(composable.progress.value).toBe(1)
    expect(seen[seen.length - 1]).toBe(1)
  })
})

describe('per-run onProgress / onChunk (E) — useSharedWorker', () => {
  test('parallel runs receive their own values', async () => {
    const { run } = useSharedWorker<TaggedModule>(createTestSharedWorker(taggedHandler))
    const progressA: number[] = []
    const progressB: number[] = []

    await Promise.all([
      run('A', { onProgress: (value) => progressA.push(value) }),
      run('B', { onProgress: (value) => progressB.push(value) }),
    ])

    expect(progressA).toContain(0.25)
    expect(progressA).not.toContain(0.75)
    expect(progressB).toContain(0.75)
  })

  test('onChunk without streaming gives no warning', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { run } = useSharedWorker<TaggedModule>(createTestSharedWorker(taggedHandler))
    const received: unknown[] = []
    await run('A', { onChunk: (chunk) => received.push(chunk) })
    expect(received).toEqual(['chunk-A'])
    expect(warnSpy).not.toHaveBeenCalled()
    warnSpy.mockRestore()
  })
})
