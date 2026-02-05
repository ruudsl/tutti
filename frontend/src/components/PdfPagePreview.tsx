import { useState, useEffect, useRef, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';

// Set up PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

interface PdfPagePreviewProps {
  file: File;
  selectedRanges?: { start: number; end: number; name: string; color?: string }[];
  onPageClick?: (pageNumber: number) => void;
  thumbnailWidth?: number;
}

interface PageThumbnail {
  pageNumber: number;
  dataUrl: string;
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

  const renderPage = useCallback(async (
    pdf: pdfjsLib.PDFDocumentProxy,
    pageNum: number,
    width: number
  ): Promise<PageThumbnail> => {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1 });
    const scale = width / viewport.width;
    const scaledViewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d')!;
    canvas.width = scaledViewport.width;
    canvas.height = scaledViewport.height;

    await page.render({
      canvasContext: context,
      viewport: scaledViewport,
    }).promise;

    return {
      pageNumber: pageNum,
      dataUrl: canvas.toDataURL('image/jpeg', 0.7),
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadPdf = async () => {
      setLoading(true);
      setError(null);
      setThumbnails([]);
      setLoadedCount(0);

      try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

        if (cancelled) return;

        setTotalPages(pdf.numPages);
        const newThumbnails: PageThumbnail[] = [];

        // Render pages in batches for better performance
        const batchSize = 4;
        for (let i = 1; i <= pdf.numPages; i += batchSize) {
          if (cancelled) return;

          const batch = [];
          for (let j = i; j < i + batchSize && j <= pdf.numPages; j++) {
            batch.push(renderPage(pdf, j, thumbnailWidth));
          }

          const results = await Promise.all(batch);
          newThumbnails.push(...results);

          if (!cancelled) {
            setThumbnails([...newThumbnails]);
            setLoadedCount(newThumbnails.length);
          }
        }

        if (!cancelled) {
          setLoading(false);
        }
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
    };
  }, [file, thumbnailWidth, renderPage]);

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
        {thumbnails.map((thumb) => {
          const rangeInfo = getPageRangeInfo(thumb.pageNumber);

          return (
            <div
              key={thumb.pageNumber}
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
                  border: rangeInfo
                    ? `3px solid ${rangeInfo.color}`
                    : '1px solid var(--border)',
                  borderRadius: '0.25rem',
                  overflow: 'hidden',
                  background: 'white',
                  boxShadow: rangeInfo ? `0 0 8px ${rangeInfo.color}40` : 'var(--shadow)',
                }}
              >
                <img
                  src={thumb.dataUrl}
                  alt={`Pagina ${thumb.pageNumber}`}
                  style={{
                    width: '100%',
                    height: 'auto',
                    display: 'block',
                  }}
                />
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
