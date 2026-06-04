/**
 * Attendance Analytics Dashboard
 * Comprehensive dashboard showing attendance trends, predictions, and at-risk members
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useOrchestras } from '../hooks/useOrchestras';
import {
  useAttendanceOverview,
  useAttendanceTrends,
  useAttendanceBySection,
  useAtRiskMembers,
  useAttendancePredictions,
  useAttendanceByDayOfWeek,
  useAttendanceLeaderboard,
} from '../hooks/useAttendanceAnalytics';
import { SkeletonTable } from '../components/Skeleton';
import { Icon } from '../components/Icon';
import {
  AttendanceLineChart,
  SectionBarChart,
  AttendanceGauge,
  DayOfWeekHeatmap,
} from '../components/charts';

export default function AttendanceAnalytics() {
  const { t } = useTranslation();
  useDocumentTitle('pageTitle.attendanceAnalytics');

  const [orchestraId, setOrchestraId] = useState<string>('');
  const [showLeaderboard, setShowLeaderboard] = useState(false);

  // Fetch orchestras for filter
  const { data: orchestras = [] } = useOrchestras();

  // Fetch analytics data
  const { data: overview, isLoading: overviewLoading } = useAttendanceOverview(orchestraId || undefined);
  const { data: trends = [], isLoading: trendsLoading } = useAttendanceTrends(12, orchestraId || undefined);
  const { data: sections = [], isLoading: sectionsLoading } = useAttendanceBySection(orchestraId || undefined);
  const { data: atRisk = [], isLoading: atRiskLoading } = useAtRiskMembers(orchestraId || undefined);
  const { data: predictions = [], isLoading: predictionsLoading } = useAttendancePredictions(5, orchestraId || undefined);
  const { data: dayStats = [], isLoading: dayStatsLoading } = useAttendanceByDayOfWeek(orchestraId || undefined);
  const { data: leaderboard = [], isLoading: leaderboardLoading } = useAttendanceLeaderboard(10, orchestraId || undefined);

  const isLoading = overviewLoading || trendsLoading;

  // Find best section
  const bestSection = sections.length > 0
    ? sections.reduce((best, current) => current.attendanceRate > best.attendanceRate ? current : best, sections[0])
    : null;

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('nl-NL', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
  };

  const getDayName = (dayOfWeek: number) => {
    const days = [
      t('days.sunday', 'Zondag'),
      t('days.monday', 'Maandag'),
      t('days.tuesday', 'Dinsdag'),
      t('days.wednesday', 'Woensdag'),
      t('days.thursday', 'Donderdag'),
      t('days.friday', 'Vrijdag'),
      t('days.saturday', 'Zaterdag'),
    ];
    return days[dayOfWeek];
  };

  const getRiskColor = (level: 'high' | 'medium' | 'low') => {
    switch (level) {
      case 'high': return 'var(--danger)';
      case 'medium': return 'var(--warning)';
      case 'low': return 'var(--info)';
    }
  };

  const getRiskBadgeClass = (level: 'high' | 'medium' | 'low') => {
    switch (level) {
      case 'high': return 'badge badge-danger';
      case 'medium': return 'badge badge-warning';
      case 'low': return 'badge badge-info';
    }
  };

  if (isLoading) {
    return (
      <div>
        <h1>{t('attendanceAnalytics.title', 'Aanwezigheidsanalyse')}</h1>
        <SkeletonTable rows={5} columns={4} />
      </div>
    );
  }

  return (
    <div className="attendance-analytics">
      {/* Header with filter */}
      <div className="flex justify-between items-center mb-3" style={{ flexWrap: 'wrap', gap: '1rem' }}>
        <h1 style={{ margin: 0 }}>{t('attendanceAnalytics.title', 'Aanwezigheidsanalyse')}</h1>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <label htmlFor="orchestra-filter" className="sr-only">
            {t('common.orchestra', 'Orkest')}
          </label>
          <select
            id="orchestra-filter"
            className="form-control form-select"
            value={orchestraId}
            onChange={(e) => setOrchestraId(e.target.value)}
            style={{ maxWidth: '200px' }}
          >
            <option value="">{t('common.allOrchestras', 'Alle orkesten')}</option>
            {orchestras.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="stat-card-grid mb-3">
        <div className="card">
          <div className="card-body stat-inline">
            <div
              className="stat-number"
              style={{
                color: (overview?.avgAttendanceRate || 0) >= 80 ? 'var(--success)' : (overview?.avgAttendanceRate || 0) >= 60 ? 'var(--warning)' : 'var(--danger)',
              }}
            >
              {overview?.avgAttendanceRate?.toFixed(1) || 0}%
              {overview && overview.trend !== 0 && (
                <span
                  style={{
                    fontSize: '0.5em',
                    marginLeft: '0.5rem',
                    color: overview.trend > 0 ? 'var(--success)' : 'var(--danger)',
                  }}
                >
                  {overview.trend > 0 ? '+' : ''}{overview.trend.toFixed(1)}%
                </span>
              )}
            </div>
            <div className="stat-label">{t('attendanceAnalytics.avgAttendance', 'Gem. opkomst')}</div>
          </div>
        </div>
        <div className="card">
          <div className="card-body stat-inline">
            <div className="stat-number" style={{ color: 'var(--info)' }}>
              {overview?.totalRehearsals || 0}
            </div>
            <div className="stat-label">{t('attendanceAnalytics.totalRehearsals', 'Repetities (6 mnd)')}</div>
          </div>
        </div>
        <div className="card">
          <div className="card-body stat-inline">
            <div className="stat-number" style={{ color: 'var(--primary)' }}>
              {bestSection?.instrument || '-'}
            </div>
            <div className="stat-label">
              {t('attendanceAnalytics.mostReliableSection', 'Betrouwbaarste sectie')}
              {bestSection && ` (${bestSection.attendanceRate.toFixed(0)}%)`}
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-body stat-inline">
            <div className="stat-number" style={{ color: 'var(--success)' }}>
              {overview?.totalMembers || 0}
            </div>
            <div className="stat-label">{t('attendanceAnalytics.activeMembers', 'Actieve leden')}</div>
          </div>
        </div>
      </div>

      {/* Main charts row */}
      <div className="grid grid-2 gap-3 mb-3">
        {/* Attendance Trend Line Chart */}
        <div className="card">
          <div className="card-body">
            <h4 style={{ marginBottom: '1rem' }}>
              <Icon name="trendingUp" size={18} style={{ marginRight: '0.5rem' }} />
              {t('attendanceAnalytics.trendOverTime', 'Opkomsttrend')}
            </h4>
            {trendsLoading ? (
              <SkeletonTable rows={3} columns={1} />
            ) : (
              <AttendanceLineChart data={trends} height={280} />
            )}
          </div>
        </div>

        {/* Section Bar Chart */}
        <div className="card">
          <div className="card-body">
            <h4 style={{ marginBottom: '1rem' }}>
              <Icon name="barChart" size={18} style={{ marginRight: '0.5rem' }} />
              {t('attendanceAnalytics.bySection', 'Per sectie')}
            </h4>
            {sectionsLoading ? (
              <SkeletonTable rows={3} columns={1} />
            ) : (
              <SectionBarChart data={sections} height={280} />
            )}
          </div>
        </div>
      </div>

      {/* Secondary row: Gauge, Heatmap, At-Risk */}
      <div className="grid grid-3 gap-3 mb-3">
        {/* Current Month Gauge */}
        <div className="card">
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <h4 style={{ marginBottom: '1rem', alignSelf: 'flex-start' }}>
              <Icon name="target" size={18} style={{ marginRight: '0.5rem' }} />
              {t('attendanceAnalytics.currentMonth', 'Deze maand')}
            </h4>
            <AttendanceGauge
              value={overview?.currentMonthRate || 0}
              target={80}
              showTrend
              trend={overview?.trend || 0}
              label={t('attendanceAnalytics.currentMonthRate', 'Huidige opkomst')}
            />
          </div>
        </div>

        {/* Day of Week Heatmap */}
        <div className="card">
          <div className="card-body">
            <h4 style={{ marginBottom: '1rem' }}>
              <Icon name="calendar" size={18} style={{ marginRight: '0.5rem' }} />
              {t('attendanceAnalytics.byDayOfWeek', 'Per weekdag')}
            </h4>
            {dayStatsLoading ? (
              <SkeletonTable rows={1} columns={7} />
            ) : (
              <DayOfWeekHeatmap data={dayStats} />
            )}
          </div>
        </div>

        {/* At-Risk Members */}
        <div className="card">
          <div className="card-body">
            <h4 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Icon name="alertTriangle" size={18} style={{ color: 'var(--warning)' }} />
              {t('attendanceAnalytics.atRiskMembers', 'Aandachtspunten')}
            </h4>
            {atRiskLoading ? (
              <SkeletonTable rows={3} columns={2} />
            ) : atRisk.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '1rem' }}>
                {t('attendanceAnalytics.noAtRiskMembers', 'Geen leden met dalende opkomst!')}
              </p>
            ) : (
              <div style={{ maxHeight: '240px', overflowY: 'auto' }}>
                {atRisk.slice(0, 5).map((member) => (
                  <div
                    key={member.id}
                    style={{
                      padding: '0.5rem 0',
                      borderBottom: '1px solid var(--border)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 500, fontSize: '0.875rem' }}>
                        {member.firstName} {member.lastName}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {member.recentRate.toFixed(0)}% (was {member.previousRate.toFixed(0)}%)
                      </div>
                    </div>
                    <span className={getRiskBadgeClass(member.riskLevel)}>
                      {member.trend > 0 ? '+' : ''}{member.trend.toFixed(0)}%
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom row: Predictions and Leaderboard */}
      <div className="grid grid-2 gap-3">
        {/* Upcoming Predictions */}
        <div className="card">
          <div className="card-body">
            <h4 style={{ marginBottom: '1rem' }}>
              <Icon name="clock" size={18} style={{ marginRight: '0.5rem' }} />
              {t('attendanceAnalytics.predictions', 'Voorspellingen')}
            </h4>
            {predictionsLoading ? (
              <SkeletonTable rows={3} columns={3} />
            ) : predictions.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '1rem' }}>
                {t('attendanceAnalytics.noUpcoming', 'Geen aankomende repetities')}
              </p>
            ) : (
              <div>
                <table className="table table-sm">
                  <thead>
                    <tr>
                      <th>{t('common.date', 'Datum')}</th>
                      <th style={{ textAlign: 'right' }}>{t('attendanceAnalytics.expected', 'Verwacht')}</th>
                      <th style={{ textAlign: 'center' }}>{t('attendanceAnalytics.alerts', 'Let op')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {predictions.map((pred) => (
                      <tr key={pred.rehearsalId}>
                        <td>
                          <div>{formatDate(pred.date)}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            {getDayName(pred.dayOfWeek)}
                          </div>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <strong>{pred.predictedCount}</strong>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '0.25rem' }}>
                            ({pred.predictedRate.toFixed(0)}%)
                          </span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {pred.understaffedSections.length > 0 ? (
                            <span
                              className="badge badge-warning"
                              title={pred.understaffedSections.map((s) => s.instrument).join(', ')}
                            >
                              {pred.understaffedSections.length} {t('attendanceAnalytics.understaffed', 'sectie(s)')}
                            </span>
                          ) : (
                            <Icon name="check" size={16} style={{ color: 'var(--success)' }} />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem', marginBottom: 0 }}>
                  {t('attendanceAnalytics.predictionNote', 'Gebaseerd op historische patronen per weekdag')}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Leaderboard */}
        <div className="card">
          <div className="card-body">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h4 style={{ margin: 0 }}>
                <Icon name="trophy" size={18} style={{ marginRight: '0.5rem', color: 'var(--warning)' }} />
                {t('attendanceAnalytics.leaderboard', 'Top leden')}
              </h4>
              <button
                className="btn btn-sm btn-outline"
                onClick={() => setShowLeaderboard(!showLeaderboard)}
              >
                {showLeaderboard ? t('common.hide', 'Verbergen') : t('common.show', 'Tonen')}
              </button>
            </div>
            {showLeaderboard && (
              leaderboardLoading ? (
                <SkeletonTable rows={5} columns={3} />
              ) : leaderboard.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '1rem' }}>
                  {t('attendanceAnalytics.noData', 'Geen data beschikbaar')}
                </p>
              ) : (
                <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                  {leaderboard.map((member, index) => (
                    <div
                      key={member.id}
                      style={{
                        padding: '0.5rem 0',
                        borderBottom: '1px solid var(--border)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                      }}
                    >
                      <span
                        style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '50%',
                          backgroundColor: index < 3 ? 'var(--warning)' : 'var(--border)',
                          color: index < 3 ? 'white' : 'var(--text-muted)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 'bold',
                          fontSize: '0.75rem',
                          flexShrink: 0,
                        }}
                      >
                        {member.rank}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 500, fontSize: '0.875rem' }}>
                          {member.firstName} {member.lastName}
                        </div>
                        {member.instrument && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            {member.instrument}
                          </div>
                        )}
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 'bold', color: 'var(--success)' }}>
                          {member.attendanceRate.toFixed(0)}%
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {member.presentCount}/{member.totalCount}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}
            {!showLeaderboard && (
              <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                {t('attendanceAnalytics.leaderboardHidden', 'Klik op "Tonen" om de ranglijst te bekijken')}
              </p>
            )}
          </div>
        </div>
      </div>

      <style>{`
        .attendance-analytics .stat-card-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 1rem;
        }
        .attendance-analytics .grid-3 {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 1rem;
        }
        @media (max-width: 1024px) {
          .attendance-analytics .grid-3 {
            grid-template-columns: 1fr;
          }
          .attendance-analytics .grid-2 {
            grid-template-columns: 1fr;
          }
        }
        @media (max-width: 768px) {
          .attendance-analytics .stat-card-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }
      `}</style>
    </div>
  );
}
