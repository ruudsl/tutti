/**
 * Accessibility Tests (WCAG 2.1 AA)
 *
 * Tests real components for accessibility compliance using axe-core.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import { BrowserRouter } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from '../i18n';

// Real components
import { Modal, FormModal } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Pagination } from '../components/Pagination';
import { Icon } from '../components/Icon';
import { NotFound } from '../components/NotFound';

// Extend expect with axe matchers
expect.extend(toHaveNoViolations);

// Create a fresh QueryClient for each test
function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

// Test wrapper with required providers
function TestWrapper({ children }: { children: React.ReactNode }) {
  const queryClient = createTestQueryClient();
  return (
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <BrowserRouter>{children}</BrowserRouter>
      </I18nextProvider>
    </QueryClientProvider>
  );
}

describe('Real Component Accessibility Tests', () => {
  describe('Modal Component', () => {
    it('should have no accessibility violations', async () => {
      const { container } = render(
        <TestWrapper>
          <Modal title="Test Modal" onClose={() => {}}>
            <p>Modal content here</p>
          </Modal>
        </TestWrapper>,
      );

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should have proper ARIA attributes', () => {
      render(
        <TestWrapper>
          <Modal title="Test Modal" onClose={() => {}}>
            <p>Content</p>
          </Modal>
        </TestWrapper>,
      );

      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-modal', 'true');
      expect(dialog).toHaveAttribute('aria-labelledby');

      const title = screen.getByText('Test Modal');
      expect(title.tagName).toBe('H3');
    });

    it('should close on Escape key', async () => {
      const onClose = vi.fn();
      render(
        <TestWrapper>
          <Modal title="Test" onClose={onClose}>
            <p>Content</p>
          </Modal>
        </TestWrapper>,
      );

      await userEvent.keyboard('{Escape}');
      expect(onClose).toHaveBeenCalled();
    });

    it('close button should have accessible label', () => {
      render(
        <TestWrapper>
          <Modal title="Test" onClose={() => {}}>
            <p>Content</p>
          </Modal>
        </TestWrapper>,
      );

      const closeButton = screen.getByRole('button', { name: /sluiten|close/i });
      expect(closeButton).toBeInTheDocument();
    });
  });

  describe('FormModal Component', () => {
    it('should have no accessibility violations', async () => {
      const { container } = render(
        <TestWrapper>
          <FormModal title="Edit User" onClose={() => {}} onSubmit={() => {}}>
            <div>
              <label htmlFor="name">Name</label>
              <input id="name" type="text" />
            </div>
          </FormModal>
        </TestWrapper>,
      );

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('submit button should be associated with form', () => {
      render(
        <TestWrapper>
          <FormModal title="Test Form" onClose={() => {}} onSubmit={() => {}} submitLabel="Save">
            <input type="text" aria-label="Test input" />
          </FormModal>
        </TestWrapper>,
      );

      const submitButton = screen.getByRole('button', { name: /save|opslaan/i });
      expect(submitButton).toHaveAttribute('type', 'submit');
      expect(submitButton).toHaveAttribute('form');
    });
  });

  describe('ConfirmDialog Component', () => {
    it('should have no accessibility violations', async () => {
      const { container } = render(
        <TestWrapper>
          <ConfirmDialog
            title="Confirm Delete"
            message="Are you sure you want to delete this item?"
            onConfirm={() => {}}
            onCancel={() => {}}
          />
        </TestWrapper>,
      );

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should have confirm and cancel buttons', () => {
      render(
        <TestWrapper>
          <ConfirmDialog
            title="Confirm"
            message="Are you sure?"
            confirmLabel="Yes, delete"
            cancelLabel="No, keep"
            onConfirm={() => {}}
            onCancel={() => {}}
          />
        </TestWrapper>,
      );

      expect(screen.getByRole('button', { name: /yes, delete/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /no, keep/i })).toBeInTheDocument();
    });
  });

  describe('Pagination Component', () => {
    it('should have no accessibility violations', async () => {
      const { container } = render(
        <TestWrapper>
          <Pagination page={3} totalPages={10} onPageChange={() => {}} total={100} limit={10} />
        </TestWrapper>,
      );

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should have proper navigation landmark', () => {
      render(
        <TestWrapper>
          <Pagination page={1} totalPages={5} onPageChange={() => {}} />
        </TestWrapper>,
      );

      const nav = screen.getByRole('navigation');
      expect(nav).toHaveAttribute('aria-label');
    });

    it('should indicate current page', () => {
      render(
        <TestWrapper>
          <Pagination page={2} totalPages={5} onPageChange={() => {}} />
        </TestWrapper>,
      );

      const currentPage = screen.getByRole('button', { current: 'page' });
      expect(currentPage).toHaveTextContent('2');
    });

    it('previous button should be disabled on first page', () => {
      render(
        <TestWrapper>
          <Pagination page={1} totalPages={5} onPageChange={() => {}} />
        </TestWrapper>,
      );

      const prevButton = screen.getByRole('button', { name: /previous|vorige/i });
      expect(prevButton).toBeDisabled();
    });

    it('next button should be disabled on last page', () => {
      render(
        <TestWrapper>
          <Pagination page={5} totalPages={5} onPageChange={() => {}} />
        </TestWrapper>,
      );

      const nextButton = screen.getByRole('button', { name: /next|volgende/i });
      expect(nextButton).toBeDisabled();
    });
  });

  describe('Icon Component', () => {
    it('should be hidden from screen readers by default', () => {
      render(
        <TestWrapper>
          <Icon name="home" />
        </TestWrapper>,
      );

      const svg = document.querySelector('svg');
      expect(svg).toHaveAttribute('aria-hidden', 'true');
    });

    it('should render accessible when aria-hidden is false', async () => {
      const { container } = render(
        <TestWrapper>
          <button type="button">
            <Icon name="check" aria-hidden={false} />
            <span>Approve</span>
          </button>
        </TestWrapper>,
      );

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });

  describe('NotFound Component', () => {
    it('should have no accessibility violations', async () => {
      const { container } = render(
        <TestWrapper>
          <NotFound />
        </TestWrapper>,
      );

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should have proper heading hierarchy', () => {
      render(
        <TestWrapper>
          <NotFound />
        </TestWrapper>,
      );

      const heading = screen.getByRole('heading', { level: 1 });
      expect(heading).toBeInTheDocument();
    });
  });

  describe('Keyboard Navigation', () => {
    it('modal buttons should be focusable', async () => {
      render(
        <TestWrapper>
          <Modal title="Test" onClose={() => {}}>
            <button type="button">Action 1</button>
            <button type="button">Action 2</button>
          </Modal>
        </TestWrapper>,
      );

      // Tab through buttons
      await userEvent.tab();
      expect(screen.getByRole('button', { name: 'Action 1' })).toHaveFocus();

      await userEvent.tab();
      expect(screen.getByRole('button', { name: 'Action 2' })).toHaveFocus();
    });

    it('pagination buttons should be keyboard accessible', async () => {
      const onPageChange = vi.fn();
      render(
        <TestWrapper>
          <Pagination page={2} totalPages={5} onPageChange={onPageChange} />
        </TestWrapper>,
      );

      // Focus on page 3 button and press Enter
      const page3 = screen.getByRole('button', { name: /3/i });
      page3.focus();
      await userEvent.keyboard('{Enter}');

      expect(onPageChange).toHaveBeenCalledWith(3);
    });
  });

  describe('Form Accessibility', () => {
    it('form inputs in modal should have labels', async () => {
      const { container } = render(
        <TestWrapper>
          <FormModal title="Add User" onClose={() => {}} onSubmit={() => {}}>
            <div className="form-group">
              <label htmlFor="email">Email address</label>
              <input id="email" type="email" required />
            </div>
            <div className="form-group">
              <label htmlFor="role">Role</label>
              <select id="role">
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </FormModal>
        </TestWrapper>,
      );

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('disabled submit button should indicate state', () => {
      render(
        <TestWrapper>
          <FormModal title="Test" onClose={() => {}} onSubmit={() => {}} submitDisabled={true}>
            <p>Form content</p>
          </FormModal>
        </TestWrapper>,
      );

      const submitButton = screen.getByRole('button', { name: /save|opslaan/i });
      expect(submitButton).toBeDisabled();
    });

    it('loading state should be announced', () => {
      render(
        <TestWrapper>
          <FormModal title="Test" onClose={() => {}} onSubmit={() => {}} isSubmitting={true}>
            <p>Form content</p>
          </FormModal>
        </TestWrapper>,
      );

      const submitButton = screen.getByRole('button', { name: /processing|verwerken|bezig/i });
      expect(submitButton).toBeDisabled();
    });
  });

  describe('Color Contrast (Visual)', () => {
    it('danger button should have accessible colors', async () => {
      const { container } = render(
        <TestWrapper>
          <ConfirmDialog
            title="Delete"
            message="Are you sure?"
            variant="danger"
            onConfirm={() => {}}
            onCancel={() => {}}
          />
        </TestWrapper>,
      );

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('warning button should have accessible colors', async () => {
      const { container } = render(
        <TestWrapper>
          <ConfirmDialog
            title="Warning"
            message="This action has consequences"
            variant="warning"
            onConfirm={() => {}}
            onCancel={() => {}}
          />
        </TestWrapper>,
      );

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });
});

// Original basic tests retained for completeness
describe('Basic Accessibility Patterns', () => {
  describe('Skip Link', () => {
    it('skip link pattern should be accessible', async () => {
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
        </TestWrapper>,
      );

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });

  describe('Data Tables', () => {
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
        </TestWrapper>,
      );

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });
});
