import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { useSwipeGesture, SwipeDirection } from '../hooks/useSwipeGesture';

// Set up PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

export interface PdfViewerProps {
  /** PDF file to display */
  file?: File;
  /** URL to PDF file */
  url?: string;
  /** Initial page number (1-indexed) */
  initialPage?: number;
  /** Callback when page changes */
  onPageChange?: (page: number, totalPages: number) => void;
  /** Enable swipe navigation (default: true) */
  enableSwipe?: boolean;
  /** Show page indicator (default: true) */
  showPageIndicator?: boolean;
  /** Custom class name */
  className?: string;
  /** Fit mode: 'width' | 'height' | 'contain' */
  fitMode?: 'width' | 'height' | 'contain';
  /** Enable zoom (default: true) */
  enableZoom?: boolean;
  /** Minimum zoom level (default: 1) */
  minZoom?: number;
  /** Maximum zoom level (default: 3) */
  maxZoom?: number;
}

interface PageCache {
  pageNumber: number;
  canvas: HTMLCanvasElement;
  scale: number;
}

type TransitionDirection = 'left' | 'right' | null;

export function PdfViewer({
  file,
  url,
  initialPage = 1,
  onPageChange,
  enableSwipe = true,
  showPageIndicator = true,
  className = '',
  fitMode = 'contain',
  enableZoom = true,
  minZoom = 1,
  maxZoom = 3,
}: PdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [isZoomed, setIsZoomed] = useState(false);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isSwipeActive, setIsSwipeActive] = useState(false);
  const [showIndicator, setShowIndicator] = useState(false);
  const [transitionDirection, setTransitionDirection] = useState<TransitionDirection>(null);
  const pageCacheRef = useRef<Map<number, PageCache>>(new Map());
  const renderingRef = useRef(false);
  const indicatorTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load PDF document
  useEffect(() => {
    let cancelled = false;

    const loadPdf = async () => {
      setLoading(true);
      setError(null);

      try {
        let data: ArrayBuffer | string;

        if (file) {
          data = await file.arrayBuffer();
        } else if (url) {
          data = url;
        } else {
          throw new Error('No PDF source provided');
        }

        const pdf = await pdfjsLib.getDocument({ data }).promise;

        if (cancelled) return;

        setPdfDoc(pdf);
        setTotalPages(pdf.numPages);
        setCurrentPage(Math.min(initialPage, pdf.numPages));
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        setError('Could not load PDF');
        setLoading(false);
      }
    };

    loadPdf();

    return () => {
      cancelled = true;
    };
  }, [file, url, initialPage]);

  // Render current page
  const renderPage = useCallback(async (pageNum: number, targetZoom?: number) => {
    if (!pdfDoc || !canvasRef.current || !containerRef.current || renderingRef.current) return;

    const effectiveZoom = targetZoom ?? zoom;
    const cacheKey = pageNum;
    const cached = pageCacheRef.current.get(cacheKey);

    // Use cached canvas if available and zoom matches
    if (cached && cached.scale === effectiveZoom) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        canvasRef.current.width = cached.canvas.width;
        canvasRef.current.height = cached.canvas.height;
        ctx.drawImage(cached.canvas, 0, 0);
      }
      return;
    }

    renderingRef.current = true;

    try {
      const page = await pdfDoc.getPage(pageNum);
      const container = containerRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');

      if (!ctx) return;

      // Calculate viewport
      const viewport = page.getViewport({ scale: 1 });
      let scale: number;

      switch (fitMode) {
        case 'width':
          scale = (container.clientWidth / viewport.width) * effectiveZoom;
          break;
        case 'height':
          scale = (container.clientHeight / viewport.height) * effectiveZoom;
          break;
        case 'contain':
        default:
          const scaleX = container.clientWidth / viewport.width;
          const scaleY = container.clientHeight / viewport.height;
          scale = Math.min(scaleX, scaleY) * effectiveZoom;
          break;
      }

      const scaledViewport = page.getViewport({ scale });

      // Set canvas dimensions
      canvas.width = scaledViewport.width;
      canvas.height = scaledViewport.height;

      // Render page
      await page.render({
        canvasContext: ctx,
        viewport: scaledViewport,
      }).promise;

      // Cache the rendered page
      const cacheCanvas = document.createElement('canvas');
      cacheCanvas.width = canvas.width;
      cacheCanvas.height = canvas.height;
      const cacheCtx = cacheCanvas.getContext('2d');
      if (cacheCtx) {
        cacheCtx.drawImage(canvas, 0, 0);
        pageCacheRef.current.set(cacheKey, {
          pageNumber: pageNum,
          canvas: cacheCanvas,
          scale: effectiveZoom,
        });
      }

      // Limit cache size
      if (pageCacheRef.current.size > 5) {
        const firstKey = pageCacheRef.current.keys().next().value;
        if (firstKey !== undefined) {
          pageCacheRef.current.delete(firstKey);
        }
      }
    } catch (err) {
      console.error('Error rendering page:', err);
    } finally {
      renderingRef.current = false;
    }
  }, [pdfDoc, zoom, fitMode]);

  // Re-render on page or zoom change
  useEffect(() => {
    if (pdfDoc) {
      renderPage(currentPage);
    }
  }, [pdfDoc, currentPage, renderPage]);

  // Notify parent of page changes
  useEffect(() => {
    if (totalPages > 0) {
      onPageChange?.(currentPage, totalPages);
    }
  }, [currentPage, totalPages, onPageChange]);

  // Navigation functions
  const goToPage = useCallback((page: number) => {
    const newPage = Math.max(1, Math.min(page, totalPages));
    if (newPage !== currentPage) {
      setCurrentPage(newPage);
      showPageIndicatorTemporarily();
    }
  }, [currentPage, totalPages]);

  const nextPage = useCallback(() => {
    if (currentPage < totalPages) {
      setTransitionDirection('left');
      goToPage(currentPage + 1);
      setTimeout(() => setTransitionDirection(null), 300);
    }
  }, [currentPage, totalPages, goToPage]);

  const previousPage = useCallback(() => {
    if (currentPage > 1) {
      setTransitionDirection('right');
      goToPage(currentPage - 1);
      setTimeout(() => setTransitionDirection(null), 300);
    }
  }, [currentPage, goToPage]);

  // Show page indicator temporarily
  const showPageIndicatorTemporarily = useCallback(() => {
    setShowIndicator(true);
    if (indicatorTimeoutRef.current) {
      clearTimeout(indicatorTimeoutRef.current);
    }
    indicatorTimeoutRef.current = setTimeout(() => {
      setShowIndicator(false);
    }, 2000);
  }, []);

  // Zoom functions
  const handleZoomIn = useCallback(() => {
    setZoom(prev => {
      const newZoom = Math.min(prev * 1.25, maxZoom);
      setIsZoomed(newZoom > 1);
      return newZoom;
    });
  }, [maxZoom]);

  const handleZoomOut = useCallback(() => {
    setZoom(prev => {
      const newZoom = Math.max(prev / 1.25, minZoom);
      setIsZoomed(newZoom > 1);
      return newZoom;
    });
  }, [minZoom]);

  const handleZoomReset = useCallback(() => {
    setZoom(1);
    setIsZoomed(false);
  }, []);

  // Swipe gesture handling
  const handleSwipeStart = useCallback((_direction: SwipeDirection | null) => {
    if (isZoomed) return;
    setIsSwipeActive(true);
  }, [isZoomed]);

  const handleSwipeMove = useCallback((deltaX: number, _deltaY: number, _velocity: number) => {
    if (isZoomed) return;
    // Limit swipe offset
    const maxOffset = 150;
    const clampedOffset = Math.max(-maxOffset, Math.min(maxOffset, deltaX));
    setSwipeOffset(clampedOffset);
    showPageIndicatorTemporarily();
  }, [isZoomed, showPageIndicatorTemporarily]);

  const handleSwipeEnd = useCallback(() => {
    setIsSwipeActive(false);
    setSwipeOffset(0);
  }, []);

  const handleSwipeLeft = useCallback(() => {
    if (!isZoomed) {
      nextPage();
    }
  }, [isZoomed, nextPage]);

  const handleSwipeRight = useCallback(() => {
    if (!isZoomed) {
      previousPage();
    }
  }, [isZoomed, previousPage]);

  const { ref: swipeRef } = useSwipeGesture<HTMLDivElement>(
    {
      onSwipeLeft: handleSwipeLeft,
      onSwipeRight: handleSwipeRight,
      onSwipeStart: handleSwipeStart,
      onSwipeMove: handleSwipeMove,
      onSwipeEnd: handleSwipeEnd,
    },
    {
      threshold: 50,
      disabled: !enableSwipe || isZoomed,
      preventScrollOnHorizontalSwipe: true,
    }
  );

  // Combine refs
  useEffect(() => {
    if (swipeRef.current && containerRef.current) {
      // The swipeRef is already attached to the wrapper div
    }
  }, [swipeRef]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        previousPage();
      } else if (e.key === 'ArrowRight') {
        nextPage();
      } else if (e.key === '+' || e.key === '=') {
        handleZoomIn();
      } else if (e.key === '-') {
        handleZoomOut();
      } else if (e.key === '0') {
        handleZoomReset();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previousPage, nextPage, handleZoomIn, handleZoomOut, handleZoomReset]);

  // Calculate transform for page transition animation
  const getTransformStyle = useMemo(() => {
    if (isSwipeActive && swipeOffset !== 0) {
      return {
        transform: `translateX(${swipeOffset}px)`,
        transition: 'none',
      };
    }

    if (transitionDirection === 'left') {
      return {
        animation: 'slideInFromRight 0.3s ease-out',
      };
    }

    if (transitionDirection === 'right') {
      return {
        animation: 'slideInFromLeft 0.3s ease-out',
      };
    }

    return {
      transform: 'translateX(0)',
      transition: 'transform 0.2s ease-out',
    };
  }, [isSwipeActive, swipeOffset, transitionDirection]);

  if (loading) {
    return (
      <div className={`pdf-viewer pdf-viewer-loading ${className}`} style={styles.container}>
        <div className="spinner" style={styles.spinner}></div>
        <p style={styles.loadingText}>Loading PDF...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`pdf-viewer pdf-viewer-error ${className}`} style={styles.container}>
        <p style={styles.errorText}>{error}</p>
      </div>
    );
  }

  return (
    <div
      ref={swipeRef}
      className={`pdf-viewer ${className}`}
      style={styles.container}
    >
      {/* PDF Canvas Container */}
      <div ref={containerRef} style={styles.canvasContainer}>
        <canvas
          ref={canvasRef}
          style={{
            ...styles.canvas,
            ...getTransformStyle,
            opacity: isSwipeActive ? 1 - Math.abs(swipeOffset) / 300 : 1,
          }}
        />
      </div>

      {/* Page Indicator */}
      {showPageIndicator && (
        <div
          style={{
            ...styles.pageIndicator,
            opacity: showIndicator || isSwipeActive ? 1 : 0,
          }}
        >
          <span style={styles.pageText}>
            {currentPage} / {totalPages}
          </span>
        </div>
      )}

      {/* Navigation Controls */}
      <div style={styles.controls}>
        <button
          onClick={previousPage}
          disabled={currentPage <= 1}
          style={{
            ...styles.navButton,
            opacity: currentPage <= 1 ? 0.3 : 1,
          }}
          aria-label="Previous page"
        >
          &#8249;
        </button>

        <div style={styles.zoomControls}>
          {enableZoom && (
            <>
              <button onClick={handleZoomOut} style={styles.zoomButton} aria-label="Zoom out">
                -
              </button>
              <span style={styles.zoomLevel}>{Math.round(zoom * 100)}%</span>
              <button onClick={handleZoomIn} style={styles.zoomButton} aria-label="Zoom in">
                +
              </button>
              {isZoomed && (
                <button onClick={handleZoomReset} style={styles.zoomButton} aria-label="Reset zoom">
                  Reset
                </button>
              )}
            </>
          )}
        </div>

        <button
          onClick={nextPage}
          disabled={currentPage >= totalPages}
          style={{
            ...styles.navButton,
            opacity: currentPage >= totalPages ? 0.3 : 1,
          }}
          aria-label="Next page"
        >
          &#8250;
        </button>
      </div>

      {/* Swipe hint overlay */}
      {isSwipeActive && (
        <div style={styles.swipeHintOverlay}>
          {swipeOffset < -30 && currentPage < totalPages && (
            <div style={{ ...styles.swipeHint, right: '1rem' }}>
              Next &rarr;
            </div>
          )}
          {swipeOffset > 30 && currentPage > 1 && (
            <div style={{ ...styles.swipeHint, left: '1rem' }}>
              &larr; Previous
            </div>
          )}
        </div>
      )}

      {/* CSS Animation keyframes */}
      <style>{`
        @keyframes slideInFromRight {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }

        @keyframes slideInFromLeft {
          from {
            transform: translateX(-100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'relative',
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: 'var(--background-secondary, #f5f5f5)',
    overflow: 'hidden',
    touchAction: 'pan-y pinch-zoom',
  },
  canvasContainer: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'auto',
    padding: '1rem',
  },
  canvas: {
    maxWidth: '100%',
    maxHeight: '100%',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
    backgroundColor: 'white',
  },
  pageIndicator: {
    position: 'absolute',
    top: '1rem',
    left: '50%',
    transform: 'translateX(-50%)',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    color: 'white',
    padding: '0.5rem 1rem',
    borderRadius: '2rem',
    fontSize: '0.875rem',
    fontWeight: 500,
    transition: 'opacity 0.3s ease',
    zIndex: 10,
    pointerEvents: 'none',
  },
  pageText: {
    fontVariantNumeric: 'tabular-nums',
  },
  controls: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0.75rem 1rem',
    backgroundColor: 'var(--background, white)',
    borderTop: '1px solid var(--border-color, #e5e7eb)',
  },
  navButton: {
    width: '2.5rem',
    height: '2.5rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '1.5rem',
    fontWeight: 'bold',
    backgroundColor: 'transparent',
    border: '1px solid var(--border-color, #e5e7eb)',
    borderRadius: '0.5rem',
    cursor: 'pointer',
    color: 'var(--text, #333)',
    transition: 'background-color 0.2s',
  },
  zoomControls: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  zoomButton: {
    width: '2rem',
    height: '2rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '1rem',
    fontWeight: 'bold',
    backgroundColor: 'transparent',
    border: '1px solid var(--border-color, #e5e7eb)',
    borderRadius: '0.25rem',
    cursor: 'pointer',
    color: 'var(--text, #333)',
  },
  zoomLevel: {
    fontSize: '0.875rem',
    fontVariantNumeric: 'tabular-nums',
    minWidth: '3rem',
    textAlign: 'center',
  },
  spinner: {
    width: '2rem',
    height: '2rem',
    border: '3px solid var(--border-color, #e5e7eb)',
    borderTopColor: 'var(--primary, #3b82f6)',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  loadingText: {
    marginTop: '1rem',
    color: 'var(--text-light, #666)',
  },
  errorText: {
    color: 'var(--danger, #ef4444)',
  },
  swipeHintOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    pointerEvents: 'none',
  },
  swipeHint: {
    position: 'absolute',
    top: '50%',
    transform: 'translateY(-50%)',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    color: 'white',
    padding: '0.5rem 1rem',
    borderRadius: '0.5rem',
    fontSize: '0.875rem',
    fontWeight: 500,
  },
};

export default PdfViewer;
