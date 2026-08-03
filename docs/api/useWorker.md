# useWorker()

The main composable for working with Web Workers in Vue 3.

## Signature

```ts
function useWorker<T extends WorkerModule>(
  createWorker: () => Worker,
  options?: UseWorkerOptions
): UseWorkerReturn<T>
```

## Parameters

### `createWorker`

A function that creates and returns a new Worker instance.

```ts
() => new Worker(new URL('./my.worker', import.meta.url))
```

### `options` (Optional)

Configuration options for the worker.

```ts
interface UseWorkerOptions {
  // Idle timeout in ms before worker is terminated (default: 0 = never)
  idleTimeout?: number
  
  // Number of retry attempts on error (default: 0)
  retries?: number
  
  // Delay between retries in ms or function of attempt number (default: 0)
  retryDelay?: number | ((attempt: number) => number)
  
  // Enable result caching with LRU strategy
  cache?: 'lru' | 'map'
  
  // Maximum cache size (default: 50)
  maxCacheSize?: number
  
  // Custom hash function for cache keys
  cacheKeyFn?: (input: unknown) => string
}
```

## Returns

```ts
interface UseWorkerReturn<T extends WorkerModule> {
  // Run a task in the worker
  run: (input: T['Input'], options?: WorkerRunOptions) => Promise<T['Output']>
  
  // Pre-create the worker without running a task
  warmup: () => Promise<void>
  
  // Reactive state
  loading: Ref<boolean>
  progress: Ref<number>
  result: Ref<T['Output'] | null>
  error: Ref<Error | null>
  chunks: Ref<Array<T['Output']>>
  
  // Terminate the worker
  terminate: () => void
}
```

## Usage

### Basic Example

```vue
<script setup lang="ts">
import { useWorker } from 'vue-worker-kit'

const { run, loading, result, error } = useWorker<
  typeof import('./workers/compute.worker')
>(() => new Worker(new URL('./workers/compute.worker', import.meta.url)))

async function compute() {
  try {
    const value = await run({ data: [1, 2, 3] })
    console.log('Result:', value)
  } catch (err) {
    console.error('Error:', err)
  }
}
</script>
```

### With Progress Tracking

```ts
const { run, progress } = useWorker<typeof import('./process.worker')>(/* ... */)

await run(largeDataset, {
  onProgress: (p) => {
    console.log(`Progress: ${p}%`)
  }
})

// Or use reactive ref
watch(progress, (p) => {
  if (p > 0) console.log(`${p}% complete`)
})
```

### With Cancellation

```ts
const controller = new AbortController()

const { run } = useWorker(/* ... */)

try {
  await run(data, { signal: controller.signal })
} catch (err) {
  if (err.name === 'AbortError') {
    console.log('Task was cancelled')
  }
}

// Cancel the task
controller.abort()
```

### With Zero-Copy Transfer

```ts
const { run } = useWorker<typeof import('./image.worker')>(/* ... */)

const imageData = new Uint8ClampedArray(1920 * 1080 * 4)

await run(imageData, {
  transfer: [imageData.buffer] // Zero-copy transfer!
})
```

### With Retry Strategy

```ts
const { run } = useWorker(/* ... */, {
  retries: 3,
  retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000) // Exponential backoff
})

// Will retry up to 3 times with increasing delays
await run(unreliableData)
```

### With Result Caching

```ts
const { run } = useWorker(/* ... */, {
  cache: 'lru',
  maxCacheSize: 100
})

// First call - executes in worker
const result1 = await run(expensiveInput)

// Second call with same input - returns cached result instantly
const result2 = await run(expensiveInput) // From cache!
```

### Warmup

Pre-create the worker to reduce latency on first run:

```ts
const { warmup, run } = useWorker(/* ... */)

// Create worker immediately (e.g., on component mount)
onMounted(async () => {
  await warmup()
  console.log('Worker ready!')
})

// Later, when needed - no creation latency
await run(data)
```

## Error Handling

Workers can throw errors that are caught and exposed via the `error` ref:

```ts
const { run, error } = useWorker(/* ... */)

try {
  await run(invalidData)
} catch (err) {
  console.error('Worker error:', err)
}

// Or watch the error ref
watch(error, (err) => {
  if (err) showErrorNotification(err.message)
})
```

## SSR Safety

useWorker is SSR-safe and won't throw errors during server-side rendering:

```ts
// Safe to use in Nuxt/SSR contexts
const { run } = useWorker(/* ... */)

// Worker is only created when run() or warmup() is called
// which should be guarded with import.meta.client
if (import.meta.client) {
  await warmup()
}
```

## Related

- [createWorkerPool()](/api/createWorkerPool) - Create a pool of workers
- [useWorkerComputed()](/api/useWorkerComputed) - Reactive computed in worker
- [WorkerRunOptions](/api/types#workerrunoptions) - Options for run()
- [Warmup Guide](/guide/warmup) - Learn about worker warmup
