/**
 * PDF Thumbnail Preview Component
 *
 * Renders a small preview thumbnail of the first page of a PDF.
 * Features lazy loading for performance and caching.
 */

import { useState, useEffect, useRef, useCallback, memo, CSSProperties } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { loadPdfjs } from '../lib/pdfjs';
import { useLazyLoad } from '../hooks/useLazyLoad';
import { useDarkMode } from '../hooks/useDarkMode';
import { Icon } from './Icon';

// Simple in-memory cache for thumbnails
const thumbnailCache = new Map<string, string>();
const MAX_CACHE_SIZE = 100;

function addToCache(key: string, dataUrl: string): void {
  // Evict oldest entries if cache is full
  if (thumbnailCache.size >= MAX_CACHE_SIZE) {
    const firstKey = thumbnailCache.keys().next().value;
    if (firstKey) thumbnailCache.delete(firstKey);
  }
  thumbnailCache.set(key, dataUrl);
}

function getCacheKey(src: string | File): string {
  if (typeof src === 'string') {
    return src;
  }
  return `file:${src.name}:${src.size}:${src.lastModified}`;
}

interface PdfThumbnailProps {
  /** PDF source - can be a URL string or a File object */
  src: string | File;
  /** Width of the thumbnail in pixels */
  width?: number;
  /** Height of the thumbnail (if not specified, uses aspect ratio) */
  height?: number;
  /** Alternative text for accessibility */
  alt?: string;
  /** Click handler - typically opens the full PDF viewer */
  onClick?: () => void;
  /** Additional CSS class name */
  className?: string;
  /** Custom styles */
  style?: CSSProperties;
  /** Root margin for lazy loading (when to start loading) */
  rootMargin?: string;
  /** Show loading spinner */
  showSpinner?: boolean;
  /** Border radius */
  borderRadius?: string;
  /** Show a hover overlay with action icon */
  showHoverOverlay?: boolean;
}

type LoadState = 'idle' | 'loading' | 'loaded' | 'error';

