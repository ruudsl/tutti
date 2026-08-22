/** Het formulier om een repetitie toe te voegen of te bewerken. Letterlijk overgenomen uit Rehearsals.tsx. */

import { useTranslation } from 'react-i18next';
import type { Orchestra } from '../../types';
import type { RehearsalFormState } from './hulpfuncties';

export function RehearsalForm({
  form,
  setForm,
  editingId,
  orchestras,
  handleSaveRehearsal,
  isSaving,
  confirmClose,
  closeForm,
}: {
  form: RehearsalFormState;
  setForm: (waarde: RehearsalFormState) => void;
  editingId: string | null;
  orchestras: Orchestra[];
  handleSaveRehearsal: () => void;
  isSaving: boolean;
  confirmClose: (vervolg: () => void) => void;
  closeForm: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="card mb-3">
      <div className="card-header">
        <h2 className="card-title">{editingId ? t('rehearsals.editRehearsal') : t('rehearsals.addRehearsal')}</h2>
      </div>
      <div className="card-body">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
          <div className="form-group">
            <label className="form-label">{t('rehearsals.date')}</label>
            <input
              type="date"
              className="form-control"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label className="form-label">{t('rehearsals.startTime')}</label>
            <input
              type="time"
              className="form-control"
              value={form.startTime}
              onChange={(e) => setForm({ ...form, startTime: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label className="form-label">{t('rehearsals.endTime')}</label>
            <input
              type="time"
              className="form-control"
              value={form.endTime}
              onChange={(e) => setForm({ ...form, endTime: e.target.value })}
            />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
          <div className="form-group">
            <label className="form-label">{t('rehearsals.location')}</label>
            <input
              type="text"
              className="form-control"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label className="form-label">{t('rehearsals.type')}</label>
            <select
              className="form-control form-select"
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
            >
              <option value="regular">{t('rehearsals.types.regular')}</option>
              <option value="extra">{t('rehearsals.types.extra')}</option>
              <option value="cancelled">{t('rehearsals.types.cancelled')}</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">{t('rehearsals.orchestra')}</label>
            <select
              className="form-control form-select"
              value={form.orchestraId}
              onChange={(e) => setForm({ ...form, orchestraId: e.target.value })}
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
        <div className="form-group" style={{ marginTop: '1rem' }}>
          <label className="form-label">{t('rehearsals.notes')}</label>
          <input
            type="text"
            className="form-control"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
          <button className="btn btn-primary" onClick={handleSaveRehearsal} disabled={!form.date || isSaving}>
            {isSaving ? t('common.loading') : t('common.save')}
          </button>
          <button className="btn btn-outline" onClick={() => confirmClose(closeForm)}>
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
