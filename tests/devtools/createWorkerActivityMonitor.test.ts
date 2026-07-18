import { describe, expect, test } from 'vitest'
import { createWorkerPool } from '../../src/adapters/pool'
import { useWorker } from '../../src/useWorker'
import { createWorkerActivityMonitor } from '../../src/devtools/createWorkerActivityMonitor'
import { createTestWorker, type FixtureModule } from '../helpers'

describe('createWorkerActivityMonitor', () => {
  test('tracks pool busy/idle/queued plus average task time and recent errors', async () => {
    const handler = async (input: { fail?: boolean; delayMs: number }) => {
      await new Promise((resolve) => setTimeout(resolve, input.delayMs))
      if (input.fail) throw new Error('nope')
      return 1
    }
    const pool = createWorkerPool<FixtureModule<{ fail?: boolean; delayMs: number }, number>>(
      () => createTestWorker(handler),
      { size: 2 },
    )
    const monitor = createWorkerActivityMonitor(pool)

    await pool.run({ delayMs: 5 })
    expect(monitor.snapshot.value.averageTaskMs).not.toBeNull()
    expect(monitor.snapshot.value.recentErrors).toHaveLength(0)

    await expect(pool.run({ fail: true, delayMs: 1 })).rejects.toThrow()
    expect(monitor.snapshot.value.recentErrors).toHaveLength(1)
    expect(monitor.snapshot.value.recentErrors[0].message).toBe('nope')

    monitor.clearErrors()
    expect(monitor.snapshot.value.recentErrors).toHaveLength(0)

    monitor.dispose()
  })

  test('works against a single useWorker() instance (busy=1 while running)', async () => {
    let release: (() => void) | undefined
    const handler = () => new Promise<number>((resolve) => (release = () => resolve(1)))
    const worker = useWorker<FixtureModule<undefined, number>>(() => createTestWorker(handler))
    const monitor = createWorkerActivityMonitor(worker)

    expect(monitor.snapshot.value.busy).toBe(0)
    const promise = worker.run(undefined)
    await new Promise((resolve) => setTimeout(resolve, 5))
    expect(monitor.snapshot.value.busy).toBe(1)
    expect(monitor.snapshot.value.idle).toBe(0)

    release?.()
    await promise
    expect(monitor.snapshot.value.busy).toBe(0)
  })
})
