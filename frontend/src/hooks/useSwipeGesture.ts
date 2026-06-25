import { useRef, useCallback, useEffect } from 'react';

export interface SwipeCallbacks {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  onSwipeStart?: (direction: SwipeDirection | null) => void;
  onSwipeMove?: (deltaX: number, deltaY: number, velocity: number) => void;
  onSwipeEnd?: (completed: boolean, direction: SwipeDirection | null) => void;
}

export interface SwipeOptions {
  /** Minimum distance in pixels to trigger a swipe (default: 50) */
  threshold?: number;
  /** Maximum time in ms for the swipe gesture (default: 300) */
  maxTime?: number;
  /** Prevent vertical scrolling during horizontal swipe (default: true) */
  preventScrollOnHorizontalSwipe?: boolean;
  /** Prevent horizontal scrolling during vertical swipe (default: false) */
  preventScrollOnVerticalSwipe?: boolean;
  /** Minimum velocity to trigger swipe (pixels/ms) (default: 0.3) */
  minVelocity?: number;
  /** Disable swipe detection (default: false) */
  disabled?: boolean;
}

export type SwipeDirection = 'left' | 'right' | 'up' | 'down';

export interface SwipeState {
  isSwiping: boolean;
  direction: SwipeDirection | null;
  deltaX: number;
  deltaY: number;
  velocity: number;
}

interface TouchData {
  startX: number;
  startY: number;
  startTime: number;
  currentX: number;
  currentY: number;
  currentTime: number;
}

const defaultOptions: Required<SwipeOptions> = {
  threshold: 50,
  maxTime: 300,
  preventScrollOnHorizontalSwipe: true,
  preventScrollOnVerticalSwipe: false,
  minVelocity: 0.3,
  disabled: false,
};

/**
 * @description Hook for detecting swipe gestures on touch devices.
 * Supports four-directional swipes with configurable thresholds, velocity detection,
 * and scroll prevention options.
 *
 * @template T - The HTML element type (default: HTMLDivElement)
 * @param {SwipeCallbacks} callbacks - Callback functions for swipe events
 * @param {Function} callbacks.onSwipeLeft - Called when user swipes left
 * @param {Function} callbacks.onSwipeRight - Called when user swipes right
 * @param {Function} callbacks.onSwipeUp - Called when user swipes up
 * @param {Function} callbacks.onSwipeDown - Called when user swipes down
 * @param {Function} callbacks.onSwipeStart - Called when swipe begins
 * @param {Function} callbacks.onSwipeMove - Called during swipe with delta and velocity
 * @param {Function} callbacks.onSwipeEnd - Called when swipe ends
 * @param {SwipeOptions} options - Configuration options
 * @param {number} options.threshold - Minimum distance to trigger swipe (default: 50)
 * @param {number} options.maxTime - Maximum time for gesture in ms (default: 300)
 * @param {boolean} options.preventScrollOnHorizontalSwipe - Prevent scroll during horizontal swipe (default: true)
 * @param {number} options.minVelocity - Minimum velocity to trigger swipe (default: 0.3)
 * @param {boolean} options.disabled - Disable swipe detection (default: false)
 *
 * @returns {Object} Gesture handlers
 * @returns {React.RefObject<T>} returns.ref - Ref to attach to the element
 * @returns {Function} returns.bind - Returns props to spread on the element
 *
 * @example
 * ```tsx
 * function SwipeableCard({ onDismiss }: { onDismiss: () => void }) {
 *   const { ref } = useSwipeGesture<HTMLDivElement>({
 *     onSwipeLeft: onDismiss,
 *     onSwipeMove: (deltaX) => {
 *       ref.current?.style.setProperty('transform', `translateX(${deltaX}px)`);
 *     },
 *     onSwipeEnd: (completed) => {
 *       if (!completed) ref.current?.style.setProperty('transform', 'translateX(0)');
 *     }
 *   });
 *
 *   return <div ref={ref}>Swipe to dismiss</div>;
 * }
 * ```
 */
