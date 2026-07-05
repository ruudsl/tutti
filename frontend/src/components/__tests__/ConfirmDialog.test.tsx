import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmDialog } from '../ConfirmDialog';

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'accessibility.closeModal': 'Close modal',
        'accessibility.processing': 'Processing...',
        'common.cancel': 'Cancel',
        'common.confirm': 'Confirm',
      };
      return translations[key] || key;
    },
  }),
}));

// Mock Icon component
vi.mock('../Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`}>{name}</span>,
}));

describe('ConfirmDialog', () => {
  const defaultProps = {
    title: 'Verwijderen?',
    message: 'Weet je zeker dat je dit item wilt verwijderen?',
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    document.body.style.overflow = '';
  });

  it('renders title and message in an accessible alertdialog', () => {
    render(<ConfirmDialog {...defaultProps} />);

    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby');
    expect(dialog).toHaveAttribute('aria-describedby');
    expect(screen.getByText('Verwijderen?')).toBeInTheDocument();
    expect(screen.getByText('Weet je zeker dat je dit item wilt verwijderen?')).toBeInTheDocument();
  });

  it('calls onConfirm when the confirm button is clicked', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<ConfirmDialog {...defaultProps} onConfirm={onConfirm} />);

    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when the cancel button is clicked', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<ConfirmDialog {...defaultProps} onCancel={onCancel} />);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('uses custom confirm and cancel labels when provided', () => {
    render(<ConfirmDialog {...defaultProps} confirmLabel="Ja, verwijderen" cancelLabel="Nee, terug" />);

    expect(screen.getByRole('button', { name: 'Ja, verwijderen' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nee, terug' })).toBeInTheDocument();
  });

  it('calls onCancel when Escape is pressed', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<ConfirmDialog {...defaultProps} onCancel={onCancel} />);

    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalled();
  });

  it('calls onCancel when the overlay is clicked, but not when clicking inside the dialog', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<ConfirmDialog {...defaultProps} onCancel={onCancel} />);

    await user.click(screen.getByRole('alertdialog'));
    expect(onCancel).not.toHaveBeenCalled();

    await user.click(screen.getByRole('presentation'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('disables both buttons and shows processing text while loading', () => {
    render(<ConfirmDialog {...defaultProps} isLoading />);

    expect(screen.getByRole('button', { name: 'Processing...' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });

  it('applies the variant button class', () => {
    const { rerender } = render(<ConfirmDialog {...defaultProps} variant="danger" />);
    expect(screen.getByRole('button', { name: 'Confirm' })).toHaveClass('btn-danger');

    rerender(<ConfirmDialog {...defaultProps} variant="info" />);
    expect(screen.getByRole('button', { name: 'Confirm' })).toHaveClass('btn-primary');
  });

  it('focuses the cancel button on open (safe default)', () => {
    render(<ConfirmDialog {...defaultProps} />);
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
  });
});
