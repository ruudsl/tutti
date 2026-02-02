import { useEffect, useRef, ReactNode } from 'react';

interface ModalProps {
  title: string;
  children: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  size?: 'small' | 'medium' | 'large';
}

/**
 * Reusable Modal component with accessibility features
 * - Closes on Escape key
 * - Closes on overlay click
 * - Focus trap
 */
export function Modal({ title, children, onClose, footer, size = 'medium' }: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<Element | null>(null);
  const onCloseRef = useRef(onClose);

  // Keep onClose ref updated
  onCloseRef.current = onClose;

  // Focus trap and cleanup - run only once on mount
  useEffect(() => {
    // Store currently focused element
    previousActiveElement.current = document.activeElement;

    // Focus the modal only on initial mount
    modalRef.current?.focus();

    // Handle Escape key using ref to avoid re-running effect
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseRef.current();
      }
    };

    // Add event listener
    document.addEventListener('keydown', handleKeyDown);

    // Prevent body scroll
    document.body.style.overflow = 'hidden';

    return () => {
      // Remove event listener
      document.removeEventListener('keydown', handleKeyDown);

      // Restore body scroll
      document.body.style.overflow = '';

      // Restore focus
      if (previousActiveElement.current instanceof HTMLElement) {
        previousActiveElement.current.focus();
      }
    };
  }, []); // Empty dependency - only run on mount/unmount

  const sizeClass = {
    small: 'modal-small',
    medium: '',
    large: 'modal-large',
  }[size];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        ref={modalRef}
        className={`modal ${sizeClass}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        tabIndex={-1}
      >
        <div className="modal-header">
          <h3 className="modal-title" id="modal-title">{title}</h3>
          <button
            className="modal-close"
            onClick={onClose}
            aria-label="Sluiten"
          >
            ×
          </button>
        </div>
        <div className="modal-body">
          {children}
        </div>
        {footer && (
          <div className="modal-footer">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

interface FormModalProps extends Omit<ModalProps, 'footer'> {
  onSubmit: (e: React.FormEvent) => void;
  submitLabel?: string;
  cancelLabel?: string;
  isSubmitting?: boolean;
}

/**
 * Modal with built-in form structure
 */
export function FormModal({
  title,
  children,
  onClose,
  onSubmit,
  submitLabel = 'Opslaan',
  cancelLabel = 'Annuleren',
  isSubmitting = false,
  size,
}: FormModalProps) {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(e);
  };

  return (
    <Modal
      title={title}
      onClose={onClose}
      size={size}
      footer={
        <>
          <button
            type="button"
            className="btn btn-outline"
            onClick={onClose}
            disabled={isSubmitting}
          >
            {cancelLabel}
          </button>
          <button
            type="submit"
            form="modal-form"
            className="btn btn-primary"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Bezig...' : submitLabel}
          </button>
        </>
      }
    >
      <form id="modal-form" onSubmit={handleSubmit}>
        {children}
      </form>
    </Modal>
  );
}

export default Modal;
