import { defineWorkerHandler } from 'vue-worker-kit/worker'

export interface SearchInput {
  query: string
  ms: number
}

export default defineWorkerHandler((input: SearchInput): string => {
  const until = Date.now() + input.ms
  for (;;) {
    if (Date.now() >= until) break
  }
  return input.query.toUpperCase()
})
