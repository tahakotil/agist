import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Disable auth in all tests so RBAC / auth middleware don't block requests
    env: {
      AGIST_AUTH_DISABLED: 'true',
    },
    include: ['packages/*/src/**/*.test.ts', 'packages/*/test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['packages/*/src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/node_modules/**']
    }
  }
})
