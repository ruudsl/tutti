import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { setupMfa, enableMfa, disableMfa } from '../api';
import { useAuth } from '../context/AuthContext';
import { Modal } from './Modal';
import { FormField } from './FormField';
import { showSuccess, showError } from '../utils/toast';

export function MfaSettings() {
  const { t } = useTranslation();
  const { user, refreshProfile } = useAuth();
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [showDisableModal, setShowDisableModal] = useState(false);
  const [qrCode, setQrCode] = useState('');
  const [secret, setSecret] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
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
      const response = await enableMfa(verificationCode);
      showSuccess(t('mfa.enableSuccess'));
      await refreshProfile();
      if (response.recoveryCodes && response.recoveryCodes.length > 0) {
        // Keep the modal open to show the one-time recovery codes
        setRecoveryCodes(response.recoveryCodes);
      } else {
        setShowSetupModal(false);
        resetSetupState();
      }
    } catch (error: any) {
      showError(error.response?.data?.error || t('mfa.errorEnable'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyRecoveryCodes = async () => {
    try {
      await navigator.clipboard.writeText(recoveryCodes.join('\n'));
      showSuccess(t('mfa.recoveryCodesCopied'));
    } catch {
      showError(t('mfa.errorEnable'));
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
    setRecoveryCodes([]);
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
              <button className="btn btn-outline" onClick={() => setShowDisableModal(true)}>
                {t('mfa.disable')}
              </button>
            ) : (
              <button className="btn btn-primary" onClick={handleStartSetup} disabled={isLoading}>
                {isLoading ? t('mfa.loading') : t('mfa.enable')}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Setup Modal */}
      {showSetupModal && recoveryCodes.length > 0 && (
        <Modal
          title={t('mfa.recoveryCodesTitle')}
          onClose={() => {
            setShowSetupModal(false);
            resetSetupState();
          }}
        >
          <p style={{ marginBottom: '0.75rem' }}>{t('mfa.recoveryCodesDescription')}</p>
          <p style={{ marginBottom: '1rem', fontWeight: 600, color: 'var(--danger, #b91c1c)' }}>
            {t('mfa.recoveryCodesWarning')}
          </p>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '0.5rem',
              marginBottom: '1rem',
              padding: '0.75rem',
              background: 'var(--bg-light, #f5f5f5)',
              borderRadius: '6px',
            }}
          >
            {recoveryCodes.map((code) => (
              <code key={code} style={{ userSelect: 'all', textAlign: 'center' }}>
                {code}
              </code>
            ))}
          </div>

          <div className="flex gap-1 justify-end">
            <button className="btn btn-outline" onClick={handleCopyRecoveryCodes}>
              {t('mfa.recoveryCodesCopy')}
            </button>
            <button
              className="btn btn-primary"
              onClick={() => {
                setShowSetupModal(false);
                resetSetupState();
              }}
            >
              {t('mfa.recoveryCodesDone')}
            </button>
          </div>
        </Modal>
      )}

      {showSetupModal && recoveryCodes.length === 0 && (
        <Modal
          title={t('mfa.setupTitle')}
          onClose={() => {
            setShowSetupModal(false);
            resetSetupState();
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <p style={{ marginBottom: '1rem' }}>{t('mfa.scanQr')}</p>

            {qrCode && (
              <div style={{ marginBottom: '1rem' }}>
                <img src={qrCode} alt="MFA QR Code" style={{ maxWidth: '200px' }} />
              </div>
            )}

            <p style={{ fontSize: '0.875rem', color: 'var(--text-light)', marginBottom: '1rem' }}>
              {t('mfa.manualCode')}
              <br />
              <code style={{ userSelect: 'all', fontSize: '0.8rem' }}>{secret}</code>
            </p>

            <FormField label={t('mfa.verificationCode')}>
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
            </FormField>

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
          <p style={{ marginBottom: '1rem' }}>{t('mfa.disablePrompt')}</p>

          <FormField label={t('mfa.password')}>
            <input
              type="password"
              className="form-control"
              value={disablePassword}
              onChange={(e) => setDisablePassword(e.target.value)}
              autoFocus
            />
          </FormField>

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
            <button className="btn btn-danger" onClick={handleDisableMfa} disabled={isLoading || !disablePassword}>
              {isLoading ? t('mfa.loading') : t('mfa.disable')}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default MfaSettings;
