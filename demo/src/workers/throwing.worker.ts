import { defineWorkerHandler } from 'vue-worker-kit/worker'

export default defineWorkerHandler((input: { shouldThrow: boolean }): string => {
  if (input.shouldThrow) {
    throw new Error('Demo: something went wrong inside the worker')
  }
  return 'ok'
})
