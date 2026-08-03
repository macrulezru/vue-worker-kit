# Getting Started

This guide will help you set up vue-worker-kit in your Vue 3 project and create your first worker.

## Prerequisites

- Vue 3.4 or higher
- Node.js 18 or higher
- TypeScript (recommended for full type safety)

## Quick Start

### 1. Create a Worker File

Create a new file `src/workers/my.worker.ts`:

```ts
// src/workers/my.worker.ts
import { defineWorkerHandler } from 'vue-worker-kit/worker'

export type Input = number
export type Output = number

export default defineWorkerHandler(async (n: Input): Promise<Output> => {
  // Heavy computation - Fibonacci example
  function fib(n: number): number {
    if (n <= 1) return n
    return fib(n - 1) + fib(n - 2)
  }
  
  return fib(n)
})
```

### 2. Use the Worker in Your Component

```vue
<script setup lang="ts">
import { useWorker } from 'vue-worker-kit'
import type { Input, Output } from './workers/my.worker'

const { run, loading, result, error, progress } = useWorker<
  typeof import('./workers/my.worker')
>(() => new Worker(new URL('./workers/my.worker', import.meta.url)))

async function compute() {
  try {
    const value = await run(35) // Input is typed!
    console.log('Result:', value) // Result is typed as Output (number)
  } catch (err) {
    console.error('Worker error:', err)
  }
}
</script>

<template>
  <div>
    <button @click="compute" :disabled="loading">
      {{ loading ? 'Computing...' : 'Compute Fibonacci(35)' }}
    </button>
    
    <div v-if="progress > 0">Progress: {{ progress }}%</div>
    <div v-if="result">Result: {{ result }}</div>
    <div v-if="error" class="error">{{ error.message }}</div>
  </div>
</template>
```

## Key Features

### Type Safety

Types are automatically inferred from your worker file. When you import the worker module type, vue-worker-kit extracts the `Input` and `Output` types:

```ts
// Full type inference - no generics needed!
const { run } = useWorker<typeof import('./my.worker')>(/* ... */)

// run() accepts exactly what your worker expects
// result.value has the exact return type
```

### Reactive State

All state is reactive and ready to use in templates:

- `loading` - boolean, true while task is running
- `result` - ref<T>, contains the result after completion
- `error` - ref<Error | null>, contains error if failed
- `progress` - ref<number>, 0-100 progress percentage
- `chunks` - ref<Array>, accumulated streaming results

### Next Steps

- [Installation](/guide/installation) - Detailed installation options
- [useWorker()](/guide/useWorker) - Learn about the main composable
- [Worker Pool](/guide/pool) - Process multiple tasks in parallel
