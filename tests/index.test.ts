import { describe, expect, test } from 'vitest'
import * as pkg from '../src/index'

describe('package root barrel (src/index.ts)', () => {
  // Regression: `createCacheKey` was once re-exported via `export type { createCacheKey }`
  // even though it's a plain function — TypeScript happily type-checked that (and even
  // emitted it into dist/index.d.ts), but a type-only export is erased at build time, so the
  // built dist/index.mjs/.cjs silently shipped without it — a runtime crash for anyone
  // calling an import that type-checked fine. Every value the barrel re-exports must survive
  // as an actual runtime binding, not just a type.
  test('createCacheKey is re-exported as a real, callable function', () => {
    expect(typeof pkg.createCacheKey).toBe('function')
    expect(pkg.createCacheKey({ a: 1 })).toBe(JSON.stringify({ a: 1 }))
  })

  test('every documented runtime export of the barrel is actually present', () => {
    const expectedRuntimeExports = [
      'useWorker',
      'createWorkerPool',
      'useWorkerPool',
      'useWorkerComputed',
      'defineWorkerHandler',
      'attachWorkerProtocol',
      'createCacheKey',
      'WorkerError',
      'WorkerUnavailableError',
    ] as const

    for (const name of expectedRuntimeExports) {
      expect(pkg[name], `expected src/index.ts to export a runtime value named "${name}"`).toBeDefined()
    }
  })
})
