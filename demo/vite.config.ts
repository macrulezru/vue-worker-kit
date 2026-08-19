import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [vue()],
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        // Standalone multi-tab check for useSharedWorker()'s real onconnect/port wiring —
        // deliberately outside the main Vue app so it can be driven directly by Playwright.
        sharedTest: fileURLToPath(new URL('./shared-test.html', import.meta.url)),
      },
    },
  },
  resolve: {
    alias: [
      {
        find: 'vue-worker-kit/worker',
        replacement: fileURLToPath(new URL('../src/worker/defineWorkerHandler.ts', import.meta.url)),
      },
      {
        find: 'vue-worker-kit/pool',
        replacement: fileURLToPath(new URL('../src/adapters/pool.ts', import.meta.url)),
      },
      {
        find: 'vue-worker-kit/computed',
        replacement: fileURLToPath(new URL('../src/adapters/computed.ts', import.meta.url)),
      },
      {
        find: 'vue-worker-kit/devtools',
        replacement: fileURLToPath(new URL('../src/devtools/index.ts', import.meta.url)),
      },
      {
        find: 'vue-worker-kit/shared',
        replacement: fileURLToPath(new URL('../src/adapters/sharedWorker.ts', import.meta.url)),
      },
      {
        find: 'vue-worker-kit',
        replacement: fileURLToPath(new URL('../src/index.ts', import.meta.url)),
      },
    ],
  },
})
