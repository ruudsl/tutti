import { useState, useCallback, ReactNode, CSSProperties, useRef, useEffect, memo } from 'react';
import { useSwipeGesture, SwipeDirection } from '../hooks/useSwipeGesture';

export interface MusicItem {
  id: string;
  title: string;
  subtitle?: string;
  metadata?: string;
  imageUrl?: string;
  [key: string]: unknown;
}

export interface SwipeableMusicListProps<T extends MusicItem> {
  items: T[];
  /** Current item index */
  currentIndex?: number;
  /** Callback when item changes */
  onItemChange?: (index: number, item: T) => void;
  /** Render function for each item */
  renderItem: (item: T, index: number, isActive: boolean) => ReactNode;
  /** Enable swipe navigation (default: true) */
  enableSwipe?: boolean;
  /** Show navigation dots (default: true) */
  showDots?: boolean;
  /** Show navigation arrows (default: true) */
  showArrows?: boolean;
  /** Loop through items (default: false) */
  loop?: boolean;
  /** Custom class name */
  className?: string;
  /** Container style */
  style?: CSSProperties;
  /** Swipe threshold (default: 50) */
  threshold?: number;
}

export function SwipeableMusicList<T extends MusicItem>({
  items,
  currentIndex: controlledIndex,
  onItemChange,
  renderItem,
  enableSwipe = true,
  showDots = true,
  showArrows = true,
  loop = false,
  className = '',
  style,
  threshold = 50,
}: SwipeableMusicListProps<T>) {
  const [internalIndex, setInternalIndex] = useState(0);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [transitionEnabled, setTransitionEnabled] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentIndex = controlledIndex ?? internalIndex;

  const goToIndex = useCallback((newIndex: number) => {
    let targetIndex = newIndex;

    if (loop) {
      if (newIndex < 0) {
        targetIndex = items.length - 1;
      } else if (newIndex >= items.length) {
        targetIndex = 0;
      }
    } else {
      targetIndex = Math.max(0, Math.min(newIndex, items.length - 1));
    }

    if (targetIndex !== currentIndex) {
      setInternalIndex(targetIndex);
      onItemChange?.(targetIndex, items[targetIndex]);
    }
  }, [currentIndex, items, loop, onItemChange]);

  const goToPrevious = useCallback(() => {
    goToIndex(currentIndex - 1);
  }, [currentIndex, goToIndex]);

  const goToNext = useCallback(() => {
    goToIndex(currentIndex + 1);
  }, [currentIndex, goToIndex]);

  const canGoPrevious = loop || currentIndex > 0;
  const canGoNext = loop || currentIndex < items.length - 1;

  const handleSwipeStart = useCallback((_direction: SwipeDirection | null) => {
    setTransitionEnabled(false);
  }, []);

  const handleSwipeMove = useCallback((deltaX: number, _deltaY: number, _velocity: number) => {
    // Prevent over-swiping when at boundaries
    if (!loop) {
      if (currentIndex === 0 && deltaX > 0) {
        setSwipeOffset(deltaX * 0.3); // Resistance at start
        return;
      }
      if (currentIndex === items.length - 1 && deltaX < 0) {
        setSwipeOffset(deltaX * 0.3); // Resistance at end
        return;
      }
    }
    setSwipeOffset(deltaX);
  }, [currentIndex, items.length, loop]);

  const handleSwipeEnd = useCallback(() => {
    setTransitionEnabled(true);
    setSwipeOffset(0);
  }, []);

  const handleSwipeLeft = useCallback(() => {
    if (canGoNext) {
      goToNext();
    }
  }, [canGoNext, goToNext]);

  const handleSwipeRight = useCallback(() => {
    if (canGoPrevious) {
      goToPrevious();
    }
  }, [canGoPrevious, goToPrevious]);

  const { ref: swipeRef } = useSwipeGesture<HTMLDivElement>(
    {
      onSwipeLeft: handleSwipeLeft,
      onSwipeRight: handleSwipeRight,
      onSwipeStart: handleSwipeStart,
      onSwipeMove: handleSwipeMove,
      onSwipeEnd: handleSwipeEnd,
    },
    {
      threshold,
      disabled: !enableSwipe || items.length <= 1,
      preventScrollOnHorizontalSwipe: true,
    }
  );

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && canGoPrevious) {
        goToPrevious();
      } else if (e.key === 'ArrowRight' && canGoNext) {
        goToNext();
      }
    };

    const container = containerRef.current;
    if (container) {
      container.addEventListener('keydown', handleKeyDown);
      return () => container.removeEventListener('keydown', handleKeyDown);
    }
  }, [canGoPrevious, canGoNext, goToPrevious, goToNext]);

  if (items.length === 0) {
    return (
      <div className={`swipeable-music-list swipeable-music-list-empty ${className}`} style={style}>
        <div style={styles.emptyState}>
          No items to display
        </div>
      </div>
    );
  }

  // Calculate transform based on current index and swipe offset
  const containerWidth = containerRef.current?.offsetWidth || 0;
  const baseOffset = -currentIndex * 100;
  const swipeOffsetPercent = containerWidth > 0 ? (swipeOffset / containerWidth) * 100 : 0;

  return (
    <div
      ref={containerRef}
      className={`swipeable-music-list ${className}`}
      style={{ ...styles.container, ...style }}
      tabIndex={0}
      role="region"
      aria-label="Music list navigation"
    >
      {/* Items container */}
      <div ref={swipeRef} style={styles.itemsWrapper}>
        <div
          style={{
            ...styles.itemsTrack,
            transform: `translateX(${baseOffset + swipeOffsetPercent}%)`,
            transition: transitionEnabled ? 'transform 0.3s ease-out' : 'none',
            width: `${items.length * 100}%`,
          }}
        >
          {items.map((item, index) => (
            <div
              key={item.id}
              style={{
                ...styles.itemSlide,
                width: `${100 / items.length}%`,
                opacity: index === currentIndex ? 1 : 0.5,
              }}
            >
              {renderItem(item, index, index === currentIndex)}
            </div>
          ))}
        </div>
      </div>

      {/* Navigation Arrows */}
      {showArrows && items.length > 1 && (
        <>
          <button
            onClick={goToPrevious}
            disabled={!canGoPrevious}
            style={{
              ...styles.arrowButton,
              ...styles.arrowLeft,
              opacity: canGoPrevious ? 1 : 0.3,
            }}
            aria-label="Previous item"
          >
            &#8249;
          </button>
          <button
            onClick={goToNext}
            disabled={!canGoNext}
            style={{
              ...styles.arrowButton,
              ...styles.arrowRight,
              opacity: canGoNext ? 1 : 0.3,
            }}
            aria-label="Next item"
          >
            &#8250;
          </button>
        </>
      )}

      {/* Navigation Dots */}
      {showDots && items.length > 1 && (
        <div style={styles.dotsContainer} role="tablist">
          {items.map((item, index) => (
            <button
              key={item.id}
              onClick={() => goToIndex(index)}
              style={{
                ...styles.dot,
                backgroundColor: index === currentIndex
                  ? 'var(--primary, #3b82f6)'
                  : 'var(--border-color, #d1d5db)',
              }}
              role="tab"
              aria-selected={index === currentIndex}
              aria-label={`Go to item ${index + 1}: ${item.title}`}
            />
          ))}
        </div>
      )}

      {/* Item counter */}
      {items.length > 1 && (
        <div style={styles.counter}>
          {currentIndex + 1} / {items.length}
        </div>
      )}
    </div>
  );
}

