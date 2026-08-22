import type { Dispatch, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import type { PlannedConcert } from '../../api';
import type { ConcertType } from '../../types';
import { Icon } from '../../components/Icon';
import type { WizardState } from './types';

/**
 * Stap 3 van de wizard: de concerten die het seizoen gaat krijgen.
 *
 * Letterlijk uit SeasonPlanner.tsx overgenomen.
 */
export function WizardStapConcerten({
  wizardState,
  setWizardState,
  concertTypes,
  addConcert,
  removeConcert,
  updateConcert,
}: {
  wizardState: WizardState;
  setWizardState: Dispatch<SetStateAction<WizardState>>;
  concertTypes: ConcertType[];
  addConcert: () => void;
  removeConcert: (index: number) => void;
  updateConcert: (index: number, field: keyof PlannedConcert, value: string | number) => void;
}) {
  const { t } = useTranslation();

  return (
    <div>
      <h2 className="card-title mb-3">{t('seasonPlanner.wizard.concertsTitle')}</h2>

      <div className="form-group">
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <input
            type="checkbox"
            checked={wizardState.generateConcerts}
            onChange={(e) => setWizardState((prev) => ({ ...prev, generateConcerts: e.target.checked }))}
          />
          {t('seasonPlanner.fields.generateConcerts')}
        </label>
      </div>

      {wizardState.generateConcerts && (
        <>
          {wizardState.concerts.map((concert, index) => (
            <div key={index} className="card mb-2" style={{ background: 'var(--background)' }}>
              <div className="card-body" style={{ padding: '0.75rem' }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '0.5rem',
                  }}
                >
                  <strong>
                    {t('seasonPlanner.wizard.concert')} {index + 1}
                  </strong>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => removeConcert(index)}
                    style={{ color: 'var(--danger)' }}
                  >
                    <Icon name="trash" size={14} />
                  </button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: '0.5rem' }}>
                  <input
                    type="text"
                    className="form-control"
                    placeholder={t('seasonPlanner.fields.concertName')}
                    value={concert.name}
                    onChange={(e) => updateConcert(index, 'name', e.target.value)}
                  />
                  <input
                    type="date"
                    className="form-control"
                    value={concert.date}
                    onChange={(e) => updateConcert(index, 'date', e.target.value)}
                  />
                  <input
                    type="text"
                    className="form-control"
                    placeholder={t('rehearsals.location')}
                    value={concert.location || ''}
                    onChange={(e) => updateConcert(index, 'location', e.target.value)}
                  />
                  <select
                    className="form-control form-select"
                    value={concert.type || ''}
                    onChange={(e) => updateConcert(index, 'type', e.target.value)}
                  >
                    <option value="">{t('seasonPlanner.fields.concertType')}</option>
                    {concertTypes.map((ct) => (
                      <option key={ct.value} value={ct.value}>
                        {ct.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          ))}
          <button type="button" className="btn btn-outline" onClick={addConcert}>
            + {t('seasonPlanner.wizard.addConcert')}
          </button>
        </>
      )}
    </div>
  );
}
