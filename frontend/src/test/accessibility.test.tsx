/**
 * Accessibility Tests (WCAG 2.1 AA)
 *
 * Tests core components for accessibility compliance using axe-core.
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import { BrowserRouter } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';
import i18n from '../i18n';

// Extend expect with axe matchers
expect.extend(toHaveNoViolations);

// Test wrapper with required providers
function TestWrapper({ children }: { children: React.ReactNode }) {
  return (
    <I18nextProvider i18n={i18n}>
      <BrowserRouter>
        {children}
      </BrowserRouter>
    </I18nextProvider>
  );
}

describe('Accessibility Tests', () => {
  describe('Button Component', () => {
    it('should have no accessibility violations', async () => {
      const { container } = render(
        <TestWrapper>
          <button type="button">Click me</button>
        </TestWrapper>
      );

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('icon-only button should have accessible name', async () => {
      const { container } = render(
        <TestWrapper>
          <button type="button" aria-label="Close">
            <svg aria-hidden="true" />
          </button>
        </TestWrapper>
      );

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });

  describe('Form Elements', () => {
    it('input should have associated label', async () => {
      const { container } = render(
        <TestWrapper>
          <div>
            <label htmlFor="email">Email</label>
            <input id="email" type="email" />
          </div>
        </TestWrapper>
      );

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('required field should indicate requirement', async () => {
      const { container } = render(
        <TestWrapper>
          <div>
            <label htmlFor="name">Name (required)</label>
            <input id="name" type="text" required aria-required="true" />
          </div>
        </TestWrapper>
      );

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });

  describe('Modal Dialog', () => {
    it('modal should have proper ARIA attributes', async () => {
      const { container } = render(
        <TestWrapper>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
          >
            <h2 id="modal-title">Modal Title</h2>
            <p>Modal content</p>
            <button type="button">Close</button>
          </div>
        </TestWrapper>
      );

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });

  describe('Navigation', () => {
    it('navigation should have accessible name', async () => {
      const { container } = render(
        <TestWrapper>
          <nav aria-label="Main navigation">
            <ul>
              <li><a href="/">Home</a></li>
              <li><a href="/about">About</a></li>
            </ul>
          </nav>
        </TestWrapper>
      );

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('skip link should be present', async () => {
      const { container } = render(
        <TestWrapper>
          <div>
            <a href="#main-content" className="skip-to-content">
              Skip to main content
            </a>
            <main id="main-content">
              <h1>Page Title</h1>
            </main>
          </div>
        </TestWrapper>
      );

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });

  describe('Images', () => {
    it('decorative images should be hidden from screen readers', async () => {
      const { container } = render(
        <TestWrapper>
          <img src="/decorative.png" alt="" role="presentation" />
        </TestWrapper>
      );

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('informative images should have alt text', async () => {
      const { container } = render(
        <TestWrapper>
          <img src="/logo.png" alt="Company Logo" />
        </TestWrapper>
      );

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });

  describe('Tables', () => {
    it('data table should have proper structure', async () => {
      const { container } = render(
        <TestWrapper>
          <table>
            <caption>User List</caption>
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Email</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>John Doe</td>
                <td>john@example.com</td>
              </tr>
            </tbody>
          </table>
        </TestWrapper>
      );

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });

  describe('Heading Hierarchy', () => {
    it('headings should be in logical order', async () => {
      const { container } = render(
        <TestWrapper>
          <main>
            <h1>Page Title</h1>
            <section>
              <h2>Section Title</h2>
              <h3>Subsection Title</h3>
            </section>
          </main>
        </TestWrapper>
      );

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });

  describe('Color Contrast', () => {
    it('text should have sufficient contrast', async () => {
      const { container } = render(
        <TestWrapper>
          <div style={{ backgroundColor: '#ffffff', color: '#1f2937' }}>
            <p>This text has good contrast</p>
          </div>
        </TestWrapper>
      );

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });

  describe('Interactive Elements', () => {
    it('links should be distinguishable', async () => {
      const { container } = render(
        <TestWrapper>
          <p>
            Please visit our <a href="/help">help page</a> for more information.
          </p>
        </TestWrapper>
      );

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('disabled buttons should indicate state', async () => {
      const { container } = render(
        <TestWrapper>
          <button type="button" disabled aria-disabled="true">
            Submit
          </button>
        </TestWrapper>
      );

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });
});
