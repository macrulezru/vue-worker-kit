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
