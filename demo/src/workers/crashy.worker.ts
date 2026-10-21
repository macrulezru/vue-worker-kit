import { defineWorkerHandler } from 'vue-worker-kit/worker'

export interface CrashyInput {
  id: number
  crash: boolean
}

export default defineWorkerHandler(async (input: CrashyInput): Promise<number> => {
  if (input.crash) {
    setTimeout(() => {
      throw new Error('worker crashed on purpose')
    }, 0)
    await new Promise(() => undefined)
  }
  await new Promise((resolve) => setTimeout(resolve, 300))
  return input.id
})
