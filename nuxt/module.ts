import { defineNuxtModule, addImportsDir, createResolver } from '@nuxt/kit'

export interface ModuleOptions {
  /**
   * Путь к директории с worker файлами (относительно rootDir)
   * @default '~/workers'
   */
  workersDir?: string
  
  /**
   * Автоматически импортировать worker composables
   * @default true
   */
  autoImport?: boolean
  
  /**
   * Префикс для импортируемых worker функций
   * @default 'use'
   */
  importPrefix?: string
}

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: 'vue-worker-kit',
    configKey: 'workerKit',
    compatibility: {
      nuxt: '^3.0.0',
      bridge: false,
    },
  },
  defaults: {
    workersDir: '~/workers',
    autoImport: true,
    importPrefix: 'use',
  },
  setup(options, nuxt) {
    const resolver = createResolver(import.meta.url)
    
    // Добавляем трансформацию для SSR-guard
    nuxt.options.build.transpile.push('vue-worker-kit')
    
    // Автоимпорт worker composables
    if (options.autoImport) {
      const workersPath = resolver.resolve(nuxt.options.srcDir, options.workersDir!.replace('~/', ''))
      
      // Добавляем директорию workers в imports
      addImportsDir([
        resolver.resolve('./runtime/composables'),
      ])
      
      // Генерируем импорты для каждого worker файла
      nuxt.hook('prepare:types', ({ references }) => {
        references.push({ path: resolver.resolve('./runtime/types.d.ts') })
      })
    }
    
    // Добавляем плагин для инициализации
    nuxt.options.plugins.push(
      resolver.resolve('./runtime/plugin')
    )
    
    // Runtime config
    nuxt.options.runtimeConfig.workerKit = {
      workersDir: options.workersDir,
      autoImport: options.autoImport,
      importPrefix: options.importPrefix,
    }
    
    // Aliases для удобного импорта
    nuxt.options.alias['#worker'] = resolver.resolve('./runtime/worker')
    nuxt.options.alias['#worker-kit'] = 'vue-worker-kit'
    
    console.log('[vue-worker-kit] Module initialized')
    console.log(`[vue-worker-kit] Workers directory: ${options.workersDir}`)
    console.log(`[vue-worker-kit] Auto-import: ${options.autoImport ? 'enabled' : 'disabled'}`)
  },
})
