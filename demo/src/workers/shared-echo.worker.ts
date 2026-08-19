import { defineWorkerHandler } from 'vue-worker-kit/worker'

// Generated once, when the SharedWorkerGlobalScope itself starts — not per connecting tab.
// Every tab's result carries the same id, which is the concrete, checkable proof that they're
// all talking to one worker instance, not one worker each (unlike a plain `useWorker()`).
const workerInstanceId = Math.random().toString(36).slice(2, 8)

export interface SharedEchoInput {
  value: number
}

export interface SharedEchoOutput {
  doubled: number
  workerInstanceId: string
}

export default defineWorkerHandler(
  (input: SharedEchoInput): SharedEchoOutput => ({
    doubled: input.value * 2,
    workerInstanceId,
  }),
)
