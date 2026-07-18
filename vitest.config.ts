import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
  test: {
    // Default to plain Node: protocol/useWorker/pool/computed tests only need
    // structuredClone/AbortController/DOMException (all present in Node), and avoiding
    // happy-dom's own globals keeps the fake-worker harness's structured-clone boundary
    // behaving exactly like a real browser Worker. Component tests that need to actually
    // mount a `.vue` file opt into `happy-dom` per-file via a `@vitest-environment` docblock.
    environment: 'node',
    globals: false,
    setupFiles: ['./tests/setupWorkerEnv.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts', 'src/**/*.vue'],
      exclude: ['src/**/__tests__/**', 'src/index.ts', 'src/devtools/index.ts'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
  },
})
