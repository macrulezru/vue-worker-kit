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

Type-safe Web Worker composables for Vue 3 — `useWorker()`, a worker pool, and a reactive `useWorkerComputed()`, with input/output types inferred straight from the worker file itself. Zero runtime dependencies beyond Vue.

---

## Contents

- [The problem](#the-problem)
- [`async`/`await` vs. a real thread](#asyncawait-vs-a-real-thread)
- [Quick start](#quick-start)
- [How the type inference works](#how-the-type-inference-works)
- [API reference](#api-reference)
  - [`defineWorkerHandler()`](#defineworkerhandler)
  - [`useWorker()`](#useworker)
  - [`createWorkerPool()` / `useWorkerPool()`](#createworkerpool--useworkerpool)
  - [`useWorkerComputed()`](#useworkercomputed)
  - [Devtools](#devtools)
- [Transferables](#transferables)
- [Cancellation](#cancellation)
- [Error handling](#error-handling)
- [Worker lifecycle](#worker-lifecycle)
- [SSR / Nuxt](#ssr--nuxt)
- [Bundler support](#bundler-support)
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

`defineWorkerHandler` only starts the message loop when it actually runs inside a `WorkerGlobalScope` (checked via `self instanceof WorkerGlobalScope`). Importing the file anywhere else — e.g. accidentally from the main bundle — is a no-op.

You don't need to call `reportProgress(1)` yourself right before returning — a final, unthrottled progress update of `1` is always sent right before the result, regardless of what your last throttled call was. Without this, a handler that only reports at periodic checkpoints (e.g. every 5%) could leave the main thread's `progress` stuck below `1` forever, since the checkpoint closest to the end can land inside the previous call's throttle window and get silently dropped.

### `useWorker()`

Main-thread composable, wraps a single lazily-created worker.

```ts
const { run, isRunning, progress, error, cancel } = useWorker<typeof import('./x.worker')>(
  () => new Worker(new URL('./x.worker.ts', import.meta.url), { type: 'module' }),
  { idleTimeout: 30_000, retries: 0 },
)

const output = await run(input, { transfer: [input.buffer], signal: controller.signal })
```

Options:

| Option | Type | Default | Description |
|---|---|---|---|
| `idleTimeout` | `number \| false` | `30000` | Worker self-terminates after this many ms idle (frees memory); the next `run()` transparently recreates it |
| `retries` | `number` | `0` | Automatic retries on rejection — never applied to cancellations (`AbortError` always rejects immediately) |
| `hardCancelOnAbort` | `boolean` | `false` | On `abort()`, terminate and recreate the worker immediately instead of waiting for cooperative `ctx.signal` handling |

Returns:

- `run(input, options?) => Promise<Output>` — `options: { transfer?: Transferable[], signal?: AbortSignal }`
- `isRunning: ComputedRef<boolean>`, `progress: ShallowRef<number>`, `error: ShallowRef<WorkerError | null>`
- `cancel()` — aborts the current `run()` call(s) that didn't receive their own `signal`
- automatic `terminate()` on `onScopeDispose` when called inside an active effect scope

`run()`'s input is passed through `toRaw()` before being posted — a `ref`/`reactive` value read straight off a component (`() => list.value`) is not structured-cloneable as a live Proxy, so the raw snapshot is what actually gets sent.

### `createWorkerPool()` / `useWorkerPool()`

For many small, independent tasks (resizing hundreds of images, etc.) — `vue-worker-kit/pool`.

```ts
import { createWorkerPool } from 'vue-worker-kit/pool'

const pool = createWorkerPool<typeof import('./resize.worker')>(() =>
  new Worker(new URL('./resize.worker.ts', import.meta.url), { type: 'module' }),
)

const thumbnails = await pool.map(files, { concurrency: pool.size })
const one = await pool.run(files[0])
```

- `pool.run(input, options?)` — queues the task on the first free worker
- `pool.map(items, { concurrency? })` — sugar over `pool.run()` per item, bounded parallelism, results in input order
- `pool.stats: ComputedRef<{ busy: number; idle: number; queued: number }>` — reactive, used by the devtools panel
- `pool.terminate()` — kills the whole pool
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

### Devtools

`vue-worker-kit/devtools` — a standalone debug panel, no `@vue/devtools-api` dependency (keeps the package dependency-free).

```ts
import { createWorkerActivityMonitor, WorkerActivityPanel } from 'vue-worker-kit/devtools'

const monitor = createWorkerActivityMonitor(pool) // or a single useWorker() instance
```

```vue
<WorkerActivityPanel :monitor="monitor" />
```

Shows busy/idle worker counts, queue length, average task time, and the last N errors — reactive, driven by an internal subscription (no polling).

## Transferables

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

## Cancellation

```ts
const controller = new AbortController()
const promise = run(input, { signal: controller.signal })
controller.abort() // promise rejects with AbortError, immediately — regardless of what the worker does
```

If you don't pass your own `signal`, `run()` creates one internally; `cancel()` aborts it. `retries` never applies to an aborted run.

## Error handling

- A thrown error inside the handler is serialized as `{ name, message, stack }` and reconstructed on the main thread as a `WorkerError`. `.workerStack` is the original in-worker stack; `.cause` is a synthetic error created at the `run()` call site (before crossing into the worker) — so both ends of the failure show up together in the console/Sentry.
- A protocol-level failure (e.g. an object that doesn't structured-clone) becomes a `WorkerError` with `name: 'DataCloneError'`, not an unhandled exception.
- `WorkerUnavailableError` is thrown instead of a raw `ReferenceError: Worker is not defined` when `run()` is called somewhere with no global `Worker` (typically SSR) — it is never wrapped or retried.

## Worker lifecycle

- **Idle timeout** — a worker idle longer than `idleTimeout` is terminated; the next `run()` transparently spins up a new one (small latency on the first call after idling — expected).
- **Scope-based auto-termination** — `useWorker`/`useWorkerPool` called inside `setup()` terminate their worker(s) on `onScopeDispose`, avoiding the classic SPA-navigation leak.
- **Pool workers are lazy** — created as tasks arrive, up to `size`, not all at `createWorkerPool()` time.

## SSR / Nuxt

`useWorker`/`useWorkerComputed`/`useWorkerPool` are safe to call in `setup()` on the server — the constructor is passed as a factory (`() => new Worker(...)`) and only invoked from inside `run()`, i.e. only on the client in normal usage. If `run()` is nonetheless called during SSR, you get a `WorkerUnavailableError` with a clear message rather than a crash. Guard client-only usage with `<ClientOnly>` in Nuxt:

```vue
<ClientOnly>
  <ProgressBar v-if="isRunning" :value="progress" />
</ClientOnly>
```

## Bundler support

No `worker-loader`/`worker-plugin` or other webpack-era workarounds needed — this uses the native ESM worker import (`new URL('./x.worker.ts', import.meta.url)` + `{ type: 'module' }`), which Vite (and Nuxt 3/4) picks up and bundles as its own chunk automatically. If you're on classic Webpack (Vue CLI), you'll need `worker-plugin` or equivalent — that's a bundler limitation, not this package's.

## Comparison

`vue-worker` (latest `1.2.1`, published 2017) and `vue-web-workers` (latest `0.2.0`, published 2020, depends on `vue@^2.6.11` directly) are both effectively unmaintained Vue 2 plugins — verified against the npm registry, not from memory. [Comlink](https://github.com/GoogleChromeLabs/comlink) (`4.4.2`, still actively maintained, zero dependencies) is a solid, Vue-agnostic RPC layer.

| | `vue-worker` / `vue-web-workers` | Comlink | vue-worker-kit |
|---|---|---|---|
| Composition API | ✗ | — (not Vue-specific) | ✓ |
| Typed input/output | ✗ | manual `wrap<T>()` | inferred from the worker file |
| Worker pool | ✗ | ✗ | ✓ |
| Reactive computed-in-worker | ✗ | ✗ | ✓ (`useWorkerComputed`) |
| Cancellation | ✗ | ✗ | ✓ (`AbortSignal`) |
| Transferables | ✗ | ✓ (manual, both directions) | ✓ (`RunOptions.transfer` in, `ctx.transfer()` out) |
| SSR-safe | ✗ | — | ✓ |
| Dependencies | — | none | none beyond `vue` |

---

## License

MIT

---

## Author

Danil Lisin Vladimirovich aka Macrulez

GitHub: [macrulezru](https://github.com/macrulezru) · Website: [macrulez.ru/en](https://macrulez.ru/en)

Questions and bugs — [issues](https://github.com/macrulezru/vue-virtual-scroller-kit/issues)

---

## 💖 Support the project

Open source takes time and effort. If my work saves you time or brings value, consider supporting further development.

<a href="https://donate.cryptocloud.plus/M6O34NIN" target="_blank">
  <img src="https://img.shields.io/badge/Donate-CryptoCloud-8A2BE2?style=for-the-badge&logo=cryptocurrency&logoColor=white" alt="Donate via CryptoCloud">
</a>

Thank you for being part of this journey. ❤️