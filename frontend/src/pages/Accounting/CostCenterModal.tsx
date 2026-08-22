import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createCostCenter } from '../../api/accounting';
import type { CostCenter } from '../../api/accounting';
import { Modal } from '../../components/Modal';
import { showError, showSuccess } from '../../utils/toast';

// =====================================================
// COST CENTER MODAL
// =====================================================
export function CostCenterModal({ onClose, onSave }: { onClose: () => void; onSave: () => void }) {
  const { t } = useTranslation();
  const [formData, setFormData] = useState<Partial<CostCenter>>({
    code: '',
    name: '',
    isActive: true,
  });

  const createMutation = useMutation({
    mutationFn: (data: Partial<CostCenter>) => createCostCenter(data),
    onSuccess: () => {
      showSuccess(t('accounting.costCenterCreated'));
      onSave();
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || t('accounting.errorSave'));
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(formData);
  };

  return (
    <Modal title={t('accounting.newCostCenter')} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="form-control">
            <label className="label">
              <span className="label-text">{t('accounting.code')} *</span>
            </label>
            <input
              type="text"
              className="input input-bordered"
              value={formData.code}
              onChange={(e) => setFormData({ ...formData, code: e.target.value })}
              required
            />
          </div>
          <div className="form-control">
            <label className="label">
              <span className="label-text">{t('common.name')} *</span>
            </label>
            <input
              type="text"
              className="input input-bordered"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>
        </div>

        <div className="form-control">
          <label className="label">
            <span className="label-text">{t('common.description')}</span>
          </label>
          <textarea
            className="textarea textarea-bordered"
            value={formData.description || ''}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          />
        </div>

        <div className="form-control">
          <label className="label">
            <span className="label-text">{t('accounting.budgetAmount')}</span>
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            className="input input-bordered"
            value={formData.budgetAmount || ''}
            onChange={(e) => setFormData({ ...formData, budgetAmount: parseFloat(e.target.value) || undefined })}
          />
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="submit" className="btn btn-primary" disabled={createMutation.isPending}>
            {createMutation.isPending ? <span className="loading loading-spinner loading-sm" /> : t('common.save')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
