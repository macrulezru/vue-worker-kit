import { defineComposable } from '#app'

/**
 * Автоимпортируемый composable для создания worker из файла
 * Используется с Nuxt Module для автоматической регистрации workers
 */
export function createWorkerFromPath<T extends Record<string, any>>(
  workerPath: string
) {
  return () => {
    if (import.meta.server) {
      throw new Error('Web Workers are not available in SSR')
    }
    
    // Динамический импорт worker файла через Vite
    return new Worker(
      new URL(workerPath, import.meta.url),
      { type: 'module' }
    )
  }
}

/**
 * Хелпер для автоимпорта всех workers из директории ~/workers
 * Генерируется автоматически Nuxt Module
 */
export const useWorkers = <T extends Record<string, any>>() => {
  const workers: Record<string, ReturnType<typeof createWorkerFromPath<T>>> = {}
  
  // Этот код будет заменён на реальные импорты во время билда
  // Пример: workers.myWorker = createWorkerFromPath<T>('~/workers/my.worker.ts')
  
  return workers
}
