/**
 * Attendance Gauge
 * Circular gauge showing current attendance rate vs target
 */

import { useTranslation } from 'react-i18next';

interface AttendanceGaugeProps {
  value: number;
  target?: number;
  size?: number;
  label?: string;
  showTrend?: boolean;
  trend?: number;
}

function getGaugeColor(value: number, target: number): string {
  const ratio = value / target;
  if (ratio >= 1) return 'var(--success)';
  if (ratio >= 0.85) return 'var(--warning)';
  return 'var(--danger)';
}

export function AttendanceGauge({
  value,
  target = 80,
  size = 160,
  label,
  showTrend = false,
  trend = 0,
}: AttendanceGaugeProps) {
  const { t } = useTranslation();

  const strokeWidth = size * 0.1;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const percentage = Math.min(value / 100, 1);
  const strokeDashoffset = circumference - percentage * circumference;
  const color = getGaugeColor(value, target);

  // Target indicator position
  const targetPercentage = Math.min(target / 100, 1);
  const targetAngle = (targetPercentage * 360) - 90; // Start from top
  const targetRadians = (targetAngle * Math.PI) / 180;
  const targetX = size / 2 + (radius + strokeWidth / 2) * Math.cos(targetRadians);
  const targetY = size / 2 + (radius + strokeWidth / 2) * Math.sin(targetRadians);

  return (
    <div style={{ textAlign: 'center' }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ transform: 'rotate(-90deg)' }}
      >
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--border)"
          strokeWidth={strokeWidth}
        />

        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.5s ease, stroke 0.3s ease' }}
        />

        {/* Target indicator (small circle) */}
        <circle
          cx={targetX}
          cy={targetY}
          r={4}
          fill="var(--text-muted)"
          style={{ transform: 'rotate(90deg)', transformOrigin: `${size / 2}px ${size / 2}px` }}
        />
      </svg>

      {/* Center text */}
      <div
        style={{
          position: 'relative',
          marginTop: -size * 0.65,
          fontSize: size * 0.2,
          fontWeight: 'bold',
          color,
        }}
      >
        {Math.round(value)}%
      </div>

      {/* Trend indicator */}
      {showTrend && trend !== 0 && (
        <div
          style={{
            fontSize: size * 0.1,
            color: trend > 0 ? 'var(--success)' : 'var(--danger)',
            marginTop: size * 0.02,
          }}
        >
          {trend > 0 ? '+' : ''}{trend.toFixed(1)}%
        </div>
      )}

      {/* Label */}
      {label && (
        <div
          style={{
            fontSize: size * 0.085,
            color: 'var(--text-muted)',
            marginTop: size * 0.1,
          }}
        >
          {label}
        </div>
      )}

      {/* Target label */}
      <div
        style={{
          fontSize: size * 0.07,
          color: 'var(--text-muted)',
          marginTop: size * 0.03,
        }}
      >
        {t('attendanceAnalytics.target', 'Doel')}: {target}%
      </div>
    </div>
  );
}

export default AttendanceGauge;
