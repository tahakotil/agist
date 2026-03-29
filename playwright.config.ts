import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  use: {
    baseURL: 'http://localhost:3004',
    headless: true,
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: 'pnpm --filter @agist/server exec tsx src/index.ts',
      port: 4400,
      reuseExistingServer: true,
      timeout: 15000,
    },
    {
      command: 'pnpm --filter @agist/web exec next dev -p 3004',
      port: 3004,
      reuseExistingServer: true,
      timeout: 30000,
    },
  ],
})
