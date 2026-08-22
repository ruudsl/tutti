import { useTranslation } from 'react-i18next';
import { currentLocale } from '../../utils/locale';
import type { Season, SeasonDetail as SeizoenMetEvenementen } from '../../api';
import { formatDate } from './formatteer';
import { SeizoenStatus } from './SeizoenStatus';

/**
 * De detailweergave van één seizoen: kop met status, notities, budget en de
 * lijst met geplande evenementen.
 *
 * Kwam letterlijk uit SeasonPlanner.tsx. Wat de hoofdcomponent daar
 * `selectedSeason` noemde heet hier `seizoen`, en de twee dingen die naar
 * buiten wijzen - terug naar het overzicht en de status omzetten - komen als
 * terugroep binnen. De ternaire keten die de volgende status bepaalt is
 * meeverhuisd zoals hij was.
 */
export function SeizoenDetail({
  seizoen,
  onTerug,
  onStatusWijzigen,
}: {
  seizoen: SeizoenMetEvenementen;
  onTerug: () => void;
  onStatusWijzigen: (status: Season['status']) => void;
}) {
  const { t } = useTranslation();

  return (
    <div>
      <button className="btn btn-outline mb-3" onClick={() => onTerug()}>
        &larr; {t('common.back')}
      </button>

      <div className="flex justify-between items-start mb-4">
        <div>
          <h1>{seizoen.name}</h1>
          <p className="piece-meta">
            {formatDate(seizoen.startDate)} - {formatDate(seizoen.endDate)} <SeizoenStatus status={seizoen.status} />
          </p>
        </div>
        <div className="flex gap-2">
          <button
            className="btn btn-outline"
            onClick={() =>
              onStatusWijzigen(
                seizoen.status === 'draft' ? 'active' : seizoen.status === 'active' ? 'completed' : 'draft',
              )
            }
          >
            {seizoen.status === 'draft'
              ? t('seasonPlanner.activate')
              : seizoen.status === 'active'
                ? t('seasonPlanner.complete')
                : t('seasonPlanner.reopen')}
          </button>
        </div>
      </div>

      {seizoen.notes && (
        <div className="card mb-3">
          <div className="card-body">
            <strong>{t('common.notes')}:</strong> {seizoen.notes}
          </div>
        </div>
      )}

      {/* Budget Summary */}
      {seizoen.budgetTotal && (
        <div className="card mb-3">
          <div className="card-header">
            <h2 className="card-title">{t('seasonPlanner.budget.title')}</h2>
          </div>
          <div className="card-body">
            <div className="flex gap-4">
              <div>
                <span className="piece-meta">{t('seasonPlanner.budget.total')}</span>
                <div className="text-lg font-bold">
                  {seizoen.budgetTotal.toLocaleString(currentLocale(), { style: 'currency', currency: 'EUR' })}
                </div>
              </div>
              <div>
                <span className="piece-meta">{t('seasonPlanner.budget.allocated')}</span>
                <div className="text-lg font-bold">
                  {seizoen.budgetAllocated.toLocaleString(currentLocale(), {
                    style: 'currency',
                    currency: 'EUR',
                  })}
                </div>
              </div>
              <div>
                <span className="piece-meta">{t('seasonPlanner.budget.remaining')}</span>
                <div
                  className="text-lg font-bold"
                  style={{
                    color: seizoen.budgetTotal - seizoen.budgetAllocated < 0 ? 'var(--danger)' : 'var(--success)',
                  }}
                >
                  {(seizoen.budgetTotal - seizoen.budgetAllocated).toLocaleString(currentLocale(), {
                    style: 'currency',
                    currency: 'EUR',
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Events */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">
            {t('seasonPlanner.events.title')} ({seizoen.events.length})
          </h2>
        </div>
        <div className="card-body flush">
          {seizoen.events.length > 0 ? (
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('common.date')}</th>
                  <th>{t('seasonPlanner.events.type')}</th>
                  <th>{t('common.name')}</th>
                  <th>{t('seasonPlanner.budget.amount')}</th>
                </tr>
              </thead>
              <tbody>
                {seizoen.events.map((event) => (
                  <tr key={event.id}>
                    <td>{formatDate(event.plannedDate)}</td>
                    <td>
                      <span
                        className={`badge badge-${event.eventType === 'concert' ? 'primary' : event.eventType === 'rehearsal' ? 'secondary' : 'outline'}`}
                      >
                        {t(`seasonPlanner.events.types.${event.eventType}`)}
                      </span>
                    </td>
                    <td>{event.eventName || '-'}</td>
                    <td>
                      {event.budgetAmount
                        ? event.budgetAmount.toLocaleString(currentLocale(), { style: 'currency', currency: 'EUR' })
                        : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="piece-meta p-4">{t('seasonPlanner.events.empty')}</p>
          )}
        </div>
      </div>
    </div>
  );
}
