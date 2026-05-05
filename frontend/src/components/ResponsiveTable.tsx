/**
 * Responsive Table Component
 *
 * A table that adapts to screen size - shows as cards on mobile, table on desktop.
 * Features sortable columns, column priority system, sticky header, and loading states.
 */

import {
  useState,
  useCallback,
  useMemo,
  ReactNode,
  CSSProperties,
  memo,
} from 'react';
import { useDarkMode } from '../hooks/useDarkMode';
import { Icon, IconName } from './Icon';

// ============================================
// Types
// ============================================

export type SortDirection = 'asc' | 'desc' | null;

export interface ColumnDefinition<T> {
  /** Unique identifier for the column */
  id: string;
  /** Column header label (Dutch) */
  header: string;
  /** Function to render the cell content */
  accessor: (row: T) => ReactNode;
  /** Function to get sortable value (optional) */
  sortValue?: (row: T) => string | number | Date | null;
  /** Column width (CSS value) */
  width?: string;
  /** Minimum width (CSS value) */
  minWidth?: string;
  /** Maximum width (CSS value) */
  maxWidth?: string;
  /** Whether column is sortable */
  sortable?: boolean;
  /** Priority for responsive hiding (1 = highest, always show; higher = hide first) */
  priority?: number;
  /** Text alignment */
  align?: 'left' | 'center' | 'right';
  /** Whether to hide on mobile */
  hideOnMobile?: boolean;
  /** Custom header icon */
  headerIcon?: IconName;
  /** Label for card view (defaults to header) */
  cardLabel?: string;
  /** Whether to show in card view */
  showInCard?: boolean;
}

export interface ResponsiveTableProps<T> {
  /** Data rows */
  data: T[];
  /** Column definitions */
  columns: ColumnDefinition<T>[];
  /** Function to get unique key for each row */
  keyExtractor: (row: T) => string;
  /** Breakpoint for switching to card view (default: 768) */
  mobileBreakpoint?: number;
  /** Whether to show sticky header */
  stickyHeader?: boolean;
  /** Loading state */
  loading?: boolean;
  /** Number of skeleton rows to show when loading */
  skeletonRows?: number;
  /** Empty state message */
  emptyMessage?: string;
  /** Empty state icon */
  emptyIcon?: IconName;
  /** Sort state */
  sortColumn?: string;
  /** Sort direction */
  sortDirection?: SortDirection;
  /** Sort change handler */
  onSort?: (columnId: string, direction: SortDirection) => void;
  /** Row click handler */
  onRowClick?: (row: T) => void;
  /** Custom row class name */
  rowClassName?: (row: T) => string;
  /** Whether rows are hoverable */
  hoverable?: boolean;
  /** Whether to show row borders */
  bordered?: boolean;
  /** Whether to use striped rows */
  striped?: boolean;
  /** Whether to use compact sizing */
  compact?: boolean;
  /** Additional CSS class name */
  className?: string;
  /** Custom styles */
  style?: CSSProperties;
  /** Render additional content before each card (mobile only) */
  renderCardPrefix?: (row: T) => ReactNode;
  /** Render additional content after each card (mobile only) */
  renderCardSuffix?: (row: T) => ReactNode;
}

// ============================================
// Helper Hooks
// ============================================

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.matchMedia(query).matches;
    }
    return false;
  });

  useState(() => {
    if (typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);

    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  });

  return matches;
}

// ============================================
// Skeleton Component
// ============================================

const SkeletonRow = memo(function SkeletonRow({
  columnCount,
  isDark,
}: {
  columnCount: number;
  isDark: boolean;
}) {
  return (
    <tr>
      {Array.from({ length: columnCount }).map((_, i) => (
        <td key={i} style={{ padding: '0.75rem 1rem' }}>
          <div
            style={{
              height: '1rem',
              backgroundColor: isDark ? 'var(--surface-hover)' : '#f3f4f6',
              borderRadius: 'var(--radius-sm)',
              animation: 'skeleton-pulse 1.5s ease-in-out infinite',
            }}
          />
        </td>
      ))}
    </tr>
  );
});

