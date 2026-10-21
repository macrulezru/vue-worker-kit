import { describe, expect, test } from 'vitest'
import { useWorker } from '../src/useWorker'
import { useSharedWorker } from '../src/adapters/sharedWorker'
import { WORKER_SUPERSEDED, isSupersededError } from '../src/errors'
import {
  createControllableTestWorker,
  createTestSharedWorker,
  createTestWorker,
  waitFor,
  type ControllableTestWorker,
  type FixtureModule,
} from './helpers'

interface Job {
  id: number
  delayMs: number
}

type JobModule = FixtureModule<Job, number>

const delayed = async (input: Job): Promise<number> => {
  await new Promise((resolve) => setTimeout(resolve, input.delayMs))
  return input.id
}

describe("concurrency: 'latest' (F)", () => {
  test('only the last of several quick runs completes; the older ones are superseded', async () => {
    const { run, error } = useWorker<JobModule>(() => createTestWorker(delayed), {
      concurrency: 'latest',
    })

    const first = run({ id: 1, delayMs: 30 }).catch((caught: Error) => caught)
    const second = run({ id: 2, delayMs: 30 }).catch((caught: Error) => caught)
    const third = run({ id: 3, delayMs: 30 })

    const [firstOutcome, secondOutcome, thirdOutcome] = await Promise.all([first, second, third])

    expect(isSupersededError(firstOutcome)).toBe(true)
    expect(isSupersededError(secondOutcome)).toBe(true)
    expect((firstOutcome as Error & { reason?: unknown }).reason).toBe(WORKER_SUPERSEDED)
    expect((firstOutcome as Error).name).toBe('AbortError')
    expect(thirdOutcome).toBe(3)
    expect(error.value).toBeNull()
  })

  test('a run with its own signal is superseded as well, and the caller signal is left alone', async () => {
    const { run } = useWorker<JobModule>(() => createTestWorker(delayed), { concurrency: 'latest' })
    const controller = new AbortController()

    const first = run({ id: 1, delayMs: 30 }, { signal: controller.signal }).catch(
      (caught: Error) => caught,
    )
    const second = run({ id: 2, delayMs: 5 })

    expect(isSupersededError(await first)).toBe(true)
    expect(controller.signal.aborted).toBe(false)
    expect(await second).toBe(2)
  })

  test('with hardCancelOnAbort the worker is terminated and recreated for every superseding run', async () => {
    const controllers: ControllableTestWorker[] = []
    const { run } = useWorker<JobModule>(
      () => {
        const controllable = createControllableTestWorker(delayed)
        controllers.push(controllable)
        return controllable.worker
      },
      { concurrency: 'latest', hardCancelOnAbort: true },
    )

    const first = run({ id: 1, delayMs: 100 }).catch((caught: Error) => caught)
    const second = run({ id: 2, delayMs: 100 }).catch((caught: Error) => caught)
    const third = run({ id: 3, delayMs: 5 })

    expect(await third).toBe(3)
    expect(isSupersededError(await first)).toBe(true)
    expect(isSupersededError(await second)).toBe(true)
    expect(controllers).toHaveLength(3)
    expect(controllers.filter((controllable) => controllable.terminated)).toHaveLength(2)
  })

  test('only the latest run updates progress and chunks', async () => {
    const handler = async (input: Job, ctx: { reportProgress(v: number): void }) => {
      ctx.reportProgress(input.id / 10)
      await new Promise((resolve) => setTimeout(resolve, input.delayMs))
      return input.id
    }
    const { run, progress } = useWorker<JobModule>(() => createTestWorker(handler as never), {
      concurrency: 'latest',
    })

    const first = run({ id: 1, delayMs: 40 }).catch(() => undefined)
    const second = run({ id: 7, delayMs: 5 })
    await Promise.all([first, second])

    expect(progress.value).toBe(1)
  })

  test('isRunning is true while a superseded run is still settling and false at the end', async () => {
    const { run, isRunning } = useWorker<JobModule>(() => createTestWorker(delayed), {
      concurrency: 'latest',
    })
    const first = run({ id: 1, delayMs: 20 }).catch(() => undefined)
    expect(isRunning.value).toBe(true)
    const second = run({ id: 2, delayMs: 20 })
    await Promise.all([first, second])
    expect(isRunning.value).toBe(false)
  })

  test('works for useSharedWorker too', async () => {
    const { run } = useSharedWorker<JobModule>(createTestSharedWorker(delayed), {
      concurrency: 'latest',
    })
    const first = run({ id: 1, delayMs: 30 }).catch((caught: Error) => caught)
    const second = run({ id: 2, delayMs: 5 })
    expect(isSupersededError(await first)).toBe(true)
    expect(await second).toBe(2)
  })
})

