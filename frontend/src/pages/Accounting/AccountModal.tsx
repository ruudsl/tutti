import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createAccount, updateAccount } from '../../api/accounting';
import type { Account, AccountSubtype, AccountType, CreateAccountData } from '../../api/accounting';
import { Modal } from '../../components/Modal';
import { showError, showSuccess } from '../../utils/toast';

export function AccountModal({
  account,
  accounts,
  onClose,
  onSave,
}: {
  account: Account | null;
  accounts: Account[];
  onClose: () => void;
  onSave: () => void;
}) {
  const { t } = useTranslation();
  const [formData, setFormData] = useState<CreateAccountData>({
    code: account?.code || '',
    name: account?.name || '',
    accountType: account?.accountType || 'expense',
    accountSubtype: account?.accountSubtype,
    parentId: account?.parentId,
    description: account?.description,
    openingBalance: account?.openingBalance || 0,
  });

  const createMutation = useMutation({
    mutationFn: (data: CreateAccountData) => createAccount(data),
    onSuccess: () => {
      showSuccess(t('accounting.accountCreated'));
      onSave();
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || t('accounting.errorSave'));
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: CreateAccountData) => updateAccount(account!.id, data),
    onSuccess: () => {
      showSuccess(t('accounting.accountUpdated'));
      onSave();
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || t('accounting.errorSave'));
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (account) {
      updateMutation.mutate(formData);
    } else {
      createMutation.mutate(formData);
    }
  };

  const parentOptions = accounts.filter((a) => a.id !== account?.id && a.accountType === formData.accountType);

  return (
    <Modal title={account ? t('accounting.editAccount') : t('accounting.newAccount')} onClose={onClose}>
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
              <span className="label-text">{t('accounting.accountType')} *</span>
            </label>
            <select
              className="select select-bordered"
              value={formData.accountType}
              onChange={(e) =>
                setFormData({ ...formData, accountType: e.target.value as AccountType, parentId: undefined })
              }
            >
              {(['asset', 'liability', 'equity', 'income', 'expense'] as AccountType[]).map((type) => (
                <option key={type} value={type}>
                  {t(`accounting.accountTypes.${type}`)}
                </option>
              ))}
            </select>
          </div>
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="form-control">
            <label className="label">
              <span className="label-text">{t('accounting.subtype')}</span>
            </label>
            <select
              className="select select-bordered"
              value={formData.accountSubtype || ''}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  accountSubtype: (e.target.value || undefined) as AccountSubtype | undefined,
                })
              }
            >
              <option value="">{t('accounting.noSubtype')}</option>
              {[
                'bank',
                'cash',
                'receivable',
                'payable',
                'inventory',
                'fixed_asset',
                'current_liability',
                'long_term_liability',
                'retained_earnings',
                'membership_fees',
                'donations',
                'grants',
                'ticket_sales',
                'sponsoring',
                'personnel',
                'materials',
                'rent',
                'utilities',
                'insurance',
                'depreciation',
                'other',
              ].map((subtype) => (
                <option key={subtype} value={subtype}>
                  {t(`accounting.accountSubtypes.${subtype}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="form-control">
            <label className="label">
              <span className="label-text">{t('accounting.parentAccount')}</span>
            </label>
            <select
              className="select select-bordered"
              value={formData.parentId || ''}
              onChange={(e) => setFormData({ ...formData, parentId: e.target.value || undefined })}
            >
              <option value="">{t('accounting.noParent')}</option>
              {parentOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} - {a.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-control">
          <label className="label">
            <span className="label-text">{t('accounting.openingBalance')}</span>
          </label>
          <input
            type="number"
            step="0.01"
            className="input input-bordered"
            value={formData.openingBalance}
            onChange={(e) => setFormData({ ...formData, openingBalance: parseFloat(e.target.value) || 0 })}
          />
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

        <div className="flex justify-end gap-2 pt-4">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={createMutation.isPending || updateMutation.isPending}
          >
            {createMutation.isPending || updateMutation.isPending ? (
              <span className="loading loading-spinner loading-sm" />
            ) : (
              t('common.save')
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}
