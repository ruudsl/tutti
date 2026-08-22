import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createBudget } from '../../api/accounting';
import type { Account, Budget, CostCenter } from '../../api/accounting';
import { Modal } from '../../components/Modal';
import { showError, showSuccess } from '../../utils/toast';

// =====================================================
// BUDGET MODAL
// =====================================================
export function BudgetModal({
  accounts,
  costCenters,
  fiscalYears,
  currentFiscalYearId,
  onClose,
  onSave,
}: {
  accounts: Account[];
  costCenters: CostCenter[];
  fiscalYears: { id: string; name: string; isCurrent: boolean }[];
  currentFiscalYearId?: string;
  onClose: () => void;
  onSave: () => void;
}) {
  const { t } = useTranslation();
  const [formData, setFormData] = useState<Partial<Budget>>({
    name: '',
    amount: 0,
    accountId: '',
    fiscalYearId: currentFiscalYearId,
  });

  const createMutation = useMutation({
    mutationFn: (data: Partial<Budget>) => createBudget(data),
    onSuccess: () => {
      showSuccess(t('accounting.budgetCreated'));
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

  const expenseAccounts = accounts.filter((a) => a.accountType === 'expense');

  return (
    <Modal title={t('accounting.newBudget')} onClose={onClose}>
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
            required
          />
        </div>

        <div className="form-control">
          <label className="label">
            <span className="label-text">{t('accounting.account')} *</span>
          </label>
          <select
            className="select select-bordered"
            value={formData.accountId || ''}
            onChange={(e) => setFormData({ ...formData, accountId: e.target.value })}
            required
          >
            <option value="">{t('accounting.selectAccount')}</option>
            {expenseAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} - {a.name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="form-control">
            <label className="label">
              <span className="label-text">{t('accounting.fiscalYear')}</span>
            </label>
            <select
              className="select select-bordered"
              value={formData.fiscalYearId || ''}
              onChange={(e) => setFormData({ ...formData, fiscalYearId: e.target.value || undefined })}
            >
              <option value="">{t('accounting.allYears')}</option>
              {fiscalYears.map((fy) => (
                <option key={fy.id} value={fy.id}>
                  {fy.name}
                </option>
              ))}
            </select>
          </div>
          <div className="form-control">
            <label className="label">
              <span className="label-text">{t('accounting.costCenter')}</span>
            </label>
            <select
              className="select select-bordered"
              value={formData.costCenterId || ''}
              onChange={(e) => setFormData({ ...formData, costCenterId: e.target.value || undefined })}
            >
              <option value="">-</option>
              {costCenters.map((cc) => (
                <option key={cc.id} value={cc.id}>
                  {cc.code} - {cc.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-control">
          <label className="label">
            <span className="label-text">{t('accounting.budgetAmount')} *</span>
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            className="input input-bordered"
            value={formData.amount || ''}
            onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
            required
          />
        </div>

        <div className="form-control">
          <label className="label">
            <span className="label-text">{t('common.notes')}</span>
          </label>
          <textarea
            className="textarea textarea-bordered"
            value={formData.notes || ''}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
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
