import { useMutation } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createInvoice } from '../../api/accounting';
import type { Account, AccountingRelation, CostCenter, CreateInvoiceData } from '../../api/accounting';
import { Icon } from '../../components/Icon';
import { Modal } from '../../components/Modal';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import { addDays, toDateInputValue } from '../../utils/dateFormat';
import { showError, showSuccess } from '../../utils/toast';

// =====================================================
// INVOICE MODAL
// =====================================================
export function InvoiceModal({
  accounts,
  relations,
  costCenters: _costCenters,
  onClose,
  onSave,
}: {
  accounts: Account[];
  relations: AccountingRelation[];
  costCenters: CostCenter[];
  onClose: () => void;
  onSave: () => void;
}) {
  void _costCenters; // Future use for cost center allocation on invoice lines
  const { t } = useTranslation();
  const [formData, setFormData] = useState<CreateInvoiceData>({
    invoiceType: 'sales',
    relationId: '',
    // toDateInputValue rekent in de tijdzone van de gebruiker. Hier stond
    // toISOString(), en dat rekent in UTC: een factuur die in Nederland tussen
    // middernacht en 01:00 (zomertijd 02:00) wordt aangemaakt, kreeg de dag
    // ervóór als factuurdatum. Op 1 januari om half een is dat een ander
    // boekjaar.
    invoiceDate: toDateInputValue(),
    // En de vervaldatum met addDays in plaats van dertig keer 24 uur: over de
    // overgang naar of van zomertijd komt dat laatste een uur naast de
    // kalender uit, en dan valt de vervaldatum een dag te vroeg of te laat.
    dueDate: toDateInputValue(addDays(new Date(), 30)),
    lines: [{ description: '', quantity: 1, unitPrice: 0 }],
  });

  // Dirty detection: compare current form state against the initial snapshot
  const initialFormRef = useRef<string | null>(null);
  if (initialFormRef.current === null) {
    initialFormRef.current = JSON.stringify(formData);
  }
  const isDirty = JSON.stringify(formData) !== initialFormRef.current;
  const { confirmClose, dialog: unsavedDialog } = useUnsavedChanges(isDirty);
  const handleClose = () => confirmClose(onClose);

  const createMutation = useMutation({
    mutationFn: (data: CreateInvoiceData) => createInvoice(data),
    onSuccess: () => {
      showSuccess(t('accounting.invoiceCreated'));
      onSave();
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || t('accounting.errorSave'));
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validLines = formData.lines.filter((line) => line.description && line.quantity > 0);
    if (validLines.length === 0) {
      showError(t('accounting.minOneLine'));
      return;
    }
    createMutation.mutate({ ...formData, lines: validLines });
  };

  const addLine = () => {
    setFormData({
      ...formData,
      lines: [...formData.lines, { description: '', quantity: 1, unitPrice: 0 }],
    });
  };

  const updateLine = (index: number, field: string, value: any) => {
    const newLines = [...formData.lines];
    newLines[index] = { ...newLines[index], [field]: value };
    setFormData({ ...formData, lines: newLines });
  };

  const removeLine = (index: number) => {
    if (formData.lines.length <= 1) return;
    setFormData({
      ...formData,
      lines: formData.lines.filter((_, i) => i !== index),
    });
  };

  const incomeAccounts = accounts.filter((a) => a.accountType === 'income');
  const expenseAccounts = accounts.filter((a) => a.accountType === 'expense');
  const relevantAccounts = formData.invoiceType === 'sales' ? incomeAccounts : expenseAccounts;

  const subtotal = formData.lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);

  return (
    <Modal title={t('accounting.newInvoice')} onClose={handleClose} size="large">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="form-control">
            <label className="label">
              <span className="label-text">{t('accounting.invoiceType')} *</span>
            </label>
            <select
              className="select select-bordered"
              value={formData.invoiceType}
              onChange={(e) => setFormData({ ...formData, invoiceType: e.target.value as any })}
            >
              <option value="sales">{t('accounting.invoiceTypes.sales')}</option>
              <option value="purchase">{t('accounting.invoiceTypes.purchase')}</option>
              <option value="credit_note">{t('accounting.invoiceTypes.credit_note')}</option>
            </select>
          </div>
          <div className="form-control">
            <label className="label">
              <span className="label-text">{t('accounting.relation')} *</span>
            </label>
            <select
              className="select select-bordered"
              value={formData.relationId}
              onChange={(e) => setFormData({ ...formData, relationId: e.target.value })}
              required
            >
              <option value="">{t('accounting.selectRelation')}</option>
              {relations.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="form-control">
            <label className="label">
              <span className="label-text">{t('accounting.invoiceDate')} *</span>
            </label>
            <input
              type="date"
              className="input input-bordered"
              value={formData.invoiceDate}
              onChange={(e) => setFormData({ ...formData, invoiceDate: e.target.value })}
              required
            />
          </div>
          <div className="form-control">
            <label className="label">
              <span className="label-text">{t('accounting.dueDate')} *</span>
            </label>
            <input
              type="date"
              className="input input-bordered"
              value={formData.dueDate}
              onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
          <div className="form-control">
            <label className="label">
              <span className="label-text">{t('accounting.description')}</span>
            </label>
            <input
              type="text"
              className="input input-bordered"
              value={formData.description || ''}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            />
          </div>
        </div>

        <div className="divider">{t('accounting.invoiceLines')}</div>

        <div className="overflow-x-auto">
          <table className="table table-sm">
            <thead>
              <tr>
                <th className="w-2/5">{t('accounting.description')}</th>
                <th className="text-right">{t('accounting.quantity')}</th>
                <th className="text-right">{t('accounting.unitPrice')}</th>
                <th>{t('accounting.account')}</th>
                <th className="text-right">{t('accounting.lineTotal')}</th>
                <th className="w-16"></th>
              </tr>
            </thead>
            <tbody>
              {formData.lines.map((line, index) => (
                <tr key={index}>
                  <td>
                    <input
                      type="text"
                      className="input input-bordered input-sm w-full"
                      value={line.description}
                      onChange={(e) => updateLine(index, 'description', e.target.value)}
                      placeholder={t('accounting.lineDescription')}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      step="1"
                      min="1"
                      className="input input-bordered input-sm w-20 text-right"
                      value={line.quantity}
                      onChange={(e) => updateLine(index, 'quantity', parseInt(e.target.value) || 1)}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      step="0.01"
                      className="input input-bordered input-sm w-24 text-right"
                      value={line.unitPrice}
                      onChange={(e) => updateLine(index, 'unitPrice', parseFloat(e.target.value) || 0)}
                    />
                  </td>
                  <td>
                    <select
                      className="select select-bordered select-sm w-full"
                      value={line.accountId || ''}
                      onChange={(e) => updateLine(index, 'accountId', e.target.value || undefined)}
                    >
                      <option value="">-</option>
                      {relevantAccounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.code} - {a.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="text-right font-mono">{(line.quantity * line.unitPrice).toFixed(2)}</td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm text-error"
                      onClick={() => removeLine(index)}
                      disabled={formData.lines.length <= 1}
                    >
                      <Icon name="trash" size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-bold">
                <td colSpan={4} className="text-right">
                  {t('accounting.subtotal')}
                </td>
                <td className="text-right font-mono">{subtotal.toFixed(2)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>

        <button type="button" className="btn btn-ghost btn-sm gap-2" onClick={addLine}>
          <Icon name="plus" size={14} />
          {t('accounting.addLine')}
        </button>

        <div className="form-control">
          <label className="label">
            <span className="label-text">{t('accounting.notes')}</span>
          </label>
          <textarea
            className="textarea textarea-bordered"
            value={formData.notes || ''}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            rows={2}
          />
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <button type="button" className="btn btn-ghost" onClick={handleClose}>
            {t('common.cancel')}
          </button>
          <button type="submit" className="btn btn-primary" disabled={createMutation.isPending}>
            {createMutation.isPending ? <span className="loading loading-spinner loading-sm" /> : t('common.save')}
          </button>
        </div>
      </form>
      {unsavedDialog}
    </Modal>
  );
}
