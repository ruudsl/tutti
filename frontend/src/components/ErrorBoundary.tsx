import { Component, ReactNode, ErrorInfo } from 'react';
import i18n from '../i18n';
import { Icon } from './Icon';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error Boundary component to catch and display errors gracefully
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log error to console in development
    if (import.meta.env.DEV) {
      console.error('ErrorBoundary caught an error:', error, errorInfo);
    }
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const t = (key: string) => i18n.t(key);

      return (
        <div className="error-boundary" role="alert">
          <div className="error-boundary-content">
            <div className="error-boundary-icon" aria-hidden="true"><Icon name="warning" size={48} /></div>
            <h1>{t('errorBoundary.title')}</h1>
            <p>{t('errorBoundary.description')}</p>
            {import.meta.env.DEV && this.state.error && (
              <div className="error-boundary-details">
                <pre>{this.state.error.message}</pre>
              </div>
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
                onClick={() => window.location.href = '/'}
                type="button"
              >
                {t('errorBoundary.backToHome')}
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
