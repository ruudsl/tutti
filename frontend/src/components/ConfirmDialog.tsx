import { ReactNode, memo, useEffect, useRef, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from './Icon';

interface ConfirmDialogProps {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'info';
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

/**
 * Confirmation dialog component with enhanced accessibility.
 * Uses role="alertdialog" for confirmation dialogs (WCAG 4.1.2).
 * Use instead of window.confirm() for better UX.
 */
export const ConfirmDialog = memo(function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel,
  variant = 'danger',
  onConfirm,
  onCancel,
  isLoading = false,
}: ConfirmDialogProps) {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const previousActiveElement = useRef<Element | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  const buttonClass = {
    danger: 'btn-danger',
    warning: 'btn-warning',
    info: 'btn-primary',
  }[variant];

  // Focus management and keyboard handling
  useEffect(() => {
    previousActiveElement.current = document.activeElement;

    // Focus the cancel button for safety (not the confirm button)
    const cancelButton = dialogRef.current?.querySelector<HTMLElement>('button.btn-outline');
    if (cancelButton) {
      cancelButton.focus();
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
        return;
      }

      // Focus trap
      if (e.key === 'Tab' && dialogRef.current) {
        const focusableElements = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled])'));
        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey && document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        } else if (!e.shiftKey && document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
      if (previousActiveElement.current instanceof HTMLElement) {
        previousActiveElement.current.focus();
      }
    };
  }, [onCancel]);

  return (
    <div className="modal-overlay" onClick={onCancel} role="presentation">
      <div
        ref={dialogRef}
        className="modal modal-small"
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
      >
        <div className="modal-header">
          <h3 className="modal-title" id={titleId}>
            {title}
          </h3>
          <button className="modal-close" onClick={onCancel} aria-label={t('accessibility.closeModal')} type="button">
            <Icon name="close" size={20} />
          </button>
        </div>
        <div className="modal-body" id={descriptionId}>
          {typeof message === 'string' ? <p>{message}</p> : message}
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-outline" onClick={onCancel} disabled={isLoading}>
            {cancelLabel || t('common.cancel')}
          </button>
          <button
            ref={confirmButtonRef}
            type="button"
            className={`btn ${buttonClass}`}
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading ? t('accessibility.processing') : confirmLabel || t('common.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
});

export default ConfirmDialog;
