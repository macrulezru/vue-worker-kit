---
layout: home
hero:
  name: vue-worker-kit
  text: Type-safe Web Worker composables for Vue 3
  tagline: Zero dependencies, SSR-safe, full TypeScript support
  image:
    src: /logo.png
    alt: vue-worker-kit logo
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: View on GitHub
      link: https://github.com/macrulezru/vue-worker-kit

features:
  - icon: 🛡️
    title: Type-Safe
    details: Full TypeScript support with automatic type inference from worker files. No manual generic declarations needed.
  - icon: ⚡
    title: Zero Dependencies
    details: Pure Vue 3 composables with no runtime dependencies. Lightweight and tree-shakable.
  - icon: 🖥️
    title: SSR-Safe
    details: Built-in SSR guards prevent errors during server-side rendering. Works seamlessly with Nuxt.
  - icon: 🔥
    title: Worker Pool
    details: Efficient worker pool with lazy creation, concurrency control, and per-item transfer support.
  - icon: 🔄
    title: Streaming & Batch
    details: Stream large datasets with chunked results or process thousands of tasks with batch API.
  - icon: 🧩
    title: WASM Bridge
    details: Native WebAssembly integration with SharedArrayBuffer support for maximum performance.
---

# vue-worker-kit

**vue-worker-kit** provides type-safe, reactive composables for working with Web Workers in Vue 3 applications.

## Why Web Workers?

Web Workers allow you to run CPU-intensive tasks in background threads, keeping your UI responsive. However, working with them traditionally involves:

- ❌ Manual message passing with `postMessage` and `onmessage`
- ❌ No type safety between main thread and worker
- ❌ Complex state management for async operations
- ❌ Difficult error handling and cancellation

## Solution

vue-worker-kit solves these problems with:

- ✅ **Automatic type inference** - Types are derived from your worker file
- ✅ **Reactive composables** - `useWorker()`, `useWorkerPool()`, `useWorkerComputed()`
- ✅ **Built-in features** - Progress tracking, cancellation, retries, caching
- ✅ **Zero boilerplate** - Clean, intuitive API

## Quick Example

```ts
// Composable usage
const { run, progress, result } = useWorker<typeof import('./my.worker')>(
  () => new Worker(new URL('./my.worker', import.meta.url))
)

await run(largeDataset, { 
  signal: abortController.signal,
  transfer: [largeDataset.buffer] 
})
```

## Performance

See our [benchmark results](/guide/benchmarks) comparing main thread vs single worker vs worker pool.
