import { useState, useEffect, useRef, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { Icon } from '../components/Icon';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import SocialLoginButtons from '../components/SocialLoginButtons';
import { LazyImage } from '../components/LazyImage';
import api from '../api/client';
import { getMicrosoftEnabled, getMicrosoftLoginUrl } from '../api/integrations';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [showMfa, setShowMfa] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [microsoftEnabled, setMicrosoftEnabled] = useState(false);
  const [microsoftLoading, setMicrosoftLoading] = useState(false);
  const [branding, setBranding] = useState<{ displayName: string; logoUrl: string | null }>({
    displayName: 'Tutti',
    logoUrl: null,
  });
  const { login } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const errorRef = useRef<HTMLDivElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);
  useDocumentTitle('pageTitle.login');

  useEffect(() => {
    api
      .get('/settings/branding')
      .then(({ data }) => {
        setBranding(data);
      })
      .catch(() => {
        /* fallback to defaults */
      });

    getMicrosoftEnabled()
      .then(({ enabled }) => setMicrosoftEnabled(enabled))
      .catch(() => {
        /* Microsoft not available */
      });
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const response = await login(email, password, showMfa ? mfaCode : undefined);

      if (response.requiresMfa) {
        setShowMfa(true);
        setIsLoading(false);
        return;
      }

      navigate('/');
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || t('auth.loginFailed');
      setError(errorMessage);
      if (showMfa) {
        setMfaCode('');
      }
      // Focus the error message for screen readers, then focus the first input
      setTimeout(() => {
        errorRef.current?.focus();
        // Also focus the email input for keyboard users to retry
        setTimeout(() => emailInputRef.current?.focus(), 100);
      }, 0);
    } finally {
      setIsLoading(false);
    }
  };

  const handleMicrosoftLogin = async () => {
    setError('');
    setMicrosoftLoading(true);
    try {
      const { authUrl } = await getMicrosoftLoginUrl();
      window.location.href = authUrl;
    } catch (err: any) {
      setError(err.response?.data?.error || t('auth.microsoft.loginFailed'));
      setMicrosoftLoading(false);
    }
  };

  const handleBackToLogin = () => {
    setShowMfa(false);
    setMfaCode('');
    setPassword('');
    setError('');
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div style={{ position: 'absolute', top: '1rem', right: '1rem' }}>
          <LanguageSwitcher compact />
        </div>
        <div className="login-logo">
          {branding.logoUrl ? (
            <LazyImage
              src={branding.logoUrl}
              alt={branding.displayName}
              height={64}
              width={200}
              objectFit="contain"
              containerStyle={{ marginBottom: '0.5rem' }}
            />
          ) : null}
          <h1>
            {!branding.logoUrl && <Icon name="music" size={28} className="login-brand-icon" />}
            {branding.displayName}
          </h1>
        </div>

        <form onSubmit={handleSubmit}>
          {error && (
            <div ref={errorRef} className="alert alert-danger" role="alert" aria-live="assertive" tabIndex={-1}>
              {error}
            </div>
          )}

          {!showMfa ? (
            <>
              <div className="form-group">
                <label htmlFor="email" className="form-label">
                  {t('auth.email')}
                </label>
                <input
                  ref={emailInputRef}
                  type="email"
                  id="email"
                  className="form-control"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                  aria-describedby={error ? 'login-error' : undefined}
                />
              </div>

              <div className="form-group">
                <label htmlFor="password" className="form-label">
                  {t('auth.password')}
                </label>
                <input
                  type="password"
                  id="password"
                  className="form-control"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            </>
          ) : (
            <>
              <div className="alert alert-info" style={{ marginBottom: '1rem' }}>
                <strong>{t('auth.mfa.title')}</strong>
                <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.875rem' }}>{t('auth.mfa.description')}</p>
              </div>

              <div className="form-group">
                <label htmlFor="mfaCode" className="form-label">
                  {t('auth.mfa.code')}
                </label>
                <input
                  type="text"
                  id="mfaCode"
                  className="form-control"
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  required
                  autoFocus
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  style={{ fontSize: '1.5rem', textAlign: 'center', letterSpacing: '0.5rem' }}
                />
              </div>

              <button
                type="button"
                className="btn btn-outline"
                onClick={handleBackToLogin}
                style={{ width: '100%', marginBottom: '0.5rem' }}
              >
                {t('auth.mfa.backToLogin')}
              </button>
            </>
          )}

          <button
            type="submit"
            className="btn btn-primary btn-lg"
            style={{ width: '100%' }}
            disabled={isLoading || (showMfa && mfaCode.length !== 6)}
          >
            {isLoading ? t('auth.loggingIn') : showMfa ? t('auth.mfa.verify') : t('auth.loginButton')}
          </button>

          {!showMfa && (
            <div style={{ marginTop: '1rem', textAlign: 'center' }}>
              <Link to="/forgot-password" style={{ color: 'var(--primary)', fontSize: '0.875rem' }}>
                {t('auth.forgotPassword')}
              </Link>
            </div>
          )}
        </form>

        {microsoftEnabled && !showMfa && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', margin: '1.25rem 0' }}>
              <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
              <span style={{ fontSize: '0.8rem', color: 'var(--text-light)' }}>{t('auth.microsoft.or')}</span>
              <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
            </div>
            <button
              type="button"
              className="btn btn-outline btn-lg"
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
              }}
              onClick={handleMicrosoftLogin}
              disabled={microsoftLoading}
            >
              <svg width="20" height="20" viewBox="0 0 21 21" xmlns="http://www.w3.org/2000/svg">
                <rect x="1" y="1" width="9" height="9" fill="#f25022" />
                <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
                <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
                <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
              </svg>
              {microsoftLoading ? t('auth.loggingIn') : t('auth.microsoft.loginButton')}
            </button>
          </>
        )}

        {/* Social Login (Google/Facebook) */}
        {!showMfa && (
          <SocialLoginButtons
            onSuccess={(result) => {
              // Store token and navigate
              localStorage.setItem('token', result.token);
              navigate('/');
            }}
            onError={(errorMsg) => {
              setError(errorMsg);
            }}
            disabled={isLoading}
          />
        )}
      </div>
    </div>
  );
}
