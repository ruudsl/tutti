/** De kaart met de spond-koppeling, inclusief het instelformulier. Letterlijk overgenomen uit Rehearsals.tsx. */

import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { FormField } from '../../components/FormField';
import type { SpondConfig, SpondGroup } from '../../types';
import type { SpondFormState } from './hulpfuncties';

export function SpondCard({
  spondConfig,
  isSyncing,
  handleSyncAll,
  showSpondSetup,
  setShowSpondSetup,
  spondForm,
  setSpondForm,
  handleLoadGroups,
  spondGroups,
  loadingGroups,
  spondWachtwoordBekend,
  spondFormBruikbaar,
  handleSaveSpondConfig,
  setRemovingSpondConfig,
}: {
  spondConfig: SpondConfig | null;
  isSyncing: boolean;
  handleSyncAll: () => void;
  showSpondSetup: boolean;
  setShowSpondSetup: (waarde: boolean) => void;
  spondForm: SpondFormState;
  setSpondForm: (waarde: SpondFormState) => void;
  handleLoadGroups: () => void;
  spondGroups: SpondGroup[];
  loadingGroups: boolean;
  spondWachtwoordBekend: boolean;
  spondFormBruikbaar: boolean;
  handleSaveSpondConfig: () => void;
  setRemovingSpondConfig: (waarde: boolean) => void;
}) {
  const { t } = useTranslation();
  const wachtwoordId = useId();
  const groepId = useId();

  return (
    <div className="card mb-3">
      <div className="card-header">
        <h2 className="card-title">{t('rehearsals.spond.title')}</h2>
        {spondConfig?.configured && spondConfig.groupId && (
          <button className="btn btn-primary btn-sm" onClick={handleSyncAll} disabled={isSyncing}>
            {isSyncing ? t('rehearsals.spond.syncing') : t('rehearsals.spond.syncAll')}
          </button>
        )}
      </div>
      <div className="card-body">
        <p className="piece-meta mb-2">{t('rehearsals.spond.description')}</p>

        {spondConfig?.configured ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.75rem' }}>
              <span className={`badge badge-${spondConfig.syncEnabled ? 'success' : 'secondary'}`}>
                {spondConfig.syncEnabled ? t('rehearsals.spond.enabled') : t('rehearsals.spond.disabled')}
              </span>
              <span style={{ fontSize: '0.875rem' }}>{spondConfig.username}</span>
              {spondConfig.groupId && (
                <span style={{ fontSize: '0.875rem', color: 'var(--text-light)' }}>
                  Groep: {spondConfig.groupId.slice(0, 8)}...
                </span>
              )}
              <span style={{ fontSize: '0.8rem', color: 'var(--text-light)' }}>
                {t('rehearsals.spond.lastSync')}:{' '}
                {spondConfig.lastSync ? new Date(spondConfig.lastSync).toLocaleString() : t('rehearsals.spond.never')}
              </span>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                className="btn btn-outline btn-sm"
                onClick={() => {
                  setSpondForm({
                    username: spondConfig.username || '',
                    password: '',
                    groupId: spondConfig.groupId || '',
                  });
                  setShowSpondSetup(true);
                  handleLoadGroups();
                }}
              >
                {t('common.edit')}
              </button>
              <button
                className="btn btn-outline btn-sm"
                onClick={() => setRemovingSpondConfig(true)}
                style={{ color: 'var(--danger)' }}
              >
                {t('rehearsals.spond.removeConfig')}
              </button>
            </div>
          </div>
        ) : (
          <div>
            <p style={{ marginBottom: '0.5rem' }}>{t('rehearsals.spond.notConfigured')}</p>
            <button className="btn btn-primary btn-sm" onClick={() => setShowSpondSetup(true)}>
              {t('rehearsals.spond.configure')}
            </button>
          </div>
        )}

        {/* Spond setup form */}
        {showSpondSetup && (
          <div
            style={{
              marginTop: '1rem',
              padding: '1rem',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
            }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <FormField label={t('rehearsals.spond.username')}>
                <input
                  type="email"
                  className="form-control"
                  value={spondForm.username}
                  onChange={(e) => setSpondForm({ ...spondForm, username: e.target.value })}
                />
              </FormField>
              {/* Met de hand gekoppeld: onder het veld staat soms nog een
                  hulptekst, en FormField kloont maar één kind. De hulptekst
                  hangt via aria-describedby aan het veld. */}
              <div className="form-group">
                <label className="form-label" htmlFor={wachtwoordId}>
                  {t('rehearsals.spond.password')}
                </label>
                <input
                  id={wachtwoordId}
                  aria-describedby={spondWachtwoordBekend ? `${wachtwoordId}-hulp` : undefined}
                  type="password"
                  className="form-control"
                  value={spondForm.password}
                  onChange={(e) => setSpondForm({ ...spondForm, password: e.target.value })}
                  placeholder={spondConfig?.configured ? '••••••••' : ''}
                />
                {spondWachtwoordBekend && (
                  <span id={`${wachtwoordId}-hulp`} className="form-help">
                    {t('rehearsals.spond.passwordKeepHint')}
                  </span>
                )}
              </div>
            </div>
            <div className="form-group" style={{ marginTop: '0.75rem' }}>
              {/* Met de hand gekoppeld: keuzelijst en knop staan samen in een
                  eigen omhulsel onder het label, dus FormField past hier niet. */}
              <label className="form-label" htmlFor={groepId}>
                {t('rehearsals.spond.selectGroup')}
              </label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <select
                  id={groepId}
                  className="form-control form-select"
                  value={spondForm.groupId}
                  onChange={(e) => setSpondForm({ ...spondForm, groupId: e.target.value })}
                  style={{ flex: 1 }}
                >
                  <option value="">{t('rehearsals.spond.noGroup')}</option>
                  {spondGroups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name} ({g.memberCount} leden)
                    </option>
                  ))}
                </select>
                <button
                  className="btn btn-outline btn-sm"
                  onClick={handleLoadGroups}
                  disabled={loadingGroups || !spondFormBruikbaar}
                >
                  {loadingGroups ? t('rehearsals.spond.loadingGroups') : t('rehearsals.spond.selectGroup')}
                </button>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
              <button className="btn btn-primary" onClick={handleSaveSpondConfig} disabled={!spondFormBruikbaar}>
                {t('rehearsals.spond.saveConfig')}
              </button>
              <button className="btn btn-outline" onClick={() => setShowSpondSetup(false)}>
                {t('common.cancel')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
