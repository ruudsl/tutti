import { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { microsoftCallback } from '../api';

export default function MicrosoftCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { loginWithToken } = useAuth();
  const { t } = useTranslation();
  const [error, setError] = useState('');
  const processedRef = useRef(false);

  useEffect(() => {
    if (processedRef.current) return;

    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const errorParam = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    if (errorParam) {
      processedRef.current = true;
      setError(errorDescription || t('auth.microsoft.loginFailed'));
      return;
    }

    if (!code || !state) {
      processedRef.current = true;
      setError(t('auth.microsoft.loginFailed'));
      return;
    }

    processedRef.current = true;

    microsoftCallback(code, state)
      .then((response) => {
        if (response.token && response.user) {
          loginWithToken(response.token, response.user);
          navigate('/');
        } else {
          setError(t('auth.microsoft.loginFailed'));
        }
      })
      .catch((err) => {
        setError(err.response?.data?.error || t('auth.microsoft.loginFailed'));
      });
  }, [searchParams, navigate, loginWithToken, t]);

  if (error) {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="login-logo">
            <h1>{t('auth.microsoft.error')}</h1>
          </div>
          <div className="alert alert-danger">{error}</div>
          <button
            className="btn btn-primary btn-lg"
            style={{ width: '100%', marginTop: '1rem' }}
            onClick={() => navigate('/login')}
          >
            {t('auth.mfa.backToLogin')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <h1>{t('auth.microsoft.processing')}</h1>
        </div>
        <div className="loading" role="status">
          <div className="spinner" aria-hidden="true"></div>
        </div>
      </div>
    </div>
  );
}
