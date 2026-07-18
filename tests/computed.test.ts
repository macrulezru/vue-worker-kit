import { nextTick, ref } from 'vue'
import { describe, expect, test } from 'vitest'
import { useWorkerComputed } from '../src/adapters/computed'
import { createTestWorker, waitFor, type FixtureModule } from './helpers'

describe('useWorkerComputed', () => {
  // §9 case 10 (debounce half)
  test('rapid source changes within the debounce window trigger exactly one worker run', async () => {
    let callCount = 0
    const handler = async (input: number) => {
      callCount++
      return input * 2
    }
    const source = ref(1)
    const result = useWorkerComputed<FixtureModule<number, number>>(
      () => createTestWorker(handler),
      () => source.value,
      { debounce: 50 },
    )

    await nextTick()
    source.value = 2
    await nextTick()
    source.value = 3
    await nextTick()
    source.value = 4

    await waitFor(() => result.value === 8, 1000)
    expect(callCount).toBe(1)
  })

  // §9 case 10 (stale-result half)
  test('a newer run supersedes a slower, in-flight older one — final value is never stale', async () => {
    const handler = async (input: { value: number; delayMs: number }) => {
      await new Promise((resolve) => setTimeout(resolve, input.delayMs))
      return input.value * 2
    }
    const source = ref({ value: 1, delayMs: 150 })
    const result = useWorkerComputed<FixtureModule<{ value: number; delayMs: number }, number>>(
      () => createTestWorker(handler),
      () => source.value,
    )

    await waitFor(() => result.isRunning) // first (slow) run started
    source.value = { value: 2, delayMs: 5 } // supersedes before the first run resolves

    await waitFor(() => result.value === 4, 1000)

    // give the superseded, slower first run time to settle too
    await new Promise((resolve) => setTimeout(resolve, 250))
    expect(result.value).toBe(4)
    expect(result.error).toBeNull()
  })

  test('value stays undefined until the first result arrives', async () => {
    const handler = async (input: number) => {
      await new Promise((resolve) => setTimeout(resolve, 10))
      return input
    }
    const source = ref(1)
    const result = useWorkerComputed<FixtureModule<number, number>>(
      () => createTestWorker(handler),
      () => source.value,
    )
    expect(result.value).toBeUndefined()
    await waitFor(() => result.value === 1)
  })
})