const SkeletonCard = memo(function SkeletonCard({ isDark }: { isDark: boolean }) {
  return (
    <div
      style={{
        padding: '1rem',
        backgroundColor: isDark ? 'var(--surface)' : '#ffffff',
        border: `1px solid ${isDark ? 'var(--border)' : '#e5e7eb'}`,
        borderRadius: 'var(--radius)',
        marginBottom: '0.75rem',
      }}
    >
      <div
        style={{
          height: '1.25rem',
          width: '60%',
          backgroundColor: isDark ? 'var(--surface-hover)' : '#f3f4f6',
          borderRadius: 'var(--radius-sm)',
          marginBottom: '0.75rem',
          animation: 'skeleton-pulse 1.5s ease-in-out infinite',
        }}
      />
      <div
        style={{
          height: '1rem',
          width: '80%',
          backgroundColor: isDark ? 'var(--surface-hover)' : '#f3f4f6',
          borderRadius: 'var(--radius-sm)',
          marginBottom: '0.5rem',
          animation: 'skeleton-pulse 1.5s ease-in-out infinite',
        }}
      />
      <div
        style={{
          height: '1rem',
          width: '40%',
          backgroundColor: isDark ? 'var(--surface-hover)' : '#f3f4f6',
          borderRadius: 'var(--radius-sm)',
          animation: 'skeleton-pulse 1.5s ease-in-out infinite',
        }}
      />
    </div>
  );
});

// ============================================
// Main Component
// ============================================

