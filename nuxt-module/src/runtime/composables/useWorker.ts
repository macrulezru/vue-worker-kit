import { useWorker as baseUseWorker } from 'vue-worker-kit'
import { getWorker, workerNames } from '#build/vue-worker-kit-workers.mjs'

export type WorkerName = typeof workerNames[number]

/**
 * Use a registered worker by name with full type safety
 */
export function useWorker<T extends WorkerName>(name: T) {
  if (import.meta.client) {
    return baseUseWorker(() => getWorker(name))
  }
  
  // SSR stub - returns disabled state
  return {
    run: async () => {
      throw new Error('Workers are only available on client side')
    },
    warmup: async () => {},
    loading: false,
    progress: 0,
    result: null,
    error: null,
    chunks: [],
    terminate: () => {},
  }
}
