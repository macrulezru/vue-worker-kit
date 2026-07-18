import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import dts from 'vite-plugin-dts'
import { resolve } from 'path'

export default defineConfig({
  plugins: [
    vue(),
    dts({
      insertTypesEntry: true,
      include: ['src/**/*.ts', 'src/**/*.vue'],
      exclude: ['src/**/__tests__/**'],
    }),
  ],
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        'worker/defineWorkerHandler': resolve(__dirname, 'src/worker/defineWorkerHandler.ts'),
        'adapters/pool': resolve(__dirname, 'src/adapters/pool.ts'),
        'adapters/computed': resolve(__dirname, 'src/adapters/computed.ts'),
        'devtools/index': resolve(__dirname, 'src/devtools/index.ts'),
      },
      formats: ['es', 'cjs'],
      fileName: (format, entryName) => (format === 'es' ? `${entryName}.mjs` : `${entryName}.cjs`),
    },
    rollupOptions: {
      external: ['vue'],
      output: {
        globals: { vue: 'Vue' },
        exports: 'named',
      },
    },
    minify: 'esbuild',
    target: 'es2020',
  },
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
})
