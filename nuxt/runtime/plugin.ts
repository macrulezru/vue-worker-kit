import { defineNuxtPlugin } from '#app'
import { WorkerUnavailableError } from 'vue-worker-kit'

/**
 * Nuxt plugin для инициализации vue-worker-kit
 * Добавляет SSR-safe проверки и глобальные обработчики ошибок
 */
export default defineNuxtPlugin({
  name: 'vue-worker-kit:init',
  setup() {
    // Глобальный обработчик ошибок воркеров для SSR
    if (import.meta.server) {
      // На сервере выбрасываем понятную ошибку при попытке использования Worker
      globalThis.Worker = class SSRWorker extends EventTarget {
        constructor(scriptUrl: string | URL) {
          super()
          console.warn(
            '[vue-worker-kit] Web Workers are not available in SSR context. ' +
            'Worker functionality will be available only on client-side.'
          )
        }
        
        postMessage() {
          throw new WorkerUnavailableError('Web Workers are not available in SSR')
        }
        
        terminate() {}
      } as any
    }
    
    return {
      provide: {
        workerKit: {
          isAvailable: import.meta.client,
        },
      },
    }
  },
})
