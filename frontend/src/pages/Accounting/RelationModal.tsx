import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createRelation } from '../../api/accounting';
import type { AccountingRelation, RelationType } from '../../api/accounting';
import { Modal } from '../../components/Modal';
import { showError, showSuccess } from '../../utils/toast';

// =====================================================
// RELATION MODAL
// =====================================================
export function RelationModal({ onClose, onSave }: { onClose: () => void; onSave: () => void }) {
  const { t } = useTranslation();
  const [formData, setFormData] = useState<Partial<AccountingRelation>>({
    relationType: 'customer',
    name: '',
    paymentTermDays: 30,
    isActive: true,
  });

  const createMutation = useMutation({
    mutationFn: (data: Partial<AccountingRelation>) => createRelation(data),
    onSuccess: () => {
      showSuccess(t('accounting.relationCreated'));
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
    <Modal title={t('accounting.newRelation')} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="form-control">
            <label className="label">
              <span className="label-text">{t('accounting.relationType')} *</span>
            </label>
            <select
              className="select select-bordered"
              value={formData.relationType}
              onChange={(e) => setFormData({ ...formData, relationType: e.target.value as RelationType })}
            >
              <option value="customer">{t('accounting.relationTypes.customer')}</option>
              <option value="supplier">{t('accounting.relationTypes.supplier')}</option>
              <option value="both">{t('accounting.relationTypes.both')}</option>
            </select>
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="form-control">
            <label className="label">
              <span className="label-text">{t('common.email')}</span>
            </label>
            <input
              type="email"
              className="input input-bordered"
              value={formData.email || ''}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            />
          </div>
          <div className="form-control">
            <label className="label">
              <span className="label-text">{t('common.phone')}</span>
            </label>
            <input
              type="tel"
              className="input input-bordered"
              value={formData.phone || ''}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            />
          </div>
        </div>

        <div className="form-control">
          <label className="label">
            <span className="label-text">{t('common.address')}</span>
          </label>
          <input
            type="text"
            className="input input-bordered"
            value={formData.addressLine || ''}
            onChange={(e) => setFormData({ ...formData, addressLine: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="form-control">
            <label className="label">
              <span className="label-text">{t('common.postalCode')}</span>
            </label>
            <input
              type="text"
              className="input input-bordered"
              value={formData.postalCode || ''}
              onChange={(e) => setFormData({ ...formData, postalCode: e.target.value })}
            />
          </div>
          <div className="form-control">
            <label className="label">
              <span className="label-text">{t('common.city')}</span>
            </label>
            <input
              type="text"
              className="input input-bordered"
              value={formData.city || ''}
              onChange={(e) => setFormData({ ...formData, city: e.target.value })}
            />
          </div>
          <div className="form-control">
            <label className="label">
              <span className="label-text">{t('common.country')}</span>
            </label>
            <input
              type="text"
              className="input input-bordered"
              value={formData.country || ''}
              onChange={(e) => setFormData({ ...formData, country: e.target.value })}
              placeholder="Nederland"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="form-control">
            <label className="label">
              <span className="label-text">{t('accounting.iban')}</span>
            </label>
            <input
              type="text"
              className="input input-bordered"
              value={formData.iban || ''}
              onChange={(e) => setFormData({ ...formData, iban: e.target.value.toUpperCase() })}
              placeholder="NL00BANK0000000000"
            />
          </div>
          <div className="form-control">
            <label className="label">
              <span className="label-text">{t('accounting.vatNumber')}</span>
            </label>
            <input
              type="text"
              className="input input-bordered"
              value={formData.vatNumber || ''}
              onChange={(e) => setFormData({ ...formData, vatNumber: e.target.value.toUpperCase() })}
              placeholder="NL000000000B00"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="form-control">
            <label className="label">
              <span className="label-text">{t('accounting.paymentTermDays')}</span>
            </label>
            <input
              type="number"
              min="0"
              className="input input-bordered"
              value={formData.paymentTermDays || 30}
              onChange={(e) => setFormData({ ...formData, paymentTermDays: parseInt(e.target.value) || 30 })}
            />
          </div>
          <div className="form-control">
            <label className="label">
              <span className="label-text">{t('accounting.creditLimit')}</span>
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              className="input input-bordered"
              value={formData.creditLimit || ''}
              onChange={(e) => setFormData({ ...formData, creditLimit: parseFloat(e.target.value) || undefined })}
            />
          </div>
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
