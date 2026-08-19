<div align="center" style="background:#111827;border-radius:20px;padding:28px 20px 20px;margin-bottom:32px">
  <h1 style="color:#f9fafb;margin:0 0 32px;font-size:2.2em;letter-spacing:-0.03em;font-weight:700;font-family:sans-serif">
    vue-worker-kit
  </h1>
  <img
    src="https://s3.twcstorage.ru/c9a2cc89-780f97fd-311d-4a1a-b86f-c25665c9dc46/images/npm/vue-worker-kit.webp"
    alt="vue-worker-kit"
    style="max-width:100%;width:auto;height:300px;border-radius:12px"
  />
</div>

[![CI](https://github.com/macrulezru/vue-worker-kit/actions/workflows/ci.yml/badge.svg)](https://github.com/macrulezru/vue-worker-kit/actions/workflows/ci.yml)

Type-safe Web Worker composables for Vue 3 — `useWorker()`, a worker pool, and a reactive `useWorkerComputed()`, with input/output types inferred straight from the worker file itself. Zero runtime dependencies beyond Vue.

---

## Contents

- [The problem](#the-problem)
- [`async`/`await` vs. a real thread](#asyncawait-vs-a-real-thread)
- [Quick start](#quick-start)
- [Demo](#demo)
- [How the type inference works](#how-the-type-inference-works)
- [API reference](#api-reference)
  - [`defineWorkerHandler()`](#defineworkerhandler)
  - [`useWorker()`](#useworker)
  - [`createWorkerPool()` / `useWorkerPool()`](#createworkerpool--useworkerpool)
  - [`useWorkerComputed()`](#useworkercomputed)
  - [`useSharedWorker()`](#usesharedworker)
  - [Devtools](#devtools)
- [Advanced features](#advanced-features)
  - [Transferables](#transferables)
  - [Streaming / Chunked Results](#streaming--chunked-results)
  - [Cancellation](#cancellation)
  - [Retry Strategy with Backoff](#retry-strategy-with-backoff)
  - [Memoization / Result Cache](#memoization--result-cache)
- [Error handling](#error-handling)
- [Worker lifecycle](#worker-lifecycle)
  - [Warmup](#warmup)
- [SSR / Nuxt](#ssr--nuxt)
- [Bundler support](#bundler-support)
- [Benchmark Suite](#benchmark-suite)
- [Comparison](#comparison)

---

## The problem

Existing Vue wrappers around Web Workers (`vue-worker`, `vue-web-workers`, and similar) are Vue 2-era plugins: no types, no Composition API, no pool, no transferables, disposable workers built by serializing a function to a string. [Comlink](https://github.com/GoogleChromeLabs/comlink) gives you a solid RPC protocol, but typing it is manual (`Comlink.wrap<MyAPI>()`), with no Vue reactivity and no component-lifecycle integration.

This package's one distinguishing idea: **end-to-end typing without duplicating generics.** The worker function's input/output type is inferred from the worker file itself via `typeof import(...)`, not written out by hand on both sides.

## `async`/`await` vs. a real thread

Worth being explicit about, because it's easy to assume `async`/`await` already solves this: **`async`/`await` does not move work off the JS thread.** JavaScript (outside of workers) always runs on a single thread, regardless of how much `async`/`await` you sprinkle on it.

There are two genuinely different situations people call "async":

- **Waiting on I/O** — `fetch`, `setTimeout`, any promise backed by a browser/OS API. The actual waiting happens outside JS (in the network stack, the OS timer), so the main thread really is free during the `await`. No worker needed here, ever.
- **A CPU-bound computation** — your own loop, a sort, a parse. Wrapping it in an `async function` changes nothing: the loop still runs synchronously, on the same thread that's also trying to render your UI and handle clicks. The only way to keep the UI responsive without a worker is to manually chop the loop into pieces and yield (`await new Promise(r => setTimeout(r))`) between them — which is exactly what `defineWorkerHandler`'s `ctx.reportProgress`/`ctx.signal` pattern is for *inside* a worker, but doesn't buy you anything if you do it on the main thread instead: it's still the same thread, just interleaving smaller slices of the same total work with rendering.

A `Worker` is a genuinely separate OS thread. That's the actual, structural difference from `async`/`await`:

- The main thread is **100% free** for the entire computation — no manual chunking/yielding required just to keep the UI alive (you'd still chunk if you want progress reporting or cancellation, but that's optional, not load-bearing for responsiveness).
- It is **not automatically faster** in wall-clock terms — `postMessage`/structured-clone and worker startup have real cost, and for a short computation a plain main-thread run can easily finish sooner. The point of a worker isn't raw speed; it's that the work no longer competes with your UI for the same thread. `createWorkerPool()` is the one place where you *do* get real speed from parallelism — multiple workers genuinely computing on different CPU cores at once.

## Quick start

```bash
npm install vue-worker-kit
```

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

## Demo

An interactive demo (`demo/`) covers every composable against a real browser, not just unit tests: `useWorker` vs. main-thread with a "longest UI freeze" metric (not a completion-time race — see [`async`/`await` vs. a real thread](#asyncawait-vs-a-real-thread) for why that would be misleading), transferables, real parallel speedup via `createWorkerPool`, `useWorkerComputed`, error handling, and `useSharedWorker`. For the last one, open a second tab from inside the demo: `portCount` updates live in both, and a `workerInstanceId` — generated once by the worker itself, not per tab — matches in both, concrete proof they share one worker instance.

```bash
git clone https://github.com/macrulezru/vue-worker-kit.git
cd vue-worker-kit/demo
npm install
npm run dev
```

## How the type inference works

`typeof import('./heavy-sort.worker')` is a **type-only** expression — TypeScript erases it at compile time. It does not import the worker file's code into the main bundle; the worker is only ever loaded via `new URL(..., import.meta.url)`, as its own chunk. `defineWorkerHandler()` returns a phantom-typed marker (`__input`/`__output` fields that never exist at runtime); `useWorker`/`createWorkerPool` read `In`/`Out` off of that marker through a conditional type. The result: `run()`'s signature is exactly `(input: In, options?: RunOptions) => Promise<Out>`, without either side writing a manual generic for the data shape.

## API reference

### `defineWorkerHandler()`

Worker-side. Wires the `run`/`cancel` message protocol automatically — you only write the handler function.

```ts
import { defineWorkerHandler, type WorkerContext } from 'vue-worker-kit/worker'

export default defineWorkerHandler(async (input: In, ctx: WorkerContext): Promise<Out> => {
  // ...
})
```

`ctx: WorkerContext`:

| Field | Type | Description |
|---|---|---|
| `signal` | `AbortSignal` | Aborted when the task is cancelled from the main thread — checking it is optional, cancellation is cooperative |
| `reportProgress(value)` | `(0..1) => void` | Sends progress to the main thread, throttled to ~20 messages/sec |
| `transfer(...transferables)` | `(...Transferable[]) => void` | Marks objects to send back zero-copy with the result instead of structured-clone copying — see [Transferables](#transferables) |
| `reportChunk(chunk)` | `(chunk: unknown) => void` | Sends an intermediate result, unthrottled — see [Streaming / Chunked Results](#streaming--chunked-results) |

`defineWorkerHandler` only starts a message loop when it actually runs inside a dedicated- or shared-worker global scope (checked via `self instanceof DedicatedWorkerGlobalScope`/`SharedWorkerGlobalScope`). Importing the file anywhere else — e.g. accidentally from the main bundle — is a no-op. The same file works for both `new Worker(...)` (via `useWorker()`/`createWorkerPool()`) and `new SharedWorker(...)` (via `useSharedWorker()`) — see [`useSharedWorker()`](#usesharedworker).

You don't need to call `reportProgress(1)` yourself right before returning — a final, unthrottled progress update of `1` is always sent right before the result, regardless of what your last throttled call was. Without this, a handler that only reports at periodic checkpoints (e.g. every 5%) could leave the main thread's `progress` stuck below `1` forever, since the checkpoint closest to the end can land inside the previous call's throttle window and get silently dropped.

### `useWorker()`

Main-thread composable, wraps a single lazily-created worker.

```ts
const { run, isRunning, progress, error, cancel, warmup } = useWorker<typeof import('./x.worker')>(
  () => new Worker(new URL('./x.worker.ts', import.meta.url), { type: 'module' }),
  { idleTimeout: 30_000, retries: 0 },
)

// Optional: pre-create the worker without running a task (avoids cold-start latency on first run)
await warmup()

const output = await run(input, { transfer: [input.buffer], signal: controller.signal })
```

Options:

| Option | Type | Default | Description |
|---|---|---|---|
| `idleTimeout` | `number \| false` | `30000` | Worker self-terminates after this many ms idle (frees memory); the next `run()` transparently recreates it |
| `retries` | `number` | `0` | Automatic retries on rejection — never applied to cancellations (`AbortError` always rejects immediately) |
| `retryDelay` | `(attempt: number) => number` | — | Delay before each retry — see [Retry Strategy with Backoff](#retry-strategy-with-backoff) |
| `hardCancelOnAbort` | `boolean` | `false` | On `abort()`, terminate and recreate the worker immediately instead of waiting for cooperative `ctx.signal` handling |
| `cache` | `{ cache: 'lru', maxCacheSize?: number }` | — | Memoizes results by input — see [Memoization / Result Cache](#memoization--result-cache) |
| `streaming` | `boolean` | `false` | Enables `ctx.reportChunk()`/`chunks` — see [Streaming / Chunked Results](#streaming--chunked-results) |

Returns:

- `run(input, options?) => Promise<Output>` — `options: { transfer?: Transferable[], signal?: AbortSignal }`
- `isRunning: ComputedRef<boolean>`, `progress: ShallowRef<number>`, `error: ShallowRef<WorkerError | null>`
- `cancel()` — aborts the current `run()` call(s) that didn't receive their own `signal`
- `warmup(): Promise<void>` — pre-creates the worker without executing a task (useful for avoiding cold-start latency)
- `chunks?: ShallowRef<unknown[]>` — present only when `streaming: true` (see [Streaming / Chunked Results](#streaming--chunked-results))
- automatic `terminate()` on `onScopeDispose` when called inside an active effect scope

`run()`'s input is passed through `toRaw()` before being posted — a `ref`/`reactive` value read straight off a component (`() => list.value`) is not structured-cloneable as a live Proxy, so the raw snapshot is what actually gets sent.

### `createWorkerPool()` / `useWorkerPool()`

For many small, independent tasks (resizing hundreds of images, etc.) — `vue-worker-kit/pool`.

```ts
import { createWorkerPool } from 'vue-worker-kit/pool'

const pool = createWorkerPool<typeof import('./resize.worker')>(() =>
  new Worker(new URL('./resize.worker.ts', import.meta.url), { type: 'module' }),
)

// Pre-create all workers up to size (optional, avoids cold-start latency on first tasks)
await pool.warmup()

// Process array with per-item transfer and global cancellation signal
const thumbnails = await pool.map(files, {
  concurrency: 4,
  transfer: (file) => [file.buffer],  // zero-copy per item
  signal: abortController.signal,     // cancel all running tasks
})

const one = await pool.run(files[0])
```

- `pool.run(input, options?)` — queues the task on the first free worker, `options: { transfer?: Transferable[], signal?: AbortSignal }`
- `pool.map(items, options?)` — processes array with bounded parallelism, results in input order. Options:
  - `concurrency?: number` — max parallel tasks (default: `pool.size`)
  - `transfer?: (item: T) => Transferable[]` — per-item zero-copy transfer function
  - `signal?: AbortSignal` — global cancellation signal for all items
- `pool.stats: ComputedRef<{ busy: number; idle: number; queued: number }>` — reactive, used by the devtools panel
- `pool.terminate()` — kills the whole pool
- `pool.warmup(): Promise<void>` — pre-creates all workers up to `size` without executing tasks
- workers are created lazily, up to `size`, as tasks arrive — not all at once
- `size` (option) defaults to `navigator.hardwareConcurrency` — the browser's own count of logical cores/threads on the machine actually running your app, not a number picked at development time. Pass `size` explicitly to override it (e.g. to cap it, or if `navigator` reports something you don't want to trust — some privacy-hardened browsers cap or round it). Falls back to `4` where `navigator` doesn't exist (SSR).
- `useWorkerPool()` is the same API with `onScopeDispose` auto-termination for use directly in `setup()`

### `useWorkerComputed()`

`vue-worker-kit/computed`. A `computed()` that recalculates inside a worker whenever its reactive source changes, with stale runs discarded automatically.

```ts
import { useWorkerComputed } from 'vue-worker-kit/computed'

const sorted = useWorkerComputed<typeof import('./heavy-sort.worker')>(
  () => new Worker(new URL('./heavy-sort.worker.ts', import.meta.url), { type: 'module' }),
  () => list.value, // tracked like a watchEffect source
  { debounce: 150 },
)

// sorted.value — undefined until the first result, then the latest CURRENT result
// sorted.isRunning, sorted.error
```

Race handling: every run gets an internal generation number. If the source changes again before a run's result arrives, that result is simply dropped on arrival (never rolls `sorted.value` back to a stale value), and the superseded run's `ctx.signal` is aborted (cooperative — the handler decides whether to check it). `debounce` (ms) prevents firing the worker on every reactive tick (e.g. on each keystroke).

### `useSharedWorker()`

`vue-worker-kit/shared` — reuses a single `SharedWorker` across every tab/window of the same origin that connects to it, instead of one worker per tab.

```ts
import { useSharedWorker } from 'vue-worker-kit/shared'

const { run, connect, disconnect, portCount } = useSharedWorker<typeof import('./shared.worker')>(
  () => new SharedWorker(new URL('./shared.worker.ts', import.meta.url), { type: 'module' }),
)

// Optional — run() connects lazily on its own; call this to connect ahead of time.
connect()

const result = await run(data)

// Closes this tab's port. Does NOT terminate the worker — other tabs stay connected to it.
disconnect()
```

- `connect(): void` — establishes this tab's connection (idempotent; `run()` also calls it lazily if you skip this)
- `disconnect(): void` — closes this tab's port only; the shared worker keeps running for every other connected tab. Called automatically on `onScopeDispose` when used inside `setup()`.
- `portCount: Ref<number>` — number of tabs the worker has seen connect, as last broadcast by the worker itself. **Best-effort**: a `MessagePort` has no platform-level "the other end went away" notification, so this only decrements on a cooperative `disconnect()` call — a crashed or force-closed tab is never subtracted.
- `run(input, options?)`, `isRunning`, `progress`, `error`, `cancel()` — same semantics as `useWorker()`
- Options: `retries`, `retryDelay`, `cache`, `streaming` — same as `useWorker()`. There is no `idleTimeout`/`hardCancelOnAbort`: a shared worker's lifetime isn't owned by any single tab, so `connect()`/`disconnect()` is the whole lifecycle story, not an idle timer.
- **Browser support**: Chrome, Firefox, Edge Desktop. ❌ Not supported in Safari iOS or Chrome Android — no `SharedWorker` constructor exists there at all. `connect()`/`run()` throw `WorkerUnavailableError` in that case, the same way `useWorker()` does under SSR.

The worker-side file is a normal `defineWorkerHandler()` module — the exact same file works with both `new Worker(...)` (via `useWorker()`) and `new SharedWorker(...)` (via `useSharedWorker()`); it doesn't need to know which one it's running under.

```ts
// shared.worker.ts
import { defineWorkerHandler } from 'vue-worker-kit/worker'

export default defineWorkerHandler(async (data: In, ctx) => {
  return processData(data)
})
```

### Devtools

`vue-worker-kit/devtools` — a standalone debug panel, no `@vue/devtools-api` dependency (keeps the package dependency-free).

```ts
import { createWorkerActivityMonitor, WorkerActivityPanel } from 'vue-worker-kit/devtools'

const monitor = createWorkerActivityMonitor(pool) // or a single useWorker()/useSharedWorker() instance
```

```vue
<WorkerActivityPanel :monitor="monitor" />
```

Shows busy/idle worker counts, queue length, average task time, and the last N errors — reactive, driven by an internal subscription (no polling).

## Advanced features

### Transferables

Into the worker, via `RunOptions.transfer`:

```ts
const buffer = new ArrayBuffer(1024 * 1024)
const result = await run(buffer, { transfer: [buffer] })
// buffer.byteLength === 0 immediately — it was detached, not copied
```

Back out of the worker, via `ctx.transfer(...)` — the mirror of the above, for a handler that wants to hand back a large buffer (e.g. a resized image, an `OffscreenCanvas`-rendered frame) without copying it:

```ts
// resize.worker.ts
export default defineWorkerHandler((input: ResizeInput, ctx) => {
  const output = resize(input) // produces a fresh ArrayBuffer
  ctx.transfer(output) // sent back zero-copy instead of structured-clone copied
  return output
})
```

`ctx.transfer()` doesn't require the transferred object to be part of the returned value — call it with whatever transferables should ride along with the result. Safe to call more than once; every object passed across all calls is included.

### Streaming / Chunked Results

For large datasets where you want intermediate results without waiting for full completion:

```ts
import { useWorker } from 'vue-worker-kit'

const { run, chunks, isRunning } = useWorker<typeof import('./process.worker')>(
  () => new Worker(new URL('./process.worker.ts', import.meta.url), { type: 'module' }),
)

// Process large dataset with streaming results
const finalResult = await run(largeDataset)

// chunks.value contains all intermediate results as they arrive
watch(chunks, (newChunks) => {
  console.log('Received chunk:', newChunks[newChunks.length - 1])
})
```

Worker-side:

```ts
// process.worker.ts
import { defineWorkerHandler } from 'vue-worker-kit/worker'

export default defineWorkerHandler(async (items: LargeDataset[], ctx) => {
  const results: Result[] = []
  
  for (let i = 0; i < items.length; i += 100) {
    const batch = items.slice(i, i + 100)
    const processed = await processBatch(batch)
    
    // Send intermediate result immediately
    ctx.reportChunk(processed)
    
    results.push(...processed)
    
    if (ctx.signal.aborted) throw ctx.signal.reason
  }
  
  return results // Final result
})
```

- `chunks: ShallowRef<unknown[]>` — reactive array of all reported chunks
- `ctx.reportChunk(data)` — sends partial result to main thread (unthrottled)
- Chunks accumulate in order; final result is separate from chunks
- Useful for progressive rendering, real-time updates, or memory-efficient processing

## Cancellation

```ts
const controller = new AbortController()
const promise = run(input, { signal: controller.signal })
controller.abort() // promise rejects with AbortError, immediately — regardless of what the worker does
```

If you don't pass your own `signal`, `run()` creates one internally; `cancel()` aborts it. `retries` never applies to an aborted run.

### Retry Strategy with Backoff

For transient failures, configure automatic retries with exponential backoff:

```ts
import { useWorker } from 'vue-worker-kit'

const { run, error } = useWorker<typeof import('./api.worker')>(
  () => new Worker(new URL('./api.worker.ts', import.meta.url), { type: 'module' }),
  {
    retries: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000), // 1s, 2s, 4s, capped at 10s
  },
)

// On failure, automatically retries with increasing delay
const result = await run(data)
```

- `retries: number` — max retry attempts (default: `0`, no retries)
- `retryDelay: number | ((attempt: number) => number)` — delay between retries
  - If `number`: constant delay in ms
  - If function: dynamic delay based on attempt number (1-indexed)
- Retries only apply to **non-abort** errors (`AbortError` rejects immediately)
- Common pattern: exponential backoff with jitter for API calls or flaky operations

```ts
// Advanced: exponential backoff with random jitter
{
  retries: 5,
  retryDelay: (attempt) => {
    const baseDelay = 1000 * 2 ** attempt
    const jitter = Math.random() * 1000
    return Math.min(baseDelay + jitter, 30000)
  },
}
```

### Memoization / Result Cache

For pure worker functions (same input → same output), enable LRU caching:

```ts
import { useWorker } from 'vue-worker-kit'

const { run } = useWorker<typeof import('./hash.worker')>(
  () => new Worker(new URL('./hash.worker.ts', import.meta.url), { type: 'module' }),
  {
    cache: { cache: 'lru', maxCacheSize: 100 }, // keep the last 100 results
  },
)

// First call — executes in worker
const hash1 = await run(data)

// Second call with the same input (compared via JSON.stringify) — returns the cached
// result instantly, no worker invocation, no postMessage round-trip
const hash2 = await run(data) // hash1 === hash2
```

Options (`cache: UseWorkerCacheOptions`):
- `cache: 'lru'` — enable the LRU cache (unset/omitted disables it)
- `maxCacheSize: number` — max entries before evicting the oldest (default: `50`)

The cache key is `JSON.stringify(input)` (exported as `createCacheKey()` if you want to reason about collisions yourself) — inputs that stringify the same (including object key order) share a cache entry.

`useWorkerComputed()` doesn't have a `cache` option — its own generation-number mechanism already discards stale/superseded results, and its `source()` typically produces a fresh input on every reactive tick anyway, so key-based memoization wouldn't have much to hit.

## Error handling

- A thrown error inside the handler is serialized as `{ name, message, stack }` and reconstructed on the main thread as a `WorkerError`. `.workerStack` is the original in-worker stack; `.cause` is a synthetic error created at the `run()` call site (before crossing into the worker) — so both ends of the failure show up together in the console/Sentry.
- A protocol-level failure (e.g. an object that doesn't structured-clone) becomes a `WorkerError` with `name: 'DataCloneError'`, not an unhandled exception.
- `WorkerUnavailableError` is thrown instead of a raw `ReferenceError: Worker is not defined` when `run()` is called somewhere with no global `Worker` (typically SSR) — it is never wrapped or retried.

## Worker lifecycle

- **Idle timeout** — a worker idle longer than `idleTimeout` is terminated; the next `run()` transparently spins up a new one (small latency on the first call after idling — expected).
- **Scope-based auto-termination** — `useWorker`/`useWorkerPool` called inside `setup()` terminate their worker(s) on `onScopeDispose`, avoiding the classic SPA-navigation leak.
- **Pool workers are lazy** — created as tasks arrive, up to `size`, not all at `createWorkerPool()` time.

### Warmup

To avoid cold-start latency on the first task, you can pre-create workers without executing any work:

```ts
// Single worker
const { warmup, run } = useWorker<typeof import('./x.worker')>(() =>
  new Worker(new URL('./x.worker.ts', import.meta.url), { type: 'module' }),
)
await warmup() // Worker is now instantiated and ready
const result = await run(data) // No worker creation delay

// Pool - pre-create all workers up to size
const pool = createWorkerPool<typeof import('./resize.worker')>(() =>
  new Worker(new URL('./resize.worker.ts', import.meta.url), { type: 'module' }),
  { size: 4 },
)
await pool.warmup() // All 4 workers are now instantiated
const results = await pool.map(items) // Immediate execution, no cold starts
```

Warmup is useful when you know a worker-intensive operation is about to happen (e.g., user clicks "Process" button) and you want to eliminate the ~50-200ms worker creation latency. Call it during idle time (e.g., `onMounted`, or after initial page load) to keep interactions snappy.

## SSR / Nuxt

`useWorker`/`useWorkerComputed`/`useWorkerPool` are safe to call in `setup()` on the server — the constructor is passed as a factory (`() => new Worker(...)`) and only invoked from inside `run()`, i.e. only on the client in normal usage. If `run()` is nonetheless called during SSR, you get a `WorkerUnavailableError` with a clear message rather than a crash. Guard client-only usage with `<ClientOnly>` in Nuxt:

```vue
<ClientOnly>
  <ProgressBar v-if="isRunning" :value="progress" />
</ClientOnly>
```

## Bundler support

No `worker-loader`/`worker-plugin` or other webpack-era workarounds needed — this uses the native ESM worker import (`new URL('./x.worker.ts', import.meta.url)` + `{ type: 'module' }`), which Vite (and Nuxt 3/4) picks up and bundles as its own chunk automatically. If you're on classic Webpack (Vue CLI), you'll need `worker-plugin` or equivalent — that's a bundler limitation, not this package's.


## Benchmark Suite

`npm run benchmark` (`benchmark/heavy-computation.bench.ts`, via [tinybench](https://github.com/tinylibs/tinybench)) compares a CPU-bound task (naive recursive `fib(30..34)`) run on the main thread vs. a single worker thread vs. a 4-thread pool — via `node:worker_threads`, since this runs under Node (`tsx`), not a browser. It's a sanity check of the pool's real parallel speedup, not a benchmark of this package's own composables (those add negligible overhead on top of raw `postMessage`, which is what's actually being measured here).

Example run on this machine (results vary by hardware/load — run it yourself for numbers that mean anything on your machine):

| Task | Ops/sec | Avg time |
|---|---|---|
| Main thread | 7.4 | 135ms |
| Single worker thread | 5.8 | 173ms |
| Pool of 4 worker threads | 9.1 | 111ms |

Single-worker is slower than main thread here — expected: `postMessage`/thread-startup overhead on a task that isn't parallelized. The pool is faster because 8 tasks genuinely run across 4 threads at once, not because any one worker is faster than the main thread.

## Comparison

`vue-worker` (latest `1.2.1`, published 2017) and `vue-web-workers` (latest `0.2.0`, published 2020, depends on `vue@^2.6.11` directly) are both effectively unmaintained Vue 2 plugins — verified against the npm registry, not from memory. [Comlink](https://github.com/GoogleChromeLabs/comlink) (`4.4.2`, still actively maintained, zero dependencies) is a solid, Vue-agnostic RPC layer.

| | `vue-worker` / `vue-web-workers` | Comlink | vue-worker-kit |
|---|---|---|---|
| Composition API | ✗ | — (not Vue-specific) | ✓ |
| Typed input/output | ✗ | manual `wrap<T>()` | inferred from the worker file |
| Worker pool | ✗ | ✗ | ✓ (`createWorkerPool`, `pool.map` with per-item transfer) |
| Reactive computed-in-worker | ✗ | ✗ | ✓ (`useWorkerComputed`) |
| SharedWorker (multi-tab) | ✗ | ✗ | ✓ (`useSharedWorker`) |
| Streaming results | ✗ | ✗ | ✓ (`ctx.reportChunk`, `chunks.value`) |
| Cancellation | ✗ | ✗ | ✓ (`AbortSignal`, per-task + global for pool) |
| Transferables | ✗ | ✓ (manual, both directions) | ✓ (`RunOptions.transfer` in, `ctx.transfer()` out, per-item for pool.map) |
| Worker warmup | ✗ | ✗ | ✓ (`warmup()` for single worker and pool) |
| Retry with backoff | ✗ | ✗ | ✓ (configurable delay function) |
| Result caching (LRU) | ✗ | ✗ | ✓ (`cache: 'lru'`, `maxCacheSize`) |
| SSR-safe | ✗ | — | ✓ |
| Dependencies | — | none | none beyond `vue` |

---

## License

MIT

---

## Author

Danil Lisin Vladimirovich aka Macrulez

GitHub: [macrulezru](https://github.com/macrulezru) · Website: [macrulez.ru/en](https://macrulez.ru/en)

Questions and bugs — [issues](https://github.com/macrulezru/vue-worker-kit/issues)

---

## 💖 Support the project

Open source takes time and effort. If my work saves you time or brings value, consider supporting further development.

<a href="https://donate.cryptocloud.plus/M6O34NIN" target="_blank">
  <img src="https://img.shields.io/badge/Donate-CryptoCloud-8A2BE2?style=for-the-badge&logo=cryptocurrency&logoColor=white" alt="Donate via CryptoCloud">
</a>

Thank you for being part of this journey. ❤️