import { effectScope } from 'vue'
import { describe, expect, test } from 'vitest'
import { useSharedWorker } from '../src/adapters/sharedWorker'
import { createTestSharedWorker, waitFor } from './helpers'
import { sortHandler } from './fixtures/sort.worker'
import { throwingHandler } from './fixtures/throwing.worker'

describe('useSharedWorker', () => {
  test('run() lazily connects and resolves with a correctly typed result', async () => {
    const factory = createTestSharedWorker(sortHandler)
    const { run } = useSharedWorker<typeof import('./fixtures/sort.worker')>(factory)
    const result = await run([3, 1, 2])
    expect(result).toEqual([1, 2, 3])
  })

  test('portCount reflects every tab connected to the same shared worker', async () => {
    const factory = createTestSharedWorker(sortHandler)
    const tabA = useSharedWorker<typeof import('./fixtures/sort.worker')>(factory)
    const tabB = useSharedWorker<typeof import('./fixtures/sort.worker')>(factory)

    tabA.connect()
    await waitFor(() => tabA.portCount.value === 1)

    tabB.connect()
    await waitFor(() => tabA.portCount.value === 2)
    expect(tabB.portCount.value).toBe(2)

    tabB.disconnect()
    await waitFor(() => tabA.portCount.value === 1)
    expect(tabB.portCount.value).toBe(0)
  })

  test('disconnect() does not terminate the worker for other still-connected tabs', async () => {
    const factory = createTestSharedWorker(sortHandler)
    const tabA = useSharedWorker<typeof import('./fixtures/sort.worker')>(factory)
    const tabB = useSharedWorker<typeof import('./fixtures/sort.worker')>(factory)
    tabA.connect()
    tabB.connect()
    await waitFor(() => tabA.portCount.value === 2)

    tabA.disconnect()
    // tabB's run() must still work — disconnecting one tab's port must never tear down
    // the shared worker itself, only that tab's own connection to it.
    const result = await tabB.run([2, 1])
    expect(result).toEqual([1, 2])
  })

  test('a rejected run surfaces a WorkerError and clears isRunning', async () => {
    const factory = createTestSharedWorker(throwingHandler)
    const { run, error, isRunning } = useSharedWorker<typeof import('./fixtures/throwing.worker')>(factory)

    await expect(run({ message: 'boom' })).rejects.toThrow('boom')
    expect(error.value?.message).toBe('boom')
    expect(isRunning.value).toBe(false)
  })

  test('disconnect() runs automatically on scope dispose', async () => {
    const factory = createTestSharedWorker(sortHandler)
    const scope = effectScope()
    const outer = useSharedWorker<typeof import('./fixtures/sort.worker')>(factory)
    outer.connect()
    await waitFor(() => outer.portCount.value === 1)

    let inner!: ReturnType<typeof useSharedWorker<typeof import('./fixtures/sort.worker')>>
    scope.run(() => {
      inner = useSharedWorker<typeof import('./fixtures/sort.worker')>(factory)
      inner.connect()
    })
    await waitFor(() => outer.portCount.value === 2)

    scope.stop()
    await waitFor(() => outer.portCount.value === 1)
  })
})
