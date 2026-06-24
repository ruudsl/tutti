/**
 * Day of Week Heatmap
 * Shows attendance patterns by day of week
 */

import { useTranslation } from 'react-i18next';
import type { RehearsalDayOfWeekStats } from '../../api/attendance-analytics';

interface DayOfWeekHeatmapProps {
  data: RehearsalDayOfWeekStats[];
}

function getHeatmapColor(rate: number): string {
  if (rate >= 85) return 'var(--success)';
  if (rate >= 70) return 'var(--warning)';
  if (rate > 0) return 'var(--danger)';
  return 'var(--border)';
}

function getHeatmapOpacity(rate: number, maxRate: number): number {
  if (rate === 0 || maxRate === 0) return 0.3;
  return 0.4 + (rate / maxRate) * 0.6;
}

export function DayOfWeekHeatmap({ data }: DayOfWeekHeatmapProps) {
  const { t } = useTranslation();

  const dayNames = [
    t('days.sunday', 'Zo'),
    t('days.monday', 'Ma'),
    t('days.tuesday', 'Di'),
    t('days.wednesday', 'Wo'),
    t('days.thursday', 'Do'),
    t('days.friday', 'Vr'),
    t('days.saturday', 'Za'),
  ];

  // Create a map for quick lookup
  const dataMap = new Map(data.map((d) => [d.dayOfWeek, d]));
  const maxRate = Math.max(...data.map((d) => d.attendanceRate), 1);

  // Generate all 7 days with data or defaults
  const allDays = dayNames.map((name, index) => {
    const dayData = dataMap.get(index);
    return {
      dayOfWeek: index,
      name,
      attendanceRate: dayData?.attendanceRate || 0,
      rehearsalCount: dayData?.rehearsalCount || 0,
    };
  });

  return (
    <div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: '8px',
        }}
      >
        {allDays.map((day) => (
          <div
            key={day.dayOfWeek}
            style={{
              aspectRatio: '1',
              borderRadius: '8px',
              backgroundColor: getHeatmapColor(day.attendanceRate),
              opacity: getHeatmapOpacity(day.attendanceRate, maxRate),
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '8px',
              minHeight: '60px',
            }}
            title={`${day.name}: ${day.attendanceRate}% (${day.rehearsalCount} ${t('attendanceAnalytics.rehearsals', 'repetities')})`}
          >
            <div
              style={{
                fontWeight: 'bold',
                fontSize: '0.75rem',
                color: 'white',
                textShadow: '0 1px 2px rgba(0,0,0,0.3)',
              }}
            >
              {day.name}
            </div>
            {day.rehearsalCount > 0 && (
              <>
                <div
                  style={{
                    fontSize: '1.1rem',
                    fontWeight: 'bold',
                    color: 'white',
                    textShadow: '0 1px 2px rgba(0,0,0,0.3)',
                    marginTop: '4px',
                  }}
                >
                  {Math.round(day.attendanceRate)}%
                </div>
                <div
                  style={{
                    fontSize: '0.65rem',
                    color: 'rgba(255,255,255,0.8)',
                    textShadow: '0 1px 2px rgba(0,0,0,0.3)',
                  }}
                >
                  {day.rehearsalCount}x
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          gap: '16px',
          marginTop: '16px',
          fontSize: '0.75rem',
          color: 'var(--text-muted)',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span
            style={{
              width: '12px',
              height: '12px',
              borderRadius: '3px',
              backgroundColor: 'var(--success)',
            }}
          />
          {'>'}85%
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span
            style={{
              width: '12px',
              height: '12px',
              borderRadius: '3px',
              backgroundColor: 'var(--warning)',
            }}
          />
          70-85%
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span
            style={{
              width: '12px',
              height: '12px',
              borderRadius: '3px',
              backgroundColor: 'var(--danger)',
            }}
          />
          {'<'}70%
        </span>
      </div>
    </div>
  );
}

export default DayOfWeekHeatmap;
