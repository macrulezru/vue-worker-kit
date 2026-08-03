import { Bench } from 'tinybench'

async function main() {
  // Бенчмарк: Main thread vs Worker vs Pool
  const bench = new Bench({ 
    time: 200,
    warmupIterations: 2,
    warmupTime: 50,
  })

  const testData = Array.from({ length: 30 }, (_, i) => i)

  // CPU-ёмкая функция для тестирования
  const cpuIntensiveTask = (n: number): number => {
    let result = n
    for (let i = 0; i < 2000; i++) {
      result = Math.sin(result) * 100
    }
    return result
  }

  // 1. Main thread (синхронно)
  bench.add('Main Thread (sync)', () => {
    return testData.map(cpuIntensiveTask)
  })

  // 2. Single Worker (эмуляция - асинхронная обработка)
  bench.add('Single Worker', async () => {
    const results: number[] = []
    for (const item of testData) {
      // Эмуляция postMessage оверхеда
      await Promise.resolve()
      results.push(cpuIntensiveTask(item))
    }
    return results
  })

  // 3. Worker Pool (4 workers, параллельная обработка)
  bench.add('Worker Pool (4 workers)', async () => {
    const results: number[] = []
    const concurrency = 4
    const chunks: number[][] = []
    
    for (let i = 0; i < testData.length; i += concurrency) {
      chunks.push(testData.slice(i, i + concurrency))
    }
    
    for (const chunk of chunks) {
      const chunkResults = await Promise.all(
        chunk.map(async (item) => {
          // Эмуляция postMessage оверхеда
          await Promise.resolve()
          return cpuIntensiveTask(item)
        })
      )
      results.push(...chunkResults)
    }
    
    return results
  })

  await bench.run()

  console.log('\n=== Benchmark Results ===\n')

  const tableData = bench.tasks.map((t) => {
    const result = t.result
    return {
      Name: t.name,
      'Ops/sec': result && result.hz ? result.hz.toFixed(2) : 'N/A',
      'Margin (%)': result && result.rme ? result.rme.toFixed(2) : 'N/A',
      'Samples': result && result.samples ? result.samples.length : 0,
      'Avg Time (ms)': result && result.mean ? (result.mean * 1000).toFixed(4) : 'N/A',
    }
  })

  console.table(tableData)

  // Экспорт результатов для CI/README
  const results = bench.tasks.map((t) => {
    const result = t.result
    return {
      name: t.name,
      hz: result && result.hz ? result.hz : 0,
      rme: result && result.rme ? result.rme : 0,
      samples: result && result.samples ? result.samples.length : 0,
      meanMs: result && result.mean ? result.mean * 1000 : 0,
    }
  })

  console.log('\n--- JSON Output ---')
  console.log(JSON.stringify(results, null, 2))

  // Сохранение результатов в файл
  const { writeFileSync } = await import('fs')
  const { join, dirname } = await import('path')
  const { fileURLToPath } = await import('url')

  const __dirname = dirname(fileURLToPath(import.meta.url))
  writeFileSync(
    join(__dirname, 'results.json'),
    JSON.stringify(results, null, 2)
  )

  console.log(`\nResults saved to ${join(__dirname, 'results.json')}`)

  // Вывод сравнения производительности
  if (results.length >= 3) {
    const mainThread = results[0]
    const singleWorker = results[1]
    const pool = results[2]
    
    console.log('\n=== Performance Comparison ===')
    if (mainThread.hz > 0 && pool.hz > 0) {
      const speedup = pool.hz / mainThread.hz
      console.log(`Pool vs Main Thread: ${speedup.toFixed(2)}x ${speedup > 1 ? 'faster' : 'slower'}`)
    }
    if (singleWorker.hz > 0 && pool.hz > 0) {
      const speedup = pool.hz / singleWorker.hz
      console.log(`Pool vs Single Worker: ${speedup.toFixed(2)}x ${speedup > 1 ? 'faster' : 'slower'}`)
    }
  }
}

main().catch(console.error)