// Card-style music item component - memoized for performance
export interface MusicCardProps {
  item: MusicItem;
  isActive?: boolean;
  onAction?: () => void;
  actionLabel?: string;
  children?: ReactNode;
}

export const MusicCard = memo(function MusicCard({
  item,
  isActive = true,
  onAction,
  actionLabel = 'View',
  children,
}: MusicCardProps) {
  return (
    <div style={{
      ...styles.musicCard,
      transform: isActive ? 'scale(1)' : 'scale(0.95)',
      opacity: isActive ? 1 : 0.8,
    }}>
      {item.imageUrl && (
        <div style={styles.musicCardImage}>
          <img
            src={item.imageUrl}
            alt={item.title}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </div>
      )}
      <div style={styles.musicCardContent}>
        <h3 style={styles.musicCardTitle}>{item.title}</h3>
        {item.subtitle && (
          <p style={styles.musicCardSubtitle}>{item.subtitle}</p>
        )}
        {item.metadata && (
          <p style={styles.musicCardMeta}>{item.metadata}</p>
        )}
        {children}
        {onAction && (
          <button
            onClick={onAction}
            style={styles.musicCardButton}
          >
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  );
});

const styles: Record<string, CSSProperties> = {
  container: {
    position: 'relative',
    width: '100%',
    overflow: 'hidden',
  },
  itemsWrapper: {
    width: '100%',
    overflow: 'hidden',
    touchAction: 'pan-y',
  },
  itemsTrack: {
    display: 'flex',
    alignItems: 'stretch',
  },
  itemSlide: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 1rem',
    boxSizing: 'border-box',
    transition: 'opacity 0.3s ease',
  },
  arrowButton: {
    position: 'absolute',
    top: '50%',
    transform: 'translateY(-50%)',
    width: '2.5rem',
    height: '2.5rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '1.5rem',
    fontWeight: 'bold',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    border: '1px solid var(--border-color, #e5e7eb)',
    borderRadius: '50%',
    cursor: 'pointer',
    zIndex: 10,
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
    transition: 'background-color 0.2s, opacity 0.2s',
  },
  arrowLeft: {
    left: '0.5rem',
  },
  arrowRight: {
    right: '0.5rem',
  },
  dotsContainer: {
    display: 'flex',
    justifyContent: 'center',
    gap: '0.5rem',
    padding: '1rem 0',
  },
  dot: {
    width: '0.5rem',
    height: '0.5rem',
    borderRadius: '50%',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
    transition: 'background-color 0.2s, transform 0.2s',
  },
  counter: {
    position: 'absolute',
    top: '0.5rem',
    right: '0.5rem',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    color: 'white',
    padding: '0.25rem 0.5rem',
    borderRadius: '0.25rem',
    fontSize: '0.75rem',
    fontVariantNumeric: 'tabular-nums',
  },
  emptyState: {
    padding: '3rem',
    textAlign: 'center',
    color: 'var(--text-light, #666)',
  },
  musicCard: {
    width: '100%',
    maxWidth: '400px',
    backgroundColor: 'var(--background, white)',
    borderRadius: '0.75rem',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
    overflow: 'hidden',
    transition: 'transform 0.3s ease, opacity 0.3s ease',
  },
  musicCardImage: {
    width: '100%',
    height: '200px',
    backgroundColor: 'var(--background-secondary, #f5f5f5)',
    overflow: 'hidden',
  },
  musicCardContent: {
    padding: '1rem',
  },
  musicCardTitle: {
    margin: '0 0 0.5rem 0',
    fontSize: '1.25rem',
    fontWeight: 600,
    color: 'var(--text, #333)',
  },
  musicCardSubtitle: {
    margin: '0 0 0.25rem 0',
    fontSize: '0.875rem',
    color: 'var(--text-light, #666)',
  },
  musicCardMeta: {
    margin: '0 0 1rem 0',
    fontSize: '0.75rem',
    color: 'var(--text-light, #999)',
  },
  musicCardButton: {
    width: '100%',
    padding: '0.75rem',
    backgroundColor: 'var(--primary, #3b82f6)',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '0.875rem',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
};

export default SwipeableMusicList;
