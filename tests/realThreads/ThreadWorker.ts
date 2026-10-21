import { Worker as NodeWorker } from 'node:worker_threads'
import type { WorkerLike } from '../../src/protocol'

export class ThreadWorker implements WorkerLike {
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  readonly thread: NodeWorker
  terminated = false

  constructor(file: string) {
    this.thread = new NodeWorker(file)
    this.thread.on('message', (data) => this.onmessage?.({ data } as MessageEvent))
    this.thread.on('error', (error: Error) =>
      this.onerror?.({ message: error.message } as ErrorEvent),
    )
  }

  postMessage(message: unknown, transfer?: Transferable[]): void {
    this.thread.postMessage(message, transfer as never)
  }

  terminate(): void {
    this.terminated = true
    void this.thread.terminate()
  }
}
