import { defineWorkerHandler, type WorkerContext } from '../../src/worker/defineWorkerHandler'

export interface DelayInput {
  id: number
  delayMs: number
}

export async function delayHandler(input: DelayInput, ctx: WorkerContext): Promise<number> {
  await new Promise((resolve) => setTimeout(resolve, input.delayMs))
  if (ctx.signal.aborted) throw ctx.signal.reason
  return input.id
}

export default defineWorkerHandler(delayHandler)
