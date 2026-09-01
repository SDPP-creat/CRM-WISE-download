import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'packages/**/*.test.ts', 'apps/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', 'apps/web/**/*.e2e.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['packages/**/src/**', 'apps/api/src/**'],
    },
  },
});
