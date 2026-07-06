import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for Harmonie E2E tests
 * @see https://playwright.dev/docs/test-configuration
 *
 * Prerequisites:
 * - Seed a dedicated E2E database first (do NOT use your dev database):
 *     DB_PATH=/tmp/harmonie-e2e/harmonie-e2e.db npm run seed:e2e --workspace=backend
 * - Run the tests with the same DB_PATH so the auto-started backend uses it:
 *     DB_PATH=/tmp/harmonie-e2e/harmonie-e2e.db npx playwright test
 *
 * In CI only the chromium project runs; locally the full browser matrix runs.
 */

const allProjects = [
  {
    name: 'chromium',
    use: { ...devices['Desktop Chrome'] },
  },

  {
    name: 'firefox',
    use: { ...devices['Desktop Firefox'] },
  },

  {
    name: 'webkit',
    use: { ...devices['Desktop Safari'] },
  },

  /* Test against mobile viewports. */
  {
    name: 'Mobile Chrome',
    use: { ...devices['Pixel 5'] },
  },
  {
    name: 'Mobile Safari',
    use: { ...devices['iPhone 12'] },
  },
];

export default defineConfig({
  testDir: './e2e',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [['list'], ['html', { open: 'never' }]],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: 'http://localhost:5173',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',

    /* Take screenshot on failure */
    screenshot: 'only-on-failure',
  },

  /* In CI only chromium runs; locally the full matrix (5 browsers) runs. */
  projects: process.env.CI ? allProjects.filter((p) => p.name === 'chromium') : allProjects,

  /*
   * Start backend + frontend (npm run dev at the repo root) unless a dev
   * server is already running on :5173 (locally we reuse it; in CI we always
   * start a fresh one). Environment variables such as DB_PATH are inherited
   * by the spawned servers, so pointing DB_PATH at a seeded E2E database
   * makes the whole stack run against it.
   */
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 180 * 1000,
  },
});
