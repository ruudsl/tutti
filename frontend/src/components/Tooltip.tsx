import { useState, useRef, useEffect, ReactNode, CSSProperties, useId } from 'react';

type TooltipPosition = 'top' | 'bottom' | 'left' | 'right';

interface TooltipProps {
  /** Content to display in the tooltip */
  content: ReactNode;
  /** Element that triggers the tooltip */
  children: ReactNode;
  /** Position of the tooltip relative to the trigger */
  position?: TooltipPosition;
  /** Delay before showing tooltip in ms (default: 300) */
  delay?: number;
  /** Whether the tooltip is disabled */
  disabled?: boolean;
  /** Custom max width */
  maxWidth?: number;
  /** Whether to show arrow */
  showArrow?: boolean;
  /** Custom class name */
  className?: string;
  /** For onboarding: highlight the trigger element */
  highlight?: boolean;
  /** For onboarding: step number to display */
  step?: number;
  /** For onboarding: total steps */
  totalSteps?: number;
  /** For onboarding: callback when dismissed */
  onDismiss?: () => void;
  /** For onboarding: force show (controlled mode) */
  forceShow?: boolean;
  /** Auto-flip position when there's not enough space */
  autoFlip?: boolean;
}

/**
 * Tooltip component for displaying hints and onboarding information.
 *
 * @example
 * ```tsx
 * // Basic tooltip
 * <Tooltip content="This is a tooltip">
 *   <button>Hover me</button>
 * </Tooltip>
 *
 * // Onboarding hint
 * <Tooltip
 *   content="Click here to add a new music piece"
 *   highlight
 *   step={1}
 *   totalSteps={5}
 *   forceShow={showOnboarding}
 *   onDismiss={() => setShowOnboarding(false)}
 * >
 *   <button>Add Music</button>
 * </Tooltip>
 * ```
 */
