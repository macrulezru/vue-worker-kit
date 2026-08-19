# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-08-19

### Added

- `useSharedWorker()` (`/shared`) — reuses a single `SharedWorker` across every tab/window of the same origin that connects to it. The exact same `defineWorkerHandler()` module works for both `new Worker(...)` and `new SharedWorker(...)`; `attachSharedWorkerProtocol()` wires the worker side onto `self.onconnect`/per-tab `MessagePort`, isolating each tab's request-id space and cancellation state from every other tab's. `connect()`/`disconnect()` manage this tab's own connection explicitly; `disconnect()` never terminates the worker for other still-connected tabs. `portCount` reports how many tabs the worker has seen connect — best-effort, since a `MessagePort` has no platform-level "the other end went away" signal, so it only decrements on a cooperative `disconnect()`, not a crashed/force-closed tab. Not supported in Safari iOS / Chrome Android (no `SharedWorker` constructor there); throws `WorkerUnavailableError` in that case.
- `useWorker()` / `useSharedWorker()`: `cache: { cache: 'lru', maxCacheSize }` — memoizes results by `JSON.stringify(input)` (also exported standalone as `createCacheKey()`), and `retryDelay(attempt)` for backoff between automatic retries.
- `useWorker()` / `useSharedWorker()`: `streaming: true` + `ctx.reportChunk(chunk)` — a worker handler can push intermediate results into a reactive `chunks: ShallowRef<unknown[]>` before its final return, for progressive/streaming consumers.
- `useWorker()` / `createWorkerPool()`: `warmup(): Promise<void>` — pre-creates the worker(s) without running a task, to avoid cold-start latency on the first real call.
- `pool.map(items, options?)`: `signal?: AbortSignal` (cancels every still-running item) and `transfer?: (item) => Transferable[]` (per-item zero-copy transfer), alongside the existing `concurrency?`.
- `createWorkerActivityMonitor()`/`<WorkerActivityPanel>` now also accept a `useSharedWorker()` instance, not just a pool or a single `useWorker()`.
- CI (GitHub Actions): typecheck, test, lint, and build run on every push/PR, for both the package and `demo/`, on Node 20.19 and Node 22.13.
- Demo (`demo/`) gained a `useSharedWorker()` section — open a second tab from inside the demo and watch `portCount` and a `workerInstanceId` (generated once by the worker itself, not per tab) sync live, concrete proof both tabs share one worker instance. README now links to the demo with setup instructions, and shows a CI status badge — neither existed before.
- `attachWorkerProtocol()` (`/worker`) now returns a `WorkerProtocolHandle` (`{ abortAll(reason?) }`) instead of `void`, so a caller wiring its own scope/port can abort every in-flight `run` request on it — used by `attachSharedWorkerProtocol()`'s own `disconnect` handling (see Fixed).

### Changed

- **`engines.node` raised from `>=18` to `^20.19.0 || ^22.13.0 || >=24.0.0`**, to match reality rather than assert something untrue: `eslint@10`, `vite@8`, `vue-tsc@3`, `vitest@4`, `happy-dom@20`, and `tinybench@6` all independently dropped Node 18 (EOL since April 2025) — verified by actually running `npm ci` under Node 18 and reading every `EBADENGINE` warning, not assumed. This only affects contributors building the package from source; the published `dist/` is plain browser/Vue JS with no Node-version dependency of its own.

### Fixed

- **Found while adding a message type to the worker protocol**: `attachWorkerProtocol`'s message handler treated anything that wasn't `'cancel'` as a `'run'` request, `id`/`input` included — a forward-compatibility hazard for any future message type (and would have made a naive `useSharedWorker` teardown message silently run the handler with `undefined` input). Now explicitly ignores anything that isn't `'run'` or `'cancel'`.
- **Found while wiring the package's own barrel file**: `createCacheKey` (a plain function) was re-exported via `export type { createCacheKey }` — TypeScript type-checked that without complaint and even emitted it into `dist/index.d.ts`, but a type-only export is erased at build time, so `dist/index.mjs`/`.cjs` silently shipped without it: a runtime `TypeError` for anyone who imported and called it, despite a clean `tsc --noEmit`. Regression-tested by importing the whole `src/index.ts` barrel and asserting every documented runtime export is actually callable, not just type-checkable.
- **Found in code review**: a cooperative `disconnect()` on `useSharedWorker()` closed that tab's port without aborting whatever `run()` it still had in flight on the worker side — the handler kept computing for a client that had already rejected the promise and would never see the result. `attachSharedWorkerProtocol()` now calls the new `WorkerProtocolHandle.abortAll()` before closing the port, so a handler checking `ctx.signal` cooperatively stops as soon as it next looks.

## [0.1.3] - 2026-07-20

### Fixed

- README's issues link pointed at the wrong repo (`vue-virtual-scroller-kit`, copy-paste leftover) instead of `vue-worker-kit`.

## [0.1.2] - 2026-07-19

### Added