export const PdfThumbnail = memo(function PdfThumbnail({
  src,
  width = 120,
  height,
  alt = 'PDF voorbeeld',
  onClick,
  className = '',
  style,
  rootMargin = '200px',
  showSpinner = true,
  borderRadius = 'var(--radius-sm)',
  showHoverOverlay = true,
}: PdfThumbnailProps) {
  const { isDark } = useDarkMode();
  const { ref, isVisible } = useLazyLoad({ rootMargin, triggerOnce: true });
  const [loadState, setLoadState] = useState<LoadState>('idle');
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const pdfRef = useRef<PDFDocumentProxy | null>(null);

  // Render first page of PDF as thumbnail
  const renderThumbnail = useCallback(async () => {
    const cacheKey = getCacheKey(src);

    // Check cache first
    const cached = thumbnailCache.get(cacheKey);
    if (cached) {
      setThumbnailUrl(cached);
      setLoadState('loaded');
      return;
    }

    setLoadState('loading');

    try {
      // Load pdf.js lazily on first use (kept out of the initial bundle)
      const pdfjsLib = await loadPdfjs();

      let data: ArrayBuffer | string;

      if (typeof src === 'string') {
        // URL - fetch with Bearer token for authentication
        const token = localStorage.getItem('token');
        const headers: HeadersInit = {};
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }
        const response = await fetch(src, { headers });
        if (!response.ok) {
          throw new Error(`Failed to fetch PDF: ${response.status}`);
        }
        data = await response.arrayBuffer();
      } else {
        // File object - read as ArrayBuffer
        data = await src.arrayBuffer();
      }

      const loadingTask = pdfjsLib.getDocument({ data });
      const pdf = await loadingTask.promise;
      pdfRef.current = pdf;

      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 1 });
      const scale = width / viewport.width;
      const scaledViewport = page.getViewport({ scale });

      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');

      if (!context) {
        throw new Error('Could not get canvas context');
      }

      canvas.width = scaledViewport.width;
      canvas.height = scaledViewport.height;

      await page.render({
        canvas,
        canvasContext: context,
        viewport: scaledViewport,
      }).promise;

      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);

      // Cache the result
      addToCache(cacheKey, dataUrl);

      setThumbnailUrl(dataUrl);
      setLoadState('loaded');

      // Cleanup
      pdf.loadingTask.destroy();
      pdfRef.current = null;
    } catch (error) {
      console.error('Failed to render PDF thumbnail:', error);
      setLoadState('error');
    }
  }, [src, width]);

  // Een andere bron betekent een ander voorbeeldje. Zonder deze stap bleef
  // het component op 'loaded' staan en bleef het oude voorblad in beeld,
  // terwijl er allang een ander bestand onder hing.
  const srcCacheKey = getCacheKey(src);
  const previousCacheKey = useRef(srcCacheKey);
  useEffect(() => {
    if (previousCacheKey.current === srcCacheKey) return;
    previousCacheKey.current = srcCacheKey;
    setThumbnailUrl(null);
    setLoadState('idle');
  }, [srcCacheKey]);

  // Start rendering when visible
  useEffect(() => {
    if (isVisible && loadState === 'idle') {
      renderThumbnail();
    }

    return () => {
      // Cleanup PDF document on unmount
      if (pdfRef.current) {
        pdfRef.current.loadingTask.destroy();
        pdfRef.current = null;
      }
    };
  }, [isVisible, loadState, renderThumbnail]);

  const containerStyles: CSSProperties = {
    position: 'relative',
    width,
    height: height ?? 'auto',
    aspectRatio: height ? undefined : '210 / 297', // A4 aspect ratio
    backgroundColor: isDark ? 'var(--surface)' : '#f9fafb',
    borderRadius,
    overflow: 'hidden',
    border: `1px solid ${isDark ? 'var(--border)' : '#e5e7eb'}`,
    boxShadow: 'var(--shadow)',
    cursor: onClick ? 'pointer' : 'default',
    transition: 'transform var(--transition-fast), box-shadow var(--transition-fast)',
    ...style,
  };

  const hoverStyles: CSSProperties =
    isHovered && onClick
      ? {
          transform: 'scale(1.02)',
          boxShadow: 'var(--shadow-md)',
        }
      : {};

  const imageStyles: CSSProperties = {
    display: 'block',
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    opacity: loadState === 'loaded' ? 1 : 0,
    transition: 'opacity 0.3s ease-in-out',
  };

  const overlayStyles: CSSProperties = {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    opacity: isHovered && showHoverOverlay && onClick ? 1 : 0,
    transition: 'opacity var(--transition-fast)',
    pointerEvents: 'none',
  };

  const spinnerStyles: CSSProperties = {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: '24px',
    height: '24px',
    border: `2px solid ${isDark ? 'var(--border)' : '#e5e7eb'}`,
    borderTopColor: 'var(--primary)',
    borderRadius: '50%',
    animation: 'pdf-thumbnail-spin 0.8s linear infinite',
    opacity: loadState === 'loading' ? 1 : 0,
    transition: 'opacity 0.2s ease-in-out',
  };

  const placeholderStyles: CSSProperties = {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    color: isDark ? 'var(--text-light)' : '#9ca3af',
    opacity: loadState === 'idle' || loadState === 'loading' ? 1 : 0,
    transition: 'opacity 0.3s ease-in-out',
  };

  const errorStyles: CSSProperties = {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--danger)',
    fontSize: 'var(--font-size-xs)',
    textAlign: 'center',
    padding: '0.5rem',
    opacity: loadState === 'error' ? 1 : 0,
    transition: 'opacity 0.3s ease-in-out',
  };

  return (
    <>
      <style>
        {`
          @keyframes pdf-thumbnail-spin {
            from { transform: translate(-50%, -50%) rotate(0deg); }
            to { transform: translate(-50%, -50%) rotate(360deg); }
          }
        `}
      </style>
      <div
        ref={ref as React.RefObject<HTMLDivElement>}
        className={`pdf-thumbnail ${className}`}
        style={{ ...containerStyles, ...hoverStyles }}
        onClick={onClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        role={onClick ? 'button' : undefined}
        tabIndex={onClick ? 0 : undefined}
        onKeyDown={
          onClick
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onClick();
                }
              }
            : undefined
        }
        aria-label={onClick ? `${alt} - Klik om te openen` : alt}
      >
        {/* Placeholder icon */}
        {(loadState === 'idle' || loadState === 'loading') && (
          <div style={placeholderStyles} aria-hidden="true">
            <Icon name="fileText" size={32} />
            <span style={{ fontSize: 'var(--font-size-xs)', marginTop: '0.25rem' }}>PDF</span>
          </div>
        )}

        {/* Loading spinner */}
        {showSpinner && loadState === 'loading' && <div style={spinnerStyles} aria-hidden="true" />}

        {/* Thumbnail image */}
        {thumbnailUrl && <img src={thumbnailUrl} alt={alt} style={imageStyles} loading="lazy" decoding="async" />}

        {/* Hover overlay */}
        {showHoverOverlay && onClick && (
          <div style={overlayStyles} aria-hidden="true">
            <Icon name="eye" size={24} style={{ color: 'white' }} />
          </div>
        )}

        {/* Error state */}
        {loadState === 'error' && (
          <div style={errorStyles}>
            <Icon name="warning" size={24} />
            <span style={{ marginTop: '0.25rem' }}>Laden mislukt</span>
          </div>
        )}
      </div>
    </>
  );
});

/**
 * Clear the thumbnail cache
 */
export function clearThumbnailCache(): void {
  thumbnailCache.clear();
}

/**
 * Remove a specific entry from the cache
 */
export function removeThumbnailFromCache(src: string | File): void {
  const key = getCacheKey(src);
  thumbnailCache.delete(key);
}

/**
 * Get current cache size
 */
export function getThumbnailCacheSize(): number {
  return thumbnailCache.size;
}

export default PdfThumbnail;
