import { useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

interface PrefetchOptions {
  /** Delay before prefetching in ms (default: 100) */
  delay?: number;
  /** Whether to navigate on click (default: true) */
  navigate?: boolean;
}

/**
 * Hook for prefetching data on hover for navigation links.
 * Improves perceived performance by loading data before the user clicks.
 *
 * @example
 * ```tsx
 * const { onMouseEnter, onMouseLeave, onClick } = usePrefetch({
 *   path: '/music-pieces/123',
 *   prefetch: () => queryClient.prefetchQuery(['musicPiece', 123], fetchMusicPiece),
 * });
 *
 * return (
 *   <a
 *     href="/music-pieces/123"
 *     onMouseEnter={onMouseEnter}
 *     onMouseLeave={onMouseLeave}
 *     onClick={onClick}
 *   >
 *     View Music Piece
 *   </a>
 * );
 * ```
 */
export function usePrefetch(
  path: string,
  prefetch: () => void | Promise<void>,
  options: PrefetchOptions = {}
) {
  const { delay = 100, navigate: shouldNavigate = true } = options;
  const navigate = useNavigate();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const prefetchedRef = useRef(false);

  const onMouseEnter = useCallback(() => {
    if (prefetchedRef.current) return;

    timeoutRef.current = setTimeout(() => {
      prefetchedRef.current = true;
      prefetch();
    }, delay);
  }, [prefetch, delay]);

  const onMouseLeave = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const onClick = useCallback((e: React.MouseEvent) => {
    if (!shouldNavigate) return;

    e.preventDefault();

    // Trigger prefetch immediately if not already done
    if (!prefetchedRef.current) {
      prefetch();
      prefetchedRef.current = true;
    }

    navigate(path);
  }, [path, navigate, prefetch, shouldNavigate]);

  const onFocus = useCallback(() => {
    if (prefetchedRef.current) return;
    prefetchedRef.current = true;
    prefetch();
  }, [prefetch]);

  return {
    onMouseEnter,
    onMouseLeave,
    onClick,
    onFocus,
    prefetchHandlers: {
      onMouseEnter,
      onMouseLeave,
      onClick,
      onFocus,
    },
  };
}

/**
 * Simple prefetch link component props generator
 */
export function getPrefetchLinkProps(
  path: string,
  prefetch: () => void | Promise<void>,
  navigate: (path: string) => void,
  options: { delay?: number } = {}
) {
  const { delay = 100 } = options;
  let timeoutId: NodeJS.Timeout | null = null;
  let prefetched = false;

  return {
    href: path,
    onMouseEnter: () => {
      if (prefetched) return;
      timeoutId = setTimeout(() => {
        prefetched = true;
        prefetch();
      }, delay);
    },
    onMouseLeave: () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    },
    onClick: (e: React.MouseEvent) => {
      e.preventDefault();
      if (!prefetched) {
        prefetch();
      }
      navigate(path);
    },
  };
}

export default usePrefetch;
