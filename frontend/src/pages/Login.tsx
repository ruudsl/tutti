import { useState, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [showMfa, setShowMfa] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const response = await login(email, password, showMfa ? mfaCode : undefined);

      if (response.requiresMfa) {
        // MFA is required, show MFA input
        setShowMfa(true);
        setIsLoading(false);
        return;
      }

      // Successful login
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Inloggen mislukt. Controleer je gegevens.');
      // Reset MFA code on error
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
        <div className="login-logo">
          <h1>🎵 Harmonie Muziek</h1>
          <p>Muziekbeheer voor orkestleden</p>
        </div>

        <form onSubmit={handleSubmit}>
          {error && <div className="alert alert-danger">{error}</div>}

          {!showMfa ? (
            // Normal login form
            <>
              <div className="form-group">
                <label htmlFor="email" className="form-label">Email</label>
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
                <label htmlFor="password" className="form-label">Wachtwoord</label>
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
            // MFA verification form
            <>
              <div className="alert alert-info" style={{ marginBottom: '1rem' }}>
                <strong>Tweestapsverificatie</strong>
                <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.875rem' }}>
                  Open je authenticator app en voer de 6-cijferige code in.
                </p>
              </div>

              <div className="form-group">
                <label htmlFor="mfaCode" className="form-label">Verificatiecode</label>
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
                Terug naar inloggen
              </button>
            </>
          )}

          <button
            type="submit"
            className="btn btn-primary btn-lg"
            style={{ width: '100%' }}
            disabled={isLoading || (showMfa && mfaCode.length !== 6)}
          >
            {isLoading ? 'Bezig...' : showMfa ? 'Verifiëren' : 'Inloggen'}
          </button>

          {!showMfa && (
            <div style={{ marginTop: '1rem', textAlign: 'center' }}>
              <Link to="/forgot-password" style={{ color: 'var(--primary)', fontSize: '0.875rem' }}>
                Wachtwoord vergeten?
              </Link>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
