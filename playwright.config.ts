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
 *
 * Let op bij lokaal draaien: zaai met de servers uit. De database is sql.js en
 * die houdt de hele inhoud in het geheugen van het serverproces. Een server die
 * al draaide ziet nieuw gezaaide rijen niet, en schrijft bij zijn eerstvolgende
 * bewaarmoment zijn eigen oudere beeld over het zojuist gezaaide bestand heen.
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
    /*
     * Wachten tot de API antwoordt, niet tot Vite antwoordt.
     *
     * Hier stond http://localhost:5173. Vite staat binnen een seconde klaar,
     * maar de backend heeft er meer nodig: sql.js inlezen, migraties draaien,
     * de database initialiseren. In dat gat serveerde Vite de pagina al terwijl
     * elke /api-aanroep afketste op ECONNREFUSED, en dan mislukt de eerste test
     * die inlogt - soms, want het hangt af van wie er net eerder klaar was.
     *
     * /api/health gaat door dezelfde proxy als alle andere aanroepen, dus deze
     * ene url dekt beide helften af: Vite moet het verzoek aannemen en de
     * backend moet het beantwoorden. Zolang de backend nog opstart geeft de
     * proxy een 500 en blijft Playwright wachten.
     */
    url: 'http://localhost:5173/api/health',
    reuseExistingServer: !process.env.CI,
    timeout: 180 * 1000,
  },
});
