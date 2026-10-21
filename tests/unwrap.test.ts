import { reactive } from 'vue'
import { describe, expect, test } from 'vitest'
import { useWorker } from '../src/useWorker'
import { createWorkerPool } from '../src/adapters/pool'
import { findReactivePath, unwrapInput } from '../src/internal/unwrap'
import { createTestWorker, type FixtureModule } from './helpers'

interface Payload {
  items: { id: number; meta?: { tag: string } }[]
}

type PayloadModule = FixtureModule<Payload, number>

const countItems = (input: Payload): number => input.items.length

function nestedReactivePayload(): Payload {
  return { items: [{ id: 1 }, { id: 2 }, { id: 3, meta: reactive({ tag: 'x' }) }] }
}

describe('deep unwrapping (I)', () => {
  test('a nested reactive proxy fails with a hint that names the path', async () => {
    const { run } = useWorker<PayloadModule>(() => createTestWorker(countItems))

    const rejection = await run(nestedReactivePayload()).catch((caught: Error) => caught)

    expect(rejection).toMatchObject({ name: 'DataCloneError' })
    expect((rejection as Error).message).toContain('input.items[2].meta')
    expect((rejection as Error).message).toContain("unwrap: 'deep'")
  })

  test("unwrap: 'deep' lets the same input through", async () => {
    const { run } = useWorker<PayloadModule>(() => createTestWorker(countItems), {
      unwrap: 'deep',
    })
    await expect(run(nestedReactivePayload())).resolves.toBe(3)
  })

  test('a per-run unwrap overrides the instance default', async () => {
    const { run } = useWorker<PayloadModule>(() => createTestWorker(countItems))
    await expect(run(nestedReactivePayload(), { unwrap: 'deep' })).resolves.toBe(3)
  })

  test('the pool takes the option too', async () => {
    const pool = createWorkerPool<PayloadModule>(() => createTestWorker(countItems), {
      size: 1,
      unwrap: 'deep',
    })
    await expect(pool.run(nestedReactivePayload())).resolves.toBe(3)
  })

  test('a reactive input at the top level is still handled in the default shallow mode', async () => {
    const { run } = useWorker<PayloadModule>(() => createTestWorker(countItems))
    await expect(run(reactive({ items: [{ id: 1 }] }) as Payload)).resolves.toBe(1)
  })

  test('a cyclic structure does not hang the hint search', () => {
    const cyclic: Record<string, unknown> = { reactive: reactive({ x: 1 }) }
    cyclic.self = cyclic
    expect(findReactivePath(cyclic)).toBe('input.reactive')

    const clean: Record<string, unknown> = { a: { b: [1, 2] } }
    ;(clean.a as Record<string, unknown>).back = clean
    expect(findReactivePath(clean)).toBeUndefined()
  })

  test('deep unwrapping keeps cycles and copies plain structures', () => {
    const source: Record<string, unknown> = { list: [reactive({ n: 1 })], flag: true }
    source.self = source

    const copy = unwrapInput(source, 'deep') as Record<string, unknown>

    expect(copy).not.toBe(source)
    expect(copy.self).toBe(copy)
    expect(copy.list).toEqual([{ n: 1 }])
    expect(() => structuredClone(copy)).not.toThrow()
  })

  test('non-plain values such as Date and typed arrays are left as they are', () => {
    const when = new Date(0)
    const bytes = new Uint8Array([1, 2])
    const copy = unwrapInput({ when, bytes }, 'deep') as { when: Date; bytes: Uint8Array }
    expect(copy.when).toBe(when)
    expect(copy.bytes).toBe(bytes)
  })
})
