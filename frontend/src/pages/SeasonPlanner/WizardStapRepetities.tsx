import type { Dispatch, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import type { Orchestra } from '../../types';
import { formatDate } from './formatteer';
import { WEEKDAYS } from './types';
import type { WizardState } from './types';

/**
 * Stap 2 van de wizard: op welke dag en welk tijdstip er gerepeteerd wordt, en
 * welke van de berekende data overgeslagen worden.
 *
 * Letterlijk uit SeasonPlanner.tsx overgenomen. De berekening van
 * `rehearsalPreview` blijft in de wizard staan en komt hier als lijst binnen.
 */
export function WizardStapRepetities({
  wizardState,
  setWizardState,
  orchestras,
  rehearsalPreview,
  toggleExcludeDate,
}: {
  wizardState: WizardState;
  setWizardState: Dispatch<SetStateAction<WizardState>>;
  orchestras: Orchestra[];
  rehearsalPreview: string[];
  toggleExcludeDate: (date: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <div>
      <h2 className="card-title mb-3">{t('seasonPlanner.wizard.rehearsalsTitle')}</h2>

      <div className="form-group">
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <input
            type="checkbox"
            checked={wizardState.generateRehearsals}
            onChange={(e) => setWizardState((prev) => ({ ...prev, generateRehearsals: e.target.checked }))}
          />
          {t('seasonPlanner.fields.generateRehearsals')}
        </label>
      </div>

      {wizardState.generateRehearsals && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">{t('seasonPlanner.fields.rehearsalDay')}</label>
              <select
                className="form-control form-select"
                value={wizardState.rehearsalDay}
                onChange={(e) => setWizardState((prev) => ({ ...prev, rehearsalDay: Number(e.target.value) }))}
              >
                {WEEKDAYS.map((day) => (
                  <option key={day.value} value={day.value}>
                    {t(`rehearsals.days.${day.value}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">{t('rehearsals.startTime')}</label>
              <input
                type="time"
                className="form-control"
                value={wizardState.rehearsalTime}
                onChange={(e) => setWizardState((prev) => ({ ...prev, rehearsalTime: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label className="form-label">{t('rehearsals.endTime')}</label>
              <input
                type="time"
                className="form-control"
                value={wizardState.rehearsalEndTime}
                onChange={(e) => setWizardState((prev) => ({ ...prev, rehearsalEndTime: e.target.value }))}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">{t('rehearsals.location')}</label>
              <input
                type="text"
                className="form-control"
                value={wizardState.rehearsalLocation}
                onChange={(e) => setWizardState((prev) => ({ ...prev, rehearsalLocation: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label className="form-label">{t('rehearsals.orchestra')}</label>
              <select
                className="form-control form-select"
                value={wizardState.orchestraId}
                onChange={(e) => setWizardState((prev) => ({ ...prev, orchestraId: e.target.value }))}
              >
                <option value="">{t('rehearsals.allOrchestras')}</option>
                {orchestras.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Preview */}
          {rehearsalPreview.length > 0 && (
            <div
              style={{
                marginTop: '1rem',
                padding: '1rem',
                background: 'var(--background)',
                borderRadius: 'var(--radius)',
              }}
            >
              <strong>
                {t('seasonPlanner.wizard.rehearsalPreview')} ({rehearsalPreview.length})
              </strong>
              <p className="piece-meta mb-2">{t('seasonPlanner.wizard.clickToExclude')}</p>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '0.5rem',
                  maxHeight: '200px',
                  overflowY: 'auto',
                }}
              >
                {rehearsalPreview.map((date) => {
                  const isExcluded = wizardState.excludedDates.includes(date);
                  return (
                    <button
                      key={date}
                      type="button"
                      className={`badge ${isExcluded ? 'badge-danger' : 'badge-secondary'}`}
                      onClick={() => toggleExcludeDate(date)}
                      style={{ cursor: 'pointer', textDecoration: isExcluded ? 'line-through' : 'none' }}
                    >
                      {formatDate(date)}
                    </button>
                  );
                })}
              </div>
              {wizardState.excludedDates.length > 0 && (
                <p className="piece-meta mt-2">
                  {t('seasonPlanner.wizard.excludedCount', { count: wizardState.excludedDates.length })}
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
