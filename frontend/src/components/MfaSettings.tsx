import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { setupMfa, enableMfa, disableMfa } from '../api';
import { useAuth } from '../context/AuthContext';
import { Modal } from './Modal';
import { showSuccess, showError } from '../utils/toast';

export function MfaSettings() {
  const { t } = useTranslation();
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
      showError(error.response?.data?.error || t('mfa.errorSetup'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleEnableMfa = async () => {
    if (verificationCode.length !== 6) {
      showError(t('mfa.enterCode'));
      return;
    }

    setIsLoading(true);
    try {
      await enableMfa(verificationCode);
      showSuccess(t('mfa.enableSuccess'));
      await refreshProfile();
      setShowSetupModal(false);
      resetSetupState();
    } catch (error: any) {
      showError(error.response?.data?.error || t('mfa.errorEnable'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisableMfa = async () => {
    if (!disablePassword) {
      showError(t('mfa.enterPassword'));
      return;
    }

    setIsLoading(true);
    try {
      await disableMfa(disablePassword);
      showSuccess(t('mfa.disableSuccess'));
      await refreshProfile();
      setShowDisableModal(false);
      setDisablePassword('');
    } catch (error: any) {
      showError(error.response?.data?.error || t('mfa.errorDisable'));
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
        <h3 className="card-title">{t('mfa.title')}</h3>
      </div>
      <div className="card-body">
        <div className="flex justify-between items-center">
          <div>
            <p style={{ margin: 0 }}>
              <strong>{t('mfa.status')}: </strong>
              {mfaEnabled ? (
                <span className="badge badge-success">{t('mfa.enabled')}</span>
              ) : (
                <span className="badge badge-secondary">{t('mfa.disabled')}</span>
              )}
            </p>
            <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.875rem', color: 'var(--text-light)' }}>
              {mfaEnabled ? t('mfa.enabledDescription') : t('mfa.disabledDescription')}
            </p>
          </div>
          <div>
            {mfaEnabled ? (
              <button
                className="btn btn-outline"
                onClick={() => setShowDisableModal(true)}
              >
                {t('mfa.disable')}
              </button>
            ) : (
              <button
                className="btn btn-primary"
                onClick={handleStartSetup}
                disabled={isLoading}
              >
                {isLoading ? t('mfa.loading') : t('mfa.enable')}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Setup Modal */}
      {showSetupModal && (
        <Modal
          title={t('mfa.setupTitle')}
          onClose={() => {
            setShowSetupModal(false);
            resetSetupState();
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <p style={{ marginBottom: '1rem' }}>
              {t('mfa.scanQr')}
            </p>

            {qrCode && (
              <div style={{ marginBottom: '1rem' }}>
                <img src={qrCode} alt="MFA QR Code" style={{ maxWidth: '200px' }} />
              </div>
            )}

            <p style={{ fontSize: '0.875rem', color: 'var(--text-light)', marginBottom: '1rem' }}>
              {t('mfa.manualCode')}<br />
              <code style={{ userSelect: 'all', fontSize: '0.8rem' }}>{secret}</code>
            </p>

            <div className="form-group">
              <label className="form-label">{t('mfa.verificationCode')}</label>
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
                {t('common.cancel')}
              </button>
              <button
                className="btn btn-primary"
                onClick={handleEnableMfa}
                disabled={isLoading || verificationCode.length !== 6}
              >
                {isLoading ? t('mfa.loading') : t('mfa.activate')}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Disable Modal */}
      {showDisableModal && (
        <Modal
          title={t('mfa.disableTitle')}
          onClose={() => {
            setShowDisableModal(false);
            setDisablePassword('');
          }}
          size="small"
        >
          <p style={{ marginBottom: '1rem' }}>
            {t('mfa.disablePrompt')}
          </p>

          <div className="form-group">
            <label className="form-label">{t('mfa.password')}</label>
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
              {t('common.cancel')}
            </button>
            <button
              className="btn btn-danger"
              onClick={handleDisableMfa}
              disabled={isLoading || !disablePassword}
            >
              {isLoading ? t('mfa.loading') : t('mfa.disable')}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default MfaSettings;
