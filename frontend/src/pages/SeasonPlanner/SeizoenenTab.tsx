import { useTranslation } from 'react-i18next';
import { Icon } from '../../components/Icon';
import type { Season } from '../../api';
import { formatDate } from './formatteer';
import { SeizoenStatus } from './SeizoenStatus';

/**
 * Het tabblad met de seizoenen: een tabel, of een lege toestand met een knop
 * om het eerste seizoen aan te maken.
 *
 * Letterlijk uit SeasonPlanner.tsx overgenomen; de drie dingen die naar buiten
 * wijzen - een seizoen openen, een seizoen verwijderen en de wizard starten -
 * komen als terugroep binnen.
 */
export function SeizoenenTab({
  seasons,
  onSelecteer,
  onVerwijder,
  onStartWizard,
}: {
  seasons: Season[];
  onSelecteer: (id: string) => void;
  onVerwijder: (id: string) => void;
  onStartWizard: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="card">
      <div className="card-body flush">
        {seasons.length > 0 ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('common.name')}</th>
                <th>{t('seasonPlanner.fields.period')}</th>
                <th>{t('common.status')}</th>
                <th>{t('seasonPlanner.events.title')}</th>
                <th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {seasons.map((season) => (
                <tr key={season.id} onClick={() => onSelecteer(season.id)} style={{ cursor: 'pointer' }}>
                  <td>
                    <strong>{season.name}</strong>
                  </td>
                  <td>
                    {formatDate(season.startDate)} - {formatDate(season.endDate)}
                  </td>
                  <td>
                    <SeizoenStatus status={season.status} />
                  </td>
                  <td>
                    <span className="badge badge-secondary">
                      {season.rehearsalCount} {t('seasonPlanner.rehearsals')}
                    </span>{' '}
                    <span className="badge badge-primary">
                      {season.concertCount} {t('seasonPlanner.concerts')}
                    </span>
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <button
                      className="btn btn-outline btn-sm"
                      onClick={() => onVerwijder(season.id)}
                      style={{ color: 'var(--danger)' }}
                    >
                      <Icon name="trash" size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-4 text-center">
            <Icon name="calendar" size={48} style={{ opacity: 0.3, marginBottom: '1rem' }} />
            <p className="piece-meta">{t('seasonPlanner.empty')}</p>
            <button className="btn btn-primary mt-2" onClick={onStartWizard}>
              {t('seasonPlanner.createFirst')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
