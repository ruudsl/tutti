import { useState, useCallback, useRef, useEffect } from 'react';

interface PullToRefreshOptions {
  /** Callback to execute on refresh */
  onRefresh: () => Promise<void>;
  /** Distance in pixels to pull before triggering refresh (default: 80) */
  threshold?: number;
  /** Maximum pull distance in pixels (default: 150) */
  maxPull?: number;
  /** Whether the hook is disabled (default: false) */
  disabled?: boolean;
}

interface PullToRefreshState {
  isPulling: boolean;
  pullDistance: number;
  isRefreshing: boolean;
  progress: number;
}

/**
 * Hook for implementing pull-to-refresh functionality on mobile devices.
 * Attaches to a container element and detects pull-down gestures.
 *
 * @example
 * ```tsx
 * const { ref, isPulling, isRefreshing, progress, pullDistance } = usePullToRefresh({
 *   onRefresh: async () => {
 *     await refetch();
 *   }
 * });
 *
 * return (
 *   <div ref={ref}>
 *     {isRefreshing && <Spinner />}
 *     {isPulling && <PullIndicator progress={progress} />}
 *     <List items={items} />
 *   </div>
 * );
 * ```
 */
export function usePullToRefresh<T extends HTMLElement = HTMLDivElement>({
  onRefresh,
  threshold = 80,
  maxPull = 150,
  disabled = false,
}: PullToRefreshOptions) {
  const ref = useRef<T>(null);
  const [state, setState] = useState<PullToRefreshState>({
    isPulling: false,
    pullDistance: 0,
    isRefreshing: false,
    progress: 0,
  });

  const touchStartRef = useRef<number>(0);
  const isPullingRef = useRef(false);

  const handleTouchStart = useCallback(
    (e: TouchEvent) => {
      if (disabled || state.isRefreshing) return;

      // Only trigger if at top of scroll container
      const element = ref.current;
      if (!element || element.scrollTop > 0) return;

      touchStartRef.current = e.touches[0].clientY;
      isPullingRef.current = false;
    },
    [disabled, state.isRefreshing],
  );

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (disabled || state.isRefreshing) return;

      const element = ref.current;
      if (!element || element.scrollTop > 0) return;

      const touch = e.touches[0];
      const deltaY = touch.clientY - touchStartRef.current;

      // Only track downward pulls
      if (deltaY <= 0) {
        if (isPullingRef.current) {
          isPullingRef.current = false;
          setState((prev) => ({ ...prev, isPulling: false, pullDistance: 0, progress: 0 }));
        }
        return;
      }

      // Prevent default scroll during pull
      e.preventDefault();

      isPullingRef.current = true;
      const pullDistance = Math.min(deltaY * 0.5, maxPull); // Apply resistance
      const progress = Math.min(pullDistance / threshold, 1);

      setState((prev) => ({
        ...prev,
        isPulling: true,
        pullDistance,
        progress,
      }));
    },
    [disabled, state.isRefreshing, threshold, maxPull],
  );

  const handleTouchEnd = useCallback(async () => {
    if (disabled || !isPullingRef.current) return;

    isPullingRef.current = false;

    const shouldRefresh = state.pullDistance >= threshold;

    if (shouldRefresh) {
      setState((prev) => ({
        ...prev,
        isPulling: false,
        pullDistance: 0,
        isRefreshing: true,
        progress: 0,
      }));

      try {
        await onRefresh();
      } finally {
        setState((prev) => ({
          ...prev,
          isRefreshing: false,
        }));
      }
    } else {
      setState((prev) => ({
        ...prev,
        isPulling: false,
        pullDistance: 0,
        progress: 0,
      }));
    }
  }, [disabled, state.pullDistance, threshold, onRefresh]);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    element.addEventListener('touchstart', handleTouchStart, { passive: true });
    element.addEventListener('touchmove', handleTouchMove, { passive: false });
    element.addEventListener('touchend', handleTouchEnd, { passive: true });
    element.addEventListener('touchcancel', handleTouchEnd, { passive: true });

    return () => {
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchmove', handleTouchMove);
      element.removeEventListener('touchend', handleTouchEnd);
      element.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  return {
    ref,
    ...state,
  };
}

export default usePullToRefresh;
