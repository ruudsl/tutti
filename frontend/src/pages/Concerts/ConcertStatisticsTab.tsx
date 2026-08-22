import { useTranslation } from 'react-i18next';
import type { ConcertStatistics } from '../../types';
import { Icon } from '../../components/Icon';
import { SkeletonTable } from '../../components/Skeleton';

/**
 * Het statistiektabblad, met de knop naar de Buma/Stemra-export.
 *
 * Het tabblad tekent zelf zijn drie toestanden. Eerder hing het aan
 * `activeTab === 'statistics' && statistics` in de hoofdcomponent: mislukte de
 * aanroep, dan stond het tabblad wél open maar volkomen leeg - geen melding,
 * geen laadindicator, niets waaraan te zien was of het aan het laden was, of
 * kapot. Dat is nu opgesplitst, net als op de modulepagina.
 */
export function ConcertStatisticsTab({
  statistics,
  isLoading,
  isError,
  refetch,
  setShowBumaStemraModal,
}: {
  statistics: ConcertStatistics | undefined;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
  setShowBumaStemraModal: (open: boolean) => void;
}) {
  const { t } = useTranslation();

  if (isError) {
    return (
      <div className="card">
        <div className="card-body">
          <div className="alert alert-danger">
            <Icon name="warning" /> {t('concerts.statisticsError')}
          </div>
          <button className="btn btn-secondary" onClick={() => refetch()}>
            <Icon name="refresh" /> {t('common.retry')}
          </button>
        </div>
      </div>
    );
  }

  // Nog onderweg, of binnen zonder inhoud: in beide gevallen valt er nog niets
  // te tonen, maar de gebruiker hoort te zien dát er iets gebeurt.
  if (isLoading || !statistics) {
    return (
      <div className="card">
        <div className="card-body">
          <SkeletonTable rows={5} columns={3} />
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-body">
        <div className="page-header">
          <h3 style={{ margin: 0 }}>{t('concerts.statistics')}</h3>
          <button className="btn btn-outline" onClick={() => setShowBumaStemraModal(true)}>
            {t('concerts.bumaStemraExport')}
          </button>
        </div>
        <div className="flex gap-3 mb-3">
          <div className="card" style={{ flex: 1, padding: '1rem', textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>{statistics.totalConcerts}</div>
            <div>{t('concerts.totalConcerts')}</div>
          </div>
        </div>

        <h4>{t('concerts.mostPlayedPieces')}</h4>
        {statistics.mostPlayedPieces.length > 0 ? (
          <table className="table">
            <thead>
              <tr>
                <th>{t('myMusic.table.title')}</th>
                <th>{t('concerts.timesPlayed', { count: 0 }).replace('0x', '#')}</th>
                <th>{t('concerts.lastPlayed')}</th>
              </tr>
            </thead>
            <tbody>
              {statistics.mostPlayedPieces.slice(0, 10).map((piece, i) => (
                <tr key={i}>
                  <td>
                    <strong>{piece.title}</strong>
                  </td>
                  <td>
                    <span className="badge badge-primary">{piece.playCount}x</span>
                  </td>
                  <td>{piece.lastPlayed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p style={{ color: 'var(--text-muted)' }}>Geen data.</p>
        )}
      </div>
    </div>
  );
}
