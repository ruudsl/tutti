import { useState, useCallback, ReactNode, CSSProperties } from 'react';
import { useSwipeGesture, SwipeCallbacks, SwipeOptions, SwipeDirection } from '../hooks/useSwipeGesture';

export interface SwipeContainerProps extends SwipeCallbacks, SwipeOptions {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  /** Enable visual feedback during swipe (default: true) */
  visualFeedback?: boolean;
  /** Maximum transform distance for visual feedback in pixels (default: 100) */
  maxTransform?: number;
  /** Show direction indicators (default: false) */
  showIndicators?: boolean;
  /** Indicator labels */
  indicators?: {
    left?: ReactNode;
    right?: ReactNode;
    up?: ReactNode;
    down?: ReactNode;
  };
  /** Custom indicator style */
  indicatorStyle?: CSSProperties;
}

interface SwipeState {
  deltaX: number;
  deltaY: number;
  direction: SwipeDirection | null;
  isActive: boolean;
}

export function SwipeContainer({
  children,
  className = '',
  style,
  visualFeedback = true,
  maxTransform = 100,
  showIndicators = false,
  indicators,
  indicatorStyle,
  onSwipeLeft,
  onSwipeRight,
  onSwipeUp,
  onSwipeDown,
  onSwipeStart,
  onSwipeMove,
  onSwipeEnd,
  ...swipeOptions
}: SwipeContainerProps) {
  const [swipeState, setSwipeState] = useState<SwipeState>({
    deltaX: 0,
    deltaY: 0,
    direction: null,
    isActive: false,
  });

  const handleSwipeStart = useCallback((direction: SwipeDirection | null) => {
    setSwipeState(prev => ({
      ...prev,
      isActive: true,
      direction,
    }));
    onSwipeStart?.(direction);
  }, [onSwipeStart]);

  const handleSwipeMove = useCallback((deltaX: number, deltaY: number, velocity: number) => {
    if (visualFeedback) {
      // Clamp the delta values
      const clampedDeltaX = Math.max(-maxTransform, Math.min(maxTransform, deltaX));
      const clampedDeltaY = Math.max(-maxTransform, Math.min(maxTransform, deltaY));

      setSwipeState(prev => ({
        ...prev,
        deltaX: clampedDeltaX,
        deltaY: clampedDeltaY,
      }));
    }
    onSwipeMove?.(deltaX, deltaY, velocity);
  }, [visualFeedback, maxTransform, onSwipeMove]);

  const handleSwipeEnd = useCallback((completed: boolean, direction: SwipeDirection | null) => {
    setSwipeState({
      deltaX: 0,
      deltaY: 0,
      direction: null,
      isActive: false,
    });
    onSwipeEnd?.(completed, direction);
  }, [onSwipeEnd]);

  const { ref } = useSwipeGesture<HTMLDivElement>(
    {
      onSwipeLeft,
      onSwipeRight,
      onSwipeUp,
      onSwipeDown,
      onSwipeStart: handleSwipeStart,
      onSwipeMove: handleSwipeMove,
      onSwipeEnd: handleSwipeEnd,
    },
    swipeOptions
  );

  // Calculate opacity based on swipe distance
  const opacityReduction = visualFeedback && swipeState.isActive
    ? Math.abs(swipeState.deltaX) / maxTransform * 0.3
    : 0;

  const containerStyle: CSSProperties = {
    ...style,
    position: 'relative',
    touchAction: 'pan-y',
    overflow: 'hidden',
  };

  const contentStyle: CSSProperties = visualFeedback && swipeState.isActive
    ? {
        transform: `translateX(${swipeState.deltaX}px)`,
        opacity: 1 - opacityReduction,
        transition: 'none',
      }
    : {
        transform: 'translateX(0)',
        opacity: 1,
        transition: 'transform 0.2s ease-out, opacity 0.2s ease-out',
      };

  const baseIndicatorStyle: CSSProperties = {
    position: 'absolute',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0.5rem',
    opacity: 0,
    transition: 'opacity 0.2s ease-out',
    pointerEvents: 'none',
    zIndex: 10,
    ...indicatorStyle,
  };

  const leftIndicatorStyle: CSSProperties = {
    ...baseIndicatorStyle,
    left: '0.5rem',
    top: '50%',
    transform: 'translateY(-50%)',
    opacity: swipeState.isActive && swipeState.deltaX < -20 ? Math.min(1, Math.abs(swipeState.deltaX) / 50) : 0,
  };

  const rightIndicatorStyle: CSSProperties = {
    ...baseIndicatorStyle,
    right: '0.5rem',
    top: '50%',
    transform: 'translateY(-50%)',
    opacity: swipeState.isActive && swipeState.deltaX > 20 ? Math.min(1, swipeState.deltaX / 50) : 0,
  };

  const upIndicatorStyle: CSSProperties = {
    ...baseIndicatorStyle,
    top: '0.5rem',
    left: '50%',
    transform: 'translateX(-50%)',
    opacity: swipeState.isActive && swipeState.deltaY < -20 ? Math.min(1, Math.abs(swipeState.deltaY) / 50) : 0,
  };

  const downIndicatorStyle: CSSProperties = {
    ...baseIndicatorStyle,
    bottom: '0.5rem',
    left: '50%',
    transform: 'translateX(-50%)',
    opacity: swipeState.isActive && swipeState.deltaY > 20 ? Math.min(1, swipeState.deltaY / 50) : 0,
  };

  return (
    <div ref={ref} className={`swipe-container ${className}`} style={containerStyle}>
      <div className="swipe-content" style={contentStyle}>
        {children}
      </div>

      {showIndicators && (
        <>
          {indicators?.left && (
            <div className="swipe-indicator swipe-indicator-left" style={leftIndicatorStyle}>
              {indicators.left}
            </div>
          )}
          {indicators?.right && (
            <div className="swipe-indicator swipe-indicator-right" style={rightIndicatorStyle}>
              {indicators.right}
            </div>
          )}
          {indicators?.up && (
            <div className="swipe-indicator swipe-indicator-up" style={upIndicatorStyle}>
              {indicators.up}
            </div>
          )}
          {indicators?.down && (
            <div className="swipe-indicator swipe-indicator-down" style={downIndicatorStyle}>
              {indicators.down}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default SwipeContainer;
