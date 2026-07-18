import { defineWorkerHandler } from 'vue-worker-kit/worker'

/**
 * Receives an ArrayBuffer of float64 values via a zero-copy `transfer` on the way in
 * (RunOptions.transfer), doubles each value in place, and sends the SAME buffer back via
 * `ctx.transfer()` — a full zero-copy round trip, neither direction ever copies the data.
 */
export default defineWorkerHandler((buffer: ArrayBuffer, ctx): ArrayBuffer => {
  const view = new Float64Array(buffer)
  for (let i = 0; i < view.length; i++) view[i] *= 2
  ctx.transfer(buffer)
  return buffer
})
