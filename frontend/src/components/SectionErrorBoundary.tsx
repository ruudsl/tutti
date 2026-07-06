import React, { Component, ReactNode, ErrorInfo } from 'react';
import { withTranslation, WithTranslation } from 'react-i18next';
import { Icon } from './Icon';

interface OwnProps {
  /** Children to wrap */
  children: ReactNode;
  /** Section name for display and error reporting */
  sectionName: string;
  /** Custom fallback UI */
  fallback?: ReactNode;
  /** Compact mode for smaller sections */
  compact?: boolean;
  /** Callback when error occurs */
  onError?: (error: Error, errorInfo: ErrorInfo, sectionName: string) => void;
  /** Whether to show retry button */
  showRetry?: boolean;
  /** Custom retry handler */
  onRetry?: () => void;
}

type Props = OwnProps & WithTranslation;

interface State {
  hasError: boolean;
  error: Error | null;
}

/** sessionStorage key guarding against chunk-load reload loops */
const CHUNK_RELOAD_GUARD_KEY = 'chunk-load-error-reloaded';

/**
 * Detects errors caused by a failed dynamic import (lazy route chunk).
 * This typically happens after a new deploy when old chunk hashes no
 * longer exist on the server.
 */
function isChunkLoadError(error: Error): boolean {
  return (
    error.name === 'ChunkLoadError' ||
    /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Loading chunk [\w-]+ failed|Loading CSS chunk/i.test(
      error.message,
    )
  );
}

/** Minimum time between automatic chunk-error reloads */
const CHUNK_RELOAD_COOLDOWN_MS = 60_000;

/**
 * Reloads the page once for chunk-load errors so users pick up the new
 * deploy. A sessionStorage timestamp guard prevents reload loops (at most
 * one automatic reload per cooldown window); returns true if a reload was
 * triggered.
 */
function reloadOnceForChunkError(): boolean {
  try {
    const lastReload = Number(sessionStorage.getItem(CHUNK_RELOAD_GUARD_KEY) || 0);
    if (Date.now() - lastReload < CHUNK_RELOAD_COOLDOWN_MS) {
      return false;
    }
    sessionStorage.setItem(CHUNK_RELOAD_GUARD_KEY, String(Date.now()));
  } catch {
    // sessionStorage unavailable - do not risk a reload loop
    return false;
  }
  window.location.reload();
  return true;
}

/**
 * Section-level Error Boundary for isolating crashes to specific parts of the UI.
 * Unlike the main ErrorBoundary, this shows a minimal error state that doesn't
 * disrupt the rest of the application.
 */
class SectionErrorBoundaryComponent extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log to console
    console.error(`Section "${this.props.sectionName}" crashed:`, error);
    console.error('Component stack:', errorInfo.componentStack);

    // A failed dynamic import usually means a new version was deployed and
    // the old chunk hashes are gone. Reload once to fetch the new bundle.
    if (isChunkLoadError(error) && reloadOnceForChunkError()) {
      return;
    }

    // Call optional error handler
    this.props.onError?.(error, errorInfo, this.props.sectionName);
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
    this.props.onRetry?.();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      // Custom fallback takes precedence
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const { compact, showRetry = true, sectionName, t } = this.props;

      if (compact) {
        return (
          <div className="section-error section-error-compact" role="alert">
            <Icon name="warning" size={16} />
            <span>{t('sectionError.compactMessage', { section: sectionName })}</span>
            {showRetry && (
              <button type="button" className="btn btn-sm btn-ghost" onClick={this.handleRetry}>
                {t('common.retry')}
              </button>
            )}
          </div>
        );
      }

      return (
        <div className="section-error" role="alert">
          <div className="section-error-icon">
            <Icon name="warning" size={24} />
          </div>
          <div className="section-error-content">
            <h4>{t('sectionError.title', { section: sectionName })}</h4>
            <p>{t('sectionError.message')}</p>
            {import.meta.env.DEV && this.state.error && (
              <pre className="section-error-details">{this.state.error.message}</pre>
            )}
          </div>
          {showRetry && (
            <button type="button" className="btn btn-sm btn-outline" onClick={this.handleRetry}>
              {t('common.retry')}
            </button>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

const SectionErrorBoundaryWithTranslation = withTranslation()(SectionErrorBoundaryComponent);

export const SectionErrorBoundary = SectionErrorBoundaryWithTranslation as React.ComponentType<OwnProps>;

/**
 * Higher-order component to wrap a component with SectionErrorBoundary
 */
export function withSectionErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  sectionName: string,
  options: Omit<OwnProps, 'children' | 'sectionName'> = {},
): React.ComponentType<P> {
  const displayName = WrappedComponent.displayName || WrappedComponent.name || 'Component';

  const WithSectionErrorBoundary: React.FC<P> = (props) => (
    <SectionErrorBoundary sectionName={sectionName} {...options}>
      <WrappedComponent {...props} />
    </SectionErrorBoundary>
  );

  WithSectionErrorBoundary.displayName = `WithSectionErrorBoundary(${displayName})`;

  return WithSectionErrorBoundary;
}

export default SectionErrorBoundary;
