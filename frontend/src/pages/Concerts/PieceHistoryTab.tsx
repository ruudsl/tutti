import { useTranslation } from 'react-i18next';
import type { PieceHistory } from '../../types';

/**
 * Het tabblad "wanneer speelden we dit voor het laatst".
 *
 * `searchTitle` blijft in de hoofdcomponent staan omdat het daar de
 * `enabled`-voorwaarde van `usePieceHistory` is: zonder ingetypte titel wordt
 * er niets opgehaald.
 */
export function PieceHistoryTab({
  searchTitle,
  setSearchTitle,
  pieceHistoryData,
}: {
  searchTitle: string;
  setSearchTitle: (waarde: string) => void;
  pieceHistoryData: PieceHistory | undefined;
}) {
  const { t } = useTranslation();

  return (
    <div className="card">
      <div className="card-body">
        <h3 style={{ marginTop: 0 }}>{t('concerts.whenLastPlayed')}</h3>
        <div className="form-group">
          <input
            type="text"
            className="form-control"
            placeholder={t('concerts.searchPieceHistory')}
            value={searchTitle}
            onChange={(e) => setSearchTitle(e.target.value)}
            style={{ maxWidth: '400px' }}
          />
        </div>

        {searchTitle && pieceHistoryData && (
          <div>
            <h4>"{pieceHistoryData.title}"</h4>
            <p>
              {pieceHistoryData.playCount > 0 ? (
                <>
                  {t('concerts.timesPlayed', { count: pieceHistoryData.playCount })} -{t('concerts.lastPlayed')}:{' '}
                  {pieceHistoryData.lastPlayed}
                </>
              ) : (
                t('concerts.neverPlayed')
              )}
            </p>

            {pieceHistoryData.history.length > 0 && (
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('common.date')}</th>
                    <th>{t('concerts.concertName')}</th>
                    <th>{t('concerts.location')}</th>
                  </tr>
                </thead>
                <tbody>
                  {pieceHistoryData.history.map((h, i) => (
                    <tr key={i}>
                      <td>{h.date}</td>
                      <td>{h.concertName}</td>
                      <td>{h.location || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
