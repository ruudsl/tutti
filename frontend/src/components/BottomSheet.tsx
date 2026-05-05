import { useEffect, useRef, useCallback, ReactNode } from 'react';
import { useSwipeGesture } from '../hooks/useSwipeGesture';
import { Icon } from './Icon';

interface BottomSheetProps {
  /** Whether the bottom sheet is open */
  isOpen: boolean;
  /** Callback when the sheet should close */
  onClose: () => void;
  /** Title for the sheet header */
  title?: string;
  /** Content to render inside the sheet */
  children: ReactNode;
  /** Height of the sheet: 'auto' | 'half' | 'full' */
  height?: 'auto' | 'half' | 'full';
  /** Whether the sheet can be dismissed by swiping down */
  swipeToDismiss?: boolean;
  /** Whether to show the drag handle indicator */
  showHandle?: boolean;
  /** Custom class name */
  className?: string;
  /** Footer content */
  footer?: ReactNode;
}

/**
 * Bottom sheet modal variant for mobile.
 * Slides up from the bottom of the screen with swipe-to-dismiss support.
 *
 * @example
 * ```tsx
 * <BottomSheet
 *   isOpen={showSheet}
 *   onClose={() => setShowSheet(false)}
 *   title="Select Option"
 *   swipeToDismiss
 * >
 *   <div>Sheet content here</div>
 * </BottomSheet>
 * ```
 */
export function BottomSheet({
  isOpen,
  onClose,
  title,
  children,
  height = 'auto',
  swipeToDismiss = true,
  showHandle = true,
  className = '',
  footer,
}: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const dragOffsetRef = useRef(0);
  const previousActiveElement = useRef<Element | null>(null);

  // Handle swipe to dismiss
  const handleSwipeDown = useCallback(() => {
    if (swipeToDismiss) {
      onClose();
    }
  }, [swipeToDismiss, onClose]);

  const handleSwipeMove = useCallback((_deltaX: number, deltaY: number) => {
    if (!swipeToDismiss || !sheetRef.current) return;

    // Only track downward swipes
    if (deltaY > 0) {
      dragOffsetRef.current = deltaY;
      sheetRef.current.style.transform = `translateY(${deltaY}px)`;
    }
  }, [swipeToDismiss]);

  const handleSwipeEnd = useCallback((completed: boolean) => {
    if (!sheetRef.current) return;

    // If dragged more than 100px, close. Otherwise, snap back
    if (completed || dragOffsetRef.current > 100) {
      onClose();
    } else {
      sheetRef.current.style.transform = 'translateY(0)';
    }
    dragOffsetRef.current = 0;
  }, [onClose]);

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
    }
  );

  // Focus management and escape key
  useEffect(() => {
    if (!isOpen) return;

    previousActiveElement.current = document.activeElement;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
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
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const heightStyles: Record<string, React.CSSProperties> = {
    auto: { maxHeight: '90vh' },
    half: { height: '50vh' },
    full: { height: '100vh', borderRadius: 0 },
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="bottom-sheet-backdrop"
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          zIndex: 299,
          animation: 'fadeIn 0.2s ease',
        }}
      />

      {/* Sheet */}
      <div
        ref={(el) => {
          (sheetRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
          (swipeRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
        }}
        className={`bottom-sheet ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'bottom-sheet-title' : undefined}
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: 'var(--surface)',
          borderTopLeftRadius: height === 'full' ? 0 : '16px',
          borderTopRightRadius: height === 'full' ? 0 : '16px',
          boxShadow: '0 -4px 20px rgba(0, 0, 0, 0.15)',
          zIndex: 300,
          display: 'flex',
          flexDirection: 'column',
          animation: 'slideUp 0.3s ease',
          paddingBottom: 'env(safe-area-inset-bottom, 0)',
          ...heightStyles[height],
        }}
      >
        {/* Handle */}
        {showHandle && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              padding: '12px 0 8px',
              cursor: swipeToDismiss ? 'grab' : 'default',
            }}
          >
            <div
              style={{
                width: '36px',
                height: '4px',
                backgroundColor: 'var(--border)',
                borderRadius: '2px',
              }}
            />
          </div>
        )}

        {/* Header */}
        {title && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 16px 12px',
              borderBottom: '1px solid var(--border)',
            }}
          >
            <h3
              id="bottom-sheet-title"
              style={{
                margin: 0,
                fontSize: '18px',
                fontWeight: 600,
              }}
            >
              {title}
            </h3>
            <button
              onClick={onClose}
              aria-label="Sluiten"
              style={{
                background: 'none',
                border: 'none',
                padding: '8px',
                cursor: 'pointer',
                color: 'var(--text-light)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name="close" size={20} />
            </button>
          </div>
        )}

        {/* Content */}
        <div
          ref={contentRef}
          style={{
            flex: 1,
            overflow: 'auto',
            padding: '16px',
          }}
        >
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div
            style={{
              padding: '12px 16px',
              borderTop: '1px solid var(--border)',
              backgroundColor: 'var(--background)',
            }}
          >
            {footer}
          </div>
        )}

        <style>{`
          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          @keyframes slideUp {
            from { transform: translateY(100%); }
            to { transform: translateY(0); }
          }
        `}</style>
      </div>
    </>
  );
}

export default BottomSheet;
