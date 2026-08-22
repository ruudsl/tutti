import { useTranslation } from 'react-i18next';
import { Modal } from '../../components/Modal';
import { Icon } from '../../components/Icon';
import type { AttendancePrediction } from '../../api/concerts';

/** De opkomstvoorspelling voor één concert. */
export function AttendancePredictionModal({
  loadingPrediction,
  predictionData,
  closePredictionModal,
}: {
  loadingPrediction: boolean;
  predictionData: AttendancePrediction | null;
  closePredictionModal: () => void;
}) {
  const { t } = useTranslation();

  return (
    <Modal title={t('concerts.prediction.title')} onClose={closePredictionModal} size="large">
      {loadingPrediction ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
          <span className="loading loading-spinner loading-lg" />
        </div>
      ) : predictionData ? (
        <div>
          {/* Summary stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
            <div className="card">
              <div className="card-body" style={{ textAlign: 'center', padding: '1rem' }}>
                <div style={{ fontSize: '1.75rem', fontWeight: 'bold', color: 'var(--primary)' }}>
                  {predictionData.prediction.expectedAttendance}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>
                  {t('concerts.prediction.expected')}
                </div>
              </div>
            </div>
            <div className="card">
              <div className="card-body" style={{ textAlign: 'center', padding: '1rem' }}>
                <div style={{ fontSize: '1.75rem', fontWeight: 'bold', color: 'var(--success)' }}>
                  {predictionData.prediction.confidenceBreakdown.highConfidenceYes}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>
                  {t('concerts.prediction.likelyYes')}
                </div>
              </div>
            </div>
            <div className="card">
              <div className="card-body" style={{ textAlign: 'center', padding: '1rem' }}>
                <div style={{ fontSize: '1.75rem', fontWeight: 'bold', color: 'var(--warning, orange)' }}>
                  {predictionData.prediction.confidenceBreakdown.uncertain}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>
                  {t('concerts.prediction.uncertain')}
                </div>
              </div>
            </div>
            <div className="card">
              <div className="card-body" style={{ textAlign: 'center', padding: '1rem' }}>
                <div style={{ fontSize: '1.75rem', fontWeight: 'bold', color: 'var(--danger)' }}>
                  {predictionData.prediction.confidenceBreakdown.highConfidenceNo}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>
                  {t('concerts.prediction.likelyNo')}
                </div>
              </div>
            </div>
          </div>

          {/* By instrument */}
          <h4 style={{ marginBottom: '0.75rem' }}>{t('concerts.prediction.byInstrument')}</h4>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
              gap: '0.5rem',
              marginBottom: '1.5rem',
            }}
          >
            {predictionData.prediction.byInstrument.map((inst) => (
              <div
                key={inst.instrument}
                style={{ padding: '0.5rem', background: 'var(--background)', borderRadius: 'var(--radius-sm)' }}
              >
                <div style={{ fontWeight: '500', fontSize: '0.875rem' }}>{inst.instrument}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>
                  {inst.expected.toFixed(1)} / {inst.total} {t('concerts.prediction.expected').toLowerCase()}
                </div>
              </div>
            ))}
          </div>

          {/* Member predictions */}
          <h4 style={{ marginBottom: '0.75rem' }}>{t('concerts.prediction.memberPredictions')}</h4>
          <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>{t('common.name')}</th>
                  <th>{t('concerts.instrument')}</th>
                  <th style={{ textAlign: 'center' }}>{t('concerts.prediction.probability')}</th>
                  <th style={{ textAlign: 'center' }}>{t('concerts.prediction.history')}</th>
                </tr>
              </thead>
              <tbody>
                {predictionData.members.map((member) => {
                  const probability = Math.round(member.attendanceProbability * 100);
                  const probabilityColor =
                    probability >= 80
                      ? 'var(--success)'
                      : probability <= 20
                        ? 'var(--danger)'
                        : 'var(--warning, orange)';
                  return (
                    <tr key={member.memberId}>
                      <td>{member.memberName}</td>
                      <td>{member.instrument || '-'}</td>
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                          <div
                            style={{
                              width: '50px',
                              height: '6px',
                              background: 'var(--border)',
                              borderRadius: '3px',
                              overflow: 'hidden',
                            }}
                          >
                            <div style={{ width: `${probability}%`, height: '100%', background: probabilityColor }} />
                          </div>
                          <span style={{ fontSize: '0.875rem', fontWeight: '500', color: probabilityColor }}>
                            {probability}%
                          </span>
                        </div>
                      </td>
                      <td style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-light)' }}>
                        {member.attendedConcerts} / {member.totalConcerts}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div
            style={{
              marginTop: '1rem',
              padding: '0.75rem',
              background: 'var(--background)',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.75rem',
              color: 'var(--text-light)',
            }}
          >
            <Icon name="info" size={14} style={{ marginRight: '0.5rem' }} />
            {t('concerts.prediction.disclaimer')}
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
