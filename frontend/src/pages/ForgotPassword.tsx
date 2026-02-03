import { useState } from 'react';
import { Link } from 'react-router-dom';
import { requestPasswordReset } from '../api';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      await requestPasswordReset(email);
      setSubmitted(true);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Er is een fout opgetreden. Probeer het later opnieuw.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="login-header">
            <h1>E-mail verzonden</h1>
          </div>
          <div className="login-body">
            <div className="alert alert-success mb-2">
              Als dit e-mailadres bij ons bekend is, ontvang je binnen enkele minuten een e-mail met instructies om je wachtwoord te herstellen.
            </div>
            <p style={{ color: 'var(--text-light)', marginBottom: '1rem' }}>
              Controleer ook je spam folder als je de e-mail niet binnen enkele minuten ontvangt.
            </p>
            <Link to="/login" className="btn btn-primary" style={{ width: '100%' }}>
              Terug naar inloggen
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <h1>Wachtwoord vergeten</h1>
          <p>Vul je e-mailadres in om een herstel link te ontvangen</p>
        </div>
        <div className="login-body">
          {error && (
            <div className="alert alert-error mb-2">{error}</div>
          )}
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">E-mailadres</label>
              <input
                type="email"
                className="form-control"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jouw@email.nl"
                required
                autoFocus
              />
            </div>
            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%' }}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Bezig...' : 'Verstuur herstel link'}
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
