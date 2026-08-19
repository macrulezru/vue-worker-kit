// Sanity-check the primitives the fake-worker test harness (tests/helpers.ts) relies on —
// fail fast with a clear message instead of confusing downstream test failures.
for (const name of ['structuredClone', 'AbortController', 'DOMException'] as const) {
  if (typeof globalThis[name] === 'undefined') {
    throw new Error(`vue-worker-kit tests require a global \`${name}\` (available natively in Node 17+).`)
  }
}

// The library's SSR guard checks `typeof Worker === 'undefined'`. Plain Node has no global
// `Worker` at all (unlike a browser), so every test would otherwise hit that guard — stub
// just enough of a constructor for the presence check; tests use `createTestWorker()` (see
// tests/helpers.ts) rather than actually constructing this stub.
if (typeof globalThis.Worker === 'undefined') {
  ;(globalThis as { Worker?: unknown }).Worker = class StubWorker {}
}
if (typeof globalThis.SharedWorker === 'undefined') {
  ;(globalThis as { SharedWorker?: unknown }).SharedWorker = class StubSharedWorker {}
}

// Provide a mock `navigator` for tests that depend on `navigator.hardwareConcurrency`.
// In real browsers this reflects available logical cores; here we emulate a typical 4-core machine.
if (typeof globalThis.navigator === 'undefined') {
  ;(globalThis as { navigator?: { hardwareConcurrency: number } }).navigator = {
    hardwareConcurrency: 4,
  }
} else if (!('hardwareConcurrency' in globalThis.navigator)) {
  ;(globalThis.navigator as { hardwareConcurrency?: number }).hardwareConcurrency = 4
}
