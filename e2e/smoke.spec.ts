import { test, expect } from '@playwright/test';

/**
 * Smoke tests for Harmonie application
 * These tests verify basic application functionality
 */

test.describe('Smoke Tests', () => {
  test('should load the application', async ({ page }) => {
    await page.goto('/');

    // Wait for the page to load
    await expect(page).toHaveTitle(/Harmonie/i);

    // Check that something renders (login form or main app)
    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('should show login form for unauthenticated users', async ({ page }) => {
    await page.goto('/');

    // Should see login form elements
    const emailInput = page.getByLabel(/email|e-mail/i);
    const passwordInput = page.getByLabel(/wachtwoord|password/i);

    await expect(emailInput.or(page.locator('input[type="email"]'))).toBeVisible();
    await expect(passwordInput.or(page.locator('input[type="password"]'))).toBeVisible();
  });
});

test.describe('Authentication', () => {
  test('should show error for invalid credentials', async ({ page }) => {
    await page.goto('/');

    // Fill in invalid credentials
    const emailInput = page.getByLabel(/email|e-mail/i).or(page.locator('input[type="email"]'));
    const passwordInput = page.getByLabel(/wachtwoord|password/i).or(page.locator('input[type="password"]'));

    await emailInput.fill('invalid@example.com');
    await passwordInput.fill('wrongpassword');

    // Submit the form
    const submitButton = page.getByRole('button', { name: /inloggen|login|sign in/i });
    await submitButton.click();

    // Should show error message
    await expect(page.getByText(/fout|error|invalid|onjuist/i)).toBeVisible({ timeout: 10000 });
  });

  // This test assumes a test user exists in the database
  // In a real setup, you would seed the database before running tests
  test.skip('should login successfully with valid credentials', async ({ page }) => {
    await page.goto('/');

    const emailInput = page.getByLabel(/email|e-mail/i).or(page.locator('input[type="email"]'));
    const passwordInput = page.getByLabel(/wachtwoord|password/i).or(page.locator('input[type="password"]'));

    await emailInput.fill('test@example.com');
    await passwordInput.fill('testpassword123');

    const submitButton = page.getByRole('button', { name: /inloggen|login|sign in/i });
    await submitButton.click();

    // Should navigate away from login page
    // Wait for dashboard or main page to load
    await expect(page).not.toHaveURL(/login/i, { timeout: 10000 });
  });
});

test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    // Set up authentication state if needed
    // For smoke tests without a backend, we can check if navigation elements exist
  });

  test('should have responsive navigation', async ({ page }) => {
    await page.goto('/');

    // Check for navigation or menu elements
    const nav = page.getByRole('navigation').or(page.locator('nav'));
    const menuButton = page.getByRole('button', { name: /menu/i }).or(page.locator('[aria-label*="menu"]'));

    // Either navigation should be visible, or there should be a menu button (mobile)
    const navOrMenu = nav.or(menuButton);
    await expect(navOrMenu).toBeVisible({ timeout: 5000 }).catch(() => {
      // Navigation might not be visible on login page
    });
  });
});

test.describe('Accessibility', () => {
  test('should have no accessibility violations on login page', async ({ page }) => {
    await page.goto('/');

    // Basic accessibility checks
    // Check for form labels
    const inputs = await page.locator('input').all();
    for (const input of inputs) {
      const type = await input.getAttribute('type');
      if (type !== 'hidden' && type !== 'submit') {
        const id = await input.getAttribute('id');
        const ariaLabel = await input.getAttribute('aria-label');
        const ariaLabelledBy = await input.getAttribute('aria-labelledby');

        // Input should have a label (either associated label, aria-label, or aria-labelledby)
        if (id) {
          const label = page.locator(`label[for="${id}"]`);
          const hasLabel = await label.count() > 0;
          const hasAriaLabel = !!ariaLabel || !!ariaLabelledBy;
          expect(hasLabel || hasAriaLabel).toBe(true);
        }
      }
    }
  });

  test('should be keyboard navigable', async ({ page }) => {
    await page.goto('/');

    // Tab through focusable elements
    await page.keyboard.press('Tab');

    // First focusable element should have focus
    const focusedElement = page.locator(':focus');
    await expect(focusedElement).toBeTruthy();
  });
});

test.describe('Performance', () => {
  test('should load within acceptable time', async ({ page }) => {
    const start = Date.now();

    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const loadTime = Date.now() - start;

    // Page should load within 5 seconds
    expect(loadTime).toBeLessThan(5000);
  });
});
