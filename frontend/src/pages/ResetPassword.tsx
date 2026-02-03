import { useState, useEffect } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { validateResetToken, resetPassword } from '../api';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isValidating, setIsValidating] = useState(true);
  const [isValid, setIsValid] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPassword !== confirmPassword) {
      setError('Wachtwoorden komen niet overeen.');
      return;
    }

    if (newPassword.length < 8) {
      setError('Wachtwoord moet minimaal 8 tekens bevatten.');
      return;
    }

    setIsSubmitting(true);

    try {
      await resetPassword(token!, newPassword);
      setSuccess(true);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Er is een fout opgetreden. Probeer het later opnieuw.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isValidating) {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="login-body" style={{ textAlign: 'center' }}>
            <div className="spinner" style={{ margin: '2rem auto' }}></div>
            <p>Link valideren...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!token || !isValid) {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="login-header">
            <h1>Ongeldige link</h1>
          </div>
          <div className="login-body">
            <div className="alert alert-error mb-2">
              Deze wachtwoord reset link is ongeldig of verlopen.
            </div>
            <p style={{ color: 'var(--text-light)', marginBottom: '1rem' }}>
              Reset links zijn 1 uur geldig. Vraag een nieuwe link aan als je wachtwoord nog steeds moet worden hersteld.
            </p>
            <Link to="/forgot-password" className="btn btn-primary" style={{ width: '100%', marginBottom: '0.5rem' }}>
              Nieuwe link aanvragen
            </Link>
            <Link to="/login" className="btn btn-outline" style={{ width: '100%' }}>
              Terug naar inloggen
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
          <div className="login-header">
            <h1>Wachtwoord gewijzigd</h1>
          </div>
          <div className="login-body">
            <div className="alert alert-success mb-2">
              Je wachtwoord is succesvol gewijzigd.
            </div>
            <p style={{ color: 'var(--text-light)', marginBottom: '1rem' }}>
              Je kunt nu inloggen met je nieuwe wachtwoord.
            </p>
            <button
              onClick={() => navigate('/login')}
              className="btn btn-primary"
              style={{ width: '100%' }}
            >
              Naar inloggen
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <h1>Nieuw wachtwoord</h1>
          <p>Kies een nieuw wachtwoord voor je account</p>
        </div>
        <div className="login-body">
          {error && (
            <div className="alert alert-error mb-2">{error}</div>
          )}
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Nieuw wachtwoord</label>
              <input
                type="password"
                className="form-control"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Minimaal 8 tekens"
                required
                minLength={8}
                autoFocus
              />
            </div>
            <div className="form-group">
              <label className="form-label">Bevestig wachtwoord</label>
              <input
                type="password"
                className="form-control"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Herhaal je wachtwoord"
                required
                minLength={8}
              />
            </div>
            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%' }}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Bezig...' : 'Wachtwoord wijzigen'}
            </button>
          </form>
          <div style={{ marginTop: '1rem', textAlign: 'center' }}>
            <Link to="/login" style={{ color: 'var(--primary)' }}>
              Terug naar inloggen
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
