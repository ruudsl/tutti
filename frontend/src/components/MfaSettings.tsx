import { useState } from 'react';
import { setupMfa, enableMfa, disableMfa } from '../api';
import { useAuth } from '../context/AuthContext';
import { Modal } from './Modal';
import { showSuccess, showError } from '../utils/toast';

export function MfaSettings() {
  const { user, refreshProfile } = useAuth();
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [showDisableModal, setShowDisableModal] = useState(false);
  const [qrCode, setQrCode] = useState('');
  const [secret, setSecret] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [disablePassword, setDisablePassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleStartSetup = async () => {
    setIsLoading(true);
    try {
      const response = await setupMfa();
      setQrCode(response.qrCode);
      setSecret(response.secret);
      setShowSetupModal(true);
    } catch (error: any) {
      showError(error.response?.data?.error || 'Fout bij starten MFA setup');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEnableMfa = async () => {
    if (verificationCode.length !== 6) {
      showError('Voer een 6-cijferige code in');
      return;
    }

    setIsLoading(true);
    try {
      await enableMfa(verificationCode);
      showSuccess('MFA is succesvol ingeschakeld');
      await refreshProfile();
      setShowSetupModal(false);
      resetSetupState();
    } catch (error: any) {
      showError(error.response?.data?.error || 'Fout bij inschakelen MFA');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisableMfa = async () => {
    if (!disablePassword) {
      showError('Voer je wachtwoord in');
      return;
    }

    setIsLoading(true);
    try {
      await disableMfa(disablePassword);
      showSuccess('MFA is uitgeschakeld');
      await refreshProfile();
      setShowDisableModal(false);
      setDisablePassword('');
    } catch (error: any) {
      showError(error.response?.data?.error || 'Fout bij uitschakelen MFA');
    } finally {
      setIsLoading(false);
    }
  };

  const resetSetupState = () => {
    setQrCode('');
    setSecret('');
    setVerificationCode('');
  };

  const mfaEnabled = user?.mfaEnabled;

  return (
    <div className="card">
      <div className="card-header">
        <h3 className="card-title">Tweestapsverificatie (MFA)</h3>
      </div>
      <div className="card-body">
        <div className="flex justify-between items-center">
          <div>
            <p style={{ margin: 0 }}>
              <strong>Status: </strong>
              {mfaEnabled ? (
                <span className="badge badge-success">Ingeschakeld</span>
              ) : (
                <span className="badge badge-secondary">Uitgeschakeld</span>
              )}
            </p>
            <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.875rem', color: 'var(--text-light)' }}>
              {mfaEnabled
                ? 'Je account is beveiligd met tweestapsverificatie.'
                : 'Beveilig je account met een authenticator app zoals Google Authenticator of Authy.'}
            </p>
          </div>
          <div>
            {mfaEnabled ? (
              <button
                className="btn btn-outline"
                onClick={() => setShowDisableModal(true)}
              >
                Uitschakelen
              </button>
            ) : (
              <button
                className="btn btn-primary"
                onClick={handleStartSetup}
                disabled={isLoading}
              >
                {isLoading ? 'Bezig...' : 'Inschakelen'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Setup Modal */}
      {showSetupModal && (
        <Modal
          title="MFA Instellen"
          onClose={() => {
            setShowSetupModal(false);
            resetSetupState();
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <p style={{ marginBottom: '1rem' }}>
              Scan de QR code met je authenticator app:
            </p>

            {qrCode && (
              <div style={{ marginBottom: '1rem' }}>
                <img src={qrCode} alt="MFA QR Code" style={{ maxWidth: '200px' }} />
              </div>
            )}

            <p style={{ fontSize: '0.875rem', color: 'var(--text-light)', marginBottom: '1rem' }}>
              Of voer deze code handmatig in:<br />
              <code style={{ userSelect: 'all', fontSize: '0.8rem' }}>{secret}</code>
            </p>

            <div className="form-group">
              <label className="form-label">Verificatiecode</label>
              <input
                type="text"
                className="form-control"
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                autoComplete="one-time-code"
                inputMode="numeric"
                style={{ fontSize: '1.5rem', textAlign: 'center', letterSpacing: '0.5rem' }}
              />
            </div>

            <div className="flex gap-1 justify-end">
              <button
                className="btn btn-outline"
                onClick={() => {
                  setShowSetupModal(false);
                  resetSetupState();
                }}
              >
                Annuleren
              </button>
              <button
                className="btn btn-primary"
                onClick={handleEnableMfa}
                disabled={isLoading || verificationCode.length !== 6}
              >
                {isLoading ? 'Bezig...' : 'Activeren'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Disable Modal */}
      {showDisableModal && (
        <Modal
          title="MFA Uitschakelen"
          onClose={() => {
            setShowDisableModal(false);
            setDisablePassword('');
          }}
          size="small"
        >
          <p style={{ marginBottom: '1rem' }}>
            Voer je wachtwoord in om MFA uit te schakelen:
          </p>

          <div className="form-group">
            <label className="form-label">Wachtwoord</label>
            <input
              type="password"
              className="form-control"
              value={disablePassword}
              onChange={(e) => setDisablePassword(e.target.value)}
              autoFocus
            />
          </div>

          <div className="flex gap-1 justify-end">
            <button
              className="btn btn-outline"
              onClick={() => {
                setShowDisableModal(false);
                setDisablePassword('');
              }}
            >
              Annuleren
            </button>
            <button
              className="btn btn-danger"
              onClick={handleDisableMfa}
              disabled={isLoading || !disablePassword}
            >
              {isLoading ? 'Bezig...' : 'Uitschakelen'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default MfaSettings;
