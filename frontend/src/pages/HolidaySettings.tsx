import { currentLocale } from '../utils/locale';
import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import {
  useHolidays,
  useHolidaySettings,
  useUpdateHolidaySettings,
  useSyncHolidays,
  useCreateCustomHoliday,
  useDeleteCustomHoliday,
  Holiday,
} from '../hooks/useHolidays';
import { Icon } from '../components/Icon';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { SkeletonTable } from '../components/Skeleton';
import { ROLES } from '../utils/constants';

export default function HolidaySettings() {
  const { t } = useTranslation();
  const { user } = useAuth();
  useDocumentTitle('pageTitle.holidaySettings');

  const isAdmin = user?.role === ROLES.ADMIN;

  // Get current year and next year for display
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);

  // Queries
  const { data: holidaysData, isLoading: holidaysLoading } = useHolidays({ year: selectedYear });
  const { data: settingsData, isLoading: settingsLoading } = useHolidaySettings();

  // Mutations
  const updateSettings = useUpdateHolidaySettings();
  const syncHolidays = useSyncHolidays();
  const createHoliday = useCreateCustomHoliday();
  const deleteHoliday = useDeleteCustomHoliday();

  // Local state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newHoliday, setNewHoliday] = useState({
    name: '',
    startDate: '',
    endDate: '',
    holidayType: '',
  });
  const [deletingHolidayId, setDeletingHolidayId] = useState<string | null>(null);

  const isLoading = holidaysLoading || settingsLoading;

  // Extract data with defaults
  const holidays = holidaysData?.holidays || [];
  const settings = settingsData || { region: 'midden', showHolidaysInCalendar: true, autoBlockRehearsals: false };
  const regions = settingsData?.regions || [];
  const availableYears = holidaysData?.meta?.availableYears || [currentYear, currentYear + 1];

  // Group holidays by type
  const holidaysByType = useMemo(() => {
    const grouped: Record<string, Holiday[]> = {
      national: [],
      kerst: [],
      voorjaar: [],
      mei: [],
      zomer: [],
      herfst: [],
      custom: [],
    };

    holidays.forEach((h) => {
      if (h.isCustom) {
        grouped.custom.push(h);
      } else if (grouped[h.holidayType]) {
        grouped[h.holidayType].push(h);
      } else {
        grouped.national.push(h);
      }
    });

    return grouped;
  }, [holidays]);

  const handleRegionChange = (region: string) => {
    updateSettings.mutate({ region });
  };

  const handleToggleShowHolidays = () => {
    updateSettings.mutate({ showHolidaysInCalendar: !settings.showHolidaysInCalendar });
  };

  const handleToggleAutoBlock = () => {
    updateSettings.mutate({ autoBlockRehearsals: !settings.autoBlockRehearsals });
  };

  const handleSync = () => {
    syncHolidays.mutate(selectedYear);
  };

  const handleAddHoliday = () => {
    if (!newHoliday.name || !newHoliday.startDate || !newHoliday.endDate) return;

    createHoliday.mutate(newHoliday, {
      onSuccess: () => {
        setShowAddForm(false);
        setNewHoliday({ name: '', startDate: '', endDate: '', holidayType: '' });
      },
    });
  };

  const handleDeleteHoliday = (id: string) => {
    deleteHoliday.mutate(id, {
      onSuccess: () => setDeletingHolidayId(null),
    });
  };

  const formatDateRange = (start: string, end: string): string => {
    const startDate = new Date(start);
    const endDate = new Date(end);
    const startStr = startDate.toLocaleDateString(currentLocale(), { day: 'numeric', month: 'short' });
    const endStr = endDate.toLocaleDateString(currentLocale(), { day: 'numeric', month: 'short' });

    if (start === end) {
      return startStr;
    }
    return `${startStr} - ${endStr}`;
  };

  const getHolidayTypeLabel = (type: string): string => {
    const labels: Record<string, string> = {
      national: t('holidays.types.national'),
      kerst: t('holidays.types.kerst'),
      voorjaar: t('holidays.types.voorjaar'),
      mei: t('holidays.types.mei'),
      zomer: t('holidays.types.zomer'),
      herfst: t('holidays.types.herfst'),
      custom: t('holidays.types.custom'),
    };
    return labels[type] || type;
  };

  const getHolidayTypeColor = (type: string): string => {
    const colors: Record<string, string> = {
      national: 'var(--danger)',
      kerst: 'var(--primary)',
      voorjaar: 'var(--success)',
      mei: 'var(--warning)',
      zomer: 'var(--info, #0dcaf0)',
      herfst: 'var(--warning)',
      custom: 'var(--secondary)',
    };
    return colors[type] || 'var(--secondary)';
  };

  if (isLoading) {
    return (
      <div>
        <div className="page-header">
          <h1>{t('holidays.title')}</h1>
        </div>
        <SkeletonTable rows={6} columns={3} />
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1>{t('holidays.title')}</h1>
        {isAdmin && (
          <button className="btn btn-outline" onClick={handleSync} disabled={syncHolidays.isPending}>
            {syncHolidays.isPending ? t('common.loading') : t('holidays.sync')}
          </button>
        )}
      </div>

      {/* Settings Card */}
      <div className="card mb-3">
        <div className="card-header">
          <h2 className="card-title">{t('holidays.settings')}</h2>
        </div>
        <div className="card-body">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem' }}>
            {/* Region Selection */}
            <div className="form-group">
              <label className="form-label">{t('holidays.region')}</label>
              <select
                className="form-control form-select"
                value={settings.region}
                onChange={(e) => handleRegionChange(e.target.value)}
                disabled={!isAdmin}
              >
                {regions.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.labelDutch}
                  </option>
                ))}
              </select>
              <small style={{ color: 'var(--text-light)' }}>{t('holidays.regionDescription')}</small>
            </div>

            {/* Toggle Options */}
            <div>
              <label className="form-label">{t('holidays.displayOptions')}</label>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    cursor: isAdmin ? 'pointer' : 'default',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={settings.showHolidaysInCalendar}
                    onChange={handleToggleShowHolidays}
                    disabled={!isAdmin}
                  />
                  <span>{t('holidays.showInCalendar')}</span>
                </label>

                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    cursor: isAdmin ? 'pointer' : 'default',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={settings.autoBlockRehearsals}
                    onChange={handleToggleAutoBlock}
                    disabled={!isAdmin}
                  />
                  <span>{t('holidays.autoBlockRehearsals')}</span>
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Holidays List */}
      <div className="card">
        <div className="card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <h2 className="card-title" style={{ margin: 0 }}>
              {t('holidays.holidayList')}
            </h2>
            <select
              className="form-control form-select"
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value))}
              style={{ width: 'auto' }}
            >
              {availableYears.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>
          {isAdmin && (
            <button className="btn btn-primary btn-sm" onClick={() => setShowAddForm(!showAddForm)}>
              + {t('holidays.addCustom')}
            </button>
          )}
        </div>

        <div className="card-body">
          {/* Add Holiday Form */}
          {showAddForm && isAdmin && (
            <div
              style={{
                padding: '1rem',
                marginBottom: '1rem',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                background: 'var(--background)',
              }}
            >
              <h3 style={{ fontSize: '1rem', marginBottom: '1rem' }}>{t('holidays.addCustomHoliday')}</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: '1rem', alignItems: 'end' }}>
                <div className="form-group">
                  <label className="form-label">{t('common.name')}</label>
                  <input
                    type="text"
                    className="form-control"
                    value={newHoliday.name}
                    onChange={(e) => setNewHoliday({ ...newHoliday, name: e.target.value })}
                    placeholder={t('holidays.namePlaceholder')}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('holidays.startDate')}</label>
                  <input
                    type="date"
                    className="form-control"
                    value={newHoliday.startDate}
                    onChange={(e) => setNewHoliday({ ...newHoliday, startDate: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('holidays.endDate')}</label>
                  <input
                    type="date"
                    className="form-control"
                    value={newHoliday.endDate}
                    onChange={(e) => setNewHoliday({ ...newHoliday, endDate: e.target.value })}
                  />
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    className="btn btn-primary"
                    onClick={handleAddHoliday}
                    disabled={
                      !newHoliday.name || !newHoliday.startDate || !newHoliday.endDate || createHoliday.isPending
                    }
                  >
                    {createHoliday.isPending ? t('common.loading') : t('common.add')}
                  </button>
                  <button className="btn btn-outline" onClick={() => setShowAddForm(false)}>
                    {t('common.cancel')}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Holiday Categories */}
          {Object.entries(holidaysByType).map(([type, typeHolidays]) => {
            if (typeHolidays.length === 0) return null;

            return (
              <div key={type} style={{ marginBottom: '1.5rem' }}>
                <h3
                  style={{
                    fontSize: '0.9rem',
                    fontWeight: 600,
                    marginBottom: '0.75rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}
                >
                  <span
                    style={{
                      width: '12px',
                      height: '12px',
                      borderRadius: '50%',
                      backgroundColor: getHolidayTypeColor(type),
                    }}
                  />
                  {getHolidayTypeLabel(type)}
                  <span style={{ color: 'var(--text-light)', fontWeight: 'normal' }}>({typeHolidays.length})</span>
                </h3>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {typeHolidays.map((holiday) => (
                    <div
                      key={holiday.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.5rem 0.75rem',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-sm)',
                        borderLeft: `3px solid ${getHolidayTypeColor(holiday.holidayType)}`,
                        background: 'var(--card-bg)',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 500, fontSize: '0.875rem' }}>{holiday.name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>
                          {formatDateRange(holiday.startDate, holiday.endDate)}
                        </div>
                      </div>
                      {holiday.isCustom && isAdmin && (
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={() => setDeletingHolidayId(holiday.id)}
                          style={{ padding: '0.15rem 0.35rem', fontSize: '0.7rem', color: 'var(--danger)' }}
                          title={t('common.delete')}
                        >
                          <Icon name="close" size={12} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {holidays.length === 0 && (
            <p style={{ color: 'var(--text-light)', textAlign: 'center', padding: '2rem' }}>
              {t('holidays.noHolidays')}
            </p>
          )}
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      {deletingHolidayId && (
        <ConfirmDialog
          title={t('holidays.deleteTitle')}
          message={t('holidays.deleteConfirm')}
          confirmLabel={t('common.delete')}
          variant="danger"
          isLoading={deleteHoliday.isPending}
          onConfirm={() => handleDeleteHoliday(deletingHolidayId)}
          onCancel={() => setDeletingHolidayId(null)}
        />
      )}
    </div>
  );
}
