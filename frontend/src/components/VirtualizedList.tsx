import { memo, CSSProperties, ReactNode, ReactElement, forwardRef, useCallback, useMemo } from 'react';
import { List, ListImperativeAPI } from 'react-window';

interface VirtualizedListProps<T> {
  /** Items to render */
  items: T[];
  /** Fixed height for each item */
  itemHeight?: number;
  /** Get height for variable-sized items */
  getItemHeight?: (index: number) => number;
  /** Render function for each item */
  renderItem: (item: T, index: number, style: CSSProperties) => ReactNode;
  /** Height of the list container */
  height?: number;
  /** Width of the list container */
  width?: number | string;
  /** Number of items to render outside visible area */
  overscanCount?: number;
  /** Custom class name for the list */
  className?: string;
  /** Empty state message */
  emptyMessage?: string;
  /** Loading state */
  loading?: boolean;
  /** Callback when list is scrolled (reserved for future use) */
  _onScroll?: (scrollOffset: number) => void;
}

interface RowProps<T> {
  items: T[];
  renderItem: (item: T, index: number, style: CSSProperties) => ReactNode;
}

/**
 * Row component for react-window v2 List
 */
function RowComponent<T>({
  index,
  style,
  items,
  renderItem,
}: {
  ariaAttributes: {
    'aria-posinset': number;
    'aria-setsize': number;
    role: 'listitem';
  };
  index: number;
  style: CSSProperties;
  items: T[];
  renderItem: (item: T, index: number, style: CSSProperties) => ReactNode;
}): ReactElement | null {
  const item = items[index];
  return <>{renderItem(item, index, style)}</>;
}

/**
 * Virtualized list component using react-window v2.
 * Only renders items that are currently visible for improved performance.
 *
 * @example
 * ```tsx
 * // Fixed height items
 * <VirtualizedList
 *   items={musicPieces}
 *   itemHeight={72}
 *   height={400}
 *   renderItem={(piece, index, style) => (
 *     <div style={style}>
 *       <MusicPieceListItem piece={piece} />
 *     </div>
 *   )}
 * />
 *
 * // Variable height items
 * <VirtualizedList
 *   items={messages}
 *   getItemHeight={(index) => messages[index].expanded ? 120 : 60}
 *   height={500}
 *   renderItem={(message, index, style) => (
 *     <div style={style}>
 *       <MessageItem message={message} />
 *     </div>
 *   )}
 * />
 * ```
 */
function VirtualizedListInner<T>(
  {
    items,
    itemHeight = 72,
    getItemHeight,
    renderItem,
    height = 400,
    className = '',
    emptyMessage = 'Geen items gevonden',
    loading = false,
    overscanCount = 5,
  }: VirtualizedListProps<T>,
  ref: React.ForwardedRef<ListImperativeAPI>,
) {
  // Create row props object for react-window v2
  const rowProps: RowProps<T> = useMemo(
    () => ({
      items,
      renderItem,
    }),
    [items, renderItem],
  );

  // Create row height function
  const rowHeight = useCallback(
    (index: number) => (getItemHeight ? getItemHeight(index) : itemHeight),
    [getItemHeight, itemHeight],
  );

  if (loading) {
    return (
      <div
        className={`virtualized-list-loading ${className}`}
        style={{
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div className="spinner" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div
        className={`virtualized-list-empty ${className}`}
        style={{
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-light)',
          fontSize: '14px',
        }}
      >
        {emptyMessage}
      </div>
    );
  }

  return (
    <List<RowProps<T>>
      listRef={ref}
      className={`virtualized-list ${className}`}
      defaultHeight={height}
      rowCount={items.length}
      rowHeight={rowHeight}
      rowComponent={
        RowComponent as (
          props: {
            ariaAttributes: {
              'aria-posinset': number;
              'aria-setsize': number;
              role: 'listitem';
            };
            index: number;
            style: CSSProperties;
          } & RowProps<T>,
        ) => ReactElement | null
      }
      rowProps={rowProps}
      overscanCount={overscanCount}
      style={{ height }}
    />
  );
}

export const VirtualizedList = forwardRef(VirtualizedListInner) as <T>(
  props: VirtualizedListProps<T> & { ref?: React.ForwardedRef<ListImperativeAPI> },
) => ReturnType<typeof VirtualizedListInner>;

/**
 * Simple wrapper for list items with common styling
 */
export const VirtualizedListItem = memo(function VirtualizedListItem({
  children,
  style,
  className = '',
  onClick,
}: {
  children: ReactNode;
  style: CSSProperties;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <div
      className={`virtualized-list-item ${className}`}
      style={{
        ...style,
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        borderBottom: '1px solid var(--border)',
        cursor: onClick ? 'pointer' : 'default',
      }}
      onClick={onClick}
    >
      {children}
    </div>
  );
});

export default VirtualizedList;
