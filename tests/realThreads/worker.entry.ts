import { parentPort } from 'node:worker_threads'
import { attachWorkerProtocol, type WorkerContext } from '../../src/worker/defineWorkerHandler'

const port = parentPort!

const scope = {
  postMessage(message: unknown, transfer?: Transferable[]) {
    port.postMessage(message, transfer as never)
  },
  set onmessage(listener: ((event: MessageEvent) => void) | null) {
    if (listener) port.on('message', (data) => listener({ data } as MessageEvent))
  },
  get onmessage() {
    return null
  },
}

function spin(milliseconds: number): void {
  const until = Date.now() + milliseconds
  for (;;) {
    if (Date.now() >= until) break
  }
}

attachWorkerProtocol(
  {
    echo(input: { id: number }) {
      return input.id
    },
    busy(input: { id: number; ms: number }) {
      spin(input.ms)
      return input.id
    },
    async busyYield(input: { id: number; ms: number }, ctx: WorkerContext) {
      const until = Date.now() + input.ms
      while (Date.now() < until) {
        spin(5)
        await ctx.yield()
      }
      return input.id
    },
  },
  scope,
)
