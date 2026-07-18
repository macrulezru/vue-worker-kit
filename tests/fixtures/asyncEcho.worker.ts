import { defineWorkerHandler } from '../../src/worker/defineWorkerHandler'

export interface AsyncEchoInput {
  value: string
  delayMs: number
}

export async function asyncEchoHandler(input: AsyncEchoInput): Promise<string> {
  await new Promise((resolve) => setTimeout(resolve, input.delayMs))
  return input.value
}

export default defineWorkerHandler(asyncEchoHandler)
