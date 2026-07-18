import { defineWorkerHandler } from '../../src/worker/defineWorkerHandler'

export function sortHandler(input: number[]): number[] {
  return [...input].sort((a, b) => a - b)
}

export default defineWorkerHandler(sortHandler)
