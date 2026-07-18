import { defineWorkerHandler } from 'vue-worker-kit/worker'

export interface SortInput {
  values: number[]
}

export default defineWorkerHandler(async (input: SortInput, ctx): Promise<number[]> => {
  const arr = [...input.values]
  const n = arr.length

  // Deliberately naive O(n^2) insertion sort so a few thousand items take long enough to
  // show progress/cancellation in the demo — a real handler would just use arr.sort().
  //
  // Yielding (setTimeout(0)) is what lets a `cancel` message land and lets progress paint,
  // but each yield costs real wall-clock time (browsers throttle timers to a few ms). Fix
  // the yield COUNT rather than the chunk size, so overhead stays ~constant instead of
  // growing with n — yielding every 50 items was ~600 yields at n=30,000, making the worker
  // run look ~20x slower than the main-thread version for reasons that have nothing to do
  // with workers themselves.
  const yieldEvery = Math.max(1, Math.floor(n / 20))

  for (let i = 1; i < n; i++) {
    if (ctx.signal.aborted) throw ctx.signal.reason
    const current = arr[i]
    let j = i - 1
    while (j >= 0 && arr[j] > current) {
      arr[j + 1] = arr[j]
      j--
    }
    arr[j + 1] = current

    if (i % yieldEvery === 0) {
      ctx.reportProgress(i / n)
      await new Promise((resolve) => setTimeout(resolve, 0)) // yield so cancel can land
    }
  }

  return arr
})
