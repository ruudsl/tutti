import { useState, useEffect, useRef, useCallback } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { loadPdfjs } from '../lib/pdfjs';
import { useLazyLoadMultiple } from '../hooks/useLazyLoad';

interface PdfPagePreviewProps {
  file: File;
  selectedRanges?: { start: number; end: number; name: string; color?: string }[];
  onPageClick?: (pageNumber: number) => void;
  thumbnailWidth?: number;
}

interface PageThumbnail {
  pageNumber: number;
  dataUrl: string | null; // null when not yet rendered
}

const RANGE_COLORS = [
  '#3b82f6', // blue
  '#10b981', // green
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
];

export default function PdfPagePreview({
  file,
  selectedRanges = [],
  onPageClick,
  thumbnailWidth = 120,
}: PdfPagePreviewProps) {
  const [thumbnails, setThumbnails] = useState<PageThumbnail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadedCount, setLoadedCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pdfRef = useRef<PDFDocumentProxy | null>(null);

  // Use lazy loading for thumbnails - only render when visible
  const { getRef, visibilityStates } = useLazyLoadMultiple({
    count: totalPages,
    rootMargin: '200px', // Start loading 200px before visible
    triggerOnce: true,
  });

  const renderPage = useCallback(async (pdf: PDFDocumentProxy, pageNum: number, width: number): Promise<string> => {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1 });
    const scale = width / viewport.width;
    const scaledViewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d')!;
    canvas.width = scaledViewport.width;
    canvas.height = scaledViewport.height;

    await page.render({
      canvas,
      canvasContext: context,
      viewport: scaledViewport,
    }).promise;

    return canvas.toDataURL('image/jpeg', 0.7);
  }, []);

  // Load PDF and initialize thumbnail placeholders
  useEffect(() => {
    let cancelled = false;

    const loadPdf = async () => {
      setLoading(true);
      setError(null);
      setThumbnails([]);
      setLoadedCount(0);

      try {
        // Load pdf.js lazily on first use (kept out of the initial bundle)
        const pdfjsLib = await loadPdfjs();

        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

        if (cancelled) {
          pdf.loadingTask.destroy();
          return;
        }

        pdfRef.current = pdf;
        setTotalPages(pdf.numPages);

        // Initialize thumbnails with null dataUrls (lazy loaded later)
        const initialThumbnails: PageThumbnail[] = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          initialThumbnails.push({ pageNumber: i, dataUrl: null });
        }
        setThumbnails(initialThumbnails);
        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError('Kon PDF niet laden');
          setLoading(false);
        }
      }
    };

    loadPdf();

    return () => {
      cancelled = true;
      if (pdfRef.current) {
        pdfRef.current.loadingTask.destroy();
        pdfRef.current = null;
      }
    };
  }, [file]);

  // Lazy render thumbnails when they become visible
  useEffect(() => {
    if (!pdfRef.current || loading) return;

    const renderVisibleThumbnails = async () => {
      const pdf = pdfRef.current;
      if (!pdf) return;

      for (let i = 0; i < visibilityStates.length; i++) {
        const isVisible = visibilityStates[i];
        const pageNum = i + 1;

        // Check if this thumbnail needs to be rendered
        if (isVisible && thumbnails[i]?.dataUrl === null) {
          try {
            const dataUrl = await renderPage(pdf, pageNum, thumbnailWidth);
            setThumbnails((prev) => {
              const updated = [...prev];
              if (updated[i]) {
                updated[i] = { ...updated[i], dataUrl };
              }
              return updated;
            });
            setLoadedCount((prev) => prev + 1);
          } catch (err) {
            console.error(`Failed to render page ${pageNum}:`, err);
          }
        }
      }
    };

    renderVisibleThumbnails();
  }, [visibilityStates, thumbnails, loading, renderPage, thumbnailWidth]);

  const getPageRangeInfo = (pageNumber: number) => {
    for (let i = 0; i < selectedRanges.length; i++) {
      const range = selectedRanges[i];
      if (pageNumber >= range.start && pageNumber <= range.end) {
        return {
          rangeIndex: i,
          rangeName: range.name,
          color: range.color || RANGE_COLORS[i % RANGE_COLORS.length],
        };
      }
    }
    return null;
  };

  if (error) {
    return (
      <div className="alert alert-danger" style={{ marginTop: '1rem' }}>
        {error}
      </div>
    );
  }

  return (
    <div className="pdf-preview-container">
      {loading && totalPages > 0 && (
        <div style={{ marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--text-light)' }}>
          Laden: {loadedCount} / {totalPages} pagina's...
        </div>
      )}

      <div
        className="pdf-thumbnails"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(auto-fill, minmax(${thumbnailWidth + 10}px, 1fr))`,
          gap: '0.75rem',
          maxHeight: '400px',
          overflowY: 'auto',
          padding: '0.5rem',
          background: 'var(--background)',
          borderRadius: '0.5rem',
        }}
      >
        {thumbnails.map((thumb, index) => {
          const rangeInfo = getPageRangeInfo(thumb.pageNumber);
          const isRendered = thumb.dataUrl !== null;

          return (
            <div
              key={thumb.pageNumber}
              ref={getRef(index)}
              className="pdf-thumbnail"
              onClick={() => onPageClick?.(thumb.pageNumber)}
              style={{
                cursor: onPageClick ? 'pointer' : 'default',
                textAlign: 'center',
                position: 'relative',
              }}
            >
              <div
                style={{
                  border: rangeInfo ? `3px solid ${rangeInfo.color}` : '1px solid var(--border)',
                  borderRadius: '0.25rem',
                  overflow: 'hidden',
                  background: 'white',
                  boxShadow: rangeInfo ? `0 0 8px ${rangeInfo.color}40` : 'var(--shadow)',
                  // Maintain aspect ratio for placeholder
                  aspectRatio: isRendered ? undefined : '210 / 297',
                  minHeight: isRendered ? undefined : '140px',
                }}
              >
                {isRendered ? (
                  <img
                    src={thumb.dataUrl ?? undefined}
                    alt={`Pagina ${thumb.pageNumber}`}
                    style={{
                      width: '100%',
                      height: 'auto',
                      display: 'block',
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: '100%',
                      height: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: '#f9fafb',
                    }}
                  >
                    <div
                      className="spinner"
                      style={{
                        width: '20px',
                        height: '20px',
                        borderWidth: '2px',
                      }}
                    />
                  </div>
                )}
              </div>
              <div
                style={{
                  marginTop: '0.25rem',
                  fontSize: '0.75rem',
                  fontWeight: rangeInfo ? 600 : 400,
                  color: rangeInfo ? rangeInfo.color : 'var(--text-light)',
                }}
              >
                {thumb.pageNumber}
                {rangeInfo && (
                  <span
                    style={{
                      display: 'block',
                      fontSize: '0.65rem',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {rangeInfo.rangeName}
                  </span>
                )}
              </div>
            </div>
          );
        })}

        {loading && thumbnails.length === 0 && (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '2rem' }}>
            <div className="spinner" style={{ margin: '0 auto 1rem' }}></div>
            <div style={{ color: 'var(--text-light)' }}>PDF wordt geladen...</div>
          </div>
        )}
      </div>

      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  );
}