- README: License, Author, and "Support the project" sections.

## [0.1.1] - 2026-07-19

### Changed

- README: added the header banner image.

### Removed

- README's "Not in v1 (roadmap)" section, which had named `SharedWorker`, `OffscreenCanvas` helpers, and a worker-side reactive store as deliberately deferred. (`useSharedWorker()` shipped in [0.2.0](#020---2026-08-19); the other two remain out of scope.)

## [0.1.0] - 2026-07-19

### Added

- `defineWorkerHandler()` (`/worker`) — declares a worker's handler function; wires the `run`/`cancel` message protocol automatically and only actually starts the message loop inside a real `WorkerGlobalScope`, so importing the file anywhere else (e.g. accidentally into the main bundle) is inert
- `useWorker<typeof import('./x.worker')>()` — input/output types inferred straight from the worker file via `typeof import(...)` (type-only, erased at compile time — the worker's code never reaches the main bundle just because its type is referenced), no manual generics on either side
  - `run(input, { transfer?, signal? }) => Promise<Output>`, `isRunning`, `progress`, `error`, `cancel()`
  - `idleTimeout` (default `30000`, `false` to disable) — worker self-terminates when idle, next `run()` transparently recreates it
  - `retries` (default `0`) — automatic retry on rejection, never applied to cancellations
  - `hardCancelOnAbort` — terminate & recreate the worker immediately on abort instead of waiting for cooperative `ctx.signal` handling
  - Automatic `terminate()` via `onScopeDispose` when called inside an active effect scope
- `createWorkerPool()` / `useWorkerPool()` (`/pool`) — a pool of lazily-created workers for many small independent tasks
  - `pool.run(input, options?)`, `pool.map(items, { concurrency? })` (bounded parallelism, results in input order), `pool.stats` (`{ busy, idle, queued }`, reactive), `pool.terminate()`
  - `size` defaults to `navigator.hardwareConcurrency` (the browser's real logical core/thread count on the machine actually running the app, not a value picked at development time), falling back to `4` where `navigator` is unavailable (SSR)
- `useWorkerComputed()` (`/computed`) — a `computed()` that recalculates inside a worker whenever its reactive source changes; `debounce` option; stale results from a superseded run are discarded by generation number rather than by forcefully killing the worker
- `ctx: WorkerContext` inside the handler — `signal` (cooperative cancellation), `reportProgress(value)` (throttled to ~20 msgs/sec, but always followed by an unthrottled final `1` right before the result, so `progress` reliably reaches 100% even if the handler only reports at periodic checkpoints), `transfer(...transferables)` (send part of the result back zero-copy instead of structured-clone copying)
- `WorkerError` (`.workerStack` from inside the worker, `.cause` a synthetic error created at the `run()` call site, so both ends of a failure show up together), `WorkerUnavailableError` (thrown, never wrapped or retried, instead of a raw `ReferenceError` when `run()` is called somewhere with no global `Worker`, typically SSR), `DataCloneError`-named `WorkerError` for structured-clone failures
- Reactive inputs (a `ref`/`reactive` value passed straight from a component) are automatically unwrapped via `toRaw()` before being posted — a live Proxy isn't structured-cloneable in any JS engine, and this is exactly the shape `useWorkerComputed`'s `source()` getter naturally produces
- `/devtools` — `createWorkerActivityMonitor()` + `<WorkerActivityPanel>`, a dependency-free (no `@vue/devtools-api`) debug panel showing busy/idle/queued counts, average task time, and recent errors, driven by an internal activity-bus subscription (no polling)
- SSR-safe: `Worker` is never constructed until `run()` is actually called; `<ClientOnly>` usage documented for Nuxt
- Zero runtime dependencies beyond `vue` (peer, `^3.4.0`); core (`useWorker` + its shared internal chunk) ~2.3 kB gzip; `pool`/`computed`/`devtools`/`worker` are each their own chunk, not pulled in unless imported
- Interactive demo (`demo/`) — `useWorker` vs. main-thread comparison (with a "longest UI freeze" metric and a live main-thread-responsiveness indicator, not a completion-time comparison — a single worker isn't faster, only non-blocking), transferables, a real parallel-speedup comparison via `createWorkerPool` (prime counting, sequential vs. pool, with a live per-worker "lanes" busy indicator), `useWorkerComputed`, error handling

### Fixed

- **Found before this ever shipped, while writing tests**: `run()` wrapped *any* non-abort rejection — including `WorkerUnavailableError` — into a generic `WorkerError`, so the documented SSR-detection type never actually reached calling code as itself. Now propagates unwrapped and unretried, the same way `AbortError` does.
- **Found before this ever shipped, via a real bug hit while building the demo**: `pool.terminate()` reset `busyCount` synchronously, but already-dispatched tasks settling afterward (via the client's own async rejection) decremented it a second time, driving it negative. Guarded with a `terminated` flag that suppresses the redundant bookkeeping without swallowing the task's own rejection.
