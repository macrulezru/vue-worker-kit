import { defineWorkerOperations } from 'vue-worker-kit/worker'

export default defineWorkerOperations({
  wordCount(input: { text: string }) {
    return { words: input.text.split(/\s+/).filter(Boolean).length }
  },
  reverse(input: { text: string }) {
    return input.text.split('').reverse().join('')
  },
  async checksum(input: { text: string }, ctx) {
    ctx.reportProgress(0.5)
    let sum = 0
    for (const char of input.text) sum = (sum + char.charCodeAt(0)) % 65521
    return sum
  },
})
