import { afterEach, describe, expect, test, vi } from 'vitest'
import { createWorkerPool } from '../src/adapters/pool'
import {
  createControllableTestWorker,
  createCrashingTestWorker,
  createTestWorker,
  nextTick,
  waitFor,
  type ControllableTestWorker,
  type FixtureModule,
} from './helpers'

interface Item {
  id: number
  delayMs?: number
}

type ItemModule = FixtureModule<Item, number>

const echo = async (input: Item): Promise<number> => {
  if (input.delayMs) await new Promise((resolve) => setTimeout(resolve, input.delayMs))
  return input.id
}

function createGate(): { promise: Promise<void>; open(): void } {
  let open!: () => void
  const promise = new Promise<void>((resolve) => {
    open = resolve
  })
  return { promise, open }
}

describe('pool — a crashed worker is replaced (B)', () => {
  test('a crash during a task rejects it, and the next tasks run normally', async () => {
    let created = 0
    const pool = createWorkerPool<ItemModule>(
      () => {
        created++
        return created === 1 ? createCrashingTestWorker('boom') : createTestWorker(echo)
      },
      { size: 1 },
    )

    await expect(pool.run({ id: 1 })).rejects.toMatchObject({ name: 'WorkerError' })

    const results = await Promise.all([2, 3, 4, 5, 6].map((id) => pool.run({ id })))
    expect(results).toEqual([2, 3, 4, 5, 6])
    expect(created).toBe(2)
    expect(pool.stats.value.busy).toBe(0)
    expect(pool.stats.value.idle).toBe(1)
  })

  test('a crash while idle removes the slot, and the next run creates a new one', async () => {
    const controllers: ControllableTestWorker[] = []
    const pool = createWorkerPool<ItemModule>(
      () => {
        const controllable = createControllableTestWorker(echo)
        controllers.push(controllable)
        return controllable.worker
      },
      { size: 2 },
    )

    await pool.run({ id: 1 })
    expect(pool.stats.value).toEqual({ busy: 0, idle: 1, queued: 0 })

    controllers[0].crash()
    expect(controllers[0].terminated).toBe(true)
    expect(pool.stats.value).toEqual({ busy: 0, idle: 0, queued: 0 })

    await expect(pool.run({ id: 2 })).resolves.toBe(2)
    expect(controllers).toHaveLength(2)
    expect(pool.stats.value).toEqual({ busy: 0, idle: 1, queued: 0 })
  })

  test('stats stay correct when one of two busy workers crashes', async () => {
    const controllers: ControllableTestWorker[] = []
    const pool = createWorkerPool<ItemModule>(
      () => {
        const controllable = createControllableTestWorker(echo)
        controllers.push(controllable)
        return controllable.worker
      },
      { size: 2 },
    )

    const first = pool.run({ id: 1, delayMs: 40 })
    const second = pool.run({ id: 2, delayMs: 40 })
    await waitFor(() => pool.stats.value.busy === 2)

    const firstSettled = first.catch((error: Error) => error)
    controllers[0].crash()
    expect(await firstSettled).toMatchObject({ name: 'WorkerError' })
    expect(pool.stats.value.busy).toBe(1)

    await expect(second).resolves.toBe(2)
    expect(pool.stats.value).toEqual({ busy: 0, idle: 1, queued: 0 })
  })

  test('queued tasks continue on a fresh slot after a crash', async () => {
    const controllers: ControllableTestWorker[] = []
    const gate = createGate()
    const slowThenEcho = async (input: Item): Promise<number> => {
      if (input.id === 1) await gate.promise
      return input.id
    }
    const pool = createWorkerPool<ItemModule>(
      () => {
        const controllable = createControllableTestWorker(slowThenEcho)
        controllers.push(controllable)
        return controllable.worker
      },
      { size: 1 },
    )

    const first = pool.run({ id: 1 }).catch((error: Error) => error)
    const queued = pool.run({ id: 2 })
    await waitFor(() => pool.stats.value.queued === 1)

    controllers[0].crash()
    expect(await first).toMatchObject({ name: 'WorkerError' })
    await expect(queued).resolves.toBe(2)
    expect(controllers).toHaveLength(2)
  })
})

