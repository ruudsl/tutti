import { Component, ReactNode, ErrorInfo } from 'react';
import { withTranslation, WithTranslation } from 'react-i18next';
import { Icon } from './Icon';

interface OwnProps {
  children: ReactNode;
  /** Custom fallback UI when error occurs */
  fallback?: ReactNode;
  /** Callback when error is caught */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  /** Callback when user clicks report button */
  onReport?: (error: Error, errorInfo: ErrorInfo | null) => void;
  /** Show report button */
  showReportButton?: boolean;
  /** Custom retry handler */
  onRetry?: () => void;
}

type Props = OwnProps & WithTranslation;

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  showDetails: boolean;
}

/**
 * Error Boundary component to catch and display errors gracefully.
 * Provides retry functionality, error reporting, and detailed error info in development.
 *
 * @example
 * ```tsx
 * <ErrorBoundary
 *   onError={(error) => logErrorToService(error)}
 *   onReport={(error) => openReportDialog(error)}
 *   showReportButton
 * >
 *   <App />
 * </ErrorBoundary>
 * ```
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });

    // Always log error to console
    console.error('ErrorBoundary caught an error:', error);
    console.error('Component stack:', errorInfo.componentStack);

    // Call optional error handler
    this.props.onError?.(error, errorInfo);
  }

  handleRetry = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
    });
    this.props.onRetry?.();
  };

  handleReport = (): void => {
    const { error, errorInfo } = this.state;
    if (error) {
      const { t } = this.props;
      if (this.props.onReport) {
        this.props.onReport(error, errorInfo);
      } else {
        // Default: copy error info to clipboard
        const errorText = [
          `${t('errorBoundary.errorLabel')}: ${error.message}`,
          `Stack: ${error.stack}`,
          errorInfo?.componentStack ? `Component stack: ${errorInfo.componentStack}` : '',
          `${t('errorBoundary.timestamp')}: ${new Date().toISOString()}`,
          `URL: ${window.location.href}`,
          `User Agent: ${navigator.userAgent}`,
        ].filter(Boolean).join('\n\n');

        navigator.clipboard.writeText(errorText).then(() => {
          alert(t('errorBoundary.copiedToClipboard'));
        }).catch(() => {
          // Fallback: show in prompt
          prompt(t('errorBoundary.copyErrorInfo'), errorText);
        });
      }
    }
  };

  toggleDetails = (): void => {
    this.setState(prev => ({ showDetails: !prev.showDetails }));
  };

  handleGoHome = (): void => {
    window.location.href = '/';
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const { error, errorInfo, showDetails } = this.state;
      const { showReportButton = true, t } = this.props;

      return (
        <div className="error-boundary" role="alert">
          <div className="error-boundary-content">
            <div className="error-boundary-icon" aria-hidden="true">
              <Icon name="warning" size={48} />
            </div>

            <h1>{t('errorBoundary.title')}</h1>
            <p>
              {t('errorBoundary.descriptionExtended')}
            </p>

            {/* Show error details in development or when toggled */}
            {error && (import.meta.env.DEV || showDetails) && (
              <div className="error-boundary-details">
                <pre>{error.message}</pre>
                {import.meta.env.DEV && error.stack && (
                  <pre style={{ marginTop: '0.5rem', fontSize: '0.75rem', opacity: 0.8 }}>
                    {error.stack}
                  </pre>
                )}
                {import.meta.env.DEV && errorInfo?.componentStack && (
                  <pre style={{ marginTop: '0.5rem', fontSize: '0.75rem', opacity: 0.6 }}>
                    {errorInfo.componentStack}
                  </pre>
                )}
              </div>
            )}

            {/* Toggle details button (production only) */}
            {!import.meta.env.DEV && error && (
              <button
                type="button"
                className="error-boundary-report-btn"
                onClick={this.toggleDetails}
                style={{ marginBottom: '1rem' }}
              >
                {showDetails ? t('errorBoundary.hideDetails') : t('errorBoundary.showDetails')}
              </button>
            )}

            <div className="error-boundary-actions">
              <button
                className="btn btn-primary"
                onClick={this.handleRetry}
                type="button"
              >
                {t('errorBoundary.retry')}
              </button>
              <button
                className="btn btn-outline"
                onClick={this.handleGoHome}
                type="button"
              >
                {t('errorBoundary.backToHome')}
              </button>
            </div>

            {/* Report error section */}
            {showReportButton && error && (
              <div className="error-boundary-report">
                <button
                  type="button"
                  className="error-boundary-report-btn"
                  onClick={this.handleReport}
                >
                  {t('errorBoundary.reportProblem')}
                </button>
              </div>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default withTranslation()(ErrorBoundary);
