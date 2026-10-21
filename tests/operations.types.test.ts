import { describe, expect, expectTypeOf, test } from 'vitest'
import { useWorker } from '../src/useWorker'
import { useSharedWorker } from '../src/adapters/sharedWorker'
import { createWorkerPool } from '../src/adapters/pool'
import type {
  WorkerModuleOperations,
  WorkerOperationInput,
  WorkerOperationName,
  WorkerOperationOutput,
} from '../src/types'
import {
  createTestSharedWorker,
  createTestWorker,
  type FixtureModule,
  type OperationsFixtureModule,
} from './helpers'

const operations = {
  parse(input: { text: string }) {
    return { length: input.text.length, ok: true }
  },
  async format(input: { value: number }) {
    return `v=${input.value}`
  },
}

type OperationsModule = OperationsFixtureModule<typeof operations>
type SingleModule = FixtureModule<number[], number[]>

function typesOnly(): void {
  const worker = useWorker<OperationsModule>(() => createTestWorker(operations))

  expectTypeOf(worker.call('parse', { text: 'a' })).resolves.toEqualTypeOf<{
    length: number
    ok: boolean
  }>()
  expectTypeOf(worker.call('format', { value: 1 })).resolves.toEqualTypeOf<string>()

  // @ts-expect-error an operation that does not exist
  worker.call('missing', {})
  // @ts-expect-error input of the wrong type
  worker.call('parse', { text: 1 })
  // @ts-expect-error input of another operation
  worker.call('format', { text: 'a' })
  // @ts-expect-error run() is not part of the type of an operations module
  void worker.run

  const pool = createWorkerPool<OperationsModule>(() => createTestWorker(operations))
  expectTypeOf(pool.call('format', { value: 1 })).resolves.toEqualTypeOf<string>()
  // @ts-expect-error unknown operation on a pool
  pool.call('missing', {})

  const shared = useSharedWorker<OperationsModule>(createTestSharedWorker(operations))
  expectTypeOf(shared.call('parse', { text: 'a' })).resolves.toEqualTypeOf<{
    length: number
    ok: boolean
  }>()
  // @ts-expect-error wrong input type on a shared worker
  shared.call('parse', { text: 1 })

  const single = useWorker<SingleModule>(() => createTestWorker((input: number[]) => input))
  expectTypeOf(single.run([1])).resolves.toEqualTypeOf<number[]>()
  // @ts-expect-error call() exists only for operations modules
  void single.call
}

describe('operation types (G)', () => {
  test('the helper types read operations off the module', () => {
    expectTypeOf<WorkerOperationName<OperationsModule>>().toEqualTypeOf<'parse' | 'format'>()
    expectTypeOf<WorkerOperationInput<OperationsModule, 'parse'>>().toEqualTypeOf<{
      text: string
    }>()
    expectTypeOf<WorkerOperationOutput<OperationsModule, 'format'>>().toEqualTypeOf<string>()
    expectTypeOf<WorkerModuleOperations<SingleModule>>().toEqualTypeOf<never>()
  })

  test('the compile-time scenarios are type-checked (see typesOnly)', () => {
    expect(typeof typesOnly).toBe('function')
  })
})
