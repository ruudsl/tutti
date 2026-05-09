import { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useDarkMode } from '../hooks/useDarkMode';
import { Icon } from './Icon';

export interface AttendanceMember {
  id: string;
  name: string;
  email?: string;
  instrument: string;
  section?: string;
  presentCount: number;
  absentCount: number;
  attendanceRate: number;
}

export interface RehearsalAttendance {
  id: string;
  date: string;
  totalMembers: number;
  presentCount: number;
  absentCount: number;
  attendanceRate: number;
}

export interface AttendanceTrend {
  date: string;
  attendanceRate: number;
  presentCount: number;
  totalMembers: number;
}

interface AttendanceDashboardProps {
  /** Member attendance data */
  members: AttendanceMember[];
  /** Rehearsal attendance data */
  rehearsals: RehearsalAttendance[];
  /** Attendance trends over time */
  trends: AttendanceTrend[];
  /** Available sections/instrument groups for filtering */
  sections?: string[];
  /** Callback when filters change */
  onFilterChange?: (filters: AttendanceFilters) => void;
  /** Callback to export data */
  onExport?: (format: 'csv' | 'pdf') => void;
  /** Loading state */
  isLoading?: boolean;
}

export interface AttendanceFilters {
  dateFrom: string;
  dateTo: string;
  section: string;
  sortBy: 'name' | 'rate' | 'present' | 'absent';
  sortOrder: 'asc' | 'desc';
}

function getDefaultFilters(): AttendanceFilters {
  const today = new Date();
  const threeMonthsAgo = new Date(today);
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

  return {
    dateFrom: threeMonthsAgo.toISOString().split('T')[0],
    dateTo: today.toISOString().split('T')[0],
    section: '',
    sortBy: 'name',
    sortOrder: 'asc',
  };
}

function AttendanceBadge({ rate, isDark }: { rate: number; isDark: boolean }) {
  let color: string;
  let bgColor: string;

  if (rate >= 80) {
    color = '#16a34a';
    bgColor = isDark ? 'rgba(22, 163, 74, 0.15)' : 'rgba(22, 163, 74, 0.1)';
  } else if (rate >= 50) {
    color = '#ca8a04';
    bgColor = isDark ? 'rgba(202, 138, 4, 0.15)' : 'rgba(202, 138, 4, 0.1)';
  } else {
    color = '#dc2626';
    bgColor = isDark ? 'rgba(220, 38, 38, 0.15)' : 'rgba(220, 38, 38, 0.1)';
  }

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '4px 10px',
        borderRadius: '12px',
        fontSize: '0.875rem',
        fontWeight: 600,
        color,
        backgroundColor: bgColor,
      }}
    >
      {rate.toFixed(0)}%
    </span>
  );
}

