import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { useSwipeGesture, SwipeDirection } from '../hooks/useSwipeGesture';
import { useTranslation } from 'react-i18next';
import { getAnnotations, createAnnotation, deleteAnnotation } from '../api';
import { Icon } from './Icon';
import { PdfAnnotator } from './PdfAnnotation';

// Set up PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

export interface PdfAnnotation {
  id: string;
  pageNumber: number;
  content: string;
  color: string;
  createdAt: string;
}

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
  /** Enable dark mode for sheet music (inverts colors) */
  darkMode?: boolean;
  /** Auto dark mode based on system preference */
  autoDarkMode?: boolean;
  /** Music piece ID for annotations */
  musicPieceId?: string;
  /** External annotations (controlled mode) */
  annotations?: PdfAnnotation[];
  /** Callback when an annotation is added */
  onAnnotationAdd?: (annotation: PdfAnnotation) => void;
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
  darkMode = false,
  autoDarkMode = false,
  musicPieceId,
  annotations: externalAnnotations,
  onAnnotationAdd,
}: PdfViewerProps) {
  const { t } = useTranslation();
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
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; scrollLeft: number; scrollTop: number } | null>(null);

  // Annotations state
  const [showAnnotationsPanel, setShowAnnotationsPanel] = useState(false);
  const [annotations, setAnnotations] = useState<PdfAnnotation[]>([]);
  const [newAnnotationText, setNewAnnotationText] = useState('');
  const [newAnnotationColor, setNewAnnotationColor] = useState('#fbbf24');
  const [annotationsLoading, setAnnotationsLoading] = useState(false);
  const [annotationFeedback, setAnnotationFeedback] = useState<string | null>(null);
  const [drawingMode, setDrawingMode] = useState(false);
  const [canvasDimensions, setCanvasDimensions] = useState({ width: 0, height: 0 });

  // Dark mode state - respects prop or system preference
  const [isDarkModeActive, setIsDarkModeActive] = useState(() => {
    if (darkMode) return true;
    if (autoDarkMode && typeof window !== 'undefined') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  // Listen for system dark mode changes
  useEffect(() => {
    if (!autoDarkMode) {
      setIsDarkModeActive(darkMode);
      return;
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      setIsDarkModeActive(e.matches);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [darkMode, autoDarkMode]);

  // Toggle dark mode function
  const toggleDarkMode = useCallback(() => {
    setIsDarkModeActive(prev => !prev);
  }, []);

  // Load annotations when musicPieceId changes or when using external annotations
  useEffect(() => {
    if (externalAnnotations !== undefined) {
      setAnnotations(externalAnnotations);
      return;
    }
    if (!musicPieceId) return;

    setAnnotationsLoading(true);
    getAnnotations(musicPieceId)
      .then((data) => {
        // Map API response (annotationType-based) to our simplified PdfAnnotation shape
        const mapped: PdfAnnotation[] = (data as any[]).map((a) => ({
          id: a.id,
          pageNumber: a.pageNumber,
          content: a.content || '',
          color: a.color || '#fbbf24',
          createdAt: a.createdAt,
        }));
        setAnnotations(mapped);
      })
      .catch(() => {
        // Silently fail – annotations are optional
      })
      .finally(() => setAnnotationsLoading(false));
  }, [musicPieceId, externalAnnotations]);

  // Show transient feedback message
  const showFeedback = useCallback((msg: string) => {
    setAnnotationFeedback(msg);
    setTimeout(() => setAnnotationFeedback(null), 2500);
  }, []);

  // Annotations for the current page
  const currentPageAnnotations = useMemo(
    () => annotations.filter((a) => a.pageNumber === currentPage),
    [annotations, currentPage]
  );

  // Pages that have at least one annotation (for dot indicators)
  const pagesWithAnnotations = useMemo(
    () => new Set(annotations.map((a) => a.pageNumber)),
    [annotations]
  );

  const handleAddAnnotation = useCallback(async () => {
    if (!newAnnotationText.trim()) return;
    if (!musicPieceId) return;

    try {
      const result = await createAnnotation({
        musicPieceId,
        pageNumber: currentPage,
        annotationType: 'note',
        xPosition: 0,
        yPosition: 0,
        content: newAnnotationText.trim(),
        color: newAnnotationColor,
      } as any);

      const newAnnotation: PdfAnnotation = {
        id: result.id,
        pageNumber: currentPage,
        content: newAnnotationText.trim(),
        color: newAnnotationColor,
        createdAt: new Date().toISOString(),
      };

      setAnnotations((prev) => [...prev, newAnnotation]);
      setNewAnnotationText('');
      showFeedback(t('annotations.saved'));
      onAnnotationAdd?.(newAnnotation);
    } catch {
      // Silently fail
    }
  }, [musicPieceId, currentPage, newAnnotationText, newAnnotationColor, t, onAnnotationAdd, showFeedback]);

  const handleDeleteAnnotation = useCallback(async (id: string) => {
    try {
      await deleteAnnotation(id);
      setAnnotations((prev) => prev.filter((a) => a.id !== id));
      showFeedback(t('annotations.deleted'));
    } catch {
      // Silently fail
    }
  }, [t, showFeedback]);

  // Load PDF document
  useEffect(() => {
    let cancelled = false;

    const loadPdf = async () => {
      setLoading(true);
      setError(null);

      try {
        let loadingTask: pdfjsLib.PDFDocumentLoadingTask;

        if (file) {
          const data = await file.arrayBuffer();
          loadingTask = pdfjsLib.getDocument({ data });
        } else if (url) {
          loadingTask = pdfjsLib.getDocument(url);
        } else {
          throw new Error('No PDF source provided');
        }

        const pdf = await loadingTask.promise;

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

      // Track dimensions for annotation overlay
      setCanvasDimensions({ width: scaledViewport.width, height: scaledViewport.height });

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

  // Mouse drag-to-pan when zoomed
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!isZoomed || !containerRef.current) return;
    e.preventDefault();
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      scrollLeft: containerRef.current.scrollLeft,
      scrollTop: containerRef.current.scrollTop,
    };
  }, [isZoomed]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging || !dragStartRef.current || !containerRef.current) return;
    e.preventDefault();
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    containerRef.current.scrollLeft = dragStartRef.current.scrollLeft - dx;
    containerRef.current.scrollTop = dragStartRef.current.scrollTop - dy;
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    dragStartRef.current = null;
  }, []);

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

  const hasAnnotationsSupport = !!musicPieceId;

  return (
    <div
      ref={swipeRef}
      className={`pdf-viewer ${className}`}
      style={{ ...styles.container, flexDirection: 'row' }}
    >
      {/* Main viewer area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
        {/* PDF Canvas Container */}
        <div
          ref={containerRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          style={{
          ...styles.canvasContainer,
          backgroundColor: isDarkModeActive ? '#1a1a1a' : '#525659',
          ...(isZoomed ? {
            // When zoomed: scrollable in all directions, content at top-left
            overflow: 'scroll',
            alignItems: 'flex-start',
            justifyContent: 'flex-start',
            touchAction: 'pan-x pan-y',
            cursor: isDragging ? 'grabbing' : 'grab',
            userSelect: 'none',
          } : {}),
        }}>
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <canvas
              ref={canvasRef}
              style={{
                ...styles.canvas,
                // When zoomed, remove size constraints so canvas can be larger than container
                ...(isZoomed ? { maxWidth: 'none', maxHeight: 'none', flexShrink: 0 } : {}),
                ...getTransformStyle,
                opacity: isSwipeActive ? 1 - Math.abs(swipeOffset) / 300 : 1,
                filter: isDarkModeActive ? 'invert(0.9) hue-rotate(180deg) contrast(0.9)' : 'none',
              }}
            />
            {/* Drawing annotation overlay */}
            {drawingMode && musicPieceId && canvasDimensions.width > 0 && (
              <div style={{ position: 'absolute', top: 0, left: 0, zIndex: 10 }}>
                <PdfAnnotator
                  musicPieceId={musicPieceId}
                  pageNumber={currentPage}
                  pageWidth={canvasDimensions.width / zoom}
                  pageHeight={canvasDimensions.height / zoom}
                  scale={zoom}
                />
              </div>
            )}
          </div>
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
            {pagesWithAnnotations.has(currentPage) && (
              <span style={{ marginLeft: '0.5rem', color: '#fbbf24' }}>&#9679;</span>
            )}
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
            {/* Dark mode toggle */}
            <button
              onClick={toggleDarkMode}
              style={{
                ...styles.zoomButton,
                marginLeft: '0.5rem',
                backgroundColor: isDarkModeActive ? '#fbbf24' : '#374151',
              }}
              aria-label={isDarkModeActive ? 'Light mode' : 'Dark mode'}
              title={isDarkModeActive ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              <Icon name={isDarkModeActive ? 'sun' : 'moon'} size={16} />
            </button>
            {/* Annotations toggle */}
            {hasAnnotationsSupport && (
              <button
                onClick={() => setShowAnnotationsPanel(prev => !prev)}
                style={{
                  ...styles.zoomButton,
                  marginLeft: '0.25rem',
                  backgroundColor: showAnnotationsPanel ? '#fbbf24' : 'transparent',
                  color: showAnnotationsPanel ? '#1f2937' : 'var(--text, #333)',
                  position: 'relative',
                  minWidth: '2rem',
                }}
                aria-label={showAnnotationsPanel ? t('annotations.hideAnnotations') : t('annotations.showAnnotations')}
                title={showAnnotationsPanel ? t('annotations.hideAnnotations') : t('annotations.showAnnotations')}
              >
                <Icon name="MessageSquare" size={16} />
                {annotations.length > 0 && (
                  <span style={{
                    position: 'absolute',
                    top: '-4px',
                    right: '-4px',
                    backgroundColor: '#ef4444',
                    color: 'white',
                    borderRadius: '50%',
                    fontSize: '0.6rem',
                    width: '14px',
                    height: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 'bold',
                  }}>
                    {annotations.length > 9 ? '9+' : annotations.length}
                  </span>
                )}
              </button>
            )}
            {/* Drawing mode toggle */}
            {hasAnnotationsSupport && (
              <button
                onClick={() => setDrawingMode(prev => !prev)}
                style={{
                  ...styles.zoomButton,
                  marginLeft: '0.25rem',
                  backgroundColor: drawingMode ? '#3b82f6' : 'transparent',
                  color: drawingMode ? 'white' : 'var(--text, #333)',
                }}
                aria-label={drawingMode ? 'Stop tekenen' : 'Teken op bladmuziek'}
                title={drawingMode ? 'Stop tekenen' : 'Teken op bladmuziek'}
              >
                <Icon name="PenTool" size={16} />
              </button>
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

        {/* Annotation feedback toast */}
        {annotationFeedback && (
          <div style={styles.feedbackToast}>
            {annotationFeedback}
          </div>
        )}
      </div>

      {/* Annotations Sidebar */}
      {hasAnnotationsSupport && showAnnotationsPanel && (
        <div style={styles.annotationsSidebar}>
          <div style={styles.annotationsHeader}>
            <span style={styles.annotationsTitle}>{t('annotations.title')}</span>
            <span style={styles.annotationsPageLabel}>
              {t('annotations.pageLabel', { page: currentPage })}
            </span>
          </div>

          {/* Add annotation form */}
          <div style={styles.addAnnotationForm}>
            <textarea
              value={newAnnotationText}
              onChange={(e) => setNewAnnotationText(e.target.value)}
              placeholder={t('annotations.placeholder')}
              style={styles.annotationTextarea}
              rows={3}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  handleAddAnnotation();
                }
              }}
            />
            <div style={styles.addAnnotationControls}>
              <div style={styles.colorPicker}>
                {['#fbbf24', '#34d399', '#60a5fa', '#f87171', '#a78bfa'].map((color) => (
                  <button
                    key={color}
                    onClick={() => setNewAnnotationColor(color)}
                    style={{
                      ...styles.colorDot,
                      backgroundColor: color,
                      outline: newAnnotationColor === color ? `2px solid ${color}` : 'none',
                      outlineOffset: '2px',
                    }}
                    aria-label={color}
                  />
                ))}
              </div>
              <button
                onClick={handleAddAnnotation}
                disabled={!newAnnotationText.trim()}
                style={{
                  ...styles.addButton,
                  opacity: newAnnotationText.trim() ? 1 : 0.4,
                }}
              >
                {t('annotations.add')}
              </button>
            </div>
          </div>

          {/* Annotation list for current page */}
          <div style={styles.annotationList}>
            {annotationsLoading ? (
              <div style={styles.annotationsEmpty}>{t('common.loading')}</div>
            ) : currentPageAnnotations.length === 0 ? (
              <div style={styles.annotationsEmpty}>{t('annotations.noAnnotations')}</div>
            ) : (
              currentPageAnnotations.map((annotation) => (
                <div key={annotation.id} style={styles.annotationItem}>
                  <div style={styles.annotationItemHeader}>
                    <span
                      style={{
                        ...styles.annotationColorDot,
                        backgroundColor: annotation.color,
                      }}
                    />
                    <button
                      onClick={() => handleDeleteAnnotation(annotation.id)}
                      style={styles.deleteAnnotationButton}
                      title={t('annotations.delete')}
                      aria-label={t('annotations.delete')}
                    >
                      &times;
                    </button>
                  </div>
                  <p style={styles.annotationContent}>{annotation.content}</p>
                </div>
              ))
            )}
          </div>
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
    display: 'flex',
    alignItems: 'center',
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
  // Annotations sidebar
  annotationsSidebar: {
    width: '260px',
    minWidth: '260px',
    display: 'flex',
    flexDirection: 'column',
    borderLeft: '1px solid var(--border-color, #e5e7eb)',
    backgroundColor: 'var(--background, white)',
    overflow: 'hidden',
  },
  annotationsHeader: {
    display: 'flex',
    flexDirection: 'column',
    padding: '0.75rem 1rem',
    borderBottom: '1px solid var(--border-color, #e5e7eb)',
    backgroundColor: 'var(--background-secondary, #f9fafb)',
  },
  annotationsTitle: {
    fontWeight: 600,
    fontSize: '0.9rem',
    color: 'var(--text, #111827)',
  },
  annotationsPageLabel: {
    fontSize: '0.75rem',
    color: 'var(--text-light, #6b7280)',
    marginTop: '0.125rem',
  },
  addAnnotationForm: {
    padding: '0.75rem',
    borderBottom: '1px solid var(--border-color, #e5e7eb)',
  },
  annotationTextarea: {
    width: '100%',
    resize: 'vertical',
    border: '1px solid var(--border-color, #d1d5db)',
    borderRadius: '0.375rem',
    padding: '0.5rem',
    fontSize: '0.8125rem',
    fontFamily: 'inherit',
    color: 'var(--text, #111827)',
    backgroundColor: 'var(--background, white)',
    boxSizing: 'border-box',
    outline: 'none',
  },
  addAnnotationControls: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: '0.5rem',
    gap: '0.5rem',
  },
  colorPicker: {
    display: 'flex',
    gap: '0.25rem',
    alignItems: 'center',
  },
  colorDot: {
    width: '1rem',
    height: '1rem',
    borderRadius: '50%',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
    flexShrink: 0,
  },
  addButton: {
    padding: '0.375rem 0.75rem',
    backgroundColor: 'var(--primary, #3b82f6)',
    color: 'white',
    border: 'none',
    borderRadius: '0.375rem',
    fontSize: '0.8125rem',
    fontWeight: 500,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  annotationList: {
    flex: 1,
    overflowY: 'auto',
    padding: '0.5rem',
  },
  annotationsEmpty: {
    padding: '1rem',
    textAlign: 'center',
    fontSize: '0.8125rem',
    color: 'var(--text-light, #9ca3af)',
  },
  annotationItem: {
    backgroundColor: 'var(--background-secondary, #f9fafb)',
    borderRadius: '0.375rem',
    padding: '0.5rem 0.625rem',
    marginBottom: '0.5rem',
    border: '1px solid var(--border-color, #e5e7eb)',
  },
  annotationItemHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '0.25rem',
  },
  annotationColorDot: {
    width: '0.625rem',
    height: '0.625rem',
    borderRadius: '50%',
    flexShrink: 0,
  },
  deleteAnnotationButton: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--text-light, #9ca3af)',
    fontSize: '1rem',
    lineHeight: 1,
    padding: '0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  annotationContent: {
    margin: 0,
    fontSize: '0.8125rem',
    color: 'var(--text, #374151)',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  feedbackToast: {
    position: 'absolute',
    bottom: '4rem',
    left: '50%',
    transform: 'translateX(-50%)',
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    color: 'white',
    padding: '0.4rem 1rem',
    borderRadius: '1rem',
    fontSize: '0.8125rem',
    fontWeight: 500,
    zIndex: 20,
    pointerEvents: 'none',
    whiteSpace: 'nowrap',
  },
};

export default PdfViewer;
