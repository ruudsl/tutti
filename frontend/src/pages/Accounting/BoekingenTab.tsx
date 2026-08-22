import { currentLocale } from '../../utils/locale';
import { useTranslation } from 'react-i18next';
import type { Transaction } from '../../api/accounting';
import { Icon } from '../../components/Icon';
import { SkeletonTable } from '../../components/Skeleton';
import { formatCurrency } from './formatteer';
import type { MutatieMetId } from './types';

export function BoekingenTab({
  transactions,
  loadingTransactions,
  boekingMutatie,
  boekingVerwijderMutatie,
  openBewerken,
  setShowTransactionModal,
}: {
  transactions: Transaction[];
  loadingTransactions: boolean;
  boekingMutatie: MutatieMetId;
  boekingVerwijderMutatie: MutatieMetId;
  openBewerken: (id: string) => void;
  setShowTransactionModal: (open: boolean) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <div className="page-header">
        <h2 className="text-xl font-semibold">{t('accounting.journalEntries')}</h2>
        <button className="btn btn-primary gap-2" onClick={() => setShowTransactionModal(true)}>
          <Icon name="plus" size={16} />
          {t('accounting.newEntry')}
        </button>
      </div>

      {loadingTransactions ? (
        <SkeletonTable rows={10} columns={6} />
      ) : transactions.length === 0 ? (
        <div className="card bg-base-200 p-8 text-center">
          <Icon name="fileText" size={48} className="mx-auto opacity-50 mb-4" />
          <p className="text-base-content/70">{t('accounting.noTransactions')}</p>
        </div>
      ) : (
        <div className="card bg-base-100 shadow-md">
          <div className="card-body">
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('accounting.transactionNumber')}</th>
                    <th>{t('accounting.date')}</th>
                    <th>{t('accounting.type')}</th>
                    <th>{t('accounting.description')}</th>
                    <th className="text-right">{t('accounting.amount')}</th>
                    <th>{t('common.status')}</th>
                    <th>
                      <span className="sr-only">{t('common.actions')}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx) => (
                    <tr key={tx.id}>
                      <td className="font-mono">{tx.transactionNumber}</td>
                      <td>{new Date(tx.transactionDate).toLocaleDateString(currentLocale())}</td>
                      <td>
                        <span className="badge badge-ghost badge-sm">
                          {t(`accounting.transactionTypes.${tx.transactionType}`)}
                        </span>
                      </td>
                      <td className="max-w-xs truncate">{tx.description}</td>
                      <td className="text-right font-mono">{formatCurrency(tx.totalAmount)}</td>
                      <td>
                        <span className={`badge badge-sm ${tx.isPosted ? 'badge-success' : 'badge-warning'}`}>
                          {tx.isPosted ? t('accounting.posted') : t('accounting.draft')}
                        </span>
                      </td>
                      <td>
                        {/* Een geboekte transactie staat vast: bewerken,
                              opnieuw boeken en verwijderen kan alleen zolang
                              hij op concept staat. */}
                        {!tx.isPosted && (
                          <div className="flex gap-1 justify-end">
                            <button
                              className="btn btn-ghost btn-xs"
                              onClick={() => openBewerken(tx.id)}
                              title={t('common.edit')}
                            >
                              <Icon name="pencil" size={16} />
                            </button>
                            <button
                              className="btn btn-ghost btn-xs text-success"
                              onClick={() => boekingMutatie.mutate(tx.id)}
                              disabled={boekingMutatie.isPending}
                              title={t('accounting.postTransaction')}
                            >
                              <Icon name="check" size={16} />
                            </button>
                            <button
                              className="btn btn-ghost btn-xs text-error"
                              onClick={() => {
                                if (window.confirm(t('accounting.confirmDeleteTransaction'))) {
                                  boekingVerwijderMutatie.mutate(tx.id);
                                }
                              }}
                              disabled={boekingVerwijderMutatie.isPending}
                              title={t('common.delete')}
                            >
                              <Icon name="trash" size={16} />
                            </button>
                          </div>
                        )}
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
