import { CSSProperties } from 'react';

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string | number;
  className?: string;
  style?: CSSProperties;
  /** Animation variant: 'pulse' | 'wave' | 'none' */
  animation?: 'pulse' | 'wave' | 'none';
  /** Circle variant for avatars */
  circle?: boolean;
}

/**
 * Basic skeleton placeholder for loading states.
 * Includes aria-hidden to prevent screen readers from announcing placeholders.
 */
export function Skeleton({
  width = '100%',
  height = '1rem',
  borderRadius = '0.25rem',
  className = '',
  style,
  animation = 'wave',
  circle = false,
}: SkeletonProps) {
  const animationClass = animation === 'wave' ? 'skeleton-wave' : animation === 'pulse' ? 'skeleton-pulse' : '';

  return (
    <div
      className={`skeleton ${animationClass} ${className}`}
      style={{
        width: circle ? height : width,
        height,
        borderRadius: circle ? '50%' : borderRadius,
        ...style,
      }}
      aria-hidden="true"
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
 * Skeleton for a table.
 * Includes role="status" and aria-label for screen reader announcement.
 */
export function SkeletonTable({ rows = 5, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div role="status" aria-label="Gegevens worden geladen" aria-busy="true">
      <span className="sr-only">Gegevens worden geladen...</span>
      <table className="table" aria-hidden="true">
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
    </div>
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

/**
 * Skeleton for music piece card
 */
export function SkeletonMusicPieceCard() {
  return (
    <div className="card" style={{ padding: '1rem' }}>
      <div style={{ display: 'flex', gap: '1rem' }}>
        <Skeleton width={80} height={100} borderRadius="0.5rem" />
        <div style={{ flex: 1 }}>
          <Skeleton height="1.25rem" width="70%" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="0.875rem" width="50%" style={{ marginBottom: '0.75rem' }} />
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <Skeleton height="1.5rem" width="4rem" borderRadius="1rem" />
            <Skeleton height="1.5rem" width="5rem" borderRadius="1rem" />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Skeleton for avatar with text
 */
export function SkeletonAvatar({ size = 40 }: { size?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
      <Skeleton circle height={size} />
      <div>
        <Skeleton height="1rem" width="120px" style={{ marginBottom: '0.25rem' }} />
        <Skeleton height="0.75rem" width="80px" />
      </div>
    </div>
  );
}

/**
 * Skeleton for dashboard stat card
 */
export function SkeletonStatCard() {
  return (
    <div className="skeleton-stat-card">
      <Skeleton height="0.75rem" width="60%" style={{ marginBottom: '0.5rem' }} />
      <Skeleton height="2rem" width="40%" style={{ marginBottom: '0.25rem' }} />
      <Skeleton height="0.75rem" width="80%" />
    </div>
  );
}

/**
 * Skeleton for page header
 */
export function SkeletonPageHeader() {
  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <Skeleton height="2rem" width="200px" style={{ marginBottom: '0.5rem' }} />
      <Skeleton height="1rem" width="300px" />
    </div>
  );
}

/**
 * Skeleton grid for multiple cards.
 * Includes accessible loading state announcement.
 */
export function SkeletonGrid({ count = 6, columns = 3 }: { count?: number; columns?: number }) {
  return (
    <div
      role="status"
      aria-label="Inhoud wordt geladen"
      aria-busy="true"
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, 1fr)`,
        gap: '1rem',
      }}
    >
      <span className="sr-only">Inhoud wordt geladen...</span>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

export default Skeleton;
