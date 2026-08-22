/** De opstellingskaart van het detailscherm. Letterlijk overgenomen uit Rehearsals.tsx. */

import { useTranslation } from 'react-i18next';
import SeatingChartVisualization from '../../components/SeatingChartVisualization';
import type { RehearsalDetail, RehearsalSeat } from '../../types';

export function SeatingCard({
  selectedRehearsal,
  seatingLoading,
  handleLoadSeating,
  handleGenerateSeating,
  showSeating,
  rehearsalSeating,
}: {
  selectedRehearsal: RehearsalDetail;
  seatingLoading: boolean;
  handleLoadSeating: (rehearsalId: string) => void;
  handleGenerateSeating: (rehearsalId: string) => void;
  showSeating: boolean;
  rehearsalSeating: RehearsalSeat[];
}) {
  const { t } = useTranslation();

  return (
    <div className="card mt-3">
      <div className="card-header">
        <h2 className="card-title">{t('seating.rehearsalSeating')}</h2>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            className="btn btn-outline btn-sm"
            onClick={() => handleLoadSeating(selectedRehearsal.id)}
            disabled={seatingLoading}
          >
            {seatingLoading ? t('common.loading') : t('seating.viewSeating')}
          </button>
          {selectedRehearsal.attendance.filter((a) => a.status === 'accepted').length > 0 && (
            <button
              className="btn btn-primary btn-sm"
              onClick={() => handleGenerateSeating(selectedRehearsal.id)}
              disabled={seatingLoading}
            >
              {t('seating.generateSeating')}
            </button>
          )}
        </div>
      </div>
      {showSeating && (
        <div className="card-body">
          {rehearsalSeating.length > 0 ? (
            <SeatingChartVisualization
              chart={{
                orchestraId: selectedRehearsal.orchestra_id || '',
                orchestraName: selectedRehearsal.orchestra_name || t('rehearsals.allOrchestras'),
                sections: [],
                seats: rehearsalSeating.map((s) => ({
                  id: s.id,
                  userId: s.userId,
                  memberName: s.memberName,
                  instrumentName: s.instrumentName,
                  rowNumber: s.rowNumber,
                  positionInRow: s.positionInRow,
                  sectionName: s.sectionName,
                })),
                totalRows: Math.max(...rehearsalSeating.map((s) => s.rowNumber), 0),
              }}
            />
          ) : (
            <p className="piece-meta">{t('seating.noAttendees')}</p>
          )}
        </div>
      )}
    </div>
  );
}
