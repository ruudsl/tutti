interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  hasNext?: boolean;
  hasPrev?: boolean;
  showInfo?: boolean;
  total?: number;
  limit?: number;
}

/**
 * Pagination component
 */
export function Pagination({
  page,
  totalPages,
  onPageChange,
  hasNext,
  hasPrev,
  showInfo = true,
  total,
  limit,
}: PaginationProps) {
  // Generate page numbers to show
  const getPageNumbers = (): (number | 'ellipsis')[] => {
    const pages: (number | 'ellipsis')[] = [];
    const showPages = 5; // Show max 5 page numbers

    if (totalPages <= showPages) {
      // Show all pages
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Show first, last, and pages around current
      if (page <= 3) {
        for (let i = 1; i <= 4; i++) pages.push(i);
        pages.push('ellipsis');
        pages.push(totalPages);
      } else if (page >= totalPages - 2) {
        pages.push(1);
        pages.push('ellipsis');
        for (let i = totalPages - 3; i <= totalPages; i++) pages.push(i);
      } else {
        pages.push(1);
        pages.push('ellipsis');
        for (let i = page - 1; i <= page + 1; i++) pages.push(i);
        pages.push('ellipsis');
        pages.push(totalPages);
      }
    }

    return pages;
  };

  if (totalPages <= 1) return null;

  const canGoPrev = hasPrev !== undefined ? hasPrev : page > 1;
  const canGoNext = hasNext !== undefined ? hasNext : page < totalPages;

  return (
    <div className="pagination">
      <button
        className="pagination-btn"
        onClick={() => onPageChange(page - 1)}
        disabled={!canGoPrev}
        aria-label="Vorige pagina"
      >
        ←
      </button>

      {getPageNumbers().map((p, i) =>
        p === 'ellipsis' ? (
          <span key={`ellipsis-${i}`} className="pagination-info">
            ...
          </span>
        ) : (
          <button
            key={p}
            className={`pagination-btn ${p === page ? 'active' : ''}`}
            onClick={() => onPageChange(p)}
            aria-label={`Pagina ${p}`}
            aria-current={p === page ? 'page' : undefined}
          >
            {p}
          </button>
        )
      )}

      <button
        className="pagination-btn"
        onClick={() => onPageChange(page + 1)}
        disabled={!canGoNext}
        aria-label="Volgende pagina"
      >
        →
      </button>

      {showInfo && total !== undefined && limit !== undefined && (
        <span className="pagination-info">
          {(page - 1) * limit + 1}-{Math.min(page * limit, total)} van {total}
        </span>
      )}
    </div>
  );
}

export default Pagination;
