import '@testing-library/jest-dom';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EmptyState } from '../EmptyState';

// Mock Icon component
vi.mock('../Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`}>{name}</span>,
}));

describe('EmptyState', () => {
  it('renders the default "no-items" variant', () => {
    render(<EmptyState />);

    expect(screen.getByText('Nog geen items')).toBeInTheDocument();
    expect(screen.getByText('Er zijn nog geen items toegevoegd aan deze lijst.')).toBeInTheDocument();
    expect(screen.getByTestId('icon-folder')).toBeInTheDocument();
  });

  it('renders variant defaults for "no-results"', () => {
    render(<EmptyState variant="no-results" />);

    expect(screen.getByText('Geen resultaten')).toBeInTheDocument();
    expect(screen.getByTestId('icon-search')).toBeInTheDocument();
  });

  it('uses role="status" for non-error variants and role="alert" for errors', () => {
    const { rerender } = render(<EmptyState variant="no-items" />);
    expect(screen.getByRole('status')).toBeInTheDocument();

    rerender(<EmptyState variant="error" />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Er ging iets mis')).toBeInTheDocument();
  });

  it('overrides title, description and icon', () => {
    render(<EmptyState icon="music" title="Geen muziekstukken" description="Voeg je eerste stuk toe." />);

    expect(screen.getByText('Geen muziekstukken')).toBeInTheDocument();
    expect(screen.getByText('Voeg je eerste stuk toe.')).toBeInTheDocument();
    expect(screen.getByTestId('icon-music')).toBeInTheDocument();
  });

  it('renders an action button and calls onAction when clicked', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(<EmptyState actionLabel="Toevoegen" onAction={onAction} />);

    const button = screen.getByRole('button', { name: 'Toevoegen' });
    await user.click(button);

    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('does not render an action button without onAction', () => {
    render(<EmptyState actionLabel="Toevoegen" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders custom children', () => {
    render(
      <EmptyState>
        <p>Extra inhoud</p>
      </EmptyState>,
    );
    expect(screen.getByText('Extra inhoud')).toBeInTheDocument();
  });

  it('applies the size class', () => {
    const { container } = render(<EmptyState size="lg" />);
    expect(container.querySelector('.empty-state-lg')).toBeInTheDocument();
  });
});
