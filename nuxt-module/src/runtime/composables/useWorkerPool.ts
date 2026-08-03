import { useWorkerPool as baseUseWorkerPool } from 'vue-worker-kit/pool'
import { getWorker, workerNames } from '#build/vue-worker-kit-workers.mjs'

export type WorkerName = typeof workerNames[number]

/**
 * Create a worker pool from a registered worker name
 */
export function useWorkerPool<T extends WorkerName>(name: T, options?: { size?: number }) {
  if (import.meta.client) {
    return baseUseWorkerPool(() => getWorker(name), options)
  }
  
  // SSR stub
  return {
    run: async () => {
      throw new Error('Workers are only available on client side')
    },
    map: async () => [],
    warmup: async () => {},
    terminate: () => {},
    stats: {
      busy: 0,
      idle: 0,
      queued: 0,
    },
  }
}
