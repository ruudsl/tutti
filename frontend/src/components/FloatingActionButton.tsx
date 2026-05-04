import { useState, useRef, useEffect, ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import { triggerHaptic, isHapticSupported } from '../hooks/useHapticFeedback';

interface FABAction {
  icon: IconName;
  label: string;
  onClick: () => void;
  color?: string;
}

interface FloatingActionButtonProps {
  /** Main icon when closed */
  icon?: IconName;
  /** Icon when open (defaults to close icon) */
  openIcon?: IconName;
  /** Primary color (default: var(--primary)) */
  color?: string;
  /** Position on screen */
  position?: 'bottom-right' | 'bottom-left' | 'bottom-center';
  /** Actions to show when expanded */
  actions?: FABAction[];
  /** Click handler for single-action FAB */
  onClick?: () => void;
  /** Label for accessibility */
  label?: string;
  /** Whether to show labels next to action icons */
  showLabels?: boolean;
  /** Custom children instead of default icon */
  children?: ReactNode;
  /** Whether FAB is hidden */
  hidden?: boolean;
  /** Bottom offset in pixels (useful for bottom navigation) */
  bottomOffset?: number;
}

/**
 * Floating Action Button component for mobile.
 * Can be a single action or expand to show multiple actions.
 *
 * @example
 * ```tsx
 * // Single action FAB
 * <FloatingActionButton
 *   icon="plus"
 *   label="Add item"
 *   onClick={() => setShowModal(true)}
 * />
 *
 * // Multi-action FAB
 * <FloatingActionButton
 *   icon="plus"
 *   actions={[
 *     { icon: 'upload', label: 'Upload', onClick: handleUpload },
 *     { icon: 'camera', label: 'Camera', onClick: handleCamera },
 *   ]}
 * />
 * ```
 */
export function FloatingActionButton({
  icon = 'plus',
  openIcon = 'close',
  color,
  position = 'bottom-right',
  actions,
  onClick,
  label = 'Menu',
  showLabels = true,
  children,
  hidden = false,
  bottomOffset = 0,
}: FloatingActionButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Close on escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

  const handleMainClick = () => {
    if (isHapticSupported()) {
      triggerHaptic('light');
    }

    if (actions && actions.length > 0) {
      setIsOpen(!isOpen);
    } else if (onClick) {
      onClick();
    }
  };

  const handleActionClick = (action: FABAction) => {
    if (isHapticSupported()) {
      triggerHaptic('selection');
    }
    setIsOpen(false);
    action.onClick();
  };

  const positionStyles: Record<string, React.CSSProperties> = {
    'bottom-right': { right: '16px', bottom: `${16 + bottomOffset}px` },
    'bottom-left': { left: '16px', bottom: `${16 + bottomOffset}px` },
    'bottom-center': { left: '50%', transform: 'translateX(-50%)', bottom: `${16 + bottomOffset}px` },
  };

  if (hidden) return null;

  return (
    <div
      ref={containerRef}
      className="fab-container"
      style={{
        position: 'fixed',
        zIndex: 100,
        ...positionStyles[position],
      }}
    >
      {/* Action buttons */}
      {actions && actions.length > 0 && (
        <div
          className="fab-actions"
          style={{
            display: 'flex',
            flexDirection: 'column-reverse',
            gap: '12px',
            marginBottom: '12px',
            opacity: isOpen ? 1 : 0,
            transform: isOpen ? 'translateY(0)' : 'translateY(20px)',
            pointerEvents: isOpen ? 'auto' : 'none',
            transition: 'opacity 0.2s ease, transform 0.2s ease',
          }}
        >
          {actions.map((action, index) => (
            <div
              key={index}
              className="fab-action-item"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                justifyContent: 'flex-end',
                opacity: isOpen ? 1 : 0,
                transform: isOpen ? 'translateY(0)' : 'translateY(10px)',
                transition: `opacity 0.2s ease ${index * 0.05}s, transform 0.2s ease ${index * 0.05}s`,
              }}
            >
              {showLabels && (
                <span
                  className="fab-action-label"
                  style={{
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    color: 'white',
                    padding: '6px 12px',
                    borderRadius: '4px',
                    fontSize: '14px',
                    fontWeight: 500,
                    whiteSpace: 'nowrap',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
                  }}
                >
                  {action.label}
                </span>
              )}
              <button
                className="fab-action-btn"
                onClick={() => handleActionClick(action)}
                aria-label={action.label}
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  border: 'none',
                  backgroundColor: action.color || 'var(--surface)',
                  color: action.color ? 'white' : 'var(--text)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
                  transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                }}
              >
                <Icon name={action.icon} size={22} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Main FAB button */}
      <button
        className="fab-main"
        onClick={handleMainClick}
        aria-label={label}
        aria-expanded={isOpen}
        style={{
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          border: 'none',
          backgroundColor: color || 'var(--primary)',
          color: 'white',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
          transition: 'transform 0.2s ease, box-shadow 0.2s ease',
          transform: isOpen ? 'rotate(45deg)' : 'rotate(0deg)',
        }}
      >
        {children || <Icon name={isOpen ? openIcon : icon} size={24} />}
      </button>

      {/* Backdrop */}
      {isOpen && (
        <div
          className="fab-backdrop"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.3)',
            zIndex: -1,
          }}
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
}

export default FloatingActionButton;
