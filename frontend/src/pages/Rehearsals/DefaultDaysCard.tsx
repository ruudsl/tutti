/** De kaart met de vaste repetitiedagen, inclusief het invoerformulier. Letterlijk overgenomen uit Rehearsals.tsx. */

import { useTranslation } from 'react-i18next';
import type { Orchestra, RehearsalDefaultDay } from '../../types';
import type { DefaultDayFormState } from './hulpfuncties';

export function DefaultDaysCard({
  showDefaultForm,
  setShowDefaultForm,
  defaultForm,
  setDefaultForm,
  orchestras,
  handleAddDefaultDay,
  defaultDays,
  handleDeleteDefaultDay,
}: {
  showDefaultForm: boolean;
  setShowDefaultForm: (waarde: boolean) => void;
  defaultForm: DefaultDayFormState;
  setDefaultForm: (waarde: DefaultDayFormState) => void;
  orchestras: Orchestra[];
  handleAddDefaultDay: () => void;
  defaultDays: RehearsalDefaultDay[];
  handleDeleteDefaultDay: (id: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="card mb-3">
      <div className="card-header">
        <h2 className="card-title">{t('rehearsals.defaultDays')}</h2>
        <button className="btn btn-primary btn-sm" onClick={() => setShowDefaultForm(!showDefaultForm)}>
          + {t('rehearsals.addDefaultDay')}
        </button>
      </div>
      <div className="card-body">
        <p className="piece-meta mb-2">{t('rehearsals.defaultDaysDescription')}</p>
        {showDefaultForm && (
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', alignItems: 'end' }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">{t('rehearsals.date')}</label>
              <select
                className="form-control form-select"
                value={defaultForm.dayOfWeek}
                onChange={(e) => setDefaultForm({ ...defaultForm, dayOfWeek: Number(e.target.value) })}
              >
                {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                  <option key={d} value={d}>
                    {t(`rehearsals.days.${d}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">{t('rehearsals.startTime')}</label>
              <input
                type="time"
                className="form-control"
                value={defaultForm.startTime}
                onChange={(e) => setDefaultForm({ ...defaultForm, startTime: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">{t('rehearsals.endTime')}</label>
              <input
                type="time"
                className="form-control"
                value={defaultForm.endTime}
                onChange={(e) => setDefaultForm({ ...defaultForm, endTime: e.target.value })}
              />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">{t('rehearsals.location')}</label>
              <input
                type="text"
                className="form-control"
                value={defaultForm.location}
                onChange={(e) => setDefaultForm({ ...defaultForm, location: e.target.value })}
              />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">{t('rehearsals.orchestra')}</label>
              <select
                className="form-control form-select"
                value={defaultForm.orchestraId}
                onChange={(e) => setDefaultForm({ ...defaultForm, orchestraId: e.target.value })}
              >
                <option value="">{t('rehearsals.allOrchestras')}</option>
                {orchestras.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </div>
            <button className="btn btn-primary" onClick={handleAddDefaultDay}>
              {t('common.save')}
            </button>
          </div>
        )}
        {defaultDays.length > 0 ? (
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {defaultDays.map((d) => (
              <div
                key={d.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.5rem 0.75rem',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--background)',
                }}
              >
                <strong>{t(`rehearsals.days.${d.day_of_week}`)}</strong>
                <span>
                  {d.start_time} - {d.end_time}
                </span>
                {d.location && <span style={{ color: 'var(--text-light)' }}>· {d.location}</span>}
                {d.orchestra_name && (
                  <span className="badge badge-secondary" style={{ fontSize: '0.7rem' }}>
                    {d.orchestra_name}
                  </span>
                )}
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => handleDeleteDefaultDay(d.id)}
                  style={{ padding: '0.1rem 0.4rem', fontSize: '0.7rem' }}
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="piece-meta">{t('rehearsals.noDefaultDays')}</p>
        )}
      </div>
    </div>
  );
}
