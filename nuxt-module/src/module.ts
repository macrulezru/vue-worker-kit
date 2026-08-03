import { defineNuxtModule, addImports, createResolver, addTemplate } from '@nuxt/kit'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { promises as fs } from 'node:fs'

export interface ModuleOptions {
  workersDir?: string
  autoImport?: boolean
  prefix?: string
  sourcemaps?: boolean
  build?: {
    target?: string
    minify?: boolean
    external?: string[]
  }
}

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: '@nuxtjs/vue-worker-kit',
    configKey: 'vueWorkerKit',
    version: '^3.0.0',
  },
  defaults: {
    workersDir: '~/workers',
    autoImport: true,
    prefix: '',
    sourcemaps: true,
    build: {
      target: 'webworker',
      minify: true,
      external: ['vue'],
    },
  },
  async setup(options, nuxt) {
    const resolver = createResolver(import.meta.url)
    const rootDir = nuxt.options.rootDir
    
    // Resolve workers directory
    const workersDir = resolve(rootDir, options.workersDir!.replace('~/', ''))
    
    // Scan for worker files
    let workerFiles: string[] = []
    try {
      const entries = await fs.readdir(workersDir)
      workerFiles = entries
        .filter(file => file.endsWith('.worker.ts') || file.endsWith('.worker.js'))
        .map(file => file.replace(/\.worker\.(ts|js)$/, ''))
    } catch {
      console.warn(`[vue-worker-kit] Workers directory not found at ${workersDir}`)
    }
    
    // Add template for worker registry
    addTemplate({
      filename: 'vue-worker-kit-workers.mjs',
      getContents: () => {
        const workers = workerFiles.map(name => ({
          name: `${options.prefix}${name}`,
          path: resolve(workersDir, `${name}.worker.ts`),
        }))
        
        return `
export const workerRegistry = {
${workers.map(w => `  '${w.name}': () => new Worker(new URL('${w.path}', import.meta.url)),`).join('\n')}
}

export const workerNames = [${workers.map(w => `'${w.name}'`).join(', ')}]

export function getWorker(name) {
  if (!workerRegistry[name]) {
    throw new Error(\`Worker '\${name}' not found. Available workers: \${Object.keys(workerRegistry).join(', ')}\`)
  }
  return workerRegistry[name]()
}
`.trim()
      },
    })
    
    // Auto-import composables
    if (options.autoImport) {
      addImports([
        {
          name: 'useWorker',
          as: 'useWorker',
          from: resolver.resolve('runtime/composables/useWorker'),
        },
        {
          name: 'useWorkerPool',
          as: 'useWorkerPool',
          from: resolver.resolve('runtime/composables/useWorkerPool'),
        },
      ])
    }
    
    // Add SSR guard plugin
    nuxt.options.plugins.push(
      resolver.resolve('runtime/plugins/ssr-guard')
    )
    
    // Configure Vite for workers
    nuxt.hook('vite:extendConfig', (config) => {
      config.worker = {
        format: 'es',
        ...config.worker,
      }
    })
    
    // Add types
    nuxt.hook('prepare:types', ({ references }) => {
      references.push({ types: 'vue-worker-kit' })
    })
  },
})
