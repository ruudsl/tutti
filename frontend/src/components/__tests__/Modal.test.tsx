import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Modal, FormModal } from '../Modal'

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'accessibility.closeModal': 'Close modal',
        'accessibility.processing': 'Processing...',
        'common.cancel': 'Cancel',
        'common.save': 'Save',
      }
      return translations[key] || key
    },
  }),
}))

// Mock useSwipeGesture hook
vi.mock('../../hooks/useSwipeGesture', () => ({
  useSwipeGesture: () => ({
    ref: { current: null },
  }),
}))

// Mock Icon component
vi.mock('../Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`}>{name}</span>,
}))

describe('Modal', () => {
  const defaultProps = {
    title: 'Test Modal',
    onClose: vi.fn(),
    children: <div>Modal Content</div>,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    // Reset body overflow
    document.body.style.overflow = ''
  })

  it('renders modal with title and content', () => {
    render(<Modal {...defaultProps} />)

    expect(screen.getByText('Test Modal')).toBeInTheDocument()
    expect(screen.getByText('Modal Content')).toBeInTheDocument()
  })

  it('renders with accessible dialog role', () => {
    render(<Modal {...defaultProps} />)

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAttribute('aria-labelledby')
  })

  it('calls onClose when clicking overlay', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<Modal {...defaultProps} onClose={onClose} />)

    const overlay = screen.getByRole('presentation')
    await user.click(overlay)

    expect(onClose).toHaveBeenCalled()
  })

  it('does not call onClose when clicking modal content', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<Modal {...defaultProps} onClose={onClose} />)

    const dialog = screen.getByRole('dialog')
    await user.click(dialog)

    expect(onClose).not.toHaveBeenCalled()
  })

  it('calls onClose when pressing Escape key', () => {
    const onClose = vi.fn()
    render(<Modal {...defaultProps} onClose={onClose} />)

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onClose).toHaveBeenCalled()
  })

  it('calls onClose when clicking close button', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<Modal {...defaultProps} onClose={onClose} />)

    const closeButton = screen.getByLabelText('Close modal')
    await user.click(closeButton)

    expect(onClose).toHaveBeenCalled()
  })

  it('renders footer when provided', () => {
    render(
      <Modal {...defaultProps} footer={<button>Footer Button</button>} />
    )

    expect(screen.getByText('Footer Button')).toBeInTheDocument()
  })

  it('applies size classes correctly', () => {
    const { rerender } = render(<Modal {...defaultProps} size="small" />)
    expect(screen.getByRole('dialog')).toHaveClass('modal-small')

    rerender(<Modal {...defaultProps} size="large" />)
    expect(screen.getByRole('dialog')).toHaveClass('modal-large')

    rerender(<Modal {...defaultProps} size="medium" />)
    expect(screen.getByRole('dialog')).not.toHaveClass('modal-small')
    expect(screen.getByRole('dialog')).not.toHaveClass('modal-large')
  })

  it('applies custom className', () => {
    render(<Modal {...defaultProps} className="custom-modal" />)

    expect(screen.getByRole('dialog')).toHaveClass('custom-modal')
  })

  it('prevents body scroll when mounted', () => {
    render(<Modal {...defaultProps} />)

    expect(document.body.style.overflow).toBe('hidden')
  })

  it('restores body scroll when unmounted', () => {
    const { unmount } = render(<Modal {...defaultProps} />)

    unmount()

    expect(document.body.style.overflow).toBe('')
  })
})

describe('FormModal', () => {
  const defaultProps = {
    title: 'Form Modal',
    onClose: vi.fn(),
    onSubmit: vi.fn(),
    children: <input type="text" name="test" />,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders form modal with submit and cancel buttons', () => {
    render(<FormModal {...defaultProps} />)

    expect(screen.getByText('Save')).toBeInTheDocument()
    expect(screen.getByText('Cancel')).toBeInTheDocument()
  })

  it('calls onSubmit when form is submitted', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<FormModal {...defaultProps} onSubmit={onSubmit} />)

    const submitButton = screen.getByText('Save')
    await user.click(submitButton)

    expect(onSubmit).toHaveBeenCalled()
  })

  it('calls onClose when cancel button is clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<FormModal {...defaultProps} onClose={onClose} />)

    const cancelButton = screen.getByText('Cancel')
    await user.click(cancelButton)

    expect(onClose).toHaveBeenCalled()
  })

  it('disables buttons when isSubmitting is true', () => {
    render(<FormModal {...defaultProps} isSubmitting={true} />)

    expect(screen.getByText('Processing...')).toBeInTheDocument()
    expect(screen.getByText('Cancel')).toBeDisabled()
    expect(screen.getByText('Processing...')).toBeDisabled()
  })

  it('disables submit button when submitDisabled is true', () => {
    render(<FormModal {...defaultProps} submitDisabled={true} />)

    expect(screen.getByText('Save')).toBeDisabled()
  })

  it('renders custom button labels', () => {
    render(
      <FormModal
        {...defaultProps}
        submitLabel="Create"
        cancelLabel="Discard"
      />
    )

    expect(screen.getByText('Create')).toBeInTheDocument()
    expect(screen.getByText('Discard')).toBeInTheDocument()
  })

  it('prevents default form submission', async () => {
    const onSubmit = vi.fn()
    render(<FormModal {...defaultProps} onSubmit={onSubmit} />)

    const form = document.querySelector('form')
    const submitEvent = new Event('submit', { bubbles: true, cancelable: true })

    form?.dispatchEvent(submitEvent)

    // The form should have a submit handler that prevents default
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalled()
    })
  })
})
