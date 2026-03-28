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
        pool: 'forks',
        poolOptions: {
            forks: {
                singleFork: true,
            },
        },
    },
});
