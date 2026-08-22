import { useTranslation } from 'react-i18next';
import type { ConcertStatistics } from '../../types';

/** Het statistiektabblad, met de knop naar de Buma/Stemra-export. */
export function ConcertStatisticsTab({
  statistics,
  setShowBumaStemraModal,
}: {
  statistics: ConcertStatistics;
  setShowBumaStemraModal: (open: boolean) => void;
}) {
  const { t } = useTranslation();

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
