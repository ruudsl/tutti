import { useState, useCallback, createContext, useContext, ReactNode } from 'react';

type AriaLivePoliteness = 'polite' | 'assertive' | 'off';

interface Announcement {
  id: string;
  message: string;
  politeness: AriaLivePoliteness;
}

interface AriaLiveContextValue {
  announce: (message: string, politeness?: AriaLivePoliteness) => void;
  clear: () => void;
}

const AriaLiveContext = createContext<AriaLiveContextValue | null>(null);

/**
 * Hook to announce messages to screen readers via ARIA live regions.
 *
 * @example
 * ```tsx
 * const { announce } = useAriaLive();
 *
 * const handleSave = async () => {
 *   await saveMusicPiece();
 *   announce('Music piece saved successfully', 'polite');
 * };
 * ```
 */
export function useAriaLive() {
  const context = useContext(AriaLiveContext);
  if (!context) {
    // Return a no-op function if used outside provider
    return {
      announce: () => {},
      clear: () => {},
    };
  }
  return context;
}

interface AriaLiveProviderProps {
  children: ReactNode;
}

/**
 * Provider component for ARIA live announcements.
 * Place this at the root of your app to enable screen reader announcements.
 *
 * @example
 * ```tsx
 * function App() {
 *   return (
 *     <AriaLiveProvider>
 *       <YourApp />
 *     </AriaLiveProvider>
 *   );
 * }
 * ```
 */
export function AriaLiveProvider({ children }: AriaLiveProviderProps) {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

  const announce = useCallback((message: string, politeness: AriaLivePoliteness = 'polite') => {
    const id = `announcement-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    setAnnouncements((prev) => [...prev, { id, message, politeness }]);

    // Clear the announcement after it's been read
    setTimeout(() => {
      setAnnouncements((prev) => prev.filter((a) => a.id !== id));
    }, 1000);
  }, []);

  const clear = useCallback(() => {
    setAnnouncements([]);
  }, []);

  return (
    <AriaLiveContext.Provider value={{ announce, clear }}>
      {children}

      {/* Polite announcements region */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
        style={{
          position: 'absolute',
          width: '1px',
          height: '1px',
          padding: 0,
          margin: '-1px',
          overflow: 'hidden',
          clip: 'rect(0, 0, 0, 0)',
          whiteSpace: 'nowrap',
          border: 0,
        }}
      >
        {announcements
          .filter((a) => a.politeness === 'polite')
          .map((a) => (
            <span key={a.id}>{a.message}</span>
          ))}
      </div>

      {/* Assertive announcements region */}
      <div
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        className="sr-only"
        style={{
          position: 'absolute',
          width: '1px',
          height: '1px',
          padding: 0,
          margin: '-1px',
          overflow: 'hidden',
          clip: 'rect(0, 0, 0, 0)',
          whiteSpace: 'nowrap',
          border: 0,
        }}
      >
        {announcements
          .filter((a) => a.politeness === 'assertive')
          .map((a) => (
            <span key={a.id}>{a.message}</span>
          ))}
      </div>
    </AriaLiveContext.Provider>
  );
}

/**
 * Standalone live region component for inline usage.
 * Use this when you need a specific element to announce changes.
 *
 * @example
 * ```tsx
 * <AriaLiveRegion politeness="polite">
 *   {isLoading ? 'Loading...' : `${items.length} items found`}
 * </AriaLiveRegion>
 * ```
 */
export function AriaLiveRegion({
  children,
  politeness = 'polite',
  atomic = true,
  className = '',
}: {
  children: ReactNode;
  politeness?: AriaLivePoliteness;
  atomic?: boolean;
  className?: string;
}) {
  return (
    <div
      role={politeness === 'assertive' ? 'alert' : 'status'}
      aria-live={politeness}
      aria-atomic={atomic}
      className={`sr-announcement ${className}`}
    >
      {children}
    </div>
  );
}

export default AriaLiveProvider;
