import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { useWorker } from '../src/useWorker'
import { createWorkerPool } from '../src/adapters/pool'
import { isSupersededError } from '../src/errors'
import { ThreadWorker } from './realThreads/ThreadWorker'
import type { OperationsFixtureModule } from './helpers'
import { waitFor } from './helpers'

const here = fileURLToPath(new URL('.', import.meta.url))

interface Spec {
  id: number
  ms: number
}

const _operations = {
  echo(input: { id: number }): number {
    return input.id
  },
  busy(input: Spec): number {
    return input.id
  },
  busyYield(input: Spec): number {
    return input.id
  },
}

type ThreadModule = OperationsFixtureModule<typeof _operations>

let outDir = ''
let workerFile = ''
const created: ThreadWorker[] = []

function factory(): Worker {
  const worker = new ThreadWorker(workerFile)
  created.push(worker)
  return worker as unknown as Worker
}

beforeAll(async () => {
  outDir = mkdtempSync(join(tmpdir(), 'vwk-threads-'))
  await build({
    configFile: false,
    logLevel: 'silent',
    build: {
      outDir,
      emptyOutDir: true,
      minify: false,
      target: 'node20',
      lib: {
        entry: resolve(here, 'realThreads/worker.entry.ts'),
        formats: ['es'],
        fileName: () => 'worker.mjs',
      },
      rollupOptions: { external: ['node:worker_threads'] },
    },
  })
  workerFile = join(outDir, 'worker.mjs')
}, 60_000)

afterAll(() => {
  for (const worker of created) worker.terminate()
  if (outDir) rmSync(outDir, { recursive: true, force: true })
})

describe('real worker threads (D, C, F)', () => {
  test('a synchronous loop blocks its worker: a cooperative cancel cannot interrupt it', async () => {
    const worker = useWorker<ThreadModule>(factory)
    const controller = new AbortController()

    const busy = worker.call('busy', { id: 1, ms: 400 }, { signal: controller.signal })
    await new Promise((resolve) => setTimeout(resolve, 60))
    controller.abort()
    await expect(busy).rejects.toMatchObject({ name: 'AbortError' })

    const startedAt = Date.now()
    await expect(worker.call('echo', { id: 2 })).resolves.toBe(2)
    expect(Date.now() - startedAt).toBeGreaterThan(200)
    worker.terminate()
  }, 20_000)

  test('hardCancelOnAbort frees the CPU at once: the next call runs on a fresh thread', async () => {
    const worker = useWorker<ThreadModule>(factory, { hardCancelOnAbort: true })
    const controller = new AbortController()
    const before = created.length

    const busy = worker.call('busy', { id: 1, ms: 2000 }, { signal: controller.signal })
    await waitFor(() => created.length === before + 1)
    await new Promise((resolve) => setTimeout(resolve, 60))
    controller.abort()
    await expect(busy).rejects.toMatchObject({ name: 'AbortError' })

    const startedAt = Date.now()
    await expect(worker.call('echo', { id: 2 })).resolves.toBe(2)
    expect(Date.now() - startedAt).toBeLessThan(1000)
    expect(created[before].terminated).toBe(true)
    worker.terminate()
  }, 20_000)

  test('a loop with ctx.yield() stops soon after cancel, on the same thread', async () => {
    const worker = useWorker<ThreadModule>(factory)
    const controller = new AbortController()
    const before = created.length

    const looping = worker.call('busyYield', { id: 1, ms: 5000 }, { signal: controller.signal })
    await new Promise((resolve) => setTimeout(resolve, 80))
    controller.abort()
    await expect(looping).rejects.toMatchObject({ name: 'AbortError' })

    const startedAt = Date.now()
    await expect(worker.call('echo', { id: 2 })).resolves.toBe(2)
    expect(Date.now() - startedAt).toBeLessThan(500)
    expect(created.length).toBe(before + 1)
    worker.terminate()
  }, 20_000)

  test("'latest' with hardCancelOnAbort: ten quick runs consume only the last, no stale CPU work", async () => {
    const worker = useWorker<ThreadModule>(factory, {
      concurrency: 'latest',
      hardCancelOnAbort: true,
    })

    const startedAt = Date.now()
    const outcomes = Array.from({ length: 9 }, (_, index) =>
      worker.call('busy', { id: index, ms: 5000 }).catch((caught: Error) => caught),
    )
    const last = worker.call('busy', { id: 99, ms: 80 })

    expect(await last).toBe(99)
    for (const outcome of await Promise.all(outcomes)) {
      expect(isSupersededError(outcome)).toBe(true)
    }
    expect(Date.now() - startedAt).toBeLessThan(3000)
    worker.terminate()
  }, 30_000)

  test('a pool map cancelled by a shared signal with hardCancelOnAbort ends every slot at once', async () => {
    const pool = createWorkerPool<ThreadModule>(factory, { size: 4, hardCancelOnAbort: true })
    const controller = new AbortController()
    const before = created.length
    const items = Array.from({ length: 200 }, (_, index) => ({ id: index, ms: 300 }))

    const mapped = pool.call('busy', items[0], { signal: controller.signal }).catch(() => undefined)
    const others = items
      .slice(1, 40)
      .map((item) => pool.call('busy', item, { signal: controller.signal }).catch(() => undefined))
    await waitFor(() => created.length - before === 4, 5000)
    await waitFor(() => pool.stats.value.busy === 4, 5000)

    const startedAt = Date.now()
    controller.abort()
    await Promise.all([mapped, ...others])
    const slots = created.slice(before)

    expect(Date.now() - startedAt).toBeLessThan(500)
    await waitFor(() => slots.every((slot) => slot.terminated), 1000)
    expect(pool.stats.value).toEqual({ busy: 0, idle: 0, queued: 0 })
  }, 30_000)
})
