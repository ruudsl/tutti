import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

interface DailyPrediction {
  date: string;
  predictedSales: number;
  actualSales?: number;
}

interface SalesPrediction {
  predictedTotalSales: number;
  predictedRevenue: number;
  confidenceLevel: 'low' | 'medium' | 'high';
  factors: string[];
  dailyPredictions: DailyPrediction[];
}

interface SalesPredictionChartProps {
  prediction: SalesPrediction;
  currentSales: number;
  currentRevenue: number;
}

export function SalesPredictionChart({ prediction, currentSales, currentRevenue }: SalesPredictionChartProps) {
  const { t } = useTranslation();

  const confidenceColors = {
    low: { bg: 'rgba(239, 68, 68, 0.1)', text: '#ef4444', border: '#ef4444' },
    medium: { bg: 'rgba(234, 179, 8, 0.1)', text: '#eab308', border: '#eab308' },
    high: { bg: 'rgba(34, 197, 94, 0.1)', text: '#22c55e', border: '#22c55e' },
  };

  const colors = confidenceColors[prediction.confidenceLevel];

  const chartData = useMemo(() => {
    const maxValue = Math.max(
      ...prediction.dailyPredictions.map((d) => Math.max(d.predictedSales, d.actualSales || 0)),
      1,
    );
    return prediction.dailyPredictions.map((d) => ({
      ...d,
      predictedHeight: (d.predictedSales / maxValue) * 100,
      actualHeight: ((d.actualSales || 0) / maxValue) * 100,
    }));
  }, [prediction.dailyPredictions]);

  const progressPercentage = Math.min(100, (currentSales / prediction.predictedTotalSales) * 100);

  return (
    <div className="sales-prediction-chart card">
      <div className="card-body">
        <div className="flex justify-between items-center mb-4">
          <h4>{t('predictions.title')}</h4>
          <span
            className="confidence-badge"
            style={{
              background: colors.bg,
              color: colors.text,
              border: `1px solid ${colors.border}`,
            }}
          >
            {t(`predictions.confidence.${prediction.confidenceLevel}`)}
          </span>
        </div>

        {/* Summary stats */}
        <div className="prediction-stats grid grid-cols-2 gap-4 mb-6">
          <div className="stat-box">
            <div className="stat-label">{t('predictions.predictedSales')}</div>
            <div className="stat-value">{prediction.predictedTotalSales}</div>
            <div className="stat-comparison">
              {t('predictions.current')}: {currentSales}
            </div>
          </div>
          <div className="stat-box">
            <div className="stat-label">{t('predictions.predictedRevenue')}</div>
            <div className="stat-value">EUR {prediction.predictedRevenue.toLocaleString()}</div>
            <div className="stat-comparison">
              {t('predictions.current')}: EUR {currentRevenue.toLocaleString()}
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="progress-section mb-6">
          <div className="flex justify-between text-sm mb-1">
            <span>{t('predictions.progress')}</span>
            <span>{progressPercentage.toFixed(0)}%</span>
          </div>
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{
                width: `${progressPercentage}%`,
                background: colors.border,
              }}
            />
          </div>
        </div>

        {/* Chart */}
        <div className="chart-container mb-6">
          <div className="chart-title text-sm text-muted mb-2">{t('predictions.dailyForecast')}</div>
          <div className="chart">
            {chartData.map((day, index) => (
              <div key={index} className="chart-bar-group">
                <div className="bars">
                  <div
                    className="bar predicted"
                    style={{ height: `${day.predictedHeight}%` }}
                    title={`${t('predictions.predicted')}: ${day.predictedSales}`}
                  />
                  {day.actualSales !== undefined && (
                    <div
                      className="bar actual"
                      style={{ height: `${day.actualHeight}%` }}
                      title={`${t('predictions.actual')}: ${day.actualSales}`}
                    />
                  )}
                </div>
                <div className="bar-label">
                  {new Date(day.date).toLocaleDateString(undefined, {
                    day: 'numeric',
                    month: 'short',
                  })}
                </div>
              </div>
            ))}
          </div>
          <div className="chart-legend">
            <span className="legend-item">
              <span className="legend-color predicted" />
              {t('predictions.predicted')}
            </span>
            <span className="legend-item">
              <span className="legend-color actual" />
              {t('predictions.actual')}
            </span>
          </div>
        </div>

        {/* Factors */}
        {prediction.factors.length > 0 && (
          <div className="factors-section">
            <div className="factors-title text-sm font-medium mb-2">{t('predictions.keyFactors')}</div>
            <ul className="factors-list">
              {prediction.factors.map((factor, index) => (
                <li key={index}>{factor}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <style>{`
                .sales-prediction-chart {
                    overflow: hidden;
                }
                .confidence-badge {
                    padding: 0.25rem 0.75rem;
                    border-radius: 9999px;
                    font-size: 0.75rem;
                    font-weight: 500;
                }
                .prediction-stats {
                    display: grid;
                }
                .stat-box {
                    background: var(--background);
                    padding: 1rem;
                    border-radius: 0.5rem;
                }
                .stat-label {
                    font-size: 0.75rem;
                    color: var(--text-light);
                    margin-bottom: 0.25rem;
                }
                .stat-value {
                    font-size: 1.5rem;
                    font-weight: 700;
                }
                .stat-comparison {
                    font-size: 0.75rem;
                    color: var(--text-light);
                    margin-top: 0.25rem;
                }
                .progress-bar {
                    height: 8px;
                    background: var(--border);
                    border-radius: 4px;
                    overflow: hidden;
                }
                .progress-fill {
                    height: 100%;
                    border-radius: 4px;
                    transition: width 0.3s ease;
                }
                .chart {
                    display: flex;
                    gap: 4px;
                    height: 120px;
                    align-items: flex-end;
                }
                .chart-bar-group {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                }
                .bars {
                    display: flex;
                    gap: 2px;
                    height: 100px;
                    align-items: flex-end;
                }
                .bar {
                    width: 12px;
                    border-radius: 2px 2px 0 0;
                    transition: height 0.3s ease;
                }
                .bar.predicted {
                    background: var(--primary);
                    opacity: 0.5;
                }
                .bar.actual {
                    background: var(--primary);
                }
                .bar-label {
                    font-size: 0.625rem;
                    color: var(--text-light);
                    margin-top: 4px;
                    white-space: nowrap;
                }
                .chart-legend {
                    display: flex;
                    gap: 1rem;
                    justify-content: center;
                    margin-top: 0.5rem;
                }
                .legend-item {
                    display: flex;
                    align-items: center;
                    gap: 0.25rem;
                    font-size: 0.75rem;
                    color: var(--text-light);
                }
                .legend-color {
                    width: 12px;
                    height: 12px;
                    border-radius: 2px;
                }
                .legend-color.predicted {
                    background: var(--primary);
                    opacity: 0.5;
                }
                .legend-color.actual {
                    background: var(--primary);
                }
                .factors-section {
                    background: var(--background);
                    padding: 1rem;
                    border-radius: 0.5rem;
                }
                .factors-list {
                    margin: 0;
                    padding-left: 1.25rem;
                    font-size: 0.875rem;
                    color: var(--text-light);
                }
                .factors-list li {
                    margin-bottom: 0.25rem;
                }
            `}</style>
    </div>
  );
}

export default SalesPredictionChart;
