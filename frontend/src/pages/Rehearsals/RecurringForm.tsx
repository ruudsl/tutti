/** Het formulier voor een reeks herhalende repetities. Letterlijk overgenomen uit Rehearsals.tsx. */

import { useTranslation } from 'react-i18next';
import type { Orchestra } from '../../types';
import { formatDate, type RecurringFormState } from './hulpfuncties';

export function RecurringForm({
  recurringForm,
  setRecurringForm,
  orchestras,
  recurringPreview,
  setRecurringPreview,
  recurringLoading,
  handleCreateRecurring,
  setShowRecurring,
}: {
  recurringForm: RecurringFormState;
  setRecurringForm: (waarde: RecurringFormState) => void;
  orchestras: Orchestra[];
  recurringPreview: string[];
  setRecurringPreview: (waarde: string[]) => void;
  recurringLoading: boolean;
  handleCreateRecurring: () => void;
  setShowRecurring: (waarde: boolean) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="card mb-3">
      <div className="card-header">
        <h2 className="card-title">{t('rehearsals.recurring.title')}</h2>
      </div>
      <div className="card-body">
        <p className="piece-meta mb-2">{t('rehearsals.recurring.description')}</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '1rem' }}>
          <div className="form-group">
            <label className="form-label">{t('rehearsals.recurring.dayOfWeek')}</label>
            <select
              className="form-control form-select"
              value={recurringForm.dayOfWeek}
              onChange={(e) => setRecurringForm({ ...recurringForm, dayOfWeek: Number(e.target.value) })}
            >
              {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                <option key={d} value={d}>
                  {t(`rehearsals.days.${d}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">{t('rehearsals.recurring.interval')}</label>
            <select
              className="form-control form-select"
              value={recurringForm.interval}
              onChange={(e) => setRecurringForm({ ...recurringForm, interval: Number(e.target.value) })}
            >
              <option value={1}>{t('rehearsals.recurring.weekly')}</option>
              <option value={2}>{t('rehearsals.recurring.biweekly')}</option>
              <option value={3}>{t('rehearsals.recurring.every3weeks')}</option>
              <option value={4}>{t('rehearsals.recurring.every4weeks')}</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">{t('rehearsals.startTime')}</label>
            <input
              type="time"
              className="form-control"
              value={recurringForm.startTime}
              onChange={(e) => setRecurringForm({ ...recurringForm, startTime: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label className="form-label">{t('rehearsals.endTime')}</label>
            <input
              type="time"
              className="form-control"
              value={recurringForm.endTime}
              onChange={(e) => setRecurringForm({ ...recurringForm, endTime: e.target.value })}
            />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
          <div className="form-group">
            <label className="form-label">{t('rehearsals.location')}</label>
            <input
              type="text"
              className="form-control"
              value={recurringForm.location}
              onChange={(e) => setRecurringForm({ ...recurringForm, location: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label className="form-label">{t('rehearsals.orchestra')}</label>
            <select
              className="form-control form-select"
              value={recurringForm.orchestraId}
              onChange={(e) => setRecurringForm({ ...recurringForm, orchestraId: e.target.value })}
            >
              <option value="">{t('rehearsals.allOrchestras')}</option>
              {orchestras.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">{t('rehearsals.recurring.until')}</label>
            <input
              type="date"
              className="form-control"
              value={recurringForm.until}
              onChange={(e) => setRecurringForm({ ...recurringForm, until: e.target.value })}
            />
          </div>
        </div>

        {/* Preview */}
        {recurringPreview.length > 0 && (
          <div
            style={{
              marginTop: '1rem',
              padding: '0.75rem',
              background: 'var(--background)',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            <strong style={{ fontSize: '0.875rem' }}>
              {t('rehearsals.recurring.preview')} ({recurringPreview.length}):
            </strong>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}>
              {recurringPreview.slice(0, 12).map((date) => (
                <span key={date} className="badge badge-secondary" style={{ fontSize: '0.75rem' }}>
                  {formatDate(date, t)}
                </span>
              ))}
              {recurringPreview.length > 12 && (
                <span style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>
                  +{recurringPreview.length - 12} {t('rehearsals.recurring.more')}
                </span>
              )}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
          <button
            className="btn btn-primary"
            onClick={handleCreateRecurring}
            disabled={recurringLoading || !recurringForm.until || recurringPreview.length === 0}
          >
            {recurringLoading
              ? t('common.loading')
              : t('rehearsals.recurring.create', { count: recurringPreview.length })}
          </button>
          <button
            className="btn btn-outline"
            onClick={() => {
              setShowRecurring(false);
              setRecurringPreview([]);
            }}
          >
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
