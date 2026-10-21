import { nextTick, ref } from 'vue'
import { describe, expect, test } from 'vitest'
import { useWorkerComputed } from '../src/adapters/computed'
import {
  createControllableTestWorker,
  waitFor,
  type ControllableTestWorker,
  type FixtureModule,
} from './helpers'

type NumberModule = FixtureModule<number, number>

describe('useWorkerComputed options (J)', () => {
  test('worker options are forwarded: hardCancelOnAbort really interrupts the stale run', async () => {
    const controllers: ControllableTestWorker[] = []
    const handler = async (input: number): Promise<number> => {
      await new Promise((resolve) => setTimeout(resolve, input))
      return input
    }
    const source = ref(300)
    const result = useWorkerComputed<NumberModule>(
      () => {
        const controllable = createControllableTestWorker(handler)
        controllers.push(controllable)
        return controllable.worker
      },
      () => source.value,
      { worker: { hardCancelOnAbort: true } },
    )

    await waitFor(() => result.isRunning)
    source.value = 5
    await waitFor(() => result.value === 5, 1000)

    expect(controllers[0].terminated).toBe(true)
    expect(controllers.length).toBeGreaterThanOrEqual(2)
  })

  test("worker: { concurrency: 'latest' } works with the computed", async () => {
    const handler = async (input: number): Promise<number> => {
      await new Promise((resolve) => setTimeout(resolve, 20))
      return input * 2
    }
    const source = ref(1)
    const result = useWorkerComputed<NumberModule>(
      () => createControllableTestWorker(handler).worker,
      () => source.value,
      { worker: { concurrency: 'latest' } },
    )

    await nextTick()
    source.value = 2
    await nextTick()
    source.value = 3
    await waitFor(() => result.value === 6, 1000)
    expect(result.error).toBeNull()
  })

  test('immediate: false does not start the worker until the source changes', async () => {
    let created = 0
    const source = ref(1)
    const result = useWorkerComputed<NumberModule>(
      () => {
        created++
        return createControllableTestWorker((input: number) => input * 2).worker
      },
      () => source.value,
      { immediate: false },
    )

    await nextTick()
    expect(created).toBe(0)
    expect(result.value).toBeUndefined()

    source.value = 4
    await waitFor(() => result.value === 8, 1000)
    expect(created).toBe(1)
  })

  test('refresh() runs the worker again for the current source', async () => {
    let calls = 0
    const handler = (input: number): number => {
      calls++
      return input + calls
    }
    const source = ref(10)
    const result = useWorkerComputed<NumberModule>(
      () => createControllableTestWorker(handler).worker,
      () => source.value,
    )

    await waitFor(() => result.value === 11, 1000)
    result.refresh()
    await waitFor(() => result.value === 12, 1000)
    expect(calls).toBe(2)
  })

  test('refresh() works with immediate: false as the first trigger', async () => {
    const source = ref(3)
    const result = useWorkerComputed<NumberModule>(
      () => createControllableTestWorker((input: number) => input * 3).worker,
      () => source.value,
      { immediate: false },
    )
    result.refresh()
    await waitFor(() => result.value === 9, 1000)
  })
})
