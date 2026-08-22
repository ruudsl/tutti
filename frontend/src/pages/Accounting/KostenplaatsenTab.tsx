import { useTranslation } from 'react-i18next';
import type { CostCenter } from '../../api/accounting';
import { Icon } from '../../components/Icon';
import { SkeletonTable } from '../../components/Skeleton';
import { formatCurrency } from './formatteer';

export function KostenplaatsenTab({
  costCenters,
  loadingCostCenters,
  setShowCostCenterModal,
}: {
  costCenters: CostCenter[];
  loadingCostCenters: boolean;
  setShowCostCenterModal: (open: boolean) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <div className="page-header">
        <h2 className="text-xl font-semibold">{t('accounting.costCenters')}</h2>
        <button className="btn btn-primary gap-2" onClick={() => setShowCostCenterModal(true)}>
          <Icon name="plus" size={16} />
          {t('accounting.newCostCenter')}
        </button>
      </div>

      {loadingCostCenters ? (
        <SkeletonTable rows={5} columns={4} />
      ) : costCenters.length === 0 ? (
        <div className="card bg-base-200 p-8 text-center">
          <Icon name="folder" size={48} className="mx-auto opacity-50 mb-4" />
          <p className="text-base-content/70">{t('accounting.noCostCenters')}</p>
        </div>
      ) : (
        <div className="card bg-base-100 shadow-md">
          <div className="card-body">
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('accounting.code')}</th>
                    <th>{t('common.name')}</th>
                    <th>{t('common.description')}</th>
                    <th className="text-right">{t('accounting.budget')}</th>
                  </tr>
                </thead>
                <tbody>
                  {costCenters.map((cc) => (
                    <tr key={cc.id}>
                      <td className="font-mono">{cc.code}</td>
                      <td>{cc.name}</td>
                      <td className="text-sm text-base-content/70">{cc.description || '-'}</td>
                      <td className="text-right font-mono">
                        {cc.budgetAmount ? formatCurrency(cc.budgetAmount) : '-'}
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