export function Tooltip({
  content,
  children,
  position = 'top',
  delay = 300,
  disabled = false,
  maxWidth = 250,
  showArrow = true,
  className = '',
  highlight = false,
  step,
  totalSteps,
  onDismiss,
  forceShow = false,
  autoFlip = true,
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState<{ top: number; left: number } | null>(null);
  const [actualPosition, setActualPosition] = useState<TooltipPosition>(position);
  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const tooltipId = useId();

  const showTooltip = forceShow || isVisible;

  // Calculate tooltip position with auto-flip support
  useEffect(() => {
    if (!showTooltip || !triggerRef.current || !tooltipRef.current) return;

    const trigger = triggerRef.current.getBoundingClientRect();
    const tooltip = tooltipRef.current.getBoundingClientRect();
    const spacing = 8;
    const viewportPadding = 10;

    // Helper to calculate position for a given placement
    const calculatePosition = (placement: TooltipPosition): { top: number; left: number; fits: boolean } => {
      let top = 0;
      let left = 0;
      let fits = true;

      switch (placement) {
        case 'top':
          top = trigger.top - tooltip.height - spacing;
          left = trigger.left + (trigger.width - tooltip.width) / 2;
          fits = top >= viewportPadding;
          break;
        case 'bottom':
          top = trigger.bottom + spacing;
          left = trigger.left + (trigger.width - tooltip.width) / 2;
          fits = top + tooltip.height <= window.innerHeight - viewportPadding;
          break;
        case 'left':
          top = trigger.top + (trigger.height - tooltip.height) / 2;
          left = trigger.left - tooltip.width - spacing;
          fits = left >= viewportPadding;
          break;
        case 'right':
          top = trigger.top + (trigger.height - tooltip.height) / 2;
          left = trigger.right + spacing;
          fits = left + tooltip.width <= window.innerWidth - viewportPadding;
          break;
      }

      return { top, left, fits };
    };

    // Opposite positions for flipping
    const opposites: Record<TooltipPosition, TooltipPosition> = {
      top: 'bottom',
      bottom: 'top',
      left: 'right',
      right: 'left',
    };

    let finalPosition = position;
    const initialCalc = calculatePosition(position);
    const fits = initialCalc.fits;
    let { top, left } = initialCalc;

    // Auto-flip to opposite side if it doesn't fit
    if (autoFlip && !fits) {
      const opposite = opposites[position];
      const oppositeCalc = calculatePosition(opposite);
      if (oppositeCalc.fits) {
        finalPosition = opposite;
        top = oppositeCalc.top;
        left = oppositeCalc.left;
      }
    }

    // Keep tooltip within viewport (final adjustment)
    left = Math.max(viewportPadding, Math.min(left, window.innerWidth - tooltip.width - viewportPadding));
    top = Math.max(viewportPadding, Math.min(top, window.innerHeight - tooltip.height - viewportPadding));

    setActualPosition(finalPosition);
    setTooltipPosition({ top, left });
  }, [showTooltip, position, autoFlip]);

  const handleMouseEnter = () => {
    if (disabled || forceShow) return;
    timeoutRef.current = setTimeout(() => setIsVisible(true), delay);
  };

  const handleMouseLeave = () => {
    if (forceShow) return;
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setIsVisible(false);
  };

  const handleFocus = () => {
    if (disabled || forceShow) return;
    setIsVisible(true);
  };

  const handleBlur = () => {
    if (forceShow) return;
    setIsVisible(false);
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const tooltipStyles: CSSProperties = {
    position: 'fixed',
    zIndex: 9999,
    maxWidth: `${maxWidth}px`,
    padding: '8px 12px',
    backgroundColor: highlight ? 'var(--primary)' : 'rgba(0, 0, 0, 0.9)',
    color: 'white',
    borderRadius: '8px',
    fontSize: '14px',
    lineHeight: 1.5,
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
    pointerEvents: forceShow ? 'auto' : 'none',
    opacity: showTooltip && tooltipPosition ? 1 : 0,
    transform: showTooltip && tooltipPosition ? 'scale(1)' : 'scale(0.95)',
    transition: 'opacity 0.15s ease, transform 0.15s ease',
    top: tooltipPosition?.top ?? 0,
    left: tooltipPosition?.left ?? 0,
  };

  const bgColor = highlight ? 'var(--primary)' : 'rgba(0, 0, 0, 0.9)';

  const arrowStyles: Record<TooltipPosition, CSSProperties> = {
    top: {
      position: 'absolute',
      bottom: '-6px',
      left: '50%',
      transform: 'translateX(-50%)',
      width: 0,
      height: 0,
      borderLeft: '6px solid transparent',
      borderRight: '6px solid transparent',
      borderTop: `6px solid ${bgColor}`,
    },
    bottom: {
      position: 'absolute',
      top: '-6px',
      left: '50%',
      transform: 'translateX(-50%)',
      width: 0,
      height: 0,
      borderLeft: '6px solid transparent',
      borderRight: '6px solid transparent',
      borderBottom: `6px solid ${bgColor}`,
    },
    left: {
      position: 'absolute',
      right: '-6px',
      top: '50%',
      transform: 'translateY(-50%)',
      width: 0,
      height: 0,
      borderTop: '6px solid transparent',
      borderBottom: '6px solid transparent',
      borderLeft: `6px solid ${bgColor}`,
    },
    right: {
      position: 'absolute',
      left: '-6px',
      top: '50%',
      transform: 'translateY(-50%)',
      width: 0,
      height: 0,
      borderTop: '6px solid transparent',
      borderBottom: '6px solid transparent',
      borderRight: `6px solid ${bgColor}`,
    },
  };

  const highlightStyles: CSSProperties = highlight
    ? {
        position: 'relative',
        zIndex: 9998,
        boxShadow: '0 0 0 4px var(--primary), 0 0 0 6px rgba(59, 130, 246, 0.3)',
        borderRadius: '4px',
      }
    : {};

  return (
    <>
      <div
        ref={triggerRef}
        className={`tooltip-trigger ${className}`}
        style={{ display: 'inline-block', ...highlightStyles }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onFocus={handleFocus}
        onBlur={handleBlur}
        aria-describedby={showTooltip ? tooltipId : undefined}
      >
        {children}
      </div>

      {showTooltip && (
        <div
          ref={tooltipRef}
          id={tooltipId}
          className="tooltip"
          style={tooltipStyles}
          role="tooltip"
          aria-live="polite"
        >
          {content}

          {/* Step indicator for onboarding */}
          {step !== undefined && totalSteps !== undefined && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginTop: '8px',
                paddingTop: '8px',
                borderTop: '1px solid rgba(255, 255, 255, 0.2)',
              }}
            >
              <span style={{ fontSize: '12px', opacity: 0.8 }}>
                Stap {step} van {totalSteps}
              </span>
              {onDismiss && (
                <button
                  onClick={onDismiss}
                  style={{
                    background: 'rgba(255, 255, 255, 0.2)',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '4px 8px',
                    color: 'white',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                  type="button"
                >
                  Begrepen
                </button>
              )}
            </div>
          )}

          {/* Arrow - uses actualPosition for auto-flipped tooltips */}
          {showArrow && <div style={arrowStyles[actualPosition]} />}
        </div>
      )}
    </>
  );
}

export default Tooltip;
