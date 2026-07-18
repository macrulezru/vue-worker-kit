import { defineWorkerHandler } from '../../src/worker/defineWorkerHandler'

export function bufferLengthHandler(input: ArrayBuffer): number {
  return input.byteLength
}

export default defineWorkerHandler(bufferLengthHandler)
