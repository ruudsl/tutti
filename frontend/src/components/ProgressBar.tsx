import { CSSProperties } from 'react';

interface ProgressBarProps {
  /** Progress value from 0 to 100 */
  value: number;
  /** Optional label to show above the bar */
  label?: string;
  /** Show percentage text */
  showPercentage?: boolean;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Color variant */
  variant?: 'primary' | 'success' | 'warning' | 'danger' | 'info';
  /** Whether the progress is indeterminate (animated, no specific value) */
  indeterminate?: boolean;
  /** Additional CSS class */
  className?: string;
  /** Custom styles */
  style?: CSSProperties;
}

const sizeMap = {
  sm: '0.25rem',
  md: '0.5rem',
  lg: '0.75rem',
};

const colorMap = {
  primary: 'var(--primary)',
  success: 'var(--success)',
  warning: 'var(--warning)',
  danger: 'var(--danger)',
  info: 'var(--info)',
};

/**
 * ProgressBar component for showing progress of operations
 */
export function ProgressBar({
  value,
  label,
  showPercentage = false,
  size = 'md',
  variant = 'primary',
  indeterminate = false,
  className = '',
  style,
}: ProgressBarProps) {
  const clampedValue = Math.min(100, Math.max(0, value));
  const height = sizeMap[size];
  const color = colorMap[variant];

  return (
    <div className={`progress-container ${className}`} style={style}>
      {(label || showPercentage) && (
        <div className="progress-header">
          {label && <span className="progress-label">{label}</span>}
          {showPercentage && !indeterminate && (
            <span className="progress-percentage">{Math.round(clampedValue)}%</span>
          )}
        </div>
      )}
      <div
        className="progress-track"
        role="progressbar"
        aria-valuenow={indeterminate ? undefined : clampedValue}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label || 'Progress'}
        style={{ height }}
      >
        <div
          className={`progress-fill ${indeterminate ? 'progress-indeterminate' : ''}`}
          style={{
            width: indeterminate ? '30%' : `${clampedValue}%`,
            backgroundColor: color,
            height: '100%',
          }}
        />
      </div>
    </div>
  );
}

/**
 * Upload progress component with file info
 */
interface UploadProgressProps {
  filename: string;
  progress: number;
  status?: 'uploading' | 'processing' | 'complete' | 'error';
  error?: string;
  onCancel?: () => void;
}

export function UploadProgress({
  filename,
  progress,
  status = 'uploading',
  error,
  onCancel,
}: UploadProgressProps) {
  const getVariant = () => {
    switch (status) {
      case 'complete':
        return 'success';
      case 'error':
        return 'danger';
      case 'processing':
        return 'info';
      default:
        return 'primary';
    }
  };

  const getLabel = () => {
    switch (status) {
      case 'complete':
        return 'Voltooid';
      case 'error':
        return 'Mislukt';
      case 'processing':
        return 'Verwerken...';
      default:
        return 'Uploaden...';
    }
  };

  return (
    <div className="upload-progress-item">
      <div className="upload-progress-header">
        <span className="upload-filename" title={filename}>
          {filename.length > 40 ? `${filename.substring(0, 37)}...` : filename}
        </span>
        {status === 'uploading' && onCancel && (
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={onCancel}
            aria-label="Annuleren"
          >
            X
          </button>
        )}
      </div>
      <ProgressBar
        value={progress}
        variant={getVariant()}
        showPercentage={status === 'uploading'}
        size="sm"
        indeterminate={status === 'processing'}
      />
      <div className="upload-progress-footer">
        <span className={`upload-status upload-status-${status}`}>{getLabel()}</span>
        {error && <span className="upload-error">{error}</span>}
      </div>
    </div>
  );
}

/**
 * Multi-file upload progress container
 */
interface MultiUploadProgressProps {
  uploads: {
    id: string;
    filename: string;
    progress: number;
    status?: 'uploading' | 'processing' | 'complete' | 'error';
    error?: string;
  }[];
  onCancel?: (id: string) => void;
  onCancelAll?: () => void;
}

export function MultiUploadProgress({
  uploads,
  onCancel,
  onCancelAll,
}: MultiUploadProgressProps) {
  const activeUploads = uploads.filter(u => u.status === 'uploading' || u.status === 'processing');
  const completedUploads = uploads.filter(u => u.status === 'complete').length;
  const failedUploads = uploads.filter(u => u.status === 'error').length;
  const totalProgress = uploads.length > 0
    ? uploads.reduce((sum, u) => sum + u.progress, 0) / uploads.length
    : 0;

  if (uploads.length === 0) return null;

  return (
    <div className="multi-upload-progress">
      <div className="multi-upload-header">
        <span className="multi-upload-title">
          {activeUploads.length > 0
            ? `Uploaden: ${activeUploads.length} bestand(en)`
            : `${completedUploads} voltooid${failedUploads > 0 ? `, ${failedUploads} mislukt` : ''}`}
        </span>
        {activeUploads.length > 0 && onCancelAll && (
          <button
            type="button"
            className="btn btn-sm btn-outline"
            onClick={onCancelAll}
          >
            Alles annuleren
          </button>
        )}
      </div>
      <ProgressBar
        value={totalProgress}
        variant={failedUploads > 0 ? 'warning' : 'primary'}
        size="md"
        showPercentage
      />
      <div className="multi-upload-list">
        {uploads.slice(-5).map((upload) => (
          <UploadProgress
            key={upload.id}
            filename={upload.filename}
            progress={upload.progress}
            status={upload.status}
            error={upload.error}
            onCancel={onCancel ? () => onCancel(upload.id) : undefined}
          />
        ))}
        {uploads.length > 5 && (
          <div className="multi-upload-more">
            en {uploads.length - 5} meer bestanden...
          </div>
        )}
      </div>
    </div>
  );
}

export default ProgressBar;
