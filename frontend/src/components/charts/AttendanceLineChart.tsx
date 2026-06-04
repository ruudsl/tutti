/**
 * Attendance Line Chart
 * Shows attendance trends over time with a line chart
 */

import { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { useTranslation } from 'react-i18next';
import type { AttendanceTrend } from '../../api';

interface AttendanceLineChartProps {
  data: AttendanceTrend[];
  height?: number;
  showAttendees?: boolean;
}

export function AttendanceLineChart({
  data,
  height = 300,
  showAttendees = true,
}: AttendanceLineChartProps) {
  const { t } = useTranslation();

  const chartData = useMemo(() => {
    return data.map((item) => ({
      ...item,
      // Format month for display (e.g., "2024-01" -> "Jan '24")
      monthLabel: formatMonth(item.month),
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
      <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis
          dataKey="monthLabel"
          tick={{ fontSize: 12, fill: 'var(--text-muted)' }}
          axisLine={{ stroke: 'var(--border)' }}
          tickLine={{ stroke: 'var(--border)' }}
        />
        <YAxis
          yAxisId="left"
          domain={[0, 100]}
          tick={{ fontSize: 12, fill: 'var(--text-muted)' }}
          axisLine={{ stroke: 'var(--border)' }}
          tickLine={{ stroke: 'var(--border)' }}
          tickFormatter={(value) => `${value}%`}
        />
        {showAttendees && (
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fontSize: 12, fill: 'var(--text-muted)' }}
            axisLine={{ stroke: 'var(--border)' }}
            tickLine={{ stroke: 'var(--border)' }}
          />
        )}
        <Tooltip
          contentStyle={{
            backgroundColor: 'var(--card-bg)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            color: 'var(--text)',
          }}
          formatter={(value: number, name: string) => {
            if (name === 'attendanceRate') {
              return [`${value}%`, t('attendanceAnalytics.attendanceRate', 'Opkomst')];
            }
            return [value, t('attendanceAnalytics.uniqueAttendees', 'Unieke aanwezigen')];
          }}
          labelFormatter={(label) => label}
        />
        <Legend
          wrapperStyle={{ paddingTop: '10px' }}
          formatter={(value) => {
            if (value === 'attendanceRate') {
              return t('attendanceAnalytics.attendanceRate', 'Opkomst');
            }
            return t('attendanceAnalytics.uniqueAttendees', 'Unieke aanwezigen');
          }}
        />
        <Line
          yAxisId="left"
          type="monotone"
          dataKey="attendanceRate"
          stroke="var(--primary)"
          strokeWidth={2}
          dot={{ fill: 'var(--primary)', strokeWidth: 2, r: 4 }}
          activeDot={{ r: 6, fill: 'var(--primary)' }}
        />
        {showAttendees && (
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="uniqueAttendees"
            stroke="var(--success)"
            strokeWidth={2}
            dot={{ fill: 'var(--success)', strokeWidth: 2, r: 4 }}
            activeDot={{ r: 6, fill: 'var(--success)' }}
            strokeDasharray="5 5"
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}

function formatMonth(monthStr: string): string {
  const [year, month] = monthStr.split('-');
  const monthNames = ['Jan', 'Feb', 'Mrt', 'Apr', 'Mei', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'];
  const monthIndex = parseInt(month, 10) - 1;
  const shortYear = year.slice(-2);
  return `${monthNames[monthIndex]} '${shortYear}`;
}

export default AttendanceLineChart;
