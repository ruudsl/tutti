import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createTransaction, updateTransaction } from '../../api/accounting';
import type { Account, CostCenter, CreateTransactionData, Transaction, TransactionType } from '../../api/accounting';
import { Icon } from '../../components/Icon';
import { Modal } from '../../components/Modal';
import { showError, showSuccess } from '../../utils/toast';

// =====================================================
// TRANSACTION MODAL
// =====================================================
export function TransactionModal({
  transaction,
  accounts,
  costCenters,
  onClose,
  onSave,
}: {
  transaction?: Transaction | null;
  accounts: Account[];
  costCenters: CostCenter[];
  onClose: () => void;
  onSave: () => void;
}) {
  const { t } = useTranslation();
  const bewerken = Boolean(transaction);
  const [formData, setFormData] = useState<CreateTransactionData>(() =>
    transaction
      ? {
          transactionDate: transaction.transactionDate.split('T')[0],
          transactionType: transaction.transactionType,
          reference: transaction.reference,
          description: transaction.description,
          lines: (transaction.lines ?? []).map((regel) => ({
            accountId: regel.accountId,
            costCenterId: regel.costCenterId,
            description: regel.description,
            debitAmount: regel.debitAmount,
            creditAmount: regel.creditAmount,
          })),
        }
      : {
          transactionDate: new Date().toISOString().split('T')[0],
          transactionType: 'journal',
          description: '',
          lines: [
            { accountId: '', debitAmount: 0, creditAmount: 0 },
            { accountId: '', debitAmount: 0, creditAmount: 0 },
          ],
        },
  );

  const createMutation = useMutation({
    mutationFn: (data: CreateTransactionData) =>
      transaction ? updateTransaction(transaction.id, data) : createTransaction(data),
    onSuccess: () => {
      showSuccess(t(bewerken ? 'accounting.transactionUpdated' : 'accounting.transactionCreated'));
      onSave();
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || t('accounting.errorSave'));
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Filter out empty lines and validate
    const validLines = formData.lines.filter(
      (line) => line.accountId && (line.debitAmount > 0 || line.creditAmount > 0),
    );
    if (validLines.length < 2) {
      showError(t('accounting.minTwoLines'));
      return;
    }
    const totalDebit = validLines.reduce((sum, l) => sum + (l.debitAmount || 0), 0);
    const totalCredit = validLines.reduce((sum, l) => sum + (l.creditAmount || 0), 0);
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      showError(t('accounting.debitCreditMustMatch'));
      return;
    }
    createMutation.mutate({ ...formData, lines: validLines });
  };

  const addLine = () => {
    setFormData({
      ...formData,
      lines: [...formData.lines, { accountId: '', debitAmount: 0, creditAmount: 0 }],
    });
  };

  const updateLine = (index: number, field: string, value: any) => {
    const newLines = [...formData.lines];
    newLines[index] = { ...newLines[index], [field]: value };
    setFormData({ ...formData, lines: newLines });
  };

  const removeLine = (index: number) => {
    if (formData.lines.length <= 2) return;
    setFormData({
      ...formData,
      lines: formData.lines.filter((_, i) => i !== index),
    });
  };

  const totalDebit = formData.lines.reduce((sum, l) => sum + (l.debitAmount || 0), 0);
  const totalCredit = formData.lines.reduce((sum, l) => sum + (l.creditAmount || 0), 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;

  return (
    <Modal title={t(bewerken ? 'accounting.editEntry' : 'accounting.newEntry')} onClose={onClose} size="large">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="form-control">
            <label className="label">
              <span className="label-text">{t('accounting.date')} *</span>
            </label>
            <input
              type="date"
              className="input input-bordered"
              value={formData.transactionDate}
              onChange={(e) => setFormData({ ...formData, transactionDate: e.target.value })}
              required
            />
          </div>
          <div className="form-control">
            <label className="label">
              <span className="label-text">{t('accounting.type')} *</span>
            </label>
            <select
              className="select select-bordered"
              value={formData.transactionType}
              onChange={(e) => setFormData({ ...formData, transactionType: e.target.value as TransactionType })}
            >
              {(['journal', 'payment', 'receipt', 'bank', 'transfer'] as TransactionType[]).map((type) => (
                <option key={type} value={type}>
                  {t(`accounting.transactionTypes.${type}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="form-control">
            <label className="label">
              <span className="label-text">{t('accounting.reference')}</span>
            </label>
            <input
              type="text"
              className="input input-bordered"
              value={formData.reference || ''}
              onChange={(e) => setFormData({ ...formData, reference: e.target.value })}
            />
          </div>
        </div>

        <div className="form-control">
          <label className="label">
            <span className="label-text">{t('accounting.description')} *</span>
          </label>
          <input
            type="text"
            className="input input-bordered"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            required
          />
        </div>

        <div className="divider">{t('accounting.lines')}</div>

        <div className="overflow-x-auto">
          <table className="table table-sm">
            <thead>
              <tr>
                <th className="w-2/5">{t('accounting.account')}</th>
                <th>{t('accounting.costCenter')}</th>
                <th className="text-right">{t('accounting.debit')}</th>
                <th className="text-right">{t('accounting.credit')}</th>
                <th className="w-16"></th>
              </tr>
            </thead>
            <tbody>
              {formData.lines.map((line, index) => (
                <tr key={index}>
                  <td>
                    <select
                      className="select select-bordered select-sm w-full"
                      value={line.accountId}
                      onChange={(e) => updateLine(index, 'accountId', e.target.value)}
                    >
                      <option value="">{t('accounting.selectAccount')}</option>
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.code} - {a.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      className="select select-bordered select-sm w-full"
                      value={line.costCenterId || ''}
                      onChange={(e) => updateLine(index, 'costCenterId', e.target.value || undefined)}
                    >
                      <option value="">-</option>
                      {costCenters.map((cc) => (
                        <option key={cc.id} value={cc.id}>
                          {cc.code} - {cc.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className="input input-bordered input-sm w-24 text-right"
                      value={line.debitAmount || ''}
                      onChange={(e) => updateLine(index, 'debitAmount', parseFloat(e.target.value) || 0)}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className="input input-bordered input-sm w-24 text-right"
                      value={line.creditAmount || ''}
                      onChange={(e) => updateLine(index, 'creditAmount', parseFloat(e.target.value) || 0)}
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm text-error"
                      onClick={() => removeLine(index)}
                      disabled={formData.lines.length <= 2}
                    >
                      <Icon name="trash" size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className={`font-bold ${isBalanced ? '' : 'text-error'}`}>
                <td colSpan={2} className="text-right">
                  {t('common.total')}
                </td>
                <td className="text-right">{totalDebit.toFixed(2)}</td>
                <td className="text-right">{totalCredit.toFixed(2)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>

        <button type="button" className="btn btn-ghost btn-sm gap-2" onClick={addLine}>
          <Icon name="plus" size={14} />
          {t('accounting.addLine')}
        </button>

        {!isBalanced && (
          <div className="alert alert-warning">
            <Icon name="warning" size={16} />
            <span>{t('accounting.debitCreditMustMatch')}</span>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-4">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="submit" className="btn btn-primary" disabled={createMutation.isPending || !isBalanced}>
            {createMutation.isPending ? <span className="loading loading-spinner loading-sm" /> : t('common.save')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
