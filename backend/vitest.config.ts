import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
    setupFiles: ['src/__tests__/setup.ts'],
    testTimeout: 10000,
    hookTimeout: 10000,
    // Run tests sequentially to avoid database conflicts
    fileParallelism: false,
    isolate: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'lcov'],
      // Raised after the test database started using the real schema
      // (src/database/schema.ts + migrations) and new suites landed for
      // file validation, auth middleware and the e-mail templates.
      // Actual at the time of writing: 51.3 / 39.6 / 53.4 / 51.6.
      // Target for WP8 remains >80%.
      thresholds: {
        statements: 48,
        branches: 37,
        functions: 50,
        lines: 48,
      },
    },
  },
});