describe("concurrency: 'serial' (F)", () => {
  function createRecordingWorker() {
    const log: string[] = []
    let active = 0
    let maxActive = 0
    const handler = async (input: Job): Promise<number> => {
      active++
      maxActive = Math.max(maxActive, active)
      log.push(`start ${input.id}`)
      await new Promise((resolve) => setTimeout(resolve, input.delayMs))
      log.push(`end ${input.id}`)
      active--
      return input.id
    }
    return { handler, log, maxActive: () => maxActive }
  }

  test('runs go one by one in the order of the calls', async () => {
    const recording = createRecordingWorker()
    const { run } = useWorker<JobModule>(() => createTestWorker(recording.handler), {
      concurrency: 'serial',
    })

    const results = await Promise.all([
      run({ id: 1, delayMs: 30 }),
      run({ id: 2, delayMs: 5 }),
      run({ id: 3, delayMs: 5 }),
    ])

    expect(results).toEqual([1, 2, 3])
    expect(recording.log).toEqual(['start 1', 'end 1', 'start 2', 'end 2', 'start 3', 'end 3'])
    expect(recording.maxActive()).toBe(1)
  })

  test('the next run starts after a failure of the previous one', async () => {
    const handler = async (input: Job): Promise<number> => {
      if (input.id === 1) throw new Error('first fails')
      return input.id
    }
    const { run } = useWorker<JobModule>(() => createTestWorker(handler), { concurrency: 'serial' })
    const first = run({ id: 1, delayMs: 0 }).catch((caught: Error) => caught)
    const second = run({ id: 2, delayMs: 0 })
    expect(((await first) as Error).message).toBe('first fails')
    expect(await second).toBe(2)
  })

  test('cancel() stops the current run and empties the waiting queue', async () => {
    const recording = createRecordingWorker()
    const { run, cancel, isRunning } = useWorker<JobModule>(
      () => createTestWorker(recording.handler),
      { concurrency: 'serial' },
    )

    const outcomes = [
      run({ id: 1, delayMs: 50 }).catch((caught: Error) => caught),
      run({ id: 2, delayMs: 5 }).catch((caught: Error) => caught),
      run({ id: 3, delayMs: 5 }).catch((caught: Error) => caught),
    ]
    await waitFor(() => recording.log.includes('start 1'))
    expect(isRunning.value).toBe(true)

    cancel()
    const settled = await Promise.all(outcomes)

    expect(settled.every((outcome) => (outcome as Error).name === 'AbortError')).toBe(true)
    await waitFor(() => recording.log.includes('end 1'))
    expect(recording.log).not.toContain('start 2')
    expect(recording.log).not.toContain('start 3')
    expect(isRunning.value).toBe(false)
  })

  test('isRunning covers waiting runs and progress follows the run that was sent last', async () => {
    const handler = async (input: Job, ctx: { reportProgress(v: number): void }) => {
      ctx.reportProgress(input.id / 10)
      await new Promise((resolve) => setTimeout(resolve, input.delayMs))
      return input.id
    }
    const { run, isRunning, progress } = useWorker<JobModule>(
      () => createTestWorker(handler as never),
      { concurrency: 'serial' },
    )
    const first = run({ id: 1, delayMs: 15 })
    const second = run({ id: 2, delayMs: 15 })
    expect(isRunning.value).toBe(true)
    await first
    expect(isRunning.value).toBe(true)
    await second
    expect(isRunning.value).toBe(false)
    expect(progress.value).toBe(1)
  })

  test('works for useSharedWorker too', async () => {
    const recording = createRecordingWorker()
    const { run } = useSharedWorker<JobModule>(createTestSharedWorker(recording.handler), {
      concurrency: 'serial',
    })
    await Promise.all([run({ id: 1, delayMs: 20 }), run({ id: 2, delayMs: 5 })])
    expect(recording.log).toEqual(['start 1', 'end 1', 'start 2', 'end 2'])
  })
})

describe("concurrency: default 'parallel'", () => {
  test('keeps running everything at once', async () => {
    let active = 0
    let maxActive = 0
    const handler = async (input: Job): Promise<number> => {
      active++
      maxActive = Math.max(maxActive, active)
      await new Promise((resolve) => setTimeout(resolve, input.delayMs))
      active--
      return input.id
    }
    const { run } = useWorker<JobModule>(() => createTestWorker(handler))
    await Promise.all([run({ id: 1, delayMs: 20 }), run({ id: 2, delayMs: 20 })])
    expect(maxActive).toBe(2)
  })
})
