import { Bench } from 'tinybench'

// Heavy computation function (Fibonacci)
function fib(n: number): number {
  if (n <= 1) return n
  return fib(n - 1) + fib(n - 2)
}

const bench = new Bench({ time: 1000 })

// Benchmark 1: Main thread execution
bench.add('Main Thread (fib(35))', async () => {
  const inputs = Array.from({ length: 5 }, (_, i) => 30 + i)
  await Promise.all(inputs.map(n => fib(n)))
})

// Benchmark 2: Single Worker
bench.add('Single Worker (fib(35))', async () => {
  const workerCode = `
    function fib(n) {
      if (n <= 1) return n
      return fib(n - 1) + fib(n - 2)
    }
    onmessage = (e) => {
      const { id, input } = e.data
      try {
        const result = fib(input)
        postMessage({ id, result })
      } catch (error) {
        postMessage({ id, error: error.message })
      }
    }
  `
  
  const inputs = Array.from({ length: 5 }, (_, i) => 30 + i)
  const blob = new Blob([workerCode], { type: 'application/javascript' })
  const worker = new Worker(URL.createObjectURL(blob))
  
  const runTask = (n: number) => new Promise<number>((resolve, reject) => {
    const handler = (e: MessageEvent) => {
      if (e.data.id === n) {
        worker.removeEventListener('message', handler)
        if (e.data.error) reject(new Error(e.data.error))
        else resolve(e.data.result)
      }
    }
    worker.addEventListener('message', handler)
    worker.postMessage({ id: n, input: n })
  })

  await Promise.all(inputs.map(runTask))
  worker.terminate()
})

// Benchmark 3: Worker Pool (4 workers)
bench.add('Worker Pool 4x (fib(35))', async () => {
  const workerCode = `
    function fib(n) {
      if (n <= 1) return n
      return fib(n - 1) + fib(n - 2)
    }
    onmessage = (e) => {
      const { id, input } = e.data
      try {
        const result = fib(input)
        postMessage({ id, result })
      } catch (error) {
        postMessage({ id, error: error.message })
      }
    }
  `
  
  const createWorker = () => {
    const blob = new Blob([workerCode], { type: 'application/javascript' })
    return new Worker(URL.createObjectURL(blob))
  }

  const inputs = Array.from({ length: 8 }, (_, i) => 30 + (i % 5))
  
  // Simple pool implementation for benchmark
  const workers = Array.from({ length: 4 }, createWorker)
  let workerIndex = 0
  
  const runTask = (n: number) => new Promise<number>((resolve, reject) => {
    const worker = workers[workerIndex++ % workers.length]
    const handler = (e: MessageEvent) => {
      if (e.data.id === n) {
        worker.removeEventListener('message', handler)
        if (e.data.error) reject(new Error(e.data.error))
        else resolve(e.data.result)
      }
    }
    worker.addEventListener('message', handler)
    worker.postMessage({ id: n, input: n })
  })

  await Promise.all(inputs.map(runTask))
  workers.forEach(w => w.terminate())
})

await bench.run()

console.log('\n📊 Benchmark Results:\n')
console.table(bench.tasks.map(t => ({
  Task: t.name,
  'Ops/sec': (t.result?.hz ?? 0).toFixed(2),
  'Avg Time (ms)': ((t.result?.mean ?? 0) * 1000).toFixed(2),
  'Margin': t.result?.rme.toFixed(2) + '%'
})))

// Save results to JSON for CI
import { writeFileSync } from 'fs'
writeFileSync('benchmark/results.json', JSON.stringify({
  timestamp: new Date().toISOString(),
  results: bench.tasks.map(t => ({
    name: t.name,
    hz: t.result?.hz ?? 0,
    mean: t.result?.mean ?? 0,
    rme: t.result?.rme ?? 0
  }))
}, null, 2))

console.log('\n✅ Results saved to benchmark/results.json')
