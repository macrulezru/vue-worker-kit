# Nuxt Module

Official Nuxt module for vue-worker-kit with automatic worker discovery and SSR guards.

## Installation

```bash
npm install @nuxtjs/vue-worker-kit
```

Add to your `nuxt.config.ts`:

```ts
export default defineNuxtConfig({
  modules: ['@nuxtjs/vue-worker-kit'],
  
  vueWorkerKit: {
    // Optional configuration
    workersDir: '~/workers', // Default: '~/workers'
    autoImport: true,        // Default: true
  }
})
```

## Features

### Automatic Worker Discovery

Place your workers in `~/workers/` directory:

```
~/workers/
├── image.worker.ts
├── data.worker.ts
└── wasm.worker.ts
```

Workers are automatically registered and can be used without manual imports:

```vue
<script setup lang="ts">
// Auto-imported!
const { run } = useWorker('image') // resolves to ~/workers/image.worker.ts
</script>
```

### SSR Guards

The module automatically adds SSR guards to prevent `ReferenceError: Worker is not defined`:

```ts
// Automatically wrapped with import.meta.client check
if (import.meta.client) {
  const { run } = useWorker(/* ... */)
}
```

### Type-safe Worker Resolution

Full TypeScript support with auto-completion:

```ts
// Type-safe worker name suggestions
useWorker('image')   // ✅ Valid
useWorker('video')   // ❌ Error: 'video' is not a registered worker
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
    
    // Generate sourcemaps for workers (development only)
    sourcemaps: true,
  }
})
```

### Build Options

Configure how workers are bundled:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  vueWorkerKit: {
    build: {
      // Target environment for workers
      target: 'webworker',
      
      // Minify workers in production
      minify: true,
      
      // External dependencies (not bundled into worker)
      external: ['vue'],
    }
  }
})
```

## Usage Examples

### Basic Worker

```ts
// ~/workers/compute.worker.ts
import { defineWorkerHandler } from 'vue-worker-kit/worker'

export type Input = number[]
export type Output = number

export default defineWorkerHandler(async (numbers: Input) => {
  return numbers.reduce((sum, n) => sum + n, 0)
})
```

```vue
<!-- In your component -->
<script setup lang="ts">
const { run, result } = useWorker('compute')

await run([1, 2, 3, 4, 5])
console.log(result.value) // 15
</script>
```

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

let wasmModule: WebAssembly.Instance

export default defineWorkerHandler(async (input: Uint8Array) => {
  if (!wasmModule) {
    const bridge = await createWasmBridge('/my-module.wasm')
    wasmModule = bridge.instance
  }
  
  // Use WASM exports
  const exports = wasmModule.exports as { process: (ptr: number) => number }
  return exports.process(input[0])
})
```

## Manual Usage (Without Module)

If you prefer not to use the module:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  vite: {
    worker: {
      format: 'es'
    }
  }
})
```

```vue
<script setup lang="ts">
// Manual worker registration
const { run } = useWorker<typeof import('~/workers/my.worker')>(
  () => new Worker(new URL('~/workers/my.worker', import.meta.url))
)
</script>
```

## Troubleshooting

### "Worker is not defined"

Ensure you're using workers only on client side:

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

### Build Errors

Check that workers don't import Vue or DOM APIs:

```ts
// ❌ Don't do this in workers
import { ref } from 'vue'
import document from 'globalthis/document'

// ✅ Do this instead
// Workers should be pure computation
```

## Next Steps

- [Getting Started](/guide/getting-started) - Quick start guide
- [Worker Pool](/guide/pool) - Parallel processing
- [WASM Bridge](/guide/wasm) - WebAssembly integration
