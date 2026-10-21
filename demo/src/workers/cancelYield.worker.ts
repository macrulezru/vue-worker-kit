import { defineWorkerOperations } from 'vue-worker-kit/worker'

export interface LoopParams {
  iterations: number
  yieldEvery: number
}

export interface LoopReport {
  startedAt: number
  yieldCalls: number
  yieldCallTimes: number[]
  completedIterations: number
  settled: boolean
}

let report: LoopReport = {
  startedAt: 0,
  yieldCalls: 0,
  yieldCallTimes: [],
  completedIterations: 0,
  settled: true,
}

function wallTime(): number {
  return performance.timeOrigin + performance.now()
}

export default defineWorkerOperations({
  async loop(input: LoopParams, ctx): Promise<number> {
    report = {
      startedAt: wallTime(),
      yieldCalls: 0,
      yieldCallTimes: [],
      completedIterations: 0,
      settled: false,
    }
    let accumulator = 0
    try {
      for (let index = 0; index < input.iterations; index++) {
        accumulator = (accumulator + Math.sqrt(index)) % 1_000_003
        report.completedIterations = index + 1
        if ((index + 1) % input.yieldEvery === 0) {
          report.yieldCalls++
          report.yieldCallTimes.push(wallTime())
          await ctx.yield()
        }
      }
      return accumulator
    } finally {
      report.settled = true
    }
  },
  lastRun(_input: null): LoopReport {
    return report
  },
})
