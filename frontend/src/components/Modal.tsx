import { useEffect, useRef, useId, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

interface ModalProps {
  title: string;
  children: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  size?: 'small' | 'medium' | 'large';
  className?: string;
}

/**
 * Reusable Modal component with accessibility features
 * - Closes on Escape key
 * - Closes on overlay click
 * - Focus trap
 * - Unique ARIA IDs per instance
 */
export function Modal({ title, children, onClose, footer, size = 'medium', className = '' }: ModalProps) {
  const { t } = useTranslation();
  const modalRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<Element | null>(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();

  // Keep onClose ref updated
  onCloseRef.current = onClose;

  // Focus trap and cleanup - run only once on mount
  useEffect(() => {
    // Store currently focused element
    previousActiveElement.current = document.activeElement;

    // Focus the close button (or first focusable element) on mount
    const closeButton = modalRef.current?.querySelector<HTMLElement>('button.modal-close');
    if (closeButton) {
      closeButton.focus();
    } else {
      modalRef.current?.focus();
    }

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
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <div
        ref={modalRef}
        className={`modal ${sizeClass} ${className}`.trim()}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="modal-header">
          <h3 className="modal-title" id={titleId}>{title}</h3>
          <button
            className="modal-close"
            onClick={onClose}
            aria-label={t('accessibility.closeModal')}
            type="button"
          >
            <span aria-hidden="true">&times;</span>
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
  submitDisabled?: boolean;
}

/**
 * Modal with built-in form structure
 */
export function FormModal({
  title,
  children,
  onClose,
  onSubmit,
  submitLabel,
  cancelLabel,
  isSubmitting = false,
  submitDisabled = false,
  size,
}: FormModalProps) {
  const { t } = useTranslation();
  const formId = useId();

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
            {cancelLabel || t('common.cancel')}
          </button>
          <button
            type="submit"
            form={formId}
            className="btn btn-primary"
            disabled={isSubmitting || submitDisabled}
          >
            {isSubmitting ? t('accessibility.processing') : (submitLabel || t('common.save'))}
          </button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit}>
        {children}
      </form>
    </Modal>
  );
}

export default Modal;
