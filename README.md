# **Worker Kit**

![Worker Kit](https://github.com/macrulezru/assets/blob/master/packages-images/vue-worker-kit.png?raw=true)

Type-safe Web Worker composables for Vue 3 — `useWorker()`, a worker pool, and a reactive `useWorkerComputed()`, with input/output types inferred straight from the worker file itself. Zero runtime dependencies beyond Vue.

---

## Features

- **`useWorker()`** — type-safe composable wrapping a single Web Worker; input/output types inferred from `typeof import('./x.worker')`, no manual generics on either side
- **`createWorkerPool()` / `useWorkerPool()`** — a lazily-grown pool (default size: `navigator.hardwareConcurrency`) for many small, independent tasks; `pool.run()`/`pool.map()` with bounded concurrency
- **`useWorkerComputed()`** — a `computed()` that recalculates inside a worker on every reactive source change; superseded/stale runs are discarded automatically via a generation number
- **`useSharedWorker()`** — reuses one `SharedWorker` across every tab/window of the same origin, instead of one worker per tab
- **`defineWorkerHandler()`** — worker-side helper that wires the run/cancel message protocol automatically; you only write the handler function
- **Transferables** — zero-copy transfer into the worker (`RunOptions.transfer`) and back out (`ctx.transfer()`), for large buffers like images or `OffscreenCanvas` frames
- **Streaming / chunked results** — `ctx.reportChunk()` sends intermediate results while a long task is still running, collected reactively in `chunks`
- **Cancellation** — `AbortSignal` support, cooperative via `ctx.signal`; `run()` rejects immediately regardless of what the worker is doing
- **Retry with backoff** — `retries`/`retryDelay` options retry non-abort failures automatically, with a constant or attempt-based delay
- **Memoization / result cache** — opt-in LRU cache keyed by `JSON.stringify(input)`, skips the worker round-trip entirely for a repeated input
- **Warmup** — pre-create a worker (or a whole pool) ahead of time to eliminate the ~50-200ms cold-start latency on the first real task
- **Worker lifecycle management** — idle-timeout termination, scope-based auto-termination on `onScopeDispose` (no SPA-navigation leaks), lazily-created pool workers
- **Devtools panel** — `vue-worker-kit/devtools`'s `<WorkerActivityPanel>` shows busy/idle counts, queue length, average task time, and recent errors — no `@vue/devtools-api` dependency
- **Structured error handling** — a thrown worker error becomes a `WorkerError` with the original in-worker stack preserved as `.workerStack`; a `DataCloneError` for values that can't structured-clone; a `WorkerUnavailableError` instead of a raw `ReferenceError` under SSR
- **End-to-end type inference** — the worker function's input/output type is inferred from the worker file itself via `typeof import(...)`, not duplicated by hand on both sides
- **Zero runtime dependencies beyond Vue**

---

## The problem

Existing Vue wrappers around Web Workers (`vue-worker`, `vue-web-workers`, and similar) are Vue 2-era plugins: no types, no Composition API, no pool, no transferables, disposable workers built by serializing a function to a string. [Comlink](https://github.com/GoogleChromeLabs/comlink) gives you a solid RPC protocol, but typing it is manual (`Comlink.wrap<MyAPI>()`), with no Vue reactivity and no component-lifecycle integration.

This package's one distinguishing idea: **end-to-end typing without duplicating generics.** The worker function's input/output type is inferred from the worker file itself via `typeof import(...)`, not written out by hand on both sides.

**`async`/`await` does not move work off the JS thread.** JavaScript (outside of workers) always runs on a single thread, regardless of how much `async`/`await` you sprinkle on it. A `Worker` is a genuinely separate OS thread — the main thread stays 100% free for the entire computation, no manual chunking/yielding required just to keep the UI alive. `createWorkerPool()` is where you get real speed from parallelism — multiple workers genuinely computing on different CPU cores at once.

`typeof import('./heavy-sort.worker')` is a **type-only** expression — TypeScript erases it at compile time. It does not import the worker file's code into the main bundle; the worker is only ever loaded via `new URL(..., import.meta.url)`, as its own chunk. The result: `run()`'s signature is exactly `(input: In, options?: RunOptions) => Promise<Out>`, without either side writing a manual generic for the data shape.

---

## Installation

Vue is a required peer dependency — this package has no framework-agnostic core, every entry point is a Vue composable or a Vue-consumable worker-side helper.

| Environment | Minimum version                        |
| ----------- | -------------------------------------- |
| Node.js     | `^20.19.0 \|\| ^22.13.0 \|\| >=24.0.0` |
| Vue         | `^3.4.0` (required)                    |

```bash
npm install vue-worker-kit
```

No peer dependencies beyond `vue` itself.

### Quick start

```ts
// heavy-sort.worker.ts
import { defineWorkerHandler } from 'vue-worker-kit/worker'

export default defineWorkerHandler(async (data: number[], ctx) => {
  for (let i = 0; i < data.length; i++) {
    if (ctx.signal.aborted) throw ctx.signal.reason
    if (i % 10_000 === 0) ctx.reportProgress(i / data.length)
  }
  return data.sort((a, b) => a - b)
})
```

```ts
// component setup()
import { useWorker } from 'vue-worker-kit'

const { run, isRunning, progress, error, cancel } = useWorker<typeof import('./heavy-sort.worker')>(
  () => new Worker(new URL('./heavy-sort.worker.ts', import.meta.url), { type: 'module' }),
)

const sorted = await run(hugeArray, { transfer: [hugeArray.buffer] })
// sorted: number[] — inferred from heavy-sort.worker.ts, no generic annotation needed
```

### More examples

#### Intermediate results, not just the final one

With `streaming: true` the worker reports chunks as it goes via `ctx.reportChunk()` — `chunks` updates reactively while the final result is still pending.

```ts
import { useWorker } from 'vue-worker-kit'

const { run, chunks, isRunning } = useWorker<typeof import('./process.worker')>(
  () => new Worker(new URL('./process.worker.ts', import.meta.url), { type: 'module' }),
  { streaming: true }, // required — without it `chunks` is undefined, not a ref
)

const finalResult = await run(largeDataset)

watch(chunks, (newChunks) => {
  console.log('Received chunk:', newChunks.at(-1))
})

// Worker-side calls ctx.reportChunk(data) as it processes each batch —
// chunks.value fills in progressively while run() is still pending.
```

---

## Documentation & links

- 📖 **Full documentation:** [npm.vuecraft.ru/en/packages/vue-worker-kit](https://npm.vuecraft.ru/en/packages/vue-worker-kit/guide/overview.html)
- 🌐 **VueCraft:** [vuecraft.ru/en](https://vuecraft.ru/en)
- 👤 **Author:** [macrulez.ru/en](https://macrulez.ru/en)
- 💻 **GitHub:** [macrulezru/vue-worker-kit](https://github.com/macrulezru/vue-worker-kit)
- 📦 **NPM:** [vue-worker-kit](https://www.npmjs.com/package/vue-worker-kit)
- 🐛 **Issues:** [github.com/macrulezru/vue-worker-kit/issues](https://github.com/macrulezru/vue-worker-kit/issues)

---

## License

MIT

---

## 💖 Support the project

Open source takes time and effort. If this library saves you time or brings value, consider supporting further development.

<a href="https://donate.cryptocloud.plus/M6O34NIN" target="_blank">
  <img src="https://img.shields.io/badge/Donate-CryptoCloud-8A2BE2?style=for-the-badge&logo=cryptocurrency&logoColor=white" alt="Donate via CryptoCloud">
</a>

Thank you for being part of this journey. ❤️
