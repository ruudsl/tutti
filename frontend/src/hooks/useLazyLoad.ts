import { useEffect, useRef, useState, useCallback } from 'react';

interface UseLazyLoadOptions {
  /**
   * The IntersectionObserver root margin.
   * Defaults to '100px' to start loading slightly before element enters viewport.
   */
  rootMargin?: string;
  /**
   * The IntersectionObserver threshold.
   * Defaults to 0 (trigger as soon as any part is visible).
   */
  threshold?: number | number[];
  /**
   * Whether to unobserve after first intersection.
   * Defaults to true for typical lazy loading behavior.
   */
  triggerOnce?: boolean;
  /**
   * Initial visibility state.
   * Defaults to false.
   */
  initialVisible?: boolean;
}

interface UseLazyLoadReturn {
  /**
   * Ref to attach to the element to observe.
   */
  ref: React.RefObject<HTMLElement | null>;
  /**
   * Whether the element is visible (has intersected).
   */
  isVisible: boolean;
  /**
   * Whether the element has ever been visible.
   */
  hasBeenVisible: boolean;
}

/**
 * Hook for lazy loading elements using IntersectionObserver.
 * Useful for deferring image/component loading until they enter the viewport.
 *
 * @example
 * const { ref, isVisible } = useLazyLoad();
 * return (
 *   <div ref={ref as React.RefObject<HTMLDivElement>}>
 *     {isVisible && <ExpensiveComponent />}
 *   </div>
 * );
 */
export function useLazyLoad(options: UseLazyLoadOptions = {}): UseLazyLoadReturn {
  const {
    rootMargin = '100px',
    threshold = 0,
    triggerOnce = true,
    initialVisible = false,
  } = options;

  const ref = useRef<HTMLElement | null>(null);
  const [isVisible, setIsVisible] = useState(initialVisible);
  const [hasBeenVisible, setHasBeenVisible] = useState(initialVisible);
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    // If already visible and triggerOnce, no need to observe
    if (hasBeenVisible && triggerOnce) return;

    // Check for IntersectionObserver support
    if (!('IntersectionObserver' in window)) {
      // Fallback: immediately set as visible
      setIsVisible(true);
      setHasBeenVisible(true);
      return;
    }

    const handleIntersection: IntersectionObserverCallback = (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          setHasBeenVisible(true);

          if (triggerOnce && observerRef.current) {
            observerRef.current.unobserve(entry.target);
          }
        } else if (!triggerOnce) {
          setIsVisible(false);
        }
      });
    };

    observerRef.current = new IntersectionObserver(handleIntersection, {
      rootMargin,
      threshold,
    });

    observerRef.current.observe(element);

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
    };
  }, [rootMargin, threshold, triggerOnce, hasBeenVisible]);

  return { ref, isVisible, hasBeenVisible };
}

interface UseLazyLoadMultipleOptions extends UseLazyLoadOptions {
  /**
   * Number of items to track.
   */
  count: number;
}

interface UseLazyLoadMultipleReturn {
  /**
   * Function to get a ref for a specific index.
   */
  getRef: (index: number) => (el: HTMLElement | null) => void;
  /**
   * Array of visibility states for each item.
   */
  visibilityStates: boolean[];
}

/**
 * Hook for lazy loading multiple elements with a single IntersectionObserver.
 * More efficient than using multiple useLazyLoad hooks.
 *
 * @example
 * const { getRef, visibilityStates } = useLazyLoadMultiple({ count: items.length });
 * return items.map((item, index) => (
 *   <div key={item.id} ref={getRef(index)}>
 *     {visibilityStates[index] && <Image src={item.src} />}
 *   </div>
 * ));
 */
export function useLazyLoadMultiple(options: UseLazyLoadMultipleOptions): UseLazyLoadMultipleReturn {
  const {
    count,
    rootMargin = '100px',
    threshold = 0,
    triggerOnce = true,
  } = options;

  const [visibilityStates, setVisibilityStates] = useState<boolean[]>(() =>
    new Array(count).fill(false)
  );
  const elementsRef = useRef<Map<number, HTMLElement | null>>(new Map());
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Update visibility states array when count changes
  useEffect(() => {
    setVisibilityStates((prev) => {
      if (prev.length === count) return prev;
      const newStates = new Array(count).fill(false);
      // Preserve existing visibility states
      prev.forEach((state, index) => {
        if (index < count) newStates[index] = state;
      });
      return newStates;
    });
  }, [count]);

  useEffect(() => {
    // Check for IntersectionObserver support
    if (!('IntersectionObserver' in window)) {
      setVisibilityStates(new Array(count).fill(true));
      return;
    }

    const handleIntersection: IntersectionObserverCallback = (entries) => {
      entries.forEach((entry) => {
        const index = parseInt(entry.target.getAttribute('data-lazy-index') || '-1', 10);
        if (index === -1) return;

        if (entry.isIntersecting) {
          setVisibilityStates((prev) => {
            if (prev[index]) return prev; // Already visible
            const next = [...prev];
            next[index] = true;
            return next;
          });

          if (triggerOnce && observerRef.current) {
            observerRef.current.unobserve(entry.target);
          }
        } else if (!triggerOnce) {
          setVisibilityStates((prev) => {
            if (!prev[index]) return prev; // Already not visible
            const next = [...prev];
            next[index] = false;
            return next;
          });
        }
      });
    };

    observerRef.current = new IntersectionObserver(handleIntersection, {
      rootMargin,
      threshold,
    });

    // Observe all current elements
    elementsRef.current.forEach((el) => {
      if (el && observerRef.current) {
        observerRef.current.observe(el);
      }
    });

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
    };
  }, [count, rootMargin, threshold, triggerOnce]);

  const getRef = useCallback((index: number) => {
    return (el: HTMLElement | null) => {
      const prevEl = elementsRef.current.get(index);

      // Unobserve previous element if different
      if (prevEl && prevEl !== el && observerRef.current) {
        observerRef.current.unobserve(prevEl);
      }

      elementsRef.current.set(index, el);

      // Observe new element
      if (el && observerRef.current) {
        el.setAttribute('data-lazy-index', String(index));
        observerRef.current.observe(el);
      }
    };
  }, []);

  return { getRef, visibilityStates };
}

export default useLazyLoad;
