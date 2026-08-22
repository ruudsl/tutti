import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../../components/Modal';

export function FiscalYearModal({
  fiscalYears,
  onClose,
  onSave,
  isPending,
}: {
  fiscalYears: { id: string; name: string; isCurrent: boolean; startDate: string; endDate: string }[];
  onClose: () => void;
  onSave: (data: { name: string; startDate: string; endDate: string; isCurrent?: boolean }) => void;
  isPending: boolean;
}) {
  const { t } = useTranslation();
  const currentYear = new Date().getFullYear();
  const [formData, setFormData] = useState({
    name: `${currentYear}`,
    startDate: `${currentYear}-01-01`,
    endDate: `${currentYear}-12-31`,
    isCurrent: fiscalYears.length === 0,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <Modal onClose={onClose} title={t('accounting.newFiscalYear')}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="form-control">
          <label className="label">
            <span className="label-text">{t('common.name')} *</span>
          </label>
          <input
            type="text"
            className="input input-bordered"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder={t('accounting.fiscalYearNamePlaceholder')}
            required
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="form-control">
            <label className="label">
              <span className="label-text">{t('accounting.startDate')} *</span>
            </label>
            <input
              type="date"
              className="input input-bordered"
              value={formData.startDate}
              onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
              required
            />
          </div>
          <div className="form-control">
            <label className="label">
              <span className="label-text">{t('accounting.endDate')} *</span>
            </label>
            <input
              type="date"
              className="input input-bordered"
              value={formData.endDate}
              onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
              required
            />
          </div>
        </div>

        <div className="form-control">
          <label className="label cursor-pointer justify-start gap-2">
            <input
              type="checkbox"
              className="checkbox checkbox-primary"
              checked={formData.isCurrent}
              onChange={(e) => setFormData({ ...formData, isCurrent: e.target.checked })}
            />
            <span className="label-text">{t('accounting.setAsCurrent')}</span>
          </label>
        </div>

        {fiscalYears.length > 0 && <div className="divider">{t('accounting.existingFiscalYears')}</div>}
        {fiscalYears.length > 0 && (
          <ul className="space-y-1 text-sm">
            {fiscalYears.map((fy) => (
              <li key={fy.id} className="flex justify-between items-center">
                <span>{fy.name}</span>
                <span className="text-base-content/60">
                  {new Date(fy.startDate).toLocaleDateString()} - {new Date(fy.endDate).toLocaleDateString()}
                  {fy.isCurrent && <span className="badge badge-primary badge-sm ml-2">{t('accounting.current')}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="flex justify-end gap-2 pt-4">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="submit" className="btn btn-primary" disabled={isPending}>
            {isPending ? <span className="loading loading-spinner loading-sm" /> : t('common.save')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
