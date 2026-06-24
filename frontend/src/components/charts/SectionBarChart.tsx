/**
 * Section Bar Chart
 * Shows attendance breakdown by instrument section
 */

import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { useTranslation } from 'react-i18next';
import type { RehearsalSectionAttendance } from '../../api/attendance-analytics';

interface SectionBarChartProps {
  data: RehearsalSectionAttendance[];
  height?: number;
}

function getBarColor(rate: number): string {
  if (rate >= 85) return 'var(--success)';
  if (rate >= 70) return 'var(--warning)';
  return 'var(--danger)';
}

export function SectionBarChart({ data, height = 300 }: SectionBarChartProps) {
  const { t } = useTranslation();

  const chartData = useMemo(() => {
    // Sort by attendance rate ascending (worst first) for impact visibility
    return [...data]
      .sort((a, b) => a.attendanceRate - b.attendanceRate)
      .map((item) => ({
        ...item,
        // Truncate long instrument names
        shortName: item.instrument.length > 12 ? item.instrument.slice(0, 10) + '...' : item.instrument,
      }));
  }, [data]);

  if (data.length === 0) {
    return (
      <div
        style={{
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-muted)',
        }}
      >
        {t('attendanceAnalytics.noData', 'Geen data beschikbaar')}
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 20, left: 80, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
        <XAxis
          type="number"
          domain={[0, 100]}
          tick={{ fontSize: 12, fill: 'var(--text-muted)' }}
          axisLine={{ stroke: 'var(--border)' }}
          tickLine={{ stroke: 'var(--border)' }}
          tickFormatter={(value) => `${value}%`}
        />
        <YAxis
          type="category"
          dataKey="shortName"
          tick={{ fontSize: 11, fill: 'var(--text)' }}
          axisLine={{ stroke: 'var(--border)' }}
          tickLine={false}
          width={75}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'var(--card-bg)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            color: 'var(--text)',
          }}
          formatter={(value) => [`${value}%`, t('attendanceAnalytics.attendanceRate', 'Opkomst')]}
          labelFormatter={(label, payload) => {
            if (payload && payload[0]) {
              const item = payload[0].payload as RehearsalSectionAttendance & { shortName: string };
              return `${item.instrument} (${item.memberCount} ${t('attendanceAnalytics.members', 'leden')})`;
            }
            return label;
          }}
        />
        <Bar dataKey="attendanceRate" radius={[0, 4, 4, 0]} maxBarSize={24}>
          {chartData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={getBarColor(entry.attendanceRate)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export default SectionBarChart;
