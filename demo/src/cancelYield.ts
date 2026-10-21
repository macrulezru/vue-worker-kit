import { useWorker } from 'vue-worker-kit'

interface RepeatResult {
  attempts: number
  aborted: number
  finishedWithResult: number
  worstYieldCallsAfterCancel: number
  yieldCallsAfterCancel: number[]
  worstStopDelayMs: number
  meanYieldIntervalMs: number
  meanYieldCostMs: number
}

const worker = useWorker<typeof import('./workers/cancelYield.worker')>(
  () => new Worker(new URL('./workers/cancelYield.worker.ts', import.meta.url), { type: 'module' }),
)

const query = new URLSearchParams(location.search)
const params = {
  iterations: 4_000_000_000,
  yieldEvery: Number(query.get('every') ?? 250_000),
}

async function runOnce(delayMs: number): Promise<{
  aborted: boolean
  yieldCallsAfterCancel: number
  stopDelayMs: number
  yieldIntervalMs: number
}> {
  const controller = new AbortController()
  const pending = worker.call('loop', params, { signal: controller.signal })
  await new Promise((resolve) => setTimeout(resolve, delayMs))
  const cancelledAt = performance.timeOrigin + performance.now()
  controller.abort()
  let aborted = false
  try {
    await pending
  } catch (caught) {
    aborted = (caught as Error).name === 'AbortError'
  }
  let report = await worker.call('lastRun', null)
  while (!report.settled) {
    await new Promise((resolve) => setTimeout(resolve, 5))
    report = await worker.call('lastRun', null)
  }
  const times = report.yieldCallTimes
  const after = times.filter((time) => time >= cancelledAt)
  const stopDelayMs = after.length > 0 ? after[after.length - 1] - cancelledAt : 0
  const yieldIntervalMs =
    times.length > 1 ? (times[times.length - 1] - times[0]) / (times.length - 1) : 0
  return { aborted, yieldCallsAfterCancel: after.length, stopDelayMs, yieldIntervalMs }
}

async function measureYieldCost(): Promise<number> {
  const probe = { iterations: 20_000, yieldEvery: 1 }
  const startedAt = performance.now()
  await worker.call('loop', probe)
  return (performance.now() - startedAt) / probe.iterations
}

async function repeat(times: number): Promise<RepeatResult> {
  const yieldCallsAfterCancel: number[] = []
  let aborted = 0
  let worstStopDelayMs = 0
  let intervalSum = 0
  let finishedWithResult = 0
  for (let attempt = 0; attempt < times; attempt++) {
    const delay = 5 + Math.floor(Math.random() * 45)
    const outcome = await runOnce(delay)
    if (outcome.aborted) aborted++
    else finishedWithResult++
    yieldCallsAfterCancel.push(outcome.yieldCallsAfterCancel)
    worstStopDelayMs = Math.max(worstStopDelayMs, outcome.stopDelayMs)
    intervalSum += outcome.yieldIntervalMs
  }
  return {
    attempts: times,
    aborted,
    finishedWithResult,
    worstYieldCallsAfterCancel: Math.max(...yieldCallsAfterCancel),
    yieldCallsAfterCancel,
    worstStopDelayMs,
    meanYieldIntervalMs: intervalSum / times,
    meanYieldCostMs: await measureYieldCost(),
  }
}

const output = document.getElementById('output') as HTMLPreElement
const startButton = document.getElementById('start') as HTMLButtonElement
const cancelButton = document.getElementById('cancel') as HTMLButtonElement
const repeatButton = document.getElementById('repeat') as HTMLButtonElement

let manual: AbortController | null = null

startButton.addEventListener('click', async () => {
  manual = new AbortController()
  output.textContent = 'running…'
  try {
    await worker.call('loop', params, { signal: manual.signal })
    output.textContent = 'finished'
  } catch {
    const report = await worker.call('lastRun', null)
    output.textContent = `cancelled after ${report.completedIterations} iterations, ${report.yieldCalls} yield calls in total`
  }
})

cancelButton.addEventListener('click', () => manual?.abort())

repeatButton.addEventListener('click', async () => {
  output.textContent = 'repeating 100 times…'
  const result = await repeat(100)
  output.textContent = JSON.stringify(result, null, 2)
})

Object.assign(window, { cancelYieldStand: { repeat, runOnce } })
