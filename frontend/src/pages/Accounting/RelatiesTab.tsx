import { useTranslation } from 'react-i18next';
import type { AccountingRelation } from '../../api/accounting';
import { Icon } from '../../components/Icon';
import { SkeletonTable } from '../../components/Skeleton';
import { formatCurrency } from './formatteer';

export function RelatiesTab({
  relations,
  loadingRelations,
  setShowRelationModal,
}: {
  relations: AccountingRelation[];
  loadingRelations: boolean;
  setShowRelationModal: (open: boolean) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <div className="page-header">
        <h2 className="text-xl font-semibold">{t('accounting.relations')}</h2>
        <button className="btn btn-primary gap-2" onClick={() => setShowRelationModal(true)}>
          <Icon name="plus" size={16} />
          {t('accounting.newRelation')}
        </button>
      </div>

      {loadingRelations ? (
        <SkeletonTable rows={10} columns={5} />
      ) : relations.length === 0 ? (
        <div className="card bg-base-200 p-8 text-center">
          <Icon name="users" size={48} className="mx-auto opacity-50 mb-4" />
          <p className="text-base-content/70">{t('accounting.noRelations')}</p>
        </div>
      ) : (
        <div className="card bg-base-100 shadow-md">
          <div className="card-body">
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('accounting.relationNumber')}</th>
                    <th>{t('common.name')}</th>
                    <th>{t('accounting.type')}</th>
                    <th>{t('common.email')}</th>
                    <th className="text-right">{t('accounting.balance')}</th>
                  </tr>
                </thead>
                <tbody>
                  {relations.map((rel) => (
                    <tr key={rel.id}>
                      <td className="font-mono">{rel.relationNumber || '-'}</td>
                      <td>{rel.name}</td>
                      <td>
                        <span
                          className={`badge badge-sm ${
                            rel.relationType === 'customer'
                              ? 'badge-success'
                              : rel.relationType === 'supplier'
                                ? 'badge-warning'
                                : 'badge-info'
                          }`}
                        >
                          {t(`accounting.relationTypes.${rel.relationType}`)}
                        </span>
                      </td>
                      <td className="text-sm">{rel.email || '-'}</td>
                      <td className={`text-right font-mono ${rel.balance >= 0 ? 'text-success' : 'text-error'}`}>
                        {formatCurrency(rel.balance)}
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
