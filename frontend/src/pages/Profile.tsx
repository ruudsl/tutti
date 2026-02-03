import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { changePassword, setupMfa, enableMfa, disableMfa } from '../api';

export default function Profile() {
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
      setPasswordError('Nieuwe wachtwoorden komen niet overeen.');
      return;
    }

    if (newPassword.length < 8) {
      setPasswordError('Wachtwoord moet minimaal 8 tekens bevatten.');
      return;
    }

    setIsChangingPassword(true);
    try {
      await changePassword(currentPassword, newPassword);
      setPasswordSuccess('Wachtwoord succesvol gewijzigd.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      setPasswordError(error.response?.data?.error || 'Fout bij wijzigen van wachtwoord.');
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
      setMfaError(error.response?.data?.error || 'Fout bij opzetten van MFA.');
    } finally {
      setIsSettingUpMfa(false);
    }
  };

  const handleEnableMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    setMfaError('');
    try {
      await enableMfa(mfaCode);
      setMfaSuccess('MFA is succesvol ingeschakeld.');
      setMfaSetup(null);
      setMfaCode('');
      refreshProfile();
    } catch (error: any) {
      setMfaError(error.response?.data?.error || 'Fout bij inschakelen van MFA.');
    }
  };

  const handleDisableMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    setMfaError('');
    setIsDisablingMfa(true);
    try {
      await disableMfa(disablePassword);
      setMfaSuccess('MFA is uitgeschakeld.');
      setDisablePassword('');
      refreshProfile();
    } catch (error: any) {
      setMfaError(error.response?.data?.error || 'Fout bij uitschakelen van MFA.');
    } finally {
      setIsDisablingMfa(false);
    }
  };

  const getRoleName = (role: string) => {
    switch (role) {
      case 'admin': return 'Beheerder';
      case 'music_committee': return 'Muziekcommissie';
      case 'member': return 'Lid';
      default: return role;
    }
  };

  return (
    <div>
      <h1>Mijn Profiel</h1>

      <div className="grid grid-2">
        {/* Profile Info */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Profielgegevens</span>
          </div>
          <div className="card-body">
            <div className="mb-2">
              <strong>Naam:</strong> {user?.firstName} {user?.lastName}
            </div>
            <div className="mb-2">
              <strong>E-mail:</strong> {user?.email}
            </div>
            <div className="mb-2">
              <strong>Rol:</strong> {user?.role ? getRoleName(user.role) : '-'}
            </div>
            <div className="mb-2">
              <strong>MFA:</strong> {user?.mfaEnabled ? 'Ingeschakeld' : 'Uitgeschakeld'}
            </div>
          </div>
        </div>

        {/* Password Change */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Wachtwoord wijzigen</span>
          </div>
          <div className="card-body">
            {passwordError && (
              <div className="alert alert-error mb-2">{passwordError}</div>
            )}
            {passwordSuccess && (
              <div className="alert alert-success mb-2">{passwordSuccess}</div>
            )}
            <form onSubmit={handlePasswordChange}>
              <div className="form-group">
                <label className="form-label">Huidig wachtwoord</label>
                <input
                  type="password"
                  className="form-control"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Nieuw wachtwoord</label>
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
                <label className="form-label">Bevestig nieuw wachtwoord</label>
                <input
                  type="password"
                  className="form-control"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                />
              </div>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={isChangingPassword}
              >
                {isChangingPassword ? 'Bezig...' : 'Wachtwoord wijzigen'}
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* MFA Section */}
      <div className="card mt-2">
        <div className="card-header">
          <span className="card-title">Twee-factor authenticatie (MFA)</span>
        </div>
        <div className="card-body">
          {mfaError && (
            <div className="alert alert-error mb-2">{mfaError}</div>
          )}
          {mfaSuccess && (
            <div className="alert alert-success mb-2">{mfaSuccess}</div>
          )}

          {!user?.mfaEnabled ? (
            // MFA not enabled
            <>
              {!mfaSetup ? (
                <div>
                  <p className="mb-2">
                    Beveilig je account met twee-factor authenticatie. Je hebt een authenticator app nodig zoals Google Authenticator of Authy.
                  </p>
                  <button
                    className="btn btn-primary"
                    onClick={handleSetupMfa}
                    disabled={isSettingUpMfa}
                  >
                    {isSettingUpMfa ? 'Bezig...' : 'MFA instellen'}
                  </button>
                </div>
              ) : (
                <div>
                  <p className="mb-2">Scan de QR-code met je authenticator app:</p>
                  <div className="mb-2" style={{ textAlign: 'center' }}>
                    <img src={mfaSetup.qrCode} alt="MFA QR Code" style={{ maxWidth: '200px' }} />
                  </div>
                  <p className="mb-2">
                    <small>Of voer deze code handmatig in: <code>{mfaSetup.secret}</code></small>
                  </p>
                  <form onSubmit={handleEnableMfa}>
                    <div className="form-group">
                      <label className="form-label">Verificatiecode</label>
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
                        MFA inschakelen
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => setMfaSetup(null)}
                      >
                        Annuleren
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
                MFA is ingeschakeld voor je account.
              </p>
              <form onSubmit={handleDisableMfa}>
                <div className="form-group">
                  <label className="form-label">Wachtwoord om MFA uit te schakelen</label>
                  <input
                    type="password"
                    className="form-control"
                    value={disablePassword}
                    onChange={(e) => setDisablePassword(e.target.value)}
                    required
                  />
                </div>
                <button
                  type="submit"
                  className="btn btn-danger"
                  disabled={isDisablingMfa}
                >
                  {isDisablingMfa ? 'Bezig...' : 'MFA uitschakelen'}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