export function useSwipeGesture<T extends HTMLElement = HTMLDivElement>(
  callbacks: SwipeCallbacks,
  options: SwipeOptions = {}
) {
  const elementRef = useRef<T | null>(null);
  const touchDataRef = useRef<TouchData | null>(null);
  const swipeDirectionRef = useRef<SwipeDirection | null>(null);
  const isTrackingRef = useRef(false);

  const opts = { ...defaultOptions, ...options };

  const getSwipeDirection = useCallback((deltaX: number, deltaY: number): SwipeDirection | null => {
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    if (absX < opts.threshold && absY < opts.threshold) {
      return null;
    }

    if (absX > absY) {
      return deltaX > 0 ? 'right' : 'left';
    } else {
      return deltaY > 0 ? 'down' : 'up';
    }
  }, [opts.threshold]);

  const calculateVelocity = useCallback((distance: number, time: number): number => {
    if (time === 0) return 0;
    return Math.abs(distance / time);
  }, []);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (opts.disabled) return;

    const touch = e.touches[0];
    touchDataRef.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      startTime: Date.now(),
      currentX: touch.clientX,
      currentY: touch.clientY,
      currentTime: Date.now(),
    };
    isTrackingRef.current = true;
    swipeDirectionRef.current = null;
  }, [opts.disabled]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!isTrackingRef.current || !touchDataRef.current || opts.disabled) return;

    const touch = e.touches[0];
    const data = touchDataRef.current;

    data.currentX = touch.clientX;
    data.currentY = touch.clientY;
    data.currentTime = Date.now();

    const deltaX = data.currentX - data.startX;
    const deltaY = data.currentY - data.startY;
    const timeDelta = data.currentTime - data.startTime;

    // Determine primary direction early
    if (!swipeDirectionRef.current) {
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);

      // Wait until we have enough movement to determine direction
      if (absX > 10 || absY > 10) {
        if (absX > absY) {
          swipeDirectionRef.current = deltaX > 0 ? 'right' : 'left';
        } else {
          swipeDirectionRef.current = deltaY > 0 ? 'down' : 'up';
        }
        callbacks.onSwipeStart?.(swipeDirectionRef.current);
      }
    }

    // Prevent scrolling based on swipe direction
    const isHorizontalSwipe = swipeDirectionRef.current === 'left' || swipeDirectionRef.current === 'right';
    const isVerticalSwipe = swipeDirectionRef.current === 'up' || swipeDirectionRef.current === 'down';

    if (isHorizontalSwipe && opts.preventScrollOnHorizontalSwipe) {
      e.preventDefault();
    }
    if (isVerticalSwipe && opts.preventScrollOnVerticalSwipe) {
      e.preventDefault();
    }

    // Calculate velocity
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    const velocity = calculateVelocity(distance, timeDelta);

    callbacks.onSwipeMove?.(deltaX, deltaY, velocity);
  }, [opts.disabled, opts.preventScrollOnHorizontalSwipe, opts.preventScrollOnVerticalSwipe, callbacks, calculateVelocity]);

  const handleTouchEnd = useCallback((_e: TouchEvent) => {
    if (!isTrackingRef.current || !touchDataRef.current || opts.disabled) return;

    const data = touchDataRef.current;
    const deltaX = data.currentX - data.startX;
    const deltaY = data.currentY - data.startY;
    const timeDelta = data.currentTime - data.startTime;

    // Calculate final velocity
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    const velocity = calculateVelocity(distance, timeDelta);

    const direction = getSwipeDirection(deltaX, deltaY);
    const isValidSwipe = direction !== null &&
      (timeDelta <= opts.maxTime || velocity >= opts.minVelocity);

    if (isValidSwipe && direction) {
      switch (direction) {
        case 'left':
          callbacks.onSwipeLeft?.();
          break;
        case 'right':
          callbacks.onSwipeRight?.();
          break;
        case 'up':
          callbacks.onSwipeUp?.();
          break;
        case 'down':
          callbacks.onSwipeDown?.();
          break;
      }
    }

    callbacks.onSwipeEnd?.(isValidSwipe, direction);

    // Reset state
    touchDataRef.current = null;
    swipeDirectionRef.current = null;
    isTrackingRef.current = false;
  }, [opts.disabled, opts.maxTime, opts.minVelocity, callbacks, calculateVelocity, getSwipeDirection]);

  const handleTouchCancel = useCallback(() => {
    callbacks.onSwipeEnd?.(false, null);
    touchDataRef.current = null;
    swipeDirectionRef.current = null;
    isTrackingRef.current = false;
  }, [callbacks]);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    element.addEventListener('touchstart', handleTouchStart, { passive: true });
    element.addEventListener('touchmove', handleTouchMove, { passive: false });
    element.addEventListener('touchend', handleTouchEnd, { passive: true });
    element.addEventListener('touchcancel', handleTouchCancel, { passive: true });

    return () => {
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchmove', handleTouchMove);
      element.removeEventListener('touchend', handleTouchEnd);
      element.removeEventListener('touchcancel', handleTouchCancel);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd, handleTouchCancel]);

  // Return both the ref and bind functions for flexibility
  const bind = useCallback(() => ({
    ref: elementRef,
    onTouchStart: (e: React.TouchEvent<T>) => handleTouchStart(e.nativeEvent),
    onTouchMove: (e: React.TouchEvent<T>) => handleTouchMove(e.nativeEvent),
    onTouchEnd: (e: React.TouchEvent<T>) => handleTouchEnd(e.nativeEvent),
    onTouchCancel: () => handleTouchCancel(),
  }), [handleTouchStart, handleTouchMove, handleTouchEnd, handleTouchCancel]);

  return {
    ref: elementRef,
    bind,
  };
}

export default useSwipeGesture;
