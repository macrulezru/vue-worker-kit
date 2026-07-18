# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
