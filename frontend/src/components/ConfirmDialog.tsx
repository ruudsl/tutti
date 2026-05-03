import { ReactNode, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from './Modal';

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
 * Confirmation dialog component
 * Use instead of window.confirm() for better UX
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

  const buttonClass = {
    danger: 'btn-danger',
    warning: 'btn-warning',
    info: 'btn-primary',
  }[variant];

  return (
    <Modal
      title={title}
      onClose={onCancel}
      size="small"
      footer={
        <>
          <button
            type="button"
            className="btn btn-outline"
            onClick={onCancel}
            disabled={isLoading}
          >
            {cancelLabel || t('common.cancel')}
          </button>
          <button
            type="button"
            className={`btn ${buttonClass}`}
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading ? t('accessibility.processing') : (confirmLabel || t('common.confirm'))}
          </button>
        </>
      }
    >
      {typeof message === 'string' ? <p>{message}</p> : message}
    </Modal>
  );
});

export default ConfirmDialog;
