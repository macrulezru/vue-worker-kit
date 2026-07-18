import { defineWorkerHandler, type WorkerContext } from '../../src/worker/defineWorkerHandler'

export interface TransferOutInput {
  size: number
  fillValue: number
}

export function transferOutHandler(input: TransferOutInput, ctx: WorkerContext): ArrayBuffer {
  const buffer = new ArrayBuffer(input.size)
  new Uint8Array(buffer).fill(input.fillValue)
  ctx.transfer(buffer)
  return buffer
}

export default defineWorkerHandler(transferOutHandler)
