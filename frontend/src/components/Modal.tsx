import { useEffect, useRef, useId, ReactNode, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useSwipeGesture } from '../hooks/useSwipeGesture';
import { Icon } from './Icon';

/**
 * Get all focusable elements within a container
 */
function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const focusableSelectors = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(', ');

  return Array.from(container.querySelectorAll<HTMLElement>(focusableSelectors));
}

interface ModalProps {
  title: string;
  children: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  size?: 'small' | 'medium' | 'large';
  className?: string;
  /** Enable swipe down to dismiss on mobile */
  swipeToDismiss?: boolean;
}

/**
 * Reusable Modal component with accessibility features
 * - Closes on Escape key
 * - Closes on overlay click
 * - Focus trap
 * - Unique ARIA IDs per instance
 */
export function Modal({
  title,
  children,
  onClose,
  footer,
  size = 'medium',
  className = '',
  swipeToDismiss = false,
}: ModalProps) {
  const { t } = useTranslation();
  const modalRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<Element | null>(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();
  const [swipeOffset, setSwipeOffset] = useState(0);

  // Keep onClose ref updated
  onCloseRef.current = onClose;

  // Swipe to dismiss handling
  const handleSwipeDown = useCallback(() => {
    if (swipeToDismiss) {
      onClose();
    }
  }, [swipeToDismiss, onClose]);

  const handleSwipeMove = useCallback(
    (_deltaX: number, deltaY: number) => {
      if (!swipeToDismiss) return;
      // Only track downward swipes
      if (deltaY > 0) {
        setSwipeOffset(Math.min(deltaY * 0.5, 150));
      }
    },
    [swipeToDismiss],
  );

  const handleSwipeEnd = useCallback(
    (completed: boolean) => {
      if (swipeOffset > 80 || completed) {
        onClose();
      } else {
        setSwipeOffset(0);
      }
    },
    [swipeOffset, onClose],
  );

  const { ref: swipeRef } = useSwipeGesture<HTMLDivElement>(
    {
      onSwipeDown: handleSwipeDown,
      onSwipeMove: handleSwipeMove,
      onSwipeEnd: handleSwipeEnd,
    },
    {
      threshold: 50,
      preventScrollOnVerticalSwipe: false,
      disabled: !swipeToDismiss,
    },
  );

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

    // Handle keyboard events: Escape to close and Tab for focus trap
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseRef.current();
        return;
      }

      // Focus trap: cycle focus within modal
      if (e.key === 'Tab' && modalRef.current) {
        const focusableElements = getFocusableElements(modalRef.current);
        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          // Shift+Tab: if on first element, wrap to last
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          // Tab: if on last element, wrap to first
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
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

  /**
   * De modal gaat naar document.body en niet naar de plek in de boom waar hij
   * geschreven staat.
   *
   * .modal-overlay is position: fixed en rekent daarmee vanaf het venster -
   * behalve als een voorouder een transform heeft, want dan wordt die het
   * referentiekader. Dat gebeurde hier: theme-2026.css geeft elk direct kind
   * van .main-content een page-in-animatie met fill-mode both, en de
   * eindtoestand daarvan is een transform. Die blijft dus permanent staan.
   *
   * Gevolg: de overlay vulde de pagina-div in plaats van het scherm, en een
   * formulier van gemiddelde hoogte kwam met zijn bovenkant boven het venster
   * uit. Op de kledingpagina was het eerste veld daardoor niet te zien.
   *
   * Buiten die boom kan geen enkele voorouder er nog invloed op hebben, ook
   * geen animatie die later wordt toegevoegd.
   */
  return createPortal(
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <div
        ref={(el) => {
          (modalRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
          (swipeRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
        }}
        className={`modal ${sizeClass} ${className}`.trim()}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        style={{
          transform: swipeOffset > 0 ? `translateY(${swipeOffset}px)` : undefined,
          opacity: swipeOffset > 0 ? 1 - swipeOffset / 200 : 1,
          transition: swipeOffset === 0 ? 'transform 0.2s ease, opacity 0.2s ease' : 'none',
        }}
      >
        <div className="modal-header">
          <h3 className="modal-title" id={titleId}>
            {title}
          </h3>
          <button className="modal-close" onClick={onClose} aria-label={t('accessibility.closeModal')} type="button">
            <Icon name="close" size={20} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>,
    document.body,
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
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={isSubmitting}>
            {cancelLabel || t('common.cancel')}
          </button>
          <button type="submit" form={formId} className="btn btn-primary" disabled={isSubmitting || submitDisabled}>
            {isSubmitting ? t('accessibility.processing') : submitLabel || t('common.save')}
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
