import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import dts from 'vite-plugin-dts'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

// Not `import.meta.dirname` (Node 20.11+ only — `package.json`'s `engines` promises `>=18`)
// and not the CJS `__dirname` global either, which Vite warns is unsupported by the upcoming
// `configLoader: 'native'`. This works on every ESM-capable Node version.
const dirname = fileURLToPath(new URL('.', import.meta.url))

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
        index: resolve(dirname, 'src/index.ts'),
        'worker/defineWorkerHandler': resolve(dirname, 'src/worker/defineWorkerHandler.ts'),
        'adapters/pool': resolve(dirname, 'src/adapters/pool.ts'),
        'adapters/computed': resolve(dirname, 'src/adapters/computed.ts'),
        'adapters/sharedWorker': resolve(dirname, 'src/adapters/sharedWorker.ts'),
        'devtools/index': resolve(dirname, 'src/devtools/index.ts'),
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
    // Vite 8 no longer bundles esbuild by default ('esbuild' minify now needs it as a separate
    // dependency) — 'oxc' is Rolldown-Vite's native Rust minifier, needs nothing extra.
    minify: 'oxc',
    target: 'es2020',
  },
  resolve: {
    alias: { '@': resolve(dirname, 'src') },
  },
})
