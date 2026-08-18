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
      // Verhoogd naarmate suites landden: eerst het echte schema in de
      // testdatabase plus file validation, auth middleware en de
      // e-mailtemplates, daarna de music-pieces routes.
      // Werkelijk op dit moment: 54,4 / 43,1 / 56,9 / 54,6.
      // Doel voor WP8 blijft >80%.
      thresholds: {
        statements: 52,
        branches: 41,
        functions: 54,
        lines: 52,
      },
    },
  },
});
