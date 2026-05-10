import { ReactNode, FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from './Modal';

interface FormModalProps {
  title: string;
  children: ReactNode;
  onClose: () => void;
  onSubmit: () => void;
  isLoading?: boolean;
  submitLabel?: string;
  cancelLabel?: string;
  size?: 'small' | 'medium' | 'large';
}

export function FormModal({
  title,
  children,
  onClose,
  onSubmit,
  isLoading = false,
  submitLabel,
  cancelLabel,
  size = 'medium',
}: FormModalProps) {
  const { t } = useTranslation();
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit();
  };
  const finalSubmitLabel = submitLabel || t('common.save');
  const finalCancelLabel = cancelLabel || t('common.cancel');

  return (
    <Modal
      title={title}
      onClose={onClose}
      size={size}
      footer={
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border rounded-lg hover:bg-gray-50"
            disabled={isLoading}
          >
            {finalCancelLabel}
          </button>
          <button
            type="submit"
            form="form-modal-form"
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            disabled={isLoading}
          >
            {isLoading ? t('common.loading') : finalSubmitLabel}
          </button>
        </div>
      }
    >
      <form id="form-modal-form" onSubmit={handleSubmit}>
        {children}
      </form>
    </Modal>
  );
}

export default FormModal;
