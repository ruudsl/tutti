import { currentLocale } from '../../utils/locale';
import { useTranslation } from 'react-i18next';
import type { Invoice } from '../../api/accounting';
import { Icon } from '../../components/Icon';
import { SkeletonTable } from '../../components/Skeleton';
import { formatCurrency } from './formatteer';
import type { MutatieMetId } from './types';

export function FacturenTab({
  invoices,
  loadingInvoices,
  factuurVerzendMutatie,
  factuurBetaaldMutatie,
  factuurVerwijderMutatie,
  setPrintInvoice,
  setShowInvoiceModal,
}: {
  invoices: Invoice[];
  loadingInvoices: boolean;
  factuurVerzendMutatie: MutatieMetId;
  factuurBetaaldMutatie: MutatieMetId;
  factuurVerwijderMutatie: MutatieMetId;
  setPrintInvoice: (factuur: Invoice) => void;
  setShowInvoiceModal: (open: boolean) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <div className="page-header">
        <h2 className="text-xl font-semibold">{t('accounting.invoices')}</h2>
        <button className="btn btn-primary gap-2" onClick={() => setShowInvoiceModal(true)}>
          <Icon name="plus" size={16} />
          {t('accounting.newInvoice')}
        </button>
      </div>

      {loadingInvoices ? (
        <SkeletonTable rows={10} columns={6} />
      ) : invoices.length === 0 ? (
        <div className="card bg-base-200 p-8 text-center">
          <Icon name="clipboard" size={48} className="mx-auto opacity-50 mb-4" />
          <p className="text-base-content/70">{t('accounting.noInvoices')}</p>
        </div>
      ) : (
        <div className="card bg-base-100 shadow-md">
          <div className="card-body">
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('accounting.invoiceNumber')}</th>
                    <th>{t('accounting.relation')}</th>
                    <th>{t('accounting.date')}</th>
                    <th>{t('accounting.due')}</th>
                    <th className="text-right">{t('accounting.amount')}</th>
                    <th>{t('common.status')}</th>
                    <th>
                      <span className="sr-only">{t('common.actions')}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((invoice) => (
                    <tr key={invoice.id}>
                      <td className="font-mono">{invoice.invoiceNumber}</td>
                      <td>{invoice.relationName}</td>
                      <td>{new Date(invoice.invoiceDate).toLocaleDateString(currentLocale())}</td>
                      <td>{new Date(invoice.dueDate).toLocaleDateString(currentLocale())}</td>
                      <td className="text-right font-mono">{formatCurrency(invoice.total)}</td>
                      <td>
                        <span
                          className={`badge badge-sm ${
                            invoice.status === 'paid'
                              ? 'badge-success'
                              : invoice.status === 'overdue'
                                ? 'badge-error'
                                : invoice.status === 'sent'
                                  ? 'badge-info'
                                  : 'badge-ghost'
                          }`}
                        >
                          {t(`accounting.invoiceStatus.${invoice.status}`)}
                        </span>
                      </td>
                      <td>
                        <div className="flex gap-1 justify-end">
                          <button
                            className="btn btn-ghost btn-xs"
                            onClick={() => setPrintInvoice(invoice)}
                            title={t('printTemplates.invoice.printButton')}
                          >
                            {t('printTemplates.print')}
                          </button>
                          {/* Een concept moet eerst verstuurd worden; pas
                                daarna kan hij betaald gemeld worden. */}
                          {invoice.status === 'draft' && (
                            <>
                              <button
                                className="btn btn-ghost btn-xs text-info"
                                onClick={() => factuurVerzendMutatie.mutate(invoice.id)}
                                disabled={factuurVerzendMutatie.isPending}
                                title={t('accounting.sendInvoice')}
                              >
                                <Icon name="envelope" size={16} />
                              </button>
                              <button
                                className="btn btn-ghost btn-xs text-error"
                                onClick={() => {
                                  if (window.confirm(t('accounting.confirmDeleteInvoice'))) {
                                    factuurVerwijderMutatie.mutate(invoice.id);
                                  }
                                }}
                                disabled={factuurVerwijderMutatie.isPending}
                                title={t('common.delete')}
                              >
                                <Icon name="trash" size={16} />
                              </button>
                            </>
                          )}
                          {invoice.status !== 'draft' && invoice.status !== 'paid' && (
                            <button
                              className="btn btn-ghost btn-xs text-success"
                              onClick={() => factuurBetaaldMutatie.mutate(invoice.id)}
                              disabled={factuurBetaaldMutatie.isPending}
                              title={t('accounting.markPaid')}
                            >
                              <Icon name="check" size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
