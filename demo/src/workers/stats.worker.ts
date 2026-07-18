import { defineWorkerHandler } from 'vue-worker-kit/worker'

export interface StatsInput {
  values: number[]
}

export interface StatsOutput {
  count: number
  average: number
  max: number
}

export default defineWorkerHandler(async (input: StatsInput): Promise<StatsOutput> => {
  // Small artificial delay so rapid, debounced source changes in the demo are visible.
  await new Promise((resolve) => setTimeout(resolve, 200))
  const { values } = input
  const sum = values.reduce((a, b) => a + b, 0)
  return {
    count: values.length,
    average: values.length ? sum / values.length : 0,
    max: values.length ? Math.max(...values) : 0,
  }
})
