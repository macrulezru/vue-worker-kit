# What is vue-worker-kit?

**vue-worker-kit** is a type-safe library for working with Web Workers in Vue 3 applications. It provides reactive composables that make it easy to offload CPU-intensive tasks to background threads without blocking the UI.

## The Problem

Web Workers are essential for keeping your Vue app responsive when performing heavy computations, but they come with challenges:

- **No type safety**: Traditional workers use `postMessage` with no compile-time type checking
- **Boilerplate code**: Manual setup of message handlers, error handling, and state management
- **Complex patterns**: Implementing worker pools, cancellation, or progress tracking requires significant code
- **SSR issues**: Direct `Worker` usage causes errors during server-side rendering

## The Solution

vue-worker-kit solves these problems with:

### Type-Safe by Design

Types are automatically inferred from your worker file:

```ts
// types.ts in worker
export type Input = { data: number[] }
export type Output = { result: number[] }

// In your component - types are automatic!
const { run, result } = useWorker<typeof import('./my.worker')>(/* ... */)
// run() accepts Input, result.value is Output
```

### Reactive Composables

Built on Vue's Composition API for seamless integration:

```ts
const { loading, progress, result, error, run } = useWorker(/* ... */)
```

### Feature-Rich

Out-of-the-box support for:
- Worker pools with concurrency control
- Zero-copy transfers for large buffers
- Cancellation with AbortSignal
- Progress reporting
- Retry strategies with exponential backoff
- Result caching (LRU)
- Streaming/chunked results
- WASM integration
- SharedWorker for multi-tab apps

## Architecture

```
┌─────────────────┐     ┌──────────────────┐
│   Main Thread   │     │    Web Worker    │
│                 │     │                  │
│  useWorker()    │────▶│ defineWorker()   │
│  - reactive     │     │  - handler       │
│  - type-safe    │     │  - ctx.report()  │
│  - SSR-safe     │     │  - signal        │
└─────────────────┘     └──────────────────┘
```

## Next Steps

- [Getting Started](/guide/getting-started) - Install and create your first worker
- [Installation](/guide/installation) - Detailed installation guide
- [Core Concepts](/guide/useWorker) - Learn about useWorker() and other composables
