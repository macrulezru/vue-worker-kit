import { defineWorkerHandler } from 'vue-worker-kit/worker'

export interface LoopInput {
  ms: number
  cooperative: boolean
}

export default defineWorkerHandler(async (input: LoopInput, ctx): Promise<number> => {
  const until = Date.now() + input.ms
  let steps = 0
  for (;;) {
    if (Date.now() >= until) break
    steps++
    if (input.cooperative && steps % 20_000 === 0) await ctx.yield()
  }
  return steps
})
