import { defineWorkerHandler } from 'vue-worker-kit/worker'
import { countPrimesInRange } from '../lib/countPrimes'

export interface CountPrimesInput {
  from: number
  to: number
}

export default defineWorkerHandler((input: CountPrimesInput): number => {
  return countPrimesInRange(input.from, input.to)
})
