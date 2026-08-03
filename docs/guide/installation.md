# Installation

## Package Managers

### npm

```bash
npm install vue-worker-kit
```

### yarn

```bash
yarn add vue-worker-kit
```

### pnpm

```bash
pnpm add vue-worker-kit
```

### bun

```bash
bun add vue-worker-kit
```

## Peer Dependencies

vue-worker-kit requires **Vue 3.4 or higher** as a peer dependency:

```json
{
  "peerDependencies": {
    "vue": "^3.4.0"
  }
}
```

Make sure you have Vue installed:

```bash
npm install vue@^3.4.0
```

## TypeScript Configuration

For the best type inference, ensure your `tsconfig.json` includes:

```json
{
  "compilerOptions": {
    "moduleResolution": "bundler",
    "module": "ESNext",
    "target": "ES2020",
    "strict": true
  }
}
```

## Vite Configuration

vue-worker-kit works out of the box with Vite. No additional configuration is needed!

If you're using custom worker configurations, make sure they don't conflict:

```ts
// vite.config.ts
export default defineConfig({
  // vue-worker-kit uses standard new Worker() syntax
  // No special worker plugin needed
})
```

## Nuxt Integration

For Nuxt 3 projects, you can use the official Nuxt module (coming soon):

```bash
npm install @nuxtjs/vue-worker-kit
```

Or manually configure workers in Nuxt:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  vite: {
    worker: {
      format: 'es'
    }
  }
})
```

## CDN Usage (Development Only)

For quick prototyping without bundlers:

```html
<script type="module">
  import { useWorker } from 'https://cdn.jsdelivr.net/npm/vue-worker-kit/+esm'
  
  // Note: Workers require bundler for proper URL resolution
  // CDN usage is limited to development experiments
</script>
```

## Next Steps

- [Getting Started](/guide/getting-started) - Create your first worker
- [Introduction](/guide/introduction) - Learn about vue-worker-kit concepts
- [useWorker()](/guide/useWorker) - API reference for the main composable
