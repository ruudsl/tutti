import { useState, useEffect, useId } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { validateResetToken, resetPassword } from '../api';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

interface ResetPasswordFormData {
  password: string;
  confirmPassword: string;
}

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');
  const { t } = useTranslation();
  const wachtwoordId = useId();
  const herhalingId = useId();
  useDocumentTitle('pageTitle.resetPassword');

  const [isValidating, setIsValidating] = useState(true);
  const [isValid, setIsValid] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  // Form with validation rules
  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
  } = useForm<ResetPasswordFormData>({
    defaultValues: {
      password: '',
      confirmPassword: '',
    },
  });

  // Watch password field for confirmation validation
  const password = watch('password');

  useEffect(() => {
    const validate = async () => {
      if (!token) {
        setIsValidating(false);
        return;
      }

      try {
        await validateResetToken(token);
        setIsValid(true);
      } catch {
        setIsValid(false);
      } finally {
        setIsValidating(false);
      }
    };

    validate();
  }, [token]);

  const onSubmit = async (data: ResetPasswordFormData) => {
    setError('');
    setIsSubmitting(true);

    try {
      await resetPassword(token!, data.password);
      setSuccess(true);
    } catch (err: any) {
      setError(err.response?.data?.error || t('errors.generic'));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isValidating) {
    return (
      <div className="login-page">
        <div className="login-card">
          <div style={{ position: 'absolute', top: '1rem', right: '1rem' }}>
            <LanguageSwitcher compact />
          </div>
          <div className="login-body" style={{ textAlign: 'center' }}>
            <div className="spinner" style={{ margin: '2rem auto' }}></div>
            <p>{t('resetPassword.validating')}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!token || !isValid) {
    return (
      <div className="login-page">
        <div className="login-card">
          <div style={{ position: 'absolute', top: '1rem', right: '1rem' }}>
            <LanguageSwitcher compact />
          </div>
          <div className="login-header">
            <h1>{t('resetPassword.invalidTitle')}</h1>
          </div>
          <div className="login-body">
            <div className="alert alert-error mb-2">{t('resetPassword.invalidMessage')}</div>
            <p style={{ color: 'var(--text-light)', marginBottom: '1rem' }}>{t('resetPassword.linkExpired')}</p>
            <Link to="/forgot-password" className="btn btn-primary" style={{ width: '100%', marginBottom: '0.5rem' }}>
              {t('resetPassword.requestNew')}
            </Link>
            <Link to="/login" className="btn btn-outline" style={{ width: '100%' }}>
              {t('forgotPassword.backToLogin')}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="login-page">
        <div className="login-card">
          <div style={{ position: 'absolute', top: '1rem', right: '1rem' }}>
            <LanguageSwitcher compact />
          </div>
          <div className="login-header">
            <h1>{t('resetPassword.successTitle')}</h1>
          </div>
          <div className="login-body">
            <div className="alert alert-success mb-2">{t('resetPassword.successMessage')}</div>
            <button onClick={() => navigate('/login')} className="btn btn-primary" style={{ width: '100%' }}>
              {t('resetPassword.loginNow')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div style={{ position: 'absolute', top: '1rem', right: '1rem' }}>
          <LanguageSwitcher compact />
        </div>
        <div className="login-header">
          <h1>{t('resetPassword.title')}</h1>
          <p>{t('resetPassword.subtitle')}</p>
        </div>
        <div className="login-body">
          {error && <div className="alert alert-error mb-2">{error}</div>}
          <form onSubmit={handleSubmit(onSubmit)}>
            {/* Met de hand gekoppeld: naast label en veld staat hier ook nog
                een foutmelding, en FormField kloont maar één kind. De melding
                hangt via aria-describedby aan het veld. */}
            <div className="form-group">
              <label className="form-label" htmlFor={wachtwoordId}>
                {t('resetPassword.newPassword')} *
              </label>
              <input
                id={wachtwoordId}
                aria-describedby={errors.password ? `${wachtwoordId}-fout` : undefined}
                type="password"
                className={`form-control ${errors.password ? 'is-invalid' : ''}`}
                {...register('password', {
                  required: t('errors.required'),
                  minLength: { value: 8, message: t('errors.passwordTooShort', { min: 8 }) },
                })}
                placeholder={t('resetPassword.minLength')}
                autoFocus
              />
              {errors.password && (
                <span id={`${wachtwoordId}-fout`} className="form-error">
                  {errors.password.message}
                </span>
              )}
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor={herhalingId}>
                {t('resetPassword.confirmPassword')} *
              </label>
              <input
                id={herhalingId}
                aria-describedby={errors.confirmPassword ? `${herhalingId}-fout` : undefined}
                type="password"
                className={`form-control ${errors.confirmPassword ? 'is-invalid' : ''}`}
                {...register('confirmPassword', {
                  required: t('errors.required'),
                  validate: (value) => value === password || t('errors.passwordMismatch'),
                })}
                placeholder={t('resetPassword.repeatPassword')}
              />
              {errors.confirmPassword && (
                <span id={`${herhalingId}-fout`} className="form-error">
                  {errors.confirmPassword.message}
                </span>
              )}
            </div>
            <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={isSubmitting}>
              {isSubmitting ? t('resetPassword.resetting') : t('resetPassword.resetButton')}
            </button>
          </form>
          <div style={{ marginTop: '1rem', textAlign: 'center' }}>
            <Link to="/login" style={{ color: 'var(--primary)' }}>
              {t('forgotPassword.backToLogin')}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
