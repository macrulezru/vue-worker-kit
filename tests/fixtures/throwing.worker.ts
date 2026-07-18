import { defineWorkerHandler } from '../../src/worker/defineWorkerHandler'

export interface ThrowingInput {
  message: string
}

export function throwingHandler(input: ThrowingInput): number {
  throw new Error(input.message)
}

export default defineWorkerHandler(throwingHandler)
