import { defineConfig } from 'vitepress'

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: 'vue-worker-kit',
  description: 'Type-safe Web Worker composables for Vue 3',
  
  head: [
    ['link', { rel: 'icon', href: '/favicon.ico' }],
    ['meta', { name: 'theme-color', content: '#42b883' }],
  ],
  
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Guide', link: '/guide/introduction' },
      { text: 'API', link: '/api/useWorker' },
      { text: 'Examples', link: '/examples/basic' },
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'Introduction',
          items: [
            { text: 'What is vue-worker-kit?', link: '/guide/introduction' },
            { text: 'Getting Started', link: '/guide/getting-started' },
            { text: 'Installation', link: '/guide/installation' },
          ],
        },
        {
          text: 'Core Concepts',
          items: [
            { text: 'useWorker()', link: '/guide/useWorker' },
            { text: 'Worker Pool', link: '/guide/pool' },
            { text: 'useWorkerComputed()', link: '/guide/computed' },
            { text: 'defineWorkerHandler()', link: '/guide/handler' },
          ],
        },
        {
          text: 'Advanced',
          items: [
            { text: 'Warmup', link: '/guide/warmup' },
            { text: 'Transfer & Zero-Copy', link: '/guide/transfer' },
            { text: 'Cancellation', link: '/guide/cancellation' },
            { text: 'Error Handling', link: '/guide/errors' },
            { text: 'SSR Support', link: '/guide/ssr' },
            { text: 'Devtools', link: '/guide/devtools' },
            { text: 'Nuxt Module', link: '/guide/nuxt' },
          ],
        },
        {
          text: 'New Features',
          items: [
            { text: 'Streaming Results', link: '/guide/streaming' },
            { text: 'Batch API', link: '/guide/batch' },
            { text: 'WASM Bridge', link: '/guide/wasm' },
            { text: 'SharedWorker', link: '/guide/shared-worker' },
            { text: 'Retry with Backoff', link: '/guide/retry' },
            { text: 'Result Cache', link: '/guide/cache' },
          ],
        },
      ],
      '/api/': [
        {
          text: 'Composables',
          items: [
            { text: 'useWorker()', link: '/api/useWorker' },
            { text: 'useWorkerPool()', link: '/api/useWorkerPool' },
            { text: 'useWorkerComputed()', link: '/api/useWorkerComputed' },
            { text: 'useSharedWorker()', link: '/api/useSharedWorker' },
          ],
        },
        {
          text: 'Functions',
          items: [
            { text: 'createWorkerPool()', link: '/api/createWorkerPool' },
            { text: 'defineWorkerHandler()', link: '/api/defineWorkerHandler' },
            { text: 'createWasmBridge()', link: '/api/createWasmBridge' },
          ],
        },
        {
          text: 'Types',
          items: [
            { text: 'WorkerModuleInput', link: '/api/types#workermoduleinput' },
            { text: 'WorkerModuleOutput', link: '/api/types#workermoduleoutput' },
            { text: 'WorkerRunOptions', link: '/api/types#workerrunoptions' },
            { text: 'WorkerMapOptions', link: '/api/types#workermapoptions' },
          ],
        },
      ],
      '/examples/': [
        {
          text: 'Basic Examples',
          items: [
            { text: 'Basic Usage', link: '/examples/basic' },
            { text: 'Image Processing', link: '/examples/image-processing' },
            { text: 'Data Transformation', link: '/examples/data-transform' },
          ],
        },
        {
          text: 'Advanced Examples',
          items: [
            { text: 'Worker Pool', link: '/examples/pool' },
            { text: 'WASM Integration', link: '/examples/wasm' },
            { text: 'Real-time Streaming', link: '/examples/streaming' },
            { text: 'Multi-tab App', link: '/examples/multi-tab' },
          ],
        },
      ],
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/macrulezru/vue-worker-kit' },
    ],
    
    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2024-present macrulez',
    },
    
    search: {
      provider: 'local',
      options: {
        locales: {
          root: {
            translations: {
              button: {
                buttonText: 'Search',
                buttonAriaLabel: 'Search docs',
              },
              modal: {
                noResultsText: 'No results for "{{query}}"',
                resetButtonTitle: 'Reset search',
                footer: {
                  selectText: 'to select',
                  navigateText: 'to navigate',
                },
              },
            },
          },
        },
      },
    },
  },
  
  vite: {
    optimizeDeps: {
      exclude: ['vue-worker-kit'],
    },
  },
})
