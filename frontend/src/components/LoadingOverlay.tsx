import { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ProgressBar } from './ProgressBar';

interface LoadingOverlayProps {
  /** Whether the overlay is visible */
  isLoading: boolean;
  /** Loading message to display */
  message?: string;
  /** Optional progress value (0-100) */
  progress?: number;
  /** Show spinner animation */
  showSpinner?: boolean;
  /** Whether the operation can be cancelled */
  cancellable?: boolean;
  /** Cancel handler */
  onCancel?: () => void;
  /** Children content (shown under the overlay when loading) */
  children?: ReactNode;
  /** Whether to use a full-screen overlay or inline */
  fullScreen?: boolean;
  /** Additional CSS class */
  className?: string;
}

/**
 * Loading overlay component for long-running operations
 */
export function LoadingOverlay({
  isLoading,
  message,
  progress,
  showSpinner = true,
  cancellable = false,
  onCancel,
  children,
  fullScreen = false,
  className = '',
}: LoadingOverlayProps) {
  const { t } = useTranslation();

  if (!isLoading && children) {
    return <>{children}</>;
  }

  if (!isLoading) {
    return null;
  }

  const overlayContent = (
    <div className="loading-overlay-content">
      {showSpinner && (
        <div className="loading-spinner" aria-hidden="true">
          <svg className="spinner-svg" viewBox="0 0 50 50">
            <circle className="spinner-circle" cx="25" cy="25" r="20" fill="none" strokeWidth="4" />
          </svg>
        </div>
      )}
      {message && <p className="loading-message">{message}</p>}
      {progress !== undefined && (
        <div className="loading-progress">
          <ProgressBar value={progress} showPercentage size="md" />
        </div>
      )}
      {cancellable && onCancel && (
        <button type="button" className="btn btn-outline btn-sm mt-2" onClick={onCancel}>
          {t('common.cancel')}
        </button>
      )}
    </div>
  );

  if (fullScreen) {
    return (
      <div
        className={`loading-overlay loading-overlay-fullscreen ${className}`}
        role="alert"
        aria-live="polite"
        aria-busy="true"
      >
        {overlayContent}
      </div>
    );
  }

  return (
    <div className={`loading-overlay-container ${className}`}>
      <div className="loading-overlay loading-overlay-inline" role="alert" aria-live="polite" aria-busy="true">
        {overlayContent}
      </div>
      {children && <div className="loading-overlay-children">{children}</div>}
    </div>
  );
}

/**
 * Simple inline loading indicator
 */
interface LoadingIndicatorProps {
  /** Loading message */
  message?: string;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Center the indicator */
  center?: boolean;
}

export function LoadingIndicator({ message, size = 'md', center = false }: LoadingIndicatorProps) {
  const sizeClass = `loading-indicator-${size}`;

  return (
    <div
      className={`loading-indicator ${sizeClass} ${center ? 'loading-indicator-center' : ''}`}
      role="status"
      aria-live="polite"
    >
      <div className="loading-dots">
        <span className="dot" />
        <span className="dot" />
        <span className="dot" />
      </div>
      {message && <span className="loading-indicator-message">{message}</span>}
    </div>
  );
}

/**
 * Page loading skeleton for initial page loads
 */
interface PageLoadingSkeletonProps {
  /** Type of page being loaded */
  type?: 'list' | 'detail' | 'form' | 'dashboard';
  /** Number of skeleton items for list type */
  itemCount?: number;
}

export function PageLoadingSkeleton({ type = 'list', itemCount = 5 }: PageLoadingSkeletonProps) {
  if (type === 'dashboard') {
    return (
      <div className="page-skeleton page-skeleton-dashboard">
        <div className="skeleton-header">
          <div className="skeleton skeleton-wave" style={{ width: '200px', height: '2rem' }} />
        </div>
        <div className="skeleton-stats-grid">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton-stat-card">
              <div
                className="skeleton skeleton-wave"
                style={{ width: '60%', height: '0.875rem', marginBottom: '0.5rem' }}
              />
              <div className="skeleton skeleton-wave" style={{ width: '40%', height: '2rem' }} />
            </div>
          ))}
        </div>
        <div className="skeleton-charts">
          <div className="skeleton skeleton-wave" style={{ width: '100%', height: '300px', borderRadius: '0.5rem' }} />
        </div>
      </div>
    );
  }

  if (type === 'detail') {
    return (
      <div className="page-skeleton page-skeleton-detail">
        <div className="skeleton-header">
          <div className="skeleton skeleton-wave" style={{ width: '60%', height: '2rem', marginBottom: '0.5rem' }} />
          <div className="skeleton skeleton-wave" style={{ width: '40%', height: '1rem' }} />
        </div>
        <div className="skeleton-content">
          <div className="skeleton skeleton-wave" style={{ width: '100%', height: '1rem', marginBottom: '0.5rem' }} />
          <div className="skeleton skeleton-wave" style={{ width: '100%', height: '1rem', marginBottom: '0.5rem' }} />
          <div className="skeleton skeleton-wave" style={{ width: '70%', height: '1rem' }} />
        </div>
      </div>
    );
  }

  if (type === 'form') {
    return (
      <div className="page-skeleton page-skeleton-form">
        <div className="skeleton-header">
          <div className="skeleton skeleton-wave" style={{ width: '200px', height: '2rem' }} />
        </div>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton-form-field">
            <div
              className="skeleton skeleton-wave"
              style={{ width: '100px', height: '0.875rem', marginBottom: '0.5rem' }}
            />
            <div className="skeleton skeleton-wave" style={{ width: '100%', height: '2.5rem' }} />
          </div>
        ))}
        <div className="skeleton-form-actions">
          <div className="skeleton skeleton-wave" style={{ width: '100px', height: '2.5rem' }} />
        </div>
      </div>
    );
  }

  // Default: list
  return (
    <div className="page-skeleton page-skeleton-list">
      <div className="skeleton-header">
        <div className="skeleton skeleton-wave" style={{ width: '200px', height: '2rem' }} />
      </div>
      <div className="skeleton-list">
        {Array.from({ length: itemCount }).map((_, i) => (
          <div key={i} className="skeleton-list-item">
            <div
              className="skeleton skeleton-wave"
              style={{ width: '2.5rem', height: '2.5rem', borderRadius: '50%' }}
            />
            <div style={{ flex: 1 }}>
              <div
                className="skeleton skeleton-wave"
                style={{ width: '60%', height: '1rem', marginBottom: '0.25rem' }}
              />
              <div className="skeleton skeleton-wave" style={{ width: '40%', height: '0.75rem' }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default LoadingOverlay;
