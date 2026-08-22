import { useTranslation } from 'react-i18next';
import type { Budget } from '../../api/accounting';
import { Icon } from '../../components/Icon';
import { SkeletonTable } from '../../components/Skeleton';
import { formatCurrency } from './formatteer';

export function BudgettenTab({
  budgets,
  loadingBudgets,
  setShowBudgetModal,
}: {
  budgets: Budget[];
  loadingBudgets: boolean;
  setShowBudgetModal: (open: boolean) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <div className="page-header">
        <h2 className="text-xl font-semibold">{t('accounting.budgets')}</h2>
        <button className="btn btn-primary gap-2" onClick={() => setShowBudgetModal(true)}>
          <Icon name="plus" size={16} />
          {t('accounting.newBudget')}
        </button>
      </div>

      {loadingBudgets ? (
        <SkeletonTable rows={5} columns={5} />
      ) : budgets.length === 0 ? (
        <div className="card bg-base-200 p-8 text-center">
          <Icon name="chart" size={48} className="mx-auto opacity-50 mb-4" />
          <p className="text-base-content/70">{t('accounting.noBudgets')}</p>
        </div>
      ) : (
        <div className="card bg-base-100 shadow-md">
          <div className="card-body">
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('common.name')}</th>
                    <th>{t('accounting.account')}</th>
                    <th className="text-right">{t('accounting.budgetAmount')}</th>
                    <th className="text-right">{t('accounting.actual')}</th>
                    <th className="text-right">{t('accounting.remaining')}</th>
                    <th>{t('common.status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {budgets.map((budget) => {
                    const percentUsed = budget.amount > 0 ? (budget.actual / budget.amount) * 100 : 0;
                    return (
                      <tr key={budget.id}>
                        <td>{budget.name}</td>
                        <td className="text-sm">
                          <span className="font-mono">{budget.accountCode}</span> - {budget.accountName}
                        </td>
                        <td className="text-right font-mono">{formatCurrency(budget.amount)}</td>
                        <td className="text-right font-mono">{formatCurrency(budget.actual)}</td>
                        <td className={`text-right font-mono ${budget.remaining >= 0 ? 'text-success' : 'text-error'}`}>
                          {formatCurrency(budget.remaining)}
                        </td>
                        <td>
                          <div className="flex items-center gap-2">
                            <progress
                              className={`progress w-16 ${percentUsed > 100 ? 'progress-error' : percentUsed > 80 ? 'progress-warning' : 'progress-success'}`}
                              value={Math.min(percentUsed, 100)}
                              max="100"
                            />
                            <span className="text-sm">{percentUsed.toFixed(0)}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
