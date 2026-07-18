import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [vue()],
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
        find: 'vue-worker-kit',
        replacement: fileURLToPath(new URL('../src/index.ts', import.meta.url)),
      },
    ],
  },
})
