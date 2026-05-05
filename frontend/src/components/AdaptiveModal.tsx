import { ReactNode } from 'react';
import { useIsMobile } from '../hooks/useIsMobile';
import { Modal, FormModal } from './Modal';
import { BottomSheet } from './BottomSheet';

interface AdaptiveModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Modal title */
  title: string;
  /** Modal content */
  children: ReactNode;
  /** Callback when closed */
  onClose: () => void;
  /** Optional footer content (desktop only, for BottomSheet use the footer prop) */
  footer?: ReactNode;
  /** Modal size (desktop only) */
  size?: 'small' | 'medium' | 'large';
  /** BottomSheet height (mobile only) */
  sheetHeight?: 'auto' | 'half' | 'full';
  /** Whether to enable swipe to dismiss on mobile */
  swipeToDismiss?: boolean;
  /** Additional class name */
  className?: string;
  /** Mobile breakpoint in pixels */
  mobileBreakpoint?: number;
}

/**
 * AdaptiveModal component that renders as a centered modal on desktop
 * and as a bottom sheet on mobile devices.
 *
 * @example
 * ```tsx
 * <AdaptiveModal
 *   isOpen={showModal}
 *   title="Select Option"
 *   onClose={() => setShowModal(false)}
 * >
 *   <div>Modal content here</div>
 * </AdaptiveModal>
 * ```
 */
export function AdaptiveModal({
  isOpen,
  title,
  children,
  onClose,
  footer,
  size = 'medium',
  sheetHeight = 'auto',
  swipeToDismiss = true,
  className = '',
  mobileBreakpoint = 768,
}: AdaptiveModalProps) {
  const isMobile = useIsMobile(mobileBreakpoint);

  if (!isOpen) return null;

  if (isMobile) {
    return (
      <BottomSheet
        isOpen={isOpen}
        onClose={onClose}
        title={title}
        height={sheetHeight}
        swipeToDismiss={swipeToDismiss}
        className={className}
        footer={footer}
      >
        {children}
      </BottomSheet>
    );
  }

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={footer}
      size={size}
      className={className}
    >
      {children}
    </Modal>
  );
}

interface AdaptiveFormModalProps extends Omit<AdaptiveModalProps, 'footer'> {
  /** Form submit handler */
  onSubmit: (e: React.FormEvent) => void;
  /** Submit button label */
  submitLabel?: string;
  /** Cancel button label */
  cancelLabel?: string;
  /** Whether form is submitting */
  isSubmitting?: boolean;
  /** Whether submit is disabled */
  submitDisabled?: boolean;
}

/**
 * AdaptiveFormModal component that renders as a form modal on desktop
 * and as a bottom sheet with form controls on mobile.
 *
 * @example
 * ```tsx
 * <AdaptiveFormModal
 *   isOpen={showForm}
 *   title="Create Item"
 *   onClose={() => setShowForm(false)}
 *   onSubmit={handleSubmit}
 *   isSubmitting={loading}
 * >
 *   <input type="text" ... />
 * </AdaptiveFormModal>
 * ```
 */
export function AdaptiveFormModal({
  isOpen,
  title,
  children,
  onClose,
  onSubmit,
  submitLabel,
  cancelLabel,
  isSubmitting = false,
  submitDisabled = false,
  size = 'medium',
  sheetHeight = 'auto',
  swipeToDismiss = true,
  className = '',
  mobileBreakpoint = 768,
}: AdaptiveFormModalProps) {
  const isMobile = useIsMobile(mobileBreakpoint);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(e);
  };

  if (isMobile) {
    const footer = (
      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
        <button
          type="button"
          className="btn btn-outline"
          onClick={onClose}
          disabled={isSubmitting}
        >
          {cancelLabel || 'Annuleren'}
        </button>
        <button
          type="submit"
          form="adaptive-form-mobile"
          className="btn btn-primary"
          disabled={isSubmitting || submitDisabled}
        >
          {isSubmitting ? 'Bezig...' : (submitLabel || 'Opslaan')}
        </button>
      </div>
    );

    return (
      <BottomSheet
        isOpen={isOpen}
        onClose={onClose}
        title={title}
        height={sheetHeight}
        swipeToDismiss={!isSubmitting && swipeToDismiss}
        className={className}
        footer={footer}
      >
        <form id="adaptive-form-mobile" onSubmit={handleSubmit}>
          {children}
        </form>
      </BottomSheet>
    );
  }

  return (
    <FormModal
      title={title}
      onClose={onClose}
      onSubmit={onSubmit}
      submitLabel={submitLabel}
      cancelLabel={cancelLabel}
      isSubmitting={isSubmitting}
      submitDisabled={submitDisabled}
      size={size}
    >
      {children}
    </FormModal>
  );
}

export default AdaptiveModal;
