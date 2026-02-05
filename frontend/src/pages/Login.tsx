import { useState, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [showMfa, setShowMfa] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  useDocumentTitle('pageTitle.login');

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
      setError(err.response?.data?.error || t('auth.loginFailed'));
      if (showMfa) {
        setMfaCode('');
      }
    } finally {
      setIsLoading(false);
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
          <h1>🎵 Harmonie Muziek</h1>
          <p>Music management for orchestra members</p>
        </div>

        <form onSubmit={handleSubmit}>
          {error && <div className="alert alert-danger">{error}</div>}

          {!showMfa ? (
            <>
              <div className="form-group">
                <label htmlFor="email" className="form-label">{t('auth.email')}</label>
                <input
                  type="email"
                  id="email"
                  className="form-control"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              <div className="form-group">
                <label htmlFor="password" className="form-label">{t('auth.password')}</label>
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
                <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.875rem' }}>
                  {t('auth.mfa.description')}
                </p>
              </div>

              <div className="form-group">
                <label htmlFor="mfaCode" className="form-label">{t('auth.mfa.code')}</label>
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
      </div>
    </div>
  );
}
