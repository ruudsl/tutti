import { CSSProperties } from 'react';

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string | number;
  className?: string;
  style?: CSSProperties;
}

/**
 * Basic skeleton placeholder for loading states
 */
export function Skeleton({
  width = '100%',
  height = '1rem',
  borderRadius = '0.25rem',
  className = '',
  style,
}: SkeletonProps) {
  return (
    <div
      className={`skeleton ${className}`}
      style={{
        width,
        height,
        borderRadius,
        ...style,
      }}
    />
  );
}

/**
 * Skeleton for text lines
 */
export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <div className="skeleton-text">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          width={i === lines - 1 ? '60%' : '100%'}
          height="0.875rem"
          style={{ marginBottom: i < lines - 1 ? '0.5rem' : 0 }}
        />
      ))}
    </div>
  );
}

/**
 * Skeleton for a card
 */
export function SkeletonCard() {
  return (
    <div className="card">
      <div className="card-body">
        <Skeleton height="1.25rem" width="60%" style={{ marginBottom: '1rem' }} />
        <SkeletonText lines={2} />
      </div>
    </div>
  );
}

/**
 * Skeleton for a table row
 */
export function SkeletonTableRow({ columns = 5 }: { columns?: number }) {
  return (
    <tr>
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i}>
          <Skeleton height="1rem" width={i === 0 ? '80%' : '60%'} />
        </td>
      ))}
    </tr>
  );
}

/**
 * Skeleton for a table
 */
export function SkeletonTable({ rows = 5, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <table className="table">
      <thead>
        <tr>
          {Array.from({ length: columns }).map((_, i) => (
            <th key={i}>
              <Skeleton height="0.875rem" width="50%" />
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: rows }).map((_, i) => (
          <SkeletonTableRow key={i} columns={columns} />
        ))}
      </tbody>
    </table>
  );
}

/**
 * Skeleton for a list item
 */
export function SkeletonListItem() {
  return (
    <div className="flex items-center gap-2 p-2">
      <Skeleton width="2.5rem" height="2.5rem" borderRadius="50%" />
      <div style={{ flex: 1 }}>
        <Skeleton height="1rem" width="40%" style={{ marginBottom: '0.25rem' }} />
        <Skeleton height="0.75rem" width="60%" />
      </div>
    </div>
  );
}

export default Skeleton;
