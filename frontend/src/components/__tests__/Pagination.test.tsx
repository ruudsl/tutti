import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Pagination } from '../Pagination';

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      const translations: Record<string, string> = {
        'accessibility.pagination': 'Pagination',
        'accessibility.previousPage': 'Previous page',
        'accessibility.nextPage': 'Next page',
      };
      if (key === 'accessibility.page') return `Page ${params?.number}`;
      return translations[key] || key;
    },
  }),
}));

describe('Pagination', () => {
  it('renders nothing when totalPages is 1', () => {
    const { container } = render(<Pagination page={1} totalPages={1} onPageChange={() => {}} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders page buttons for small page counts', () => {
    render(<Pagination page={1} totalPages={3} onPageChange={() => {}} />);
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('marks current page as active', () => {
    render(<Pagination page={2} totalPages={3} onPageChange={() => {}} />);
    const page2Button = screen.getByText('2');
    expect(page2Button).toHaveAttribute('aria-current', 'page');
  });

  it('disables previous button on first page', () => {
    render(<Pagination page={1} totalPages={3} onPageChange={() => {}} />);
    const prevButton = screen.getByLabelText('Previous page');
    expect(prevButton).toBeDisabled();
  });

  it('disables next button on last page', () => {
    render(<Pagination page={3} totalPages={3} onPageChange={() => {}} />);
    const nextButton = screen.getByLabelText('Next page');
    expect(nextButton).toBeDisabled();
  });

  it('calls onPageChange when clicking a page', async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(<Pagination page={1} totalPages={3} onPageChange={onPageChange} />);
    await user.click(screen.getByText('2'));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it('calls onPageChange when clicking next', async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(<Pagination page={1} totalPages={3} onPageChange={onPageChange} />);
    await user.click(screen.getByLabelText('Next page'));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it('calls onPageChange when clicking previous', async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(<Pagination page={2} totalPages={3} onPageChange={onPageChange} />);
    await user.click(screen.getByLabelText('Previous page'));
    expect(onPageChange).toHaveBeenCalledWith(1);
  });

  it('shows ellipsis for many pages', () => {
    render(<Pagination page={5} totalPages={10} onPageChange={() => {}} />);
    const ellipses = screen.getAllByText('...');
    expect(ellipses.length).toBeGreaterThanOrEqual(1);
  });

  it('shows info text when total and limit provided', () => {
    render(<Pagination page={1} totalPages={3} onPageChange={() => {}} total={75} limit={25} />);
    expect(screen.getByText('1-25 van 75')).toBeInTheDocument();
  });

  it('hides info text when showInfo is false', () => {
    render(<Pagination page={1} totalPages={3} onPageChange={() => {}} total={75} limit={25} showInfo={false} />);
    expect(screen.queryByText('1-25 van 75')).not.toBeInTheDocument();
  });
});
