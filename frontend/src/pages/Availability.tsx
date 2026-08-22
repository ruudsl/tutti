import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { showSuccess, showError } from '../utils/toast';
import { currentLocale } from '../utils/locale';
import {
  getMyAvailability,
  getTeamAvailability,
  setAvailability,
  setBulkAvailability,
  removeAvailability,
  getOrchestras,
} from '../api';
import type { AvailabilityEntry, TeamMember } from '../api/availability';
import type { Orchestra } from '../types';
import { ROLES } from '../utils/constants';
import { SkeletonTable } from '../components/Skeleton';

const MANAGER_ROLES: string[] = [ROLES.ADMIN, ROLES.CONDUCTOR];

type AvailabilityStatus = 'available' | 'unavailable' | 'maybe';

export default function Availability() {
  const { t } = useTranslation();
  const { user } = useAuth();
  useDocumentTitle('pageTitle.availability');
  const queryClient = useQueryClient();

  const isManager = user && MANAGER_ROLES.includes(user.role);

  // View mode
  const [viewMode, setViewMode] = useState<'my' | 'team'>('my');

  // Date range for calendar (6 weeks from today)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [currentMonth, setCurrentMonth] = useState(today);

  const startOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
  const endOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);

  // Start calendar from first day of week containing first of month
  const calendarStart = new Date(startOfMonth);
  calendarStart.setDate(calendarStart.getDate() - ((calendarStart.getDay() + 6) % 7)); // Start from Monday

  // End calendar at last day of week containing last of month
  const calendarEnd = new Date(endOfMonth);
  const daysToAdd = (7 - ((calendarEnd.getDay() + 6) % 7)) % 7;
  calendarEnd.setDate(calendarEnd.getDate() + daysToAdd);

  // Team view state
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [orchestraFilter, setOrchestraFilter] = useState('');

  // My availability query
  const fromDate = calendarStart.toISOString().split('T')[0];
  const toDate = calendarEnd.toISOString().split('T')[0];

  const { data: myAvailability = [], isLoading: myLoading } = useQuery({
    queryKey: ['myAvailability', fromDate, toDate],
    queryFn: () => getMyAvailability(fromDate, toDate),
    staleTime: 5 * 60 * 1000,
  });

  const { data: orchestras = [] } = useQuery<Orchestra[]>({
    queryKey: ['orchestras'],
    queryFn: getOrchestras,
    enabled: !!isManager,
    staleTime: 5 * 60 * 1000,
  });

  const { data: teamData, isLoading: teamLoading } = useQuery({
    queryKey: ['teamAvailability', selectedDate, orchestraFilter],
    queryFn: () => getTeamAvailability(selectedDate!, orchestraFilter || undefined),
    enabled: viewMode === 'team' && !!selectedDate,
    staleTime: 2 * 60 * 1000,
  });

  // Build availability map for quick lookup
  const availabilityMap = useMemo(() => {
    const map = new Map<string, AvailabilityEntry>();
    myAvailability.forEach((entry: AvailabilityEntry) => {
      map.set(entry.date, entry);
    });
    return map;
  }, [myAvailability]);

  // Generate calendar days
  const calendarDays = useMemo(() => {
    const days: Date[] = [];
    const current = new Date(calendarStart);
    while (current <= calendarEnd) {
      days.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }
    return days;
  }, [currentMonth]);

  // Handlers
  const handleSetAvailability = async (date: string, status: AvailabilityStatus) => {
    try {
      await setAvailability(date, status);
      showSuccess(t('availability.saved'));
      queryClient.invalidateQueries({ queryKey: ['myAvailability'] });
    } catch (e: any) {
      showError(e.response?.data?.error || t('common.error'));
    }
  };

  const handleRemoveAvailability = async (date: string) => {
    try {
      await removeAvailability(date);
      showSuccess(t('availability.removed'));
      queryClient.invalidateQueries({ queryKey: ['myAvailability'] });
    } catch (e: any) {
      showError(e.response?.data?.error || t('common.error'));
    }
  };

  const handleBulkSet = async (status: AvailabilityStatus) => {
    // Set availability for all weekdays in the current month
    const dates = calendarDays
      .filter((d) => d.getMonth() === currentMonth.getMonth() && d.getDay() !== 0 && d.getDay() !== 6)
      .filter((d) => d >= today)
      .map((d) => d.toISOString().split('T')[0]);

    if (dates.length === 0) {
      showError(t('availability.noFutureDates'));
      return;
    }

    try {
      await setBulkAvailability(dates, status);
      showSuccess(t('availability.bulkSaved', { count: dates.length }));
      queryClient.invalidateQueries({ queryKey: ['myAvailability'] });
    } catch (e: any) {
      showError(e.response?.data?.error || t('common.error'));
    }
  };

  const handlePrevMonth = () => {
    setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const handleToday = () => {
    setCurrentMonth(new Date());
  };

  const getStatusColor = (status: string | undefined): string => {
    switch (status) {
      case 'available':
        return 'var(--success)';
      case 'unavailable':
        return 'var(--danger)';
      case 'maybe':
        return 'var(--warning, orange)';
      default:
        return 'transparent';
    }
  };

  const formatMonthYear = (date: Date): string => {
    // Stond hier als `t('locale')`, maar de sleutel `locale` bestaat in geen van
    // de drie taalbestanden. i18next geeft dan de sleutel zelf terug, dus kreeg
    // toLocaleDateString de tekst 'locale' als taalcode. Dat gooit niet - het
    // valt stilzwijgend terug op het Engels, en de maandkop van de
    // beschikbaarheidskalender las "March 2026" waar "maart 2026" hoorde.
    // currentLocale() is precies waarvoor het bedoeld is.
    return date.toLocaleDateString(currentLocale(), { month: 'long', year: 'numeric' });
  };

  if (myLoading) {
    return (
      <div className="page">
        <h1>{t('availability.title')}</h1>
        <SkeletonTable rows={6} columns={7} />
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h1>{t('availability.title')}</h1>
        {isManager && (
          <div
            style={{
              display: 'flex',
              gap: '0',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              overflow: 'hidden',
            }}
          >
            <button
              onClick={() => setViewMode('my')}
              style={{
                padding: '0.5rem 1rem',
                border: 'none',
                background: viewMode === 'my' ? 'var(--primary)' : 'transparent',
                color: viewMode === 'my' ? 'white' : 'inherit',
                cursor: 'pointer',
              }}
            >
              {t('availability.myAvailability')}
            </button>
            <button
              onClick={() => setViewMode('team')}
              style={{
                padding: '0.5rem 1rem',
                border: 'none',
                background: viewMode === 'team' ? 'var(--primary)' : 'transparent',
                color: viewMode === 'team' ? 'white' : 'inherit',
                cursor: 'pointer',
              }}
            >
              {t('availability.teamAvailability')}
            </button>
          </div>
        )}
      </div>

      {/* Month navigation */}
      <div className="card mb-3">
        <div className="card-body" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button className="btn btn-outline btn-sm" onClick={handlePrevMonth}>
            &larr; {t('common.previous')}
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <h2 style={{ margin: 0, textTransform: 'capitalize' }}>{formatMonthYear(currentMonth)}</h2>
            <button className="btn btn-outline btn-sm" onClick={handleToday}>
              {t('availability.today')}
            </button>
          </div>
          <button className="btn btn-outline btn-sm" onClick={handleNextMonth}>
            {t('common.next')} &rarr;
          </button>
        </div>
      </div>

      {viewMode === 'my' && (
        <>
          {/* Quick bulk actions */}
          <div className="card mb-3">
            <div className="card-body">
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.875rem', color: 'var(--text-light)' }}>{t('availability.bulkSet')}:</span>
                <button
                  className="btn btn-sm"
                  style={{ backgroundColor: 'var(--success)', color: 'white' }}
                  onClick={() => handleBulkSet('available')}
                >
                  {t('availability.statuses.available')}
                </button>
                <button
                  className="btn btn-sm"
                  style={{ backgroundColor: 'var(--warning, orange)', color: 'white' }}
                  onClick={() => handleBulkSet('maybe')}
                >
                  {t('availability.statuses.maybe')}
                </button>
                <button
                  className="btn btn-sm"
                  style={{ backgroundColor: 'var(--danger)', color: 'white' }}
                  onClick={() => handleBulkSet('unavailable')}
                >
                  {t('availability.statuses.unavailable')}
                </button>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-light)', marginLeft: '0.5rem' }}>
                  ({t('availability.weekdaysOnly')})
                </span>
              </div>
            </div>
          </div>

          {/* Calendar grid */}
          <div className="card">
            <div className="card-body flush" style={{ padding: '0.5rem' }}>
              {/* Day headers */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', marginBottom: '2px' }}>
                {[1, 2, 3, 4, 5, 6, 0].map((dayNum) => (
                  <div
                    key={dayNum}
                    style={{
                      textAlign: 'center',
                      padding: '0.5rem',
                      fontWeight: 'bold',
                      fontSize: '0.75rem',
                      color: 'var(--text-light)',
                    }}
                  >
                    {t(`rehearsals.days.${dayNum}`).slice(0, 2)}
                  </div>
                ))}
              </div>

              {/* Calendar cells */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
                {calendarDays.map((day) => {
                  const dateStr = day.toISOString().split('T')[0];
                  const entry = availabilityMap.get(dateStr);
                  const isCurrentMonth = day.getMonth() === currentMonth.getMonth();
                  const isPast = day < today;
                  const isToday = dateStr === today.toISOString().split('T')[0];

                  return (
                    <div
                      key={dateStr}
                      style={{
                        position: 'relative',
                        minHeight: '80px',
                        padding: '0.5rem',
                        background: isCurrentMonth ? 'var(--surface)' : 'var(--background)',
                        opacity: isPast ? 0.5 : 1,
                        border: isToday ? '2px solid var(--primary)' : '1px solid var(--border)',
                        borderRadius: 'var(--radius-sm)',
                      }}
                    >
                      <div style={{ fontSize: '0.875rem', fontWeight: isToday ? 'bold' : 'normal' }}>
                        {day.getDate()}
                      </div>

                      {/* Status indicator */}
                      {entry && (
                        <div
                          style={{
                            position: 'absolute',
                            top: '0.25rem',
                            right: '0.25rem',
                            width: '10px',
                            height: '10px',
                            borderRadius: '50%',
                            backgroundColor: getStatusColor(entry.status),
                          }}
                          title={t(`availability.statuses.${entry.status}`)}
                        />
                      )}

                      {/* Action buttons */}
                      {!isPast && isCurrentMonth && (
                        <div style={{ marginTop: '0.5rem', display: 'flex', gap: '2px', flexWrap: 'wrap' }}>
                          <button
                            onClick={() => handleSetAvailability(dateStr, 'available')}
                            style={{
                              width: '24px',
                              height: '24px',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '0.75rem',
                              backgroundColor: entry?.status === 'available' ? 'var(--success)' : 'var(--border)',
                              color: entry?.status === 'available' ? 'white' : 'var(--text-light)',
                            }}
                            title={t('availability.statuses.available')}
                          >
                            ✓
                          </button>
                          <button
                            onClick={() => handleSetAvailability(dateStr, 'maybe')}
                            style={{
                              width: '24px',
                              height: '24px',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '0.75rem',
                              backgroundColor: entry?.status === 'maybe' ? 'var(--warning, orange)' : 'var(--border)',
                              color: entry?.status === 'maybe' ? 'white' : 'var(--text-light)',
                            }}
                            title={t('availability.statuses.maybe')}
                          >
                            ?
                          </button>
                          <button
                            onClick={() => handleSetAvailability(dateStr, 'unavailable')}
                            style={{
                              width: '24px',
                              height: '24px',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '0.75rem',
                              backgroundColor: entry?.status === 'unavailable' ? 'var(--danger)' : 'var(--border)',
                              color: entry?.status === 'unavailable' ? 'white' : 'var(--text-light)',
                            }}
                            title={t('availability.statuses.unavailable')}
                          >
                            ✗
                          </button>
                          {entry && (
                            <button
                              onClick={() => handleRemoveAvailability(dateStr)}
                              style={{
                                width: '24px',
                                height: '24px',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '0.6rem',
                                backgroundColor: 'var(--border)',
                                color: 'var(--text-light)',
                              }}
                              title={t('availability.clear')}
                            >
                              ⌫
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Legend */}
          <div className="card mt-3">
            <div className="card-body">
              <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', fontSize: '0.875rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span
                    style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: 'var(--success)' }}
                  />
                  {t('availability.statuses.available')}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span
                    style={{
                      width: '12px',
                      height: '12px',
                      borderRadius: '50%',
                      backgroundColor: 'var(--warning, orange)',
                    }}
                  />
                  {t('availability.statuses.maybe')}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span
                    style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: 'var(--danger)' }}
                  />
                  {t('availability.statuses.unavailable')}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {viewMode === 'team' && (
        <>
          {/* Date and orchestra selection */}
          <div className="card mb-3">
            <div className="card-body">
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'end', flexWrap: 'wrap' }}>
                <div className="form-group" style={{ flex: 1, minWidth: '200px' }}>
                  <label className="form-label">{t('availability.selectDate')}</label>
                  <input
                    type="date"
                    className="form-control"
                    value={selectedDate || ''}
                    onChange={(e) => setSelectedDate(e.target.value)}
                  />
                </div>
                {orchestras.length > 0 && (
                  <div className="form-group" style={{ flex: 1, minWidth: '200px' }}>
                    <label className="form-label">{t('rehearsals.orchestra')}</label>
                    <select
                      className="form-control form-select"
                      value={orchestraFilter}
                      onChange={(e) => setOrchestraFilter(e.target.value)}
                    >
                      <option value="">{t('rehearsals.allOrchestras')}</option>
                      {orchestras.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Team availability display */}
          {selectedDate && teamData && (
            <div className="card">
              <div className="card-header">
                <h2 className="card-title">
                  {t('availability.teamFor')} {selectedDate}
                </h2>
              </div>
              <div className="card-body">
                {/* Summary */}
                <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span
                      style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: 'var(--success)' }}
                    />
                    <strong>{teamData.summary.available}</strong> {t('availability.statuses.available')}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span
                      style={{
                        width: '12px',
                        height: '12px',
                        borderRadius: '50%',
                        backgroundColor: 'var(--warning, orange)',
                      }}
                    />
                    <strong>{teamData.summary.maybe}</strong> {t('availability.statuses.maybe')}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span
                      style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: 'var(--danger)' }}
                    />
                    <strong>{teamData.summary.unavailable}</strong> {t('availability.statuses.unavailable')}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span
                      style={{
                        width: '12px',
                        height: '12px',
                        borderRadius: '50%',
                        backgroundColor: 'var(--secondary)',
                      }}
                    />
                    <strong>{teamData.summary.unknown}</strong> {t('availability.statuses.unknown')}
                  </div>
                </div>

                {/* Member list */}
                {teamLoading ? (
                  <SkeletonTable rows={8} columns={3} />
                ) : (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                      gap: '0.5rem',
                    }}
                  >
                    {teamData.members.map((member: TeamMember) => (
                      <div
                        key={member.userId}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          padding: '0.5rem',
                          borderRadius: 'var(--radius-sm)',
                          background: 'var(--background)',
                        }}
                      >
                        <span
                          style={{
                            width: '10px',
                            height: '10px',
                            borderRadius: '50%',
                            backgroundColor: getStatusColor(member.status),
                            flexShrink: 0,
                          }}
                        />
                        <span style={{ fontSize: '0.875rem' }}>
                          {member.firstName} {member.lastName}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {!selectedDate && (
            <div className="card">
              <div className="card-body">
                <p className="piece-meta">{t('availability.selectDatePrompt')}</p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
