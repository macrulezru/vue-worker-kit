import { describe, expect, test } from 'vitest'
import { useWorker } from '../src/useWorker'
import { createTestWorker, nextTick, waitFor, type FixtureModule } from './helpers'
import type { WorkerContext } from '../src/worker/defineWorkerHandler'

type LoopModule = FixtureModule<number, number>

describe('cooperative cancellation (D)', () => {
  test('a loop that awaits ctx.yield() stops soon after cancel', async () => {
    const state = { iterations: 0, finished: false, stopReason: '' }
    const handler = async (total: number, ctx: WorkerContext): Promise<number> => {
      try {
        for (let index = 0; index < total; index++) {
          state.iterations++
          if (index % 1000 === 0) await ctx.yield()
        }
        return state.iterations
      } catch (error) {
        state.stopReason = (error as Error).name
        throw error
      } finally {
        state.finished = true
      }
    }
    const { run } = useWorker<LoopModule>(() => createTestWorker(handler))

    const controller = new AbortController()
    const promise = run(5_000_000, { signal: controller.signal })
    await waitFor(() => state.iterations > 1000)
    controller.abort()

    await expect(promise).rejects.toMatchObject({ name: 'AbortError' })
    await waitFor(() => state.finished, 2000)
    expect(state.stopReason).toBe('AbortError')
    expect(state.iterations).toBeLessThan(5_000_000)
  })

  test('without yield a synchronous loop never observes the cancellation', async () => {
    const state = { sawAbort: false, iterations: 0 }
    const handler = (total: number, ctx: WorkerContext): number => {
      for (let index = 0; index < total; index++) {
        state.iterations++
        if (ctx.signal.aborted) state.sawAbort = true
      }
      return state.iterations
    }
    const { run } = useWorker<LoopModule>(() => createTestWorker(handler))

    const controller = new AbortController()
    setTimeout(() => controller.abort(), 0)
    const result = await run(3_000_000, { signal: controller.signal })

    expect(result).toBe(3_000_000)
    expect(state.sawAbort).toBe(false)
  })

  test('throwIfAborted throws an AbortError once the signal is aborted', async () => {
    const state: { before?: unknown; after?: Error } = {}
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const handler = async (_input: number, ctx: WorkerContext): Promise<number> => {
      try {
        ctx.throwIfAborted()
        state.before = 'passed'
      } catch (error) {
        state.before = error
      }
      await gate
      try {
        ctx.throwIfAborted()
      } catch (error) {
        state.after = error as Error
      }
      return 1
    }
    const { run } = useWorker<LoopModule>(() => createTestWorker(handler))

    const controller = new AbortController()
    const promise = run(0, { signal: controller.signal }).catch((error: Error) => error)
    await nextTick()
    controller.abort()
    await nextTick()
    release()
    await promise
    await waitFor(() => state.after !== undefined)

    expect(state.before).toBe('passed')
    expect(state.after?.name).toBe('AbortError')
  })

  test('ctx.yield() resolves normally when nothing was cancelled', async () => {
    const handler = async (_input: number, ctx: WorkerContext): Promise<number> => {
      for (let index = 0; index < 5; index++) await ctx.yield()
      return 7
    }
    const { run } = useWorker<LoopModule>(() => createTestWorker(handler))
    await expect(run(0)).resolves.toBe(7)
  })
})
