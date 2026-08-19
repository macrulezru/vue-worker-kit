import { writeFileSync } from 'fs'
import { Worker } from 'node:worker_threads'
import { Bench } from 'tinybench'

// Heavy computation function (Fibonacci)
function fib(n: number): number {
  if (n <= 1) return n
  return fib(n - 1) + fib(n - 2)
}

// `time: 1000` alone can report zero samples if a single iteration takes longer than the 1s
// sampling budget — `iterations` is a floor on sample count regardless of how long they take.
const bench = new Bench({ time: 1000, iterations: 3 })

// A DOM `Worker` doesn't exist in Node (this runs via `tsx`, not a browser) — `node:worker_threads`
// is Node's real equivalent. `eval: true` lets the worker's source be a plain string instead of
// its own file, same spirit as the Blob-URL trick you'd use in a browser.
const workerSource = `
  const { parentPort } = require('node:worker_threads')
  function fib(n) { return n <= 1 ? n : fib(n - 1) + fib(n - 2) }
  parentPort.on('message', ({ id, input }) => {
    try {
      parentPort.postMessage({ id, result: fib(input) })
    } catch (error) {
      parentPort.postMessage({ id, error: error instanceof Error ? error.message : String(error) })
    }
  })
`

function createWorker(): Worker {
  return new Worker(workerSource, { eval: true })
}

function runTask(worker: Worker, n: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const handler = (msg: { id: number; result?: number; error?: string }) => {
      if (msg.id !== n) return
      worker.off('message', handler)
      if (msg.error) reject(new Error(msg.error))
      else resolve(msg.result!)
    }
    worker.on('message', handler)
    worker.postMessage({ id: n, input: n })
  })
}

// Benchmark 1: Main thread execution
bench.add('Main Thread (fib 30..34)', async () => {
  const inputs = Array.from({ length: 5 }, (_, i) => 30 + i)
  await Promise.all(inputs.map((n) => fib(n)))
})

// Benchmark 2: Single worker thread
bench.add('Single Worker (fib 30..34)', async () => {
  const worker = createWorker()
  const inputs = Array.from({ length: 5 }, (_, i) => 30 + i)
  await Promise.all(inputs.map((n) => runTask(worker, n)))
  await worker.terminate()
})

// Benchmark 3: Pool of 4 worker threads
bench.add('Worker Pool 4x (fib 30..34, 8 tasks)', async () => {
  const workers = Array.from({ length: 4 }, createWorker)
  const inputs = Array.from({ length: 8 }, (_, i) => 30 + (i % 5))
  await Promise.all(inputs.map((n, i) => runTask(workers[i % workers.length], n)))
  await Promise.all(workers.map((w) => w.terminate()))
})

await bench.run()

console.log('\n📊 Benchmark Results:\n')
console.table(
  bench.tasks.map((t) => ({
    Task: t.name,
    'Ops/sec': (t.result?.throughput.mean ?? 0).toFixed(2),
    'Avg Time (ms)': (t.result?.latency.mean ?? 0).toFixed(2),
    Margin: (t.result?.latency.rme ?? 0).toFixed(2) + '%',
  })),
)

// Save results to JSON for CI
writeFileSync(
  'benchmark/results.json',
  JSON.stringify(
    {
      timestamp: new Date().toISOString(),
      results: bench.tasks.map((t) => ({
        name: t.name,
        opsPerSec: t.result?.throughput.mean ?? 0,
        meanMs: t.result?.latency.mean ?? 0,
        rme: t.result?.latency.rme ?? 0,
      })),
    },
    null,
    2,
  ),
)

console.log('\n✅ Results saved to benchmark/results.json')
