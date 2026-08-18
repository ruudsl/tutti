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
      // Werkelijk op dit moment: 47,4 / 35,8 / 50,5 / 47,4.
      //
      // De percentages zijn gedaald ten opzichte van de vorige stand
      // (54,4 / 43,1 / 56,9 / 54,6) doordat tasks, resources en equipment nu
      // in de test-app gemount staan voor de routevolgorde-regressietests.
      // Dat zijn ruim 1200 extra statements in de noemer die nauwelijks
      // gedekt zijn. In absolute zin ging de dekking juist omhoog:
      // 2486 -> 2746 gedekte statements.
      //
      // Doel voor WP8 blijft >80%.
      thresholds: {
        statements: 46,
        branches: 34,
        functions: 49,
        lines: 46,
      },
    },
  },
});
