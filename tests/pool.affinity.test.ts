import { describe, expect, test } from 'vitest'
import { createWorkerPool } from '../src/adapters/pool'
import {
  createControllableTestWorker,
  waitFor,
  type ControllableTestWorker,
  type FixtureModule,
} from './helpers'

function createGate(): { promise: Promise<void>; open(): void } {
  let open!: () => void
  const promise = new Promise<void>((resolve) => {
    open = resolve
  })
  return { promise, open }
}

interface Input {
  hold?: number
  spin?: boolean
}

function createTaggedPool(options: {
  size: number
  affinityMode?: 'prefer' | 'strict'
  idleTimeout?: number
  hardCancelOnAbort?: boolean
}) {
  const controllers: ControllableTestWorker[] = []
  const gates = new Map<number, ReturnType<typeof createGate>>()
  const pool = createWorkerPool<FixtureModule<Input, number>>(() => {
    const workerId = controllers.length
    const handler = async (input: Input): Promise<number> => {
      if (input.hold !== undefined) await gates.get(input.hold)?.promise
      if (input.spin) await new Promise(() => undefined)
      return workerId
    }
    const controllable = createControllableTestWorker(handler)
    controllers.push(controllable)
    return controllable.worker
  }, options)
  return { pool, controllers, gates }
}

describe('pool affinity — documented rules', () => {
  test('the binding is not moved when a task is forced onto another slot', async () => {
    const { pool, gates } = createTaggedPool({ size: 2 })
    const gate = createGate()
    gates.set(1, gate)

    const owner = await pool.run({}, { affinity: 'a' })
    const holder = pool.run({ hold: 1 }, { affinity: 'a' })
    await waitFor(() => pool.stats.value.busy === 1)

    const forced = await pool.run({}, { affinity: 'a' })
    expect(forced).not.toBe(owner)

    gate.open()
    await holder

    expect(await pool.run({}, { affinity: 'a' })).toBe(owner)
    expect(await pool.run({}, { affinity: 'a' })).toBe(owner)
  })

  test('after idleTimeout removes the slot, the key binds to the slot that takes the next task', async () => {
    const { pool, controllers } = createTaggedPool({ size: 2, idleTimeout: 20 })

    const first = await pool.run({}, { affinity: 'a' })
    await waitFor(() => controllers[first].terminated, 1000)
    await waitFor(() => pool.stats.value.idle === 0, 1000)

    const second = await pool.run({}, { affinity: 'a' })
    const third = await pool.run({}, { affinity: 'a' })

    expect(second).not.toBe(first)
    expect(third).toBe(second)
  })

  test('after hardCancelOnAbort removes the slot, the key binds again to the next accepting slot', async () => {
    const { pool, controllers } = createTaggedPool({ size: 2, hardCancelOnAbort: true })
    const controller = new AbortController()

    const first = pool.run({ spin: true }, { affinity: 'a', signal: controller.signal })
    await waitFor(() => pool.stats.value.busy === 1)
    controller.abort()
    await expect(first).rejects.toMatchObject({ name: 'AbortError' })
    expect(controllers[0].terminated).toBe(true)

    const second = await pool.run({}, { affinity: 'a' })
    const third = await pool.run({}, { affinity: 'a' })

    expect(second).toBe(1)
    expect(third).toBe(second)
  })

  test('strict waits for its slot and never creates extra slots', async () => {
    const { pool, controllers, gates } = createTaggedPool({ size: 3, affinityMode: 'strict' })
    const gate = createGate()
    gates.set(1, gate)

    const owner = await pool.run({}, { affinity: 'a' })
    const holder = pool.run({ hold: 1 }, { affinity: 'a' })
    await waitFor(() => pool.stats.value.busy === 1)

    const waiting = [
      pool.run({}, { affinity: 'a' }),
      pool.run({}, { affinity: 'a' }),
      pool.run({}, { affinity: 'a' }),
    ]
    await new Promise((resolve) => setTimeout(resolve, 30))

    expect(controllers.length).toBe(1)
    expect(pool.stats.value.queued).toBe(3)

    gate.open()
    await holder
    expect(await Promise.all(waiting)).toEqual([owner, owner, owner])
    expect(controllers.length).toBe(1)
  })
})
