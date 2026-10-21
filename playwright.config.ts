import { defineConfig } from '@playwright/test'

const port = 5199

export default defineConfig({
  testDir: 'browser-tests',
  testMatch: '*.pw.ts',
  timeout: 300_000,
  workers: 1,
  reporter: 'list',
  use: { baseURL: `http://localhost:${port}` },
  webServer: {
    command: `npm run dev --prefix demo -- --port ${port} --strictPort`,
    url: `http://localhost:${port}/cancel-yield.html`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'firefox', use: { browserName: 'firefox' } },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
})
