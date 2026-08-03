# Nuxt Module for vue-worker-kit

[![npm version](https://img.shields.io/npm/v/@nuxtjs/vue-worker-kit.svg)](https://npmjs.com/package/@nuxtjs/vue-worker-kit)
[![License](https://img.shields.io/npm/l/@nuxtjs/vue-worker-kit.svg)](https://github.com/macrulezru/vue-worker-kit/blob/main/LICENSE)

Official Nuxt module for **vue-worker-kit** - Type-safe Web Worker composables for Vue 3.

## Features

- 🚀 **Automatic Worker Discovery** - Workers in `~/workers/` are auto-registered
- 🔒 **Type-Safe** - Full TypeScript support with auto-completion
- 🛡️ **SSR Guards** - Automatic client-side checks to prevent SSR errors
- ⚡ **Zero Configuration** - Works out of the box
- 📦 **Optimized Build** - Workers bundled efficiently for production

## Installation

```bash
npm install @nuxtjs/vue-worker-kit vue-worker-kit
```

Add to your `nuxt.config.ts`:

```ts
export default defineNuxtConfig({
  modules: ['@nuxtjs/vue-worker-kit'],
  
  vueWorkerKit: {
    workersDir: '~/workers', // Default directory for workers
    autoImport: true,        // Auto-import composables
  }
})
```

## Usage

### Create a Worker

Place your worker file in `~/workers/`:

```ts
// ~/workers/compute.worker.ts
import { defineWorkerHandler } from 'vue-worker-kit/worker'

export type Input = number[]
export type Output = number

export default defineWorkerHandler(async (numbers: Input): Promise<Output> => {
  return numbers.reduce((sum, n) => sum + n, 0)
})
```

### Use in Components

```vue
<script setup lang="ts">
// Auto-imported! No manual import needed
const { run, result, loading } = useWorker('compute')

async function calculate() {
  await run([1, 2, 3, 4, 5])
  console.log(result.value) // 15
}
</script>

<template>
  <button @click="calculate" :disabled="loading">
    {{ loading ? 'Computing...' : 'Calculate Sum' }}
  </button>
  <div v-if="result">Result: {{ result }}</div>
</template>
```

## Configuration

### Module Options

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  vueWorkerKit: {
    // Directory containing worker files (relative to project root)
    workersDir: '~/workers',
    
    // Enable auto-import of useWorker composables
    autoImport: true,
    
    // Prefix for auto-imported worker names
    prefix: '',
    
    // Generate sourcemaps for workers in development
    sourcemaps: true,
    
    // Build options for workers
    build: {
      target: 'webworker',
      minify: true,
      external: ['vue'],
    }
  }
})
```

## Advanced Usage

### Worker Pool

```vue
<script setup lang="ts">
const pool = useWorkerPool('image', { size: 4 })

const images = ref<File[]>([])
const processed = await pool.map(images.value, {
  transfer: (img) => [img.buffer]
})
</script>
```

### WASM Integration

```ts
// ~/workers/wasm.worker.ts
import { defineWorkerHandler, createWasmBridge } from 'vue-worker-kit/worker'

let wasmInstance: WebAssembly.Instance

export default defineWorkerHandler(async (input: Uint8Array) => {
  if (!wasmInstance) {
    const bridge = await createWasmBridge('/my-module.wasm')
    wasmInstance = bridge.instance
  }
  
  const exports = wasmInstance.exports as { process: (ptr: number) => number }
  return exports.process(input[0])
})
```

## Troubleshooting

### "Worker is not defined" Error

The module automatically adds SSR guards. If you still see this error, ensure you're only using workers on the client:

```ts
if (import.meta.client) {
  const { run } = useWorker(/* ... */)
}
```

### Type Errors

Make sure your worker exports `Input` and `Output` types:

```ts
// Required for type inference
export type Input = string
export type Output = number
```

## License

MIT License - see [LICENSE](https://github.com/macrulezru/vue-worker-kit/blob/main/LICENSE) for details.

## Links

- [GitHub Repository](https://github.com/macrulezru/vue-worker-kit)
- [Documentation](https://vue-worker-kit.netlify.app)
- [npm Package](https://www.npmjs.com/package/@nuxtjs/vue-worker-kit)