function ResponsiveTableComponent<T>({
  data,
  columns,
  keyExtractor,
  mobileBreakpoint = 768,
  stickyHeader = false,
  loading = false,
  skeletonRows = 5,
  emptyMessage = 'Geen gegevens beschikbaar',
  emptyIcon = 'inbox' as IconName,
  sortColumn,
  sortDirection,
  onSort,
  onRowClick,
  rowClassName,
  hoverable = true,
  bordered = true,
  striped = false,
  compact = false,
  className = '',
  style,
  renderCardPrefix,
  renderCardSuffix,
}: ResponsiveTableProps<T>) {
  const { isDark } = useDarkMode();
  const isMobile = useMediaQuery(`(max-width: ${mobileBreakpoint}px)`);
  const [hoveredRowId, setHoveredRowId] = useState<string | null>(null);

  // Filter columns based on priority and mobile state
  const visibleColumns = useMemo(() => {
    if (!isMobile) return columns;
    return columns.filter((col) => !col.hideOnMobile);
  }, [columns, isMobile]);

  // Handle sort click
  const handleSort = useCallback((columnId: string) => {
    if (!onSort) return;

    let newDirection: SortDirection;
    if (sortColumn !== columnId) {
      newDirection = 'asc';
    } else if (sortDirection === 'asc') {
      newDirection = 'desc';
    } else if (sortDirection === 'desc') {
      newDirection = null;
    } else {
      newDirection = 'asc';
    }

    onSort(columnId, newDirection);
  }, [sortColumn, sortDirection, onSort]);

  // Styles
  const tableWrapperStyles: CSSProperties = {
    width: '100%',
    overflowX: 'auto',
    ...style,
  };

  const tableStyles: CSSProperties = {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: compact ? 'var(--font-size-sm)' : 'var(--font-size-md)',
  };

  const headerCellStyles = (column: ColumnDefinition<T>): CSSProperties => ({
    padding: compact ? '0.5rem 0.75rem' : '0.75rem 1rem',
    textAlign: column.align ?? 'left',
    fontWeight: 'var(--font-weight-semibold)',
    color: isDark ? 'var(--text)' : '#374151',
    backgroundColor: isDark ? 'var(--surface)' : '#f9fafb',
    borderBottom: `2px solid ${isDark ? 'var(--border)' : '#e5e7eb'}`,
    whiteSpace: 'nowrap',
    width: column.width,
    minWidth: column.minWidth,
    maxWidth: column.maxWidth,
    position: stickyHeader ? 'sticky' : undefined,
    top: stickyHeader ? 0 : undefined,
    zIndex: stickyHeader ? 10 : undefined,
    cursor: column.sortable && onSort ? 'pointer' : 'default',
    userSelect: column.sortable ? 'none' : undefined,
    transition: 'background-color var(--transition-fast)',
  });

  const bodyCellStyles = (column: ColumnDefinition<T>): CSSProperties => ({
    padding: compact ? '0.5rem 0.75rem' : '0.75rem 1rem',
    textAlign: column.align ?? 'left',
    color: isDark ? 'var(--text)' : '#1f2937',
    borderBottom: bordered ? `1px solid ${isDark ? 'var(--border)' : '#e5e7eb'}` : undefined,
    width: column.width,
    minWidth: column.minWidth,
    maxWidth: column.maxWidth,
    verticalAlign: 'middle',
  });

  const getRowStyles = (row: T, index: number): CSSProperties => {
    const rowId = keyExtractor(row);
    const isHovered = hoveredRowId === rowId;

    return {
      backgroundColor: striped && index % 2 === 1
        ? (isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)')
        : (isHovered && hoverable
          ? (isDark ? 'var(--surface-hover)' : '#f9fafb')
          : 'transparent'),
      cursor: onRowClick ? 'pointer' : 'default',
      transition: 'background-color var(--transition-fast)',
    };
  };

  // Card view for mobile
  const cardStyles: CSSProperties = {
    padding: '1rem',
    backgroundColor: isDark ? 'var(--surface)' : '#ffffff',
    border: `1px solid ${isDark ? 'var(--border)' : '#e5e7eb'}`,
    borderRadius: 'var(--radius)',
    marginBottom: '0.75rem',
    cursor: onRowClick ? 'pointer' : 'default',
    transition: 'box-shadow var(--transition-fast), transform var(--transition-fast)',
  };

  const cardLabelStyles: CSSProperties = {
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-medium)',
    color: 'var(--text-muted)',
    marginBottom: '0.25rem',
    textTransform: 'uppercase',
    letterSpacing: '0.025em',
  };

  const cardValueStyles: CSSProperties = {
    fontSize: 'var(--font-size-sm)',
    color: isDark ? 'var(--text)' : '#1f2937',
  };

  // Render sort indicator
  const renderSortIndicator = (column: ColumnDefinition<T>) => {
    if (!column.sortable || !onSort) return null;

    const isActive = sortColumn === column.id;
    const iconColor = isActive ? 'var(--primary)' : 'var(--text-muted)';

    return (
      <span
        style={{
          display: 'inline-flex',
          marginLeft: '0.5rem',
          opacity: isActive ? 1 : 0.5,
        }}
      >
        {isActive && sortDirection === 'asc' ? (
          <Icon name="chevronUp" size={14} style={{ color: iconColor }} />
        ) : isActive && sortDirection === 'desc' ? (
          <Icon name="chevronDown" size={14} style={{ color: iconColor }} />
        ) : (
          <Icon name="chevronDown" size={14} style={{ color: iconColor, opacity: 0.3 }} />
        )}
      </span>
    );
  };

  // Loading state
  if (loading) {
    if (isMobile) {
      return (
        <div className={className}>
          <style>
            {`
              @keyframes skeleton-pulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.5; }
              }
            `}
          </style>
          {Array.from({ length: skeletonRows }).map((_, i) => (
            <SkeletonCard key={i} isDark={isDark} />
          ))}
        </div>
      );
    }

    return (
      <div style={tableWrapperStyles} className={className}>
        <style>
          {`
            @keyframes skeleton-pulse {
              0%, 100% { opacity: 1; }
              50% { opacity: 0.5; }
            }
          `}
        </style>
        <table style={tableStyles}>
          <thead>
            <tr>
              {visibleColumns.map((column) => (
                <th key={column.id} style={headerCellStyles(column)}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                    {column.headerIcon && <Icon name={column.headerIcon} size={14} />}
                    {column.header}
                    {renderSortIndicator(column)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: skeletonRows }).map((_, i) => (
              <SkeletonRow key={i} columnCount={visibleColumns.length} isDark={isDark} />
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // Empty state
  if (data.length === 0) {
    return (
      <div
        className={className}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '3rem 1rem',
          color: 'var(--text-muted)',
          ...style,
        }}
      >
        <Icon name={emptyIcon} size={48} style={{ marginBottom: '1rem', opacity: 0.5 }} />
        <p style={{ fontSize: 'var(--font-size-md)', margin: 0 }}>{emptyMessage}</p>
      </div>
    );
  }

  // Mobile card view
  if (isMobile) {
    const cardColumns = columns.filter((col) => col.showInCard !== false);

    return (
      <div className={`responsive-table-cards ${className}`} style={style}>
        {data.map((row) => {
          const rowId = keyExtractor(row);
          const isHovered = hoveredRowId === rowId;

          return (
            <div
              key={rowId}
              className={rowClassName?.(row)}
              style={{
                ...cardStyles,
                boxShadow: isHovered && hoverable ? 'var(--shadow-md)' : 'var(--shadow)',
                transform: isHovered && hoverable ? 'translateY(-1px)' : 'none',
              }}
              onClick={() => onRowClick?.(row)}
              onMouseEnter={() => hoverable && setHoveredRowId(rowId)}
              onMouseLeave={() => setHoveredRowId(null)}
            >
              {renderCardPrefix?.(row)}

              <div style={{ display: 'grid', gap: '0.75rem' }}>
                {cardColumns.map((column, colIndex) => {
                  // First column is typically the title, render it larger
                  const isTitle = colIndex === 0;

                  return (
                    <div key={column.id}>
                      {!isTitle && (
                        <div style={cardLabelStyles}>
                          {column.cardLabel ?? column.header}
                        </div>
                      )}
                      <div
                        style={{
                          ...cardValueStyles,
                          fontSize: isTitle ? 'var(--font-size-md)' : cardValueStyles.fontSize,
                          fontWeight: isTitle ? 'var(--font-weight-semibold)' : 'normal',
                        }}
                      >
                        {column.accessor(row)}
                      </div>
                    </div>
                  );
                })}
              </div>

              {renderCardSuffix?.(row)}
            </div>
          );
        })}
      </div>
    );
  }

  // Desktop table view
  return (
    <div style={tableWrapperStyles} className={`responsive-table ${className}`}>
      <table style={tableStyles}>
        <thead>
          <tr>
            {visibleColumns.map((column) => (
              <th
                key={column.id}
                style={headerCellStyles(column)}
                onClick={() => column.sortable && handleSort(column.id)}
                onKeyDown={(e) => {
                  if (column.sortable && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    handleSort(column.id);
                  }
                }}
                tabIndex={column.sortable ? 0 : undefined}
                role={column.sortable ? 'columnheader' : undefined}
                aria-sort={
                  sortColumn === column.id
                    ? (sortDirection === 'asc' ? 'ascending' : sortDirection === 'desc' ? 'descending' : undefined)
                    : undefined
                }
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                  {column.headerIcon && <Icon name={column.headerIcon} size={14} />}
                  {column.header}
                  {renderSortIndicator(column)}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, index) => {
            const rowId = keyExtractor(row);

            return (
              <tr
                key={rowId}
                className={rowClassName?.(row)}
                style={getRowStyles(row, index)}
                onClick={() => onRowClick?.(row)}
                onMouseEnter={() => hoverable && setHoveredRowId(rowId)}
                onMouseLeave={() => setHoveredRowId(null)}
                tabIndex={onRowClick ? 0 : undefined}
                onKeyDown={(e) => {
                  if (onRowClick && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    onRowClick(row);
                  }
                }}
              >
                {visibleColumns.map((column) => (
                  <td key={column.id} style={bodyCellStyles(column)}>
                    {column.accessor(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Memoize and export
export const ResponsiveTable = memo(ResponsiveTableComponent) as typeof ResponsiveTableComponent;

// ============================================
// Helper for creating column definitions
// ============================================

export function createColumn<T>(
  id: string,
  header: string,
  accessor: (row: T) => ReactNode,
  options?: Partial<Omit<ColumnDefinition<T>, 'id' | 'header' | 'accessor'>>
): ColumnDefinition<T> {
  return {
    id,
    header,
    accessor,
    sortable: true,
    showInCard: true,
    priority: 5,
    ...options,
  };
}

export default ResponsiveTable;