describe('pool — cancelling queued tasks (C)', () => {
  test('aborting tasks that wait in the queue rejects them immediately without reaching a worker', async () => {
    const gate = createGate()
    let handled = 0
    const handler = async (input: Item): Promise<number> => {
      handled++
      if (input.id === 0) await gate.promise
      return input.id
    }
    const pool = createWorkerPool<ItemModule>(() => createTestWorker(handler), { size: 1 })

    const running = pool.run({ id: 0 })
    await waitFor(() => pool.stats.value.busy === 1)

    const controller = new AbortController()
    const queued = Array.from({ length: 5 }, (_, index) =>
      pool.run({ id: index + 1 }, { signal: controller.signal }).catch((error: Error) => error),
    )
    expect(pool.stats.value.queued).toBe(5)

    controller.abort()
    const outcomes = await Promise.all(queued)

    expect(outcomes.every((outcome) => (outcome as Error).name === 'AbortError')).toBe(true)
    expect(pool.stats.value.queued).toBe(0)
    gate.open()
    await running
    expect(handled).toBe(1)
  })

  test('a signal that is already aborted rejects without queueing', async () => {
    const pool = createWorkerPool<ItemModule>(() => createTestWorker(echo), { size: 1 })
    const controller = new AbortController()
    controller.abort()
    await expect(pool.run({ id: 1 }, { signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    })
    expect(pool.stats.value).toEqual({ busy: 0, idle: 0, queued: 0 })
  })

  test('hardCancelOnAbort terminates only the aborted slot, and later tasks get a new one', async () => {
    const controllers: ControllableTestWorker[] = []
    const pool = createWorkerPool<ItemModule>(
      () => {
        const controllable = createControllableTestWorker(echo)
        controllers.push(controllable)
        return controllable.worker
      },
      { size: 2, hardCancelOnAbort: true },
    )

    const controller = new AbortController()
    const aborted = pool.run({ id: 1, delayMs: 200 }, { signal: controller.signal })
    const survivor = pool.run({ id: 2, delayMs: 30 })
    await waitFor(() => pool.stats.value.busy === 2)

    controller.abort()
    await expect(aborted).rejects.toMatchObject({ name: 'AbortError' })
    expect(controllers[0].terminated).toBe(true)
    expect(controllers[1].terminated).toBe(false)
    expect(pool.stats.value.busy).toBe(1)

    await expect(survivor).resolves.toBe(2)
    await expect(pool.run({ id: 3 })).resolves.toBe(3)
    expect(controllers.length).toBeGreaterThanOrEqual(2)
    expect(pool.stats.value.busy).toBe(0)
  })

  test('without the flag a slot is released only after the handler finishes', async () => {
    const controllers: ControllableTestWorker[] = []
    const pool = createWorkerPool<ItemModule>(
      () => {
        const controllable = createControllableTestWorker(echo)
        controllers.push(controllable)
        return controllable.worker
      },
      { size: 1 },
    )

    const controller = new AbortController()
    const aborted = pool.run({ id: 1, delayMs: 60 }, { signal: controller.signal })
    await waitFor(() => pool.stats.value.busy === 1)

    controller.abort()
    await expect(aborted).rejects.toMatchObject({ name: 'AbortError' })
    expect(controllers[0].terminated).toBe(false)
    expect(pool.stats.value.busy).toBe(1)

    await waitFor(() => pool.stats.value.busy === 0)
    expect(controllers).toHaveLength(1)
  })

  test('the call-level hardCancelOnAbort overrides the pool default', async () => {
    const controllers: ControllableTestWorker[] = []
    const pool = createWorkerPool<ItemModule>(
      () => {
        const controllable = createControllableTestWorker(echo)
        controllers.push(controllable)
        return controllable.worker
      },
      { size: 1, hardCancelOnAbort: false },
    )

    const controller = new AbortController()
    const aborted = pool.run(
      { id: 1, delayMs: 200 },
      { signal: controller.signal, hardCancelOnAbort: true },
    )
    await waitFor(() => pool.stats.value.busy === 1)
    controller.abort()
    await expect(aborted).rejects.toMatchObject({ name: 'AbortError' })
    expect(controllers[0].terminated).toBe(true)
  })

  test('map() with a shared signal and hardCancelOnAbort terminates every busy slot at once', async () => {
    const controllers: ControllableTestWorker[] = []
    const pool = createWorkerPool<ItemModule>(
      () => {
        const controllable = createControllableTestWorker(echo)
        controllers.push(controllable)
        return controllable.worker
      },
      { size: 4 },
    )

    const controller = new AbortController()
    const items = Array.from({ length: 200 }, (_, index) => ({ id: index, delayMs: 100 }))
    const mapped = pool.map(items, { signal: controller.signal, hardCancelOnAbort: true })
    const settled = mapped.catch((error: Error) => error)
    await waitFor(() => pool.stats.value.busy === 4)

    const startedAt = Date.now()
    controller.abort()
    expect(await settled).toMatchObject({ name: 'AbortError' })
    await nextTick()

    expect(Date.now() - startedAt).toBeLessThan(100)
    expect(controllers.filter((controllable) => controllable.terminated)).toHaveLength(4)
    expect(pool.stats.value).toEqual({ busy: 0, idle: 0, queued: 0 })
  })
})

describe('pool — idle slots (K)', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  test('an idle slot is terminated after idleTimeout and recreated on the next task', async () => {
    vi.useFakeTimers()
    const controllers: ControllableTestWorker[] = []
    const pool = createWorkerPool<ItemModule>(
      () => {
        const controllable = createControllableTestWorker(echo)
        controllers.push(controllable)
        return controllable.worker
      },
      { size: 2, idleTimeout: 100 },
    )

    await pool.run({ id: 1 })
    expect(pool.stats.value.idle).toBe(1)

    vi.advanceTimersByTime(99)
    expect(controllers[0].terminated).toBe(false)
    vi.advanceTimersByTime(2)
    expect(controllers[0].terminated).toBe(true)
    expect(pool.stats.value).toEqual({ busy: 0, idle: 0, queued: 0 })

    await expect(pool.run({ id: 2 })).resolves.toBe(2)
    expect(controllers).toHaveLength(2)
  })

  test('a busy slot is not terminated by the idle timer', async () => {
    vi.useFakeTimers()
    const gate = createGate()
    const controllers: ControllableTestWorker[] = []
    const gated = async (input: Item): Promise<number> => {
      await gate.promise
      return input.id
    }
    const pool = createWorkerPool<ItemModule>(
      () => {
        const controllable = createControllableTestWorker(gated)
        controllers.push(controllable)
        return controllable.worker
      },
      { size: 1, idleTimeout: 50 },
    )

    const running = pool.run({ id: 1 })
    await Promise.resolve()
    vi.advanceTimersByTime(500)
    expect(controllers[0].terminated).toBe(false)

    gate.open()
    await expect(running).resolves.toBe(1)
    vi.advanceTimersByTime(60)
    expect(controllers[0].terminated).toBe(true)
  })

  test('workers created by warmup() also go to sleep', async () => {
    vi.useFakeTimers()
    const controllers: ControllableTestWorker[] = []
    const pool = createWorkerPool<ItemModule>(
      () => {
        const controllable = createControllableTestWorker(echo)
        controllers.push(controllable)
        return controllable.worker
      },
      { size: 3, idleTimeout: 80 },
    )

    await pool.warmup()
    expect(pool.stats.value.idle).toBe(3)
    vi.advanceTimersByTime(81)
    expect(controllers.every((controllable) => controllable.terminated)).toBe(true)
    expect(pool.stats.value.idle).toBe(0)
  })

  test('terminate() clears the pending idle timers', async () => {
    vi.useFakeTimers()
    const controllers: ControllableTestWorker[] = []
    const pool = createWorkerPool<ItemModule>(
      () => {
        const controllable = createControllableTestWorker(echo)
        controllers.push(controllable)
        return controllable.worker
      },
      { size: 1, idleTimeout: 50 },
    )
    await pool.run({ id: 1 })
    pool.terminate()
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('pool — affinity (L)', () => {
  function createTaggedPool(options: { size: number; affinityMode?: 'prefer' | 'strict' }) {
    const controllers: ControllableTestWorker[] = []
    const gates = new Map<number, ReturnType<typeof createGate>>()
    const pool = createWorkerPool<FixtureModule<{ hold?: number }, number>>(() => {
      const workerId = controllers.length
      const handler = async (input: { hold?: number }): Promise<number> => {
        if (input.hold !== undefined) await gates.get(input.hold)?.promise
        return workerId
      }
      const controllable = createControllableTestWorker(handler)
      controllers.push(controllable)
      return controllable.worker
    }, options)
    return { pool, controllers, gates }
  }

  test('tasks with the same key keep landing on the same slot', async () => {
    const { pool } = createTaggedPool({ size: 3 })

    const a1 = await pool.run({}, { affinity: 'a' })
    const b1 = await pool.run({}, { affinity: 'b' })
    const a2 = await pool.run({}, { affinity: 'a' })
    const b2 = await pool.run({}, { affinity: 'b' })

    expect(a2).toBe(a1)
    expect(b2).toBe(b1)
  })

  test("'prefer' does not block when the preferred slot is busy", async () => {
    const { pool, gates } = createTaggedPool({ size: 2 })
    const gate = createGate()
    gates.set(1, gate)

    const owner = await pool.run({}, { affinity: 'a' })
    const holder = pool.run({ hold: 1 }, { affinity: 'a' })
    await waitFor(() => pool.stats.value.busy === 1)

    const other = await pool.run({}, { affinity: 'a' })
    expect(other).not.toBe(owner)

    gate.open()
    await holder
  })

  test("'strict' waits for the preferred slot to become free", async () => {
    const { pool, gates } = createTaggedPool({ size: 2, affinityMode: 'strict' })
    const gate = createGate()
    gates.set(1, gate)

    const owner = await pool.run({}, { affinity: 'a' })
    const holder = pool.run({ hold: 1 }, { affinity: 'a' })
    await waitFor(() => pool.stats.value.busy === 1)

    let settled = false
    const next = pool.run({}, { affinity: 'a' }).then((value) => {
      settled = true
      return value
    })
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(settled).toBe(false)
    expect(pool.stats.value.queued).toBe(1)

    const unrelated = await pool.run({}, { affinity: 'z' })
    expect(unrelated).not.toBe(owner)

    gate.open()
    await holder
    expect(await next).toBe(owner)
  })

  test('the key follows a recreated slot after a crash', async () => {
    const { pool, controllers } = createTaggedPool({ size: 2 })

    const first = await pool.run({}, { affinity: 'a' })
    controllers[first].crash()

    const second = await pool.run({}, { affinity: 'a' })
    const third = await pool.run({}, { affinity: 'a' })
    expect(controllers.length).toBe(2)
    expect(second).not.toBe(first)
    expect(third).toBe(second)
  })
})
