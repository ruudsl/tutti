import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { changePassword, setupMfa, enableMfa, disableMfa } from '../api';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { SessionsManager } from '../components/SessionsManager';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { GdprExport } from '../components/GdprExport';
import NotificationPreferences from '../components/NotificationPreferences';
import { CalendarSync } from '../components/CalendarSync';
import { CustomFieldsSection } from '../components/CustomFields';

export default function Profile() {
  const { t } = useTranslation();
  useDocumentTitle('pageTitle.profile');
  const { user, refreshProfile } = useAuth();

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // MFA state
  const [mfaSetup, setMfaSetup] = useState<{ qrCode: string; secret: string } | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaError, setMfaError] = useState('');
  const [mfaSuccess, setMfaSuccess] = useState('');
  const [isSettingUpMfa, setIsSettingUpMfa] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');
  const [isDisablingMfa, setIsDisablingMfa] = useState(false);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    if (newPassword !== confirmPassword) {
      setPasswordError(t('profile.changePassword.mismatch'));
      return;
    }

    if (newPassword.length < 8) {
      setPasswordError(t('profile.changePassword.tooShort'));
      return;
    }

    setIsChangingPassword(true);
    try {
      await changePassword(currentPassword, newPassword);
      setPasswordSuccess(t('profile.changePassword.success'));
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      setPasswordError(error.response?.data?.error || t('profile.changePassword.wrongCurrent'));
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleSetupMfa = async () => {
    setMfaError('');
    setIsSettingUpMfa(true);
    try {
      const data = await setupMfa();
      setMfaSetup({ qrCode: data.qrCode, secret: data.secret });
    } catch (error: any) {
      setMfaError(error.response?.data?.error || t('mfa.errorSetup'));
    } finally {
      setIsSettingUpMfa(false);
    }
  };

  const handleEnableMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    setMfaError('');
    try {
      await enableMfa(mfaCode);
      setMfaSuccess(t('profile.mfa.enableSuccess'));
      setMfaSetup(null);
      setMfaCode('');
      refreshProfile();
    } catch (error: any) {
      setMfaError(error.response?.data?.error || t('mfa.errorEnable'));
    }
  };

  const handleDisableMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    setMfaError('');
    setIsDisablingMfa(true);
    try {
      await disableMfa(disablePassword);
      setMfaSuccess(t('profile.mfa.disableSuccess'));
      setDisablePassword('');
      refreshProfile();
    } catch (error: any) {
      setMfaError(error.response?.data?.error || t('mfa.errorDisable'));
    } finally {
      setIsDisablingMfa(false);
    }
  };

  return (
    <div>
      <h1>{t('profile.title')}</h1>

      <div className="grid grid-2">
        {/* Profile Info */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">{t('profile.info')}</span>
          </div>
          <div className="card-body">
            <div className="mb-2">
              <strong>{t('profile.name')}:</strong> {user?.firstName} {user?.lastName}
            </div>
            <div className="mb-2">
              <strong>{t('profile.email')}:</strong> {user?.email}
            </div>
            <div className="mb-2">
              <strong>{t('profile.role')}:</strong> {user?.role ? t(`roles.${user.role}`) : '-'}
            </div>
            <div className="mb-2">
              <strong>{t('profile.mfaStatus')}:</strong>{' '}
              {user?.mfaEnabled ? t('profile.mfaEnabled') : t('profile.mfaDisabled')}
            </div>
            <div className="mb-2">
              <strong>{t('profile.language')}:</strong>
              <div className="mt-1">
                <LanguageSwitcher />
              </div>
            </div>
          </div>
        </div>

        {/* Password Change */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">{t('profile.changePassword.title')}</span>
          </div>
          <div className="card-body">
            {passwordError && <div className="alert alert-error mb-2">{passwordError}</div>}
            {passwordSuccess && <div className="alert alert-success mb-2">{passwordSuccess}</div>}
            <form onSubmit={handlePasswordChange}>
              <div className="form-group">
                <label className="form-label">{t('profile.changePassword.current')}</label>
                <input
                  type="password"
                  className="form-control"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">{t('profile.changePassword.new')}</label>
                <input
                  type="password"
                  className="form-control"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={8}
                />
              </div>
              <div className="form-group">
                <label className="form-label">{t('profile.changePassword.confirm')}</label>
                <input
                  type="password"
                  className="form-control"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                />
              </div>
              <button type="submit" className="btn btn-primary" disabled={isChangingPassword}>
                {isChangingPassword ? t('profile.changePassword.changing') : t('profile.changePassword.button')}
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Custom Fields */}
      {user?.id && <CustomFieldsSection entityType="user" entityId={user.id} editable={true} className="mt-3" />}

      {/* MFA Section */}
      <div className="card mt-2">
        <div className="card-header">
          <span className="card-title">{t('profile.mfa.title')}</span>
        </div>
        <div className="card-body">
          {mfaError && <div className="alert alert-error mb-2">{mfaError}</div>}
          {mfaSuccess && <div className="alert alert-success mb-2">{mfaSuccess}</div>}

          {!user?.mfaEnabled ? (
            // MFA not enabled
            <>
              {!mfaSetup ? (
                <div>
                  <p className="mb-2">{t('profile.mfa.setupDescription')}</p>
                  <button className="btn btn-primary" onClick={handleSetupMfa} disabled={isSettingUpMfa}>
                    {isSettingUpMfa ? t('profile.mfa.settingUp') : t('profile.mfa.setupButton')}
                  </button>
                </div>
              ) : (
                <div>
                  <p className="mb-2">{t('profile.mfa.scanQr')}</p>
                  <div className="mb-2" style={{ textAlign: 'center' }}>
                    <img src={mfaSetup.qrCode} alt="MFA QR Code" style={{ maxWidth: '200px' }} />
                  </div>
                  <p className="mb-2">
                    <small>
                      {t('profile.mfa.manualCode')} <code>{mfaSetup.secret}</code>
                    </small>
                  </p>
                  <form onSubmit={handleEnableMfa}>
                    <div className="form-group">
                      <label className="form-label">{t('profile.mfa.verificationCode')}</label>
                      <input
                        type="text"
                        className="form-control"
                        value={mfaCode}
                        onChange={(e) => setMfaCode(e.target.value)}
                        placeholder="123456"
                        maxLength={6}
                        required
                      />
                    </div>
                    <div className="flex gap-1">
                      <button type="submit" className="btn btn-primary">
                        {t('profile.mfa.enableButton')}
                      </button>
                      <button type="button" className="btn btn-secondary" onClick={() => setMfaSetup(null)}>
                        {t('common.cancel')}
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </>
          ) : (
            // MFA enabled
            <div>
              <p className="mb-2" style={{ color: 'var(--success)' }}>
                {t('profile.mfa.disableTitle')}
              </p>
              <form onSubmit={handleDisableMfa}>
                <div className="form-group">
                  <label className="form-label">{t('profile.mfa.disablePassword')}</label>
                  <input
                    type="password"
                    className="form-control"
                    value={disablePassword}
                    onChange={(e) => setDisablePassword(e.target.value)}
                    required
                  />
                </div>
                <button type="submit" className="btn btn-danger" disabled={isDisablingMfa}>
                  {isDisablingMfa ? t('profile.mfa.disabling') : t('profile.mfa.disableButton')}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>

      {/* Notification Preferences */}
      <div className="card mt-3">
        <div className="card-body">
          <NotificationPreferences />
        </div>
      </div>

      {/* Calendar Sync */}
      <div className="card mt-3">
        <div className="card-body">
          <CalendarSync />
        </div>
      </div>

      {/* Sessions Management */}
      <div className="card mt-3">
        <div className="card-body">
          <SessionsManager />
        </div>
      </div>

      {/* GDPR Data Export */}
      <div className="card mt-3">
        <div className="card-body">
          <GdprExport />
        </div>
      </div>
    </div>
  );
}