function TrendChart({ data, noDataText }: { data: AttendanceTrend[]; isDark: boolean; noDataText: string }) {
  if (data.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '200px',
          color: 'var(--text-muted)',
        }}
      >
        {noDataText}
      </div>
    );
  }

  const maxRate = 100;
  const chartHeight = 180;
  const chartWidth = '100%';
  const barWidth = 100 / Math.max(data.length, 1);

  return (
    <div style={{ width: chartWidth, height: chartHeight, position: 'relative' }}>
      {/* Y-axis labels */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 30,
          width: '40px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          fontSize: '0.75rem',
          color: 'var(--text-muted)',
        }}
      >
        <span>100%</span>
        <span>50%</span>
        <span>0%</span>
      </div>

      {/* Chart area */}
      <div
        style={{
          position: 'absolute',
          left: '45px',
          right: '10px',
          top: 0,
          bottom: '30px',
          display: 'flex',
          alignItems: 'flex-end',
          gap: '4px',
          borderLeft: '1px solid var(--border)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        {/* Grid lines */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: '50%',
            borderTop: '1px dashed var(--border)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: '20%',
            borderTop: '1px dashed var(--border)',
            opacity: 0.5,
          }}
        />

        {/* Bars */}
        {data.map((item) => {
          const height = (item.attendanceRate / maxRate) * 100;
          let barColor: string;
          if (item.attendanceRate >= 80) {
            barColor = '#16a34a';
          } else if (item.attendanceRate >= 50) {
            barColor = '#ca8a04';
          } else {
            barColor = '#dc2626';
          }

          return (
            <div
              key={item.date}
              style={{
                flex: 1,
                maxWidth: `${barWidth}%`,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                height: '100%',
                justifyContent: 'flex-end',
              }}
              title={`${new Date(item.date).toLocaleDateString('nl-NL')}: ${item.attendanceRate.toFixed(0)}% (${item.presentCount}/${item.totalMembers})`}
            >
              <div
                style={{
                  width: '100%',
                  maxWidth: '30px',
                  height: `${height}%`,
                  backgroundColor: barColor,
                  borderRadius: '4px 4px 0 0',
                  transition: 'height 0.3s ease',
                  minHeight: '4px',
                }}
              />
            </div>
          );
        })}
      </div>

      {/* X-axis labels */}
      <div
        style={{
          position: 'absolute',
          left: '45px',
          right: '10px',
          bottom: 0,
          height: '25px',
          display: 'flex',
          fontSize: '0.625rem',
          color: 'var(--text-muted)',
          overflow: 'hidden',
        }}
      >
        {data.length <= 12 ? (
          data.map((item) => (
            <div
              key={item.date}
              style={{
                flex: 1,
                textAlign: 'center',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {new Date(item.date).toLocaleDateString('nl-NL', { day: '2-digit', month: 'short' })}
            </div>
          ))
        ) : (
          <>
            <span style={{ flex: 1, textAlign: 'left' }}>
              {new Date(data[0].date).toLocaleDateString('nl-NL', { day: '2-digit', month: 'short' })}
            </span>
            <span style={{ flex: 1, textAlign: 'right' }}>
              {new Date(data[data.length - 1].date).toLocaleDateString('nl-NL', { day: '2-digit', month: 'short' })}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

export function AttendanceDashboard({
  members,
  rehearsals,
  trends,
  sections = [],
  onFilterChange,
  onExport,
  isLoading = false,
}: AttendanceDashboardProps) {
  const { t } = useTranslation();
  const { isDark } = useDarkMode();

  const [filters, setFilters] = useState<AttendanceFilters>(getDefaultFilters);
  const [showExportMenu, setShowExportMenu] = useState(false);

  const updateFilter = useCallback(<K extends keyof AttendanceFilters>(
    key: K,
    value: AttendanceFilters[K]
  ) => {
    setFilters((prev) => {
      const newFilters = { ...prev, [key]: value };
      onFilterChange?.(newFilters);
      return newFilters;
    });
  }, [onFilterChange]);

  const resetFilters = useCallback(() => {
    const defaults = getDefaultFilters();
    setFilters(defaults);
    onFilterChange?.(defaults);
  }, [onFilterChange]);

  // Filter and sort members
  const filteredMembers = useMemo(() => {
    let result = [...members];

    // Filter by section
    if (filters.section) {
      result = result.filter(m => m.section === filters.section || m.instrument === filters.section);
    }

    // Sort
    result.sort((a, b) => {
      let comparison = 0;
      switch (filters.sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'rate':
          comparison = a.attendanceRate - b.attendanceRate;
          break;
        case 'present':
          comparison = a.presentCount - b.presentCount;
          break;
        case 'absent':
          comparison = a.absentCount - b.absentCount;
          break;
      }
      return filters.sortOrder === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [members, filters]);

  // Calculate summary stats
  const summaryStats = useMemo(() => {
    if (members.length === 0) {
      return { avgRate: 0, highAttendance: 0, lowAttendance: 0 };
    }

    const totalRate = members.reduce((sum, m) => sum + m.attendanceRate, 0);
    const avgRate = totalRate / members.length;
    const highAttendance = members.filter(m => m.attendanceRate >= 80).length;
    const lowAttendance = members.filter(m => m.attendanceRate < 50).length;

    return { avgRate, highAttendance, lowAttendance };
  }, [members]);

  const handleExport = (format: 'csv' | 'pdf') => {
    setShowExportMenu(false);
    onExport?.(format);
  };

  return (
    <div className="attendance-dashboard">
      {/* Header */}
      <div className="attendance-header">
        <h2 className="attendance-title">
          <Icon name="users" size={24} />
          {t('attendanceDashboard.title')}
        </h2>
        <div className="attendance-header-actions">
          <div className="export-dropdown">
            <button
              className="btn btn-outline"
              onClick={() => setShowExportMenu(!showExportMenu)}
              type="button"
            >
              <Icon name="download" size={18} />
              {t('common.export')}
            </button>
            {showExportMenu && (
              <div className="export-menu">
                <button onClick={() => handleExport('csv')} type="button">
                  <Icon name="fileText" size={16} />
                  CSV
                </button>
                <button onClick={() => handleExport('pdf')} type="button">
                  <Icon name="fileText" size={16} />
                  PDF
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="attendance-summary">
        <div className="summary-card">
          <div className="summary-icon" style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)' }}>
            <Icon name="users" size={24} />
          </div>
          <div className="summary-content">
            <span className="summary-value">{members.length}</span>
            <span className="summary-label">Totaal leden</span>
          </div>
        </div>
        <div className="summary-card">
          <div className="summary-icon" style={{ backgroundColor: 'rgba(22, 163, 74, 0.1)' }}>
            <Icon name="check" size={24} />
          </div>
          <div className="summary-content">
            <span className="summary-value">{summaryStats.avgRate.toFixed(0)}%</span>
            <span className="summary-label">Gemiddelde aanwezigheid</span>
          </div>
        </div>
        <div className="summary-card">
          <div className="summary-icon" style={{ backgroundColor: 'rgba(22, 163, 74, 0.1)' }}>
            <Icon name="chart" size={24} />
          </div>
          <div className="summary-content">
            <span className="summary-value">{summaryStats.highAttendance}</span>
            <span className="summary-label">Hoge aanwezigheid (&gt;80%)</span>
          </div>
        </div>
        <div className="summary-card">
          <div className="summary-icon" style={{ backgroundColor: 'rgba(220, 38, 38, 0.1)' }}>
            <Icon name="warning" size={24} />
          </div>
          <div className="summary-content">
            <span className="summary-value">{summaryStats.lowAttendance}</span>
            <span className="summary-label">Lage aanwezigheid (&lt;50%)</span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="attendance-filters">
        <div className="filter-group">
          <label htmlFor="date-from">Van</label>
          <input
            id="date-from"
            type="date"
            value={filters.dateFrom}
            onChange={(e) => updateFilter('dateFrom', e.target.value)}
          />
        </div>
        <div className="filter-group">
          <label htmlFor="date-to">Tot</label>
          <input
            id="date-to"
            type="date"
            value={filters.dateTo}
            onChange={(e) => updateFilter('dateTo', e.target.value)}
          />
        </div>
        <div className="filter-group">
          <label htmlFor="section-filter">Sectie</label>
          <select
            id="section-filter"
            value={filters.section}
            onChange={(e) => updateFilter('section', e.target.value)}
          >
            <option value="">Alle secties</option>
            {sections.map((section) => (
              <option key={section} value={section}>
                {section}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <label htmlFor="sort-by">Sorteren op</label>
          <select
            id="sort-by"
            value={filters.sortBy}
            onChange={(e) => updateFilter('sortBy', e.target.value as AttendanceFilters['sortBy'])}
          >
            <option value="name">Naam</option>
            <option value="rate">Aanwezigheid %</option>
            <option value="present">Aanwezig</option>
            <option value="absent">Afwezig</option>
          </select>
        </div>
        <div className="filter-group">
          <label htmlFor="sort-order">Volgorde</label>
          <select
            id="sort-order"
            value={filters.sortOrder}
            onChange={(e) => updateFilter('sortOrder', e.target.value as 'asc' | 'desc')}
          >
            <option value="asc">Oplopend</option>
            <option value="desc">Aflopend</option>
          </select>
        </div>
        <button className="btn btn-text" onClick={resetFilters} type="button">
          <Icon name="refresh" size={16} />
          Reset
        </button>
      </div>

      {/* Trend chart */}
      <div className="attendance-trend-section">
        <h3 className="section-title">Aanwezigheid over tijd</h3>
        <div className="trend-chart-container">
          <TrendChart data={trends} isDark={isDark} />
        </div>
      </div>

      {/* Member table */}
      <div className="attendance-table-section">
        <h3 className="section-title">Ledenlijst ({filteredMembers.length})</h3>
        {isLoading ? (
          <div className="loading-state">
            <span>Laden...</span>
          </div>
        ) : filteredMembers.length === 0 ? (
          <div className="empty-state">
            <Icon name="users" size={48} />
            <p>Geen leden gevonden</p>
          </div>
        ) : (
          <div className="attendance-table-wrapper">
            <table className="attendance-table">
              <thead>
                <tr>
                  <th>Naam</th>
                  <th>Instrument</th>
                  <th>Aanwezig</th>
                  <th>Afwezig</th>
                  <th>Percentage</th>
                </tr>
              </thead>
              <tbody>
                {filteredMembers.map((member) => (
                  <tr key={member.id}>
                    <td className="member-name">
                      <span className="name-text">{member.name}</span>
                      {member.email && (
                        <span className="member-email">{member.email}</span>
                      )}
                    </td>
                    <td>{member.instrument}</td>
                    <td className="count-cell present">{member.presentCount}</td>
                    <td className="count-cell absent">{member.absentCount}</td>
                    <td>
                      <AttendanceBadge rate={member.attendanceRate} isDark={isDark} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Rehearsal breakdown */}
      <div className="attendance-rehearsal-section">
        <h3 className="section-title">Repetities ({rehearsals.length})</h3>
        <div className="rehearsal-list">
          {rehearsals.length === 0 ? (
            <div className="empty-state">
              <Icon name="calendar" size={48} />
              <p>Geen repetities gevonden</p>
            </div>
          ) : (
            rehearsals.slice(0, 10).map((rehearsal) => (
              <div key={rehearsal.id} className="rehearsal-item">
                <div className="rehearsal-date">
                  {new Date(rehearsal.date).toLocaleDateString('nl-NL', {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </div>
                <div className="rehearsal-stats">
                  <span className="stat present">
                    <Icon name="check" size={14} />
                    {rehearsal.presentCount}
                  </span>
                  <span className="stat absent">
                    <Icon name="close" size={14} />
                    {rehearsal.absentCount}
                  </span>
                </div>
                <AttendanceBadge rate={rehearsal.attendanceRate} isDark={isDark} />
              </div>
            ))
          )}
        </div>
      </div>

      <style>{`
        .attendance-dashboard {
          display: flex;
          flex-direction: column;
          gap: 24px;
          padding: 24px;
          background: var(--background);
          font-family: var(--font-family);
          min-height: 100%;
        }

        .attendance-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 16px;
        }

        .attendance-title {
          display: flex;
          align-items: center;
          gap: 12px;
          margin: 0;
          font-size: 1.5rem;
          font-weight: 600;
          color: var(--text);
        }

        .attendance-header-actions {
          display: flex;
          gap: 8px;
        }

        .export-dropdown {
          position: relative;
        }

        .export-menu {
          position: absolute;
          top: 100%;
          right: 0;
          margin-top: 4px;
          background: ${isDark ? 'var(--surface)' : '#fff'};
          border: 1px solid var(--border);
          border-radius: 8px;
          box-shadow: var(--shadow-lg);
          z-index: 10;
          overflow: hidden;
        }

        .export-menu button {
          display: flex;
          align-items: center;
          gap: 8px;
          width: 100%;
          padding: 10px 16px;
          background: none;
          border: none;
          color: var(--text);
          font-size: 0.875rem;
          cursor: pointer;
          transition: background 0.2s;
        }

        .export-menu button:hover {
          background: var(--surface-hover);
        }

        .attendance-summary {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 16px;
        }

        .summary-card {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 20px;
          background: ${isDark ? 'var(--surface)' : '#fff'};
          border: 1px solid var(--border);
          border-radius: 12px;
        }

        .summary-icon {
          width: 48px;
          height: 48px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 12px;
          color: var(--primary);
        }

        .summary-content {
          display: flex;
          flex-direction: column;
        }

        .summary-value {
          font-size: 1.5rem;
          font-weight: 700;
          color: var(--text);
        }

        .summary-label {
          font-size: 0.875rem;
          color: var(--text-light);
        }

        .attendance-filters {
          display: flex;
          flex-wrap: wrap;
          gap: 16px;
          padding: 16px 20px;
          background: ${isDark ? 'var(--surface)' : '#fff'};
          border: 1px solid var(--border);
          border-radius: 12px;
          align-items: flex-end;
        }

        .filter-group {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .filter-group label {
          font-size: 0.75rem;
          font-weight: 500;
          color: var(--text-light);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .filter-group input,
        .filter-group select {
          padding: 8px 12px;
          border: 1px solid var(--border);
          border-radius: 6px;
          background: ${isDark ? 'var(--surface-hover)' : '#fff'};
          color: var(--text);
          font-size: 0.875rem;
          min-width: 140px;
        }

        .filter-group input:focus,
        .filter-group select:focus {
          outline: none;
          border-color: var(--primary);
        }

        .attendance-trend-section,
        .attendance-table-section,
        .attendance-rehearsal-section {
          background: ${isDark ? 'var(--surface)' : '#fff'};
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 20px;
        }

        .section-title {
          font-size: 1.125rem;
          font-weight: 600;
          color: var(--text);
          margin: 0 0 16px 0;
        }

        .trend-chart-container {
          padding: 16px 0;
        }

        .attendance-table-wrapper {
          overflow-x: auto;
        }

        .attendance-table {
          width: 100%;
          border-collapse: collapse;
        }

        .attendance-table th,
        .attendance-table td {
          padding: 12px 16px;
          text-align: left;
          border-bottom: 1px solid var(--border);
        }

        .attendance-table th {
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--text-light);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .attendance-table tbody tr:hover {
          background: var(--surface-hover);
        }

        .member-name {
          display: flex;
          flex-direction: column;
        }

        .name-text {
          font-weight: 500;
          color: var(--text);
        }

        .member-email {
          font-size: 0.75rem;
          color: var(--text-muted);
        }

        .count-cell {
          font-weight: 500;
          font-family: monospace;
        }

        .count-cell.present {
          color: #16a34a;
        }

        .count-cell.absent {
          color: #dc2626;
        }

        .rehearsal-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .rehearsal-item {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 12px 16px;
          background: ${isDark ? 'var(--surface-hover)' : 'var(--surface)'};
          border-radius: 8px;
        }

        .rehearsal-date {
          flex: 1;
          font-size: 0.875rem;
          color: var(--text);
        }

        .rehearsal-stats {
          display: flex;
          gap: 12px;
        }

        .rehearsal-stats .stat {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 0.875rem;
          font-weight: 500;
        }

        .rehearsal-stats .stat.present {
          color: #16a34a;
        }

        .rehearsal-stats .stat.absent {
          color: #dc2626;
        }

        .empty-state,
        .loading-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 40px 20px;
          color: var(--text-muted);
          text-align: center;
        }

        .empty-state p {
          margin: 12px 0 0;
        }

        .btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 10px 16px;
          font-size: 0.875rem;
          font-weight: 500;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .btn-outline {
          background: transparent;
          color: var(--text);
          border: 1px solid var(--border);
        }

        .btn-outline:hover {
          background: var(--surface-hover);
          border-color: var(--border-strong);
        }

        .btn-text {
          background: transparent;
          color: var(--text-light);
          border: none;
          padding: 8px 12px;
        }

        .btn-text:hover {
          color: var(--text);
          background: var(--surface-hover);
        }

        @media (max-width: 768px) {
          .attendance-dashboard {
            padding: 16px;
          }

          .attendance-filters {
            flex-direction: column;
            align-items: stretch;
          }

          .filter-group {
            width: 100%;
          }

          .filter-group input,
          .filter-group select {
            width: 100%;
          }

          .attendance-table th:nth-child(2),
          .attendance-table td:nth-child(2) {
            display: none;
          }
        }
      `}</style>
    </div>
  );
}

export default AttendanceDashboard;
