import { useState, useMemo, useEffect, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { showSuccess, showError } from '../utils/toast';
import { getErrorMessage } from '../utils/errorHandling';
import { Icon } from '../components/Icon';
import { ResponsiveTable, ColumnDefinition } from '../components/ResponsiveTable';
import { Tooltip } from '../components/Tooltip';
import { ConfirmDialog } from '../components/ConfirmDialog';
import {
  getRehearsals,
  createRehearsal,
  updateRehearsal,
  deleteRehearsal,
  getRehearsal,
  updateRehearsalPieces,
  getDefaultDays,
  addDefaultDay,
  deleteDefaultDay,
  generateRehearsals,
  getOrchestras,
  getSpondConfig,
  saveSpondConfig,
  removeSpondConfig,
  getSpondGroups,
  syncSpond,
  syncSpondRehearsal,
  getAttendanceSummary,
  getRehearsalSeating,
  generateRehearsalSeating,
  getMyAttendanceStatus,
  updateMyAttendance,
  createRecurringRehearsals,
  getHolidays,
} from '../api';
import type { AttendanceMember, Holiday } from '../api';
import type { Rehearsal, RehearsalDetail, SpondGroup, RehearsalSeat } from '../types';
import { ROLES } from '../utils/constants';
import { SkeletonTable } from '../components/Skeleton';
import SeatingChartVisualization from '../components/SeatingChartVisualization';
import { AddToCalendarButton } from '../components/CalendarSync';
import AttendanceDashboard, {
  AttendanceMember as DashboardMember,
  RehearsalAttendance,
  AttendanceTrend,
  AttendanceFilters,
} from '../components/AttendanceDashboard';
import { CustomFieldFormSection, CustomFieldRenderer } from '../components/CustomFields';

const MANAGER_ROLES: string[] = [ROLES.ADMIN, ROLES.MUSIC_COMMITTEE, ROLES.CONDUCTOR];

const EMPTY_REHEARSAL_FORM = {
  date: '',
  startTime: '19:30',
  endTime: '21:30',
  location: '',
  type: 'regular',
  notes: '',
  orchestraId: '',
};

export default function Rehearsals() {
  const { t } = useTranslation();
  const { user } = useAuth();
  useDocumentTitle('pageTitle.rehearsals');
  const queryClient = useQueryClient();

  const isManager = user && MANAGER_ROLES.includes(user.role);

  // Date range for rehearsals query
  const today = new Date().toISOString().split('T')[0];
  const sixMonthsLater = new Date();
  sixMonthsLater.setMonth(sixMonthsLater.getMonth() + 6);
  const endDate = sixMonthsLater.toISOString().split('T')[0];

  // Main data queries with React Query
  const { data: rehearsals = [], isLoading: rehearsalsLoading } = useQuery({
    queryKey: ['rehearsals', today, endDate],
    queryFn: () => getRehearsals(today, endDate),
    staleTime: 5 * 60 * 1000,
  });

  const { data: defaultDays = [] } = useQuery({
    queryKey: ['defaultDays'],
    queryFn: getDefaultDays,
    enabled: !!isManager,
    staleTime: 5 * 60 * 1000,
  });

  const { data: orchestras = [] } = useQuery({
    queryKey: ['orchestras'],
    queryFn: getOrchestras,
    enabled: !!isManager,
    staleTime: 5 * 60 * 1000,
  });

  const { data: spondConfig = null } = useQuery({
    queryKey: ['spondConfig'],
    queryFn: getSpondConfig,
    enabled: user?.role === ROLES.ADMIN,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch holidays for the date range
  const { data: holidaysData } = useQuery({
    queryKey: ['holidays', today, endDate],
    queryFn: () => getHolidays({ startDate: today, endDate }),
    staleTime: 30 * 60 * 1000, // 30 minutes
  });

  const holidays = holidaysData?.holidays || [];
  const showHolidaysInCalendar = holidaysData?.settings?.showHolidaysInCalendar ?? true;

  // Helper to check if a date falls within any holiday
  const getHolidayForDate = (date: string): Holiday | undefined => {
    if (!showHolidaysInCalendar) return undefined;
    return holidays.find((h) => date >= h.startDate && date <= h.endDate);
  };

  const isLoading = rehearsalsLoading;

  const [rehearsalSeating, setRehearsalSeating] = useState<RehearsalSeat[]>([]);
  const [showSeating, setShowSeating] = useState(false);
  const [seatingLoading, setSeatingLoading] = useState(false);
  const [selectedRehearsal, setSelectedRehearsal] = useState<RehearsalDetail | null>(null);

  // Form states
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_REHEARSAL_FORM });
  // Snapshot of the form state when the form was opened, for dirty detection
  const [formSnapshot, setFormSnapshot] = useState(() => JSON.stringify(EMPTY_REHEARSAL_FORM));
  const isFormDirty = showForm && JSON.stringify(form) !== formSnapshot;
  const { confirmClose, dialog: unsavedChangesDialog } = useUnsavedChanges(isFormDirty);

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
  };

  // Default day form
  const [showDefaultForm, setShowDefaultForm] = useState(false);
  const [defaultForm, setDefaultForm] = useState({
    dayOfWeek: 1,
    startTime: '19:30',
    endTime: '21:30',
    location: '',
    orchestraId: '',
  });

  // Generate form
  const [showGenerate, setShowGenerate] = useState(false);
  const [genFrom, setGenFrom] = useState('');
  const [genTo, setGenTo] = useState('');

  // Pieces editing
  const [editingPieces, setEditingPieces] = useState(false);
  const [pieces, setPieces] = useState<{ title: string; notes: string }[]>([]);

  // Recurring rehearsals form
  const [showRecurring, setShowRecurring] = useState(false);
  const [recurringForm, setRecurringForm] = useState({
    dayOfWeek: 1,
    interval: 1,
    startTime: '19:30',
    endTime: '21:30',
    location: '',
    orchestraId: '',
    until: '',
  });
  const [recurringLoading, setRecurringLoading] = useState(false);
  const [recurringPreview, setRecurringPreview] = useState<string[]>([]);

  // Spond
  const [showSpondSetup, setShowSpondSetup] = useState(false);
  const [spondForm, setSpondForm] = useState({ username: '', password: '', groupId: '' });
  const [spondGroups, setSpondGroups] = useState<SpondGroup[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const isAdmin = user?.role === ROLES.ADMIN;

  // Tabs
  const [activeTab, setActiveTab] = useState<'rehearsals' | 'attendance' | 'dashboard'>('rehearsals');

  // Attendance summary
  const [attendanceMembers, setAttendanceMembers] = useState<AttendanceMember[]>([]);
  const [attendanceRehearsalCount, setAttendanceRehearsalCount] = useState(0);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [attendanceFrom, setAttendanceFrom] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 3);
    return d.toISOString().split('T')[0];
  });
  const [attendanceTo, setAttendanceTo] = useState(() => new Date().toISOString().split('T')[0]);
  const [attendanceOrchestraId, setAttendanceOrchestraId] = useState('');
  const [attendanceSortBy, setAttendanceSortBy] = useState<'name' | 'rate' | 'count'>('name');

  // My attendance
  const [myAttendanceStatus, setMyAttendanceStatus] = useState<string>('unknown');
  const [canSyncToSpond, setCanSyncToSpond] = useState(false);

  // Delete confirmation
  const [deletingRehearsalId, setDeletingRehearsalId] = useState<string | null>(null);
  const [removingSpondConfig, setRemovingSpondConfig] = useState(false);

  // Helper to refresh data after mutations
  const refreshRehearsals = () => {
    queryClient.invalidateQueries({ queryKey: ['rehearsals'] });
  };

  const refreshDefaultDays = () => {
    queryClient.invalidateQueries({ queryKey: ['defaultDays'] });
  };

  const loadAttendance = async () => {
    setAttendanceLoading(true);
    try {
      const data = await getAttendanceSummary(attendanceFrom, attendanceTo, attendanceOrchestraId || undefined);
      setAttendanceMembers(data.members);
      setAttendanceRehearsalCount(data.rehearsalCount);
    } catch (e) {
      console.error(e);
      showError(t('rehearsals.attendance.error'));
    } finally {
      setAttendanceLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'attendance') {
      loadAttendance();
    }
  }, [activeTab, attendanceFrom, attendanceTo, attendanceOrchestraId]);

  const sortedAttendance = useMemo(() => {
    const sorted = [...attendanceMembers];
    if (attendanceSortBy === 'name') {
      sorted.sort((a, b) => a.name.localeCompare(b.name));
    } else if (attendanceSortBy === 'rate') {
      sorted.sort((a, b) => (b.total ? b.accepted / b.total : 0) - (a.total ? a.accepted / a.total : 0));
    } else if (attendanceSortBy === 'count') {
      sorted.sort((a, b) => b.accepted - a.accepted);
    }
    return sorted;
  }, [attendanceMembers, attendanceSortBy]);

  const upcoming = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return rehearsals.filter((r) => r.date >= today);
  }, [rehearsals]);

  const handleOpenDetail = async (id: string) => {
    try {
      const detail = await getRehearsal(id);
      setSelectedRehearsal(detail);
      setEditingPieces(false);
      // Load my attendance status
      try {
        const status = await getMyAttendanceStatus(id);
        setMyAttendanceStatus(status.status);
        setCanSyncToSpond(status.canSyncToSpond);
      } catch {
        setMyAttendanceStatus('unknown');
        setCanSyncToSpond(false);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const updateMyAttendanceMutation = useMutation({
    mutationFn: ({ rehearsalId, accepted }: { rehearsalId: string; accepted: boolean }) =>
      updateMyAttendance(rehearsalId, accepted),
    onMutate: async ({ rehearsalId, accepted }) => {
      // Snapshot current state, then apply the optimistic update
      await queryClient.cancelQueries({ queryKey: ['rehearsals'] });
      const previousStatus = myAttendanceStatus;
      const previousRehearsals = queryClient.getQueriesData<Rehearsal[]>({ queryKey: ['rehearsals'] });

      setMyAttendanceStatus(accepted ? 'accepted' : 'declined');
      queryClient.setQueriesData<Rehearsal[]>({ queryKey: ['rehearsals'] }, (old) => {
        if (!Array.isArray(old)) return old;
        return old.map((r) => {
          if (r.id !== rehearsalId) return r;
          let acceptedCount = r.accepted_count;
          let declinedCount = r.declined_count;
          if (previousStatus === 'accepted') acceptedCount -= 1;
          if (previousStatus === 'declined') declinedCount -= 1;
          if (accepted) acceptedCount += 1;
          else declinedCount += 1;
          return { ...r, accepted_count: acceptedCount, declined_count: declinedCount };
        });
      });

      return { previousStatus, previousRehearsals };
    },
    onError: (e: unknown, _variables, context) => {
      // Roll back the optimistic update
      if (context) {
        setMyAttendanceStatus(context.previousStatus);
        context.previousRehearsals.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
      showError(getErrorMessage(e, t('common.error')));
    },
    onSuccess: async (result, { rehearsalId }) => {
      setMyAttendanceStatus(result.status);
      showSuccess(result.message);
      if (result.spondSynced) {
        showSuccess(t('rehearsals.attendance.syncedToSpond'));
      }
      // Reload rehearsal details to update attendance list
      const detail = await getRehearsal(rehearsalId);
      setSelectedRehearsal(detail);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['rehearsals'] });
    },
  });

  const handleUpdateMyAttendance = (accepted: boolean) => {
    if (!selectedRehearsal) return;
    updateMyAttendanceMutation.mutate({ rehearsalId: selectedRehearsal.id, accepted });
  };

  const saveRehearsalMutation = useMutation({
    mutationFn: ({ id, data }: { id: string | null; data: typeof form }) =>
      id ? updateRehearsal(id, data) : createRehearsal(data),
    onSuccess: (_result, { id }) => {
      showSuccess(id ? t('rehearsals.saved') : t('rehearsals.created'));
      setShowForm(false);
      setEditingId(null);
      queryClient.invalidateQueries({ queryKey: ['rehearsals'] });
    },
    onError: (e: unknown) => {
      showError(getErrorMessage(e, t('rehearsals.errorSaving')));
    },
  });

  const handleSaveRehearsal = () => {
    saveRehearsalMutation.mutate({ id: editingId, data: form });
  };

  const deleteRehearsalMutation = useMutation({
    mutationFn: (id: string) => deleteRehearsal(id),
    onSuccess: (_result, id) => {
      showSuccess(t('rehearsals.deleted'));
      if (selectedRehearsal?.id === id) setSelectedRehearsal(null);
      queryClient.invalidateQueries({ queryKey: ['rehearsals'] });
      setDeletingRehearsalId(null);
    },
    onError: (e: unknown) => {
      showError(getErrorMessage(e, t('rehearsals.errorSaving')));
    },
  });

  const handleDelete = (id: string) => {
    deleteRehearsalMutation.mutate(id);
  };

  const handleEdit = (r: Rehearsal) => {
    const newForm = {
      date: r.date,
      startTime: r.start_time,
      endTime: r.end_time,
      location: r.location || '',
      type: r.type,
      notes: r.notes || '',
      orchestraId: r.orchestra_id || '',
    };
    setForm(newForm);
    setFormSnapshot(JSON.stringify(newForm));
    setEditingId(r.id);
    setShowForm(true);
  };

  const handleAddDefaultDay = async () => {
    try {
      await addDefaultDay(defaultForm);
      setShowDefaultForm(false);
      refreshDefaultDays();
    } catch (e: unknown) {
      showError(getErrorMessage(e, t('rehearsals.errorSaving')));
    }
  };

  const handleDeleteDefaultDay = async (id: string) => {
    try {
      await deleteDefaultDay(id);
      refreshDefaultDays();
    } catch (e: unknown) {
      showError(getErrorMessage(e, t('rehearsals.errorSaving')));
    }
  };

  const generateRehearsalsMutation = useMutation({
    mutationFn: () => generateRehearsals(genFrom, genTo),
    onSuccess: (result) => {
      showSuccess(t('rehearsals.generated', { count: result.count }));
      setShowGenerate(false);
      queryClient.invalidateQueries({ queryKey: ['rehearsals'] });
    },
    onError: (e: unknown) => {
      showError(getErrorMessage(e, t('rehearsals.errorSaving')));
    },
  });

  const handleGenerate = () => {
    generateRehearsalsMutation.mutate();
  };

  const handleStartEditPieces = () => {
    if (selectedRehearsal) {
      setPieces(selectedRehearsal.pieces.map((p) => ({ title: p.title, notes: p.notes || '' })));
      setEditingPieces(true);
    }
  };

  const handleSavePieces = async () => {
    if (!selectedRehearsal) return;
    try {
      await updateRehearsalPieces(
        selectedRehearsal.id,
        pieces.filter((p) => p.title.trim()),
      );
      showSuccess(t('rehearsals.piecesSaved'));
      handleOpenDetail(selectedRehearsal.id);
    } catch (e: unknown) {
      showError(getErrorMessage(e, t('rehearsals.errorSaving')));
    }
  };

  // Recurring rehearsals helpers
  const WEEKDAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

  const buildRrule = () => {
    const byDay = WEEKDAY_CODES[recurringForm.dayOfWeek];
    let rrule = `FREQ=WEEKLY;BYDAY=${byDay}`;
    if (recurringForm.interval > 1) {
      rrule += `;INTERVAL=${recurringForm.interval}`;
    }
    return rrule;
  };

  const calculateRecurringPreview = () => {
    if (!recurringForm.until) {
      setRecurringPreview([]);
      return;
    }
    const dates: string[] = [];
    const endDate = new Date(recurringForm.until);
    const current = new Date();
    // Find first occurrence of selected day
    while (current.getDay() !== recurringForm.dayOfWeek) {
      current.setDate(current.getDate() + 1);
    }
    // Generate dates
    while (current <= endDate && dates.length < 52) {
      dates.push(current.toISOString().split('T')[0]);
      current.setDate(current.getDate() + 7 * recurringForm.interval);
    }
    setRecurringPreview(dates);
  };

  useEffect(() => {
    calculateRecurringPreview();
  }, [recurringForm.dayOfWeek, recurringForm.interval, recurringForm.until]);

  const handleCreateRecurring = async () => {
    if (!recurringForm.until) return;
    setRecurringLoading(true);
    try {
      const rrule = buildRrule();
      const result = await createRecurringRehearsals({
        rrule,
        startTime: recurringForm.startTime,
        endTime: recurringForm.endTime,
        location: recurringForm.location || undefined,
        orchestraId: recurringForm.orchestraId || undefined,
        until: recurringForm.until,
      });
      showSuccess(t('rehearsals.recurring.created', { count: result.count }));
      setShowRecurring(false);
      setRecurringPreview([]);
      refreshRehearsals();
    } catch (e: unknown) {
      showError(getErrorMessage(e, t('rehearsals.errorSaving')));
    } finally {
      setRecurringLoading(false);
    }
  };

  // Spond handlers
  const handleSaveSpondConfig = async () => {
    try {
      await saveSpondConfig({
        username: spondForm.username,
        password: spondForm.password,
        groupId: spondForm.groupId || undefined,
        syncEnabled: true,
      });
      showSuccess(t('rehearsals.spond.configSaved'));
      setShowSpondSetup(false);
      setSpondForm({ username: '', password: '', groupId: '' });
      queryClient.invalidateQueries({ queryKey: ['spondConfig'] });
    } catch (e: unknown) {
      showError(getErrorMessage(e, t('rehearsals.spond.loginFailed')));
    }
  };

  const handleRemoveSpondConfig = async () => {
    try {
      await removeSpondConfig();
      showSuccess(t('rehearsals.spond.configRemoved'));
      queryClient.invalidateQueries({ queryKey: ['spondConfig'] });
      setRemovingSpondConfig(false);
    } catch (e: unknown) {
      showError(getErrorMessage(e, t('rehearsals.errorSaving')));
    }
  };

  const handleLoadGroups = async () => {
    setLoadingGroups(true);
    try {
      const groups = await getSpondGroups();
      setSpondGroups(groups);
    } catch (e: unknown) {
      showError(getErrorMessage(e, t('rehearsals.spond.loginFailed')));
    } finally {
      setLoadingGroups(false);
    }
  };

  const handleSyncAll = async () => {
    setIsSyncing(true);
    try {
      const result = await syncSpond();
      showSuccess(t('rehearsals.spond.syncSuccess', { count: result.synced }));
      refreshRehearsals();
    } catch (e: unknown) {
      showError(getErrorMessage(e, t('rehearsals.errorSaving')));
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSyncRehearsal = async (rehearsalId: string) => {
    setIsSyncing(true);
    try {
      await syncSpondRehearsal(rehearsalId);
      showSuccess(t('rehearsals.spond.syncRehearsalSuccess'));
      if (selectedRehearsal?.id === rehearsalId) {
        handleOpenDetail(rehearsalId);
      }
      refreshRehearsals();
    } catch (e: unknown) {
      showError(getErrorMessage(e, t('rehearsals.errorSaving')));
    } finally {
      setIsSyncing(false);
    }
  };

  const handleLoadSeating = async (rehearsalId: string) => {
    setSeatingLoading(true);
    try {
      const seats = await getRehearsalSeating(rehearsalId);
      setRehearsalSeating(seats);
      setShowSeating(true);
    } catch (e: unknown) {
      showError(getErrorMessage(e, t('common.error')));
    } finally {
      setSeatingLoading(false);
    }
  };

  const handleGenerateSeating = async (rehearsalId: string) => {
    setSeatingLoading(true);
    try {
      const result = await generateRehearsalSeating(rehearsalId);
      showSuccess(t('seating.seatingGenerated', { count: result.memberCount }));
      const seats = await getRehearsalSeating(rehearsalId);
      setRehearsalSeating(seats);
      setShowSeating(true);
    } catch (e: unknown) {
      showError(getErrorMessage(e, t('common.error')));
    } finally {
      setSeatingLoading(false);
    }
  };

  const getTypeStyle = (type: string): React.CSSProperties => {
    switch (type) {
      case 'extra':
        return { borderLeft: '4px solid var(--warning)' };
      case 'cancelled':
        return { borderLeft: '4px solid var(--danger)', opacity: 0.6, textDecoration: 'line-through' };
      default:
        return { borderLeft: '4px solid var(--primary)' };
    }
  };

  if (isLoading) {
    return (
      <div>
        <div className="page-header">
          <h1>{t('rehearsals.title')}</h1>
        </div>
        <SkeletonTable rows={6} columns={5} />
      </div>
    );
  }

  // Detail view
  if (selectedRehearsal) {
    return (
      <div>
        <button className="btn btn-outline mb-3" onClick={() => setSelectedRehearsal(null)}>
          &larr; {t('common.back')}
        </button>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '1rem' }}>
          <div>
            <h1>{formatDate(selectedRehearsal.date, t)}</h1>
            <p className="piece-meta">
              {selectedRehearsal.start_time} - {selectedRehearsal.end_time}
              {selectedRehearsal.location && ` · ${selectedRehearsal.location}`}
              {' · '}
              <span
                className={`badge badge-${selectedRehearsal.type === 'extra' ? 'warning' : selectedRehearsal.type === 'cancelled' ? 'danger' : 'primary'}`}
              >
                {t(`rehearsals.types.${selectedRehearsal.type}`)}
              </span>
              {selectedRehearsal.orchestra_name && (
                <>
                  {' · '}
                  <span className="badge badge-secondary">{selectedRehearsal.orchestra_name}</span>
                </>
              )}
            </p>
          </div>
          <div>
            <AddToCalendarButton type="rehearsal" id={selectedRehearsal.id} />
          </div>
        </div>

        {selectedRehearsal.notes && (
          <div className="card mb-3">
            <div className="card-body">
              <strong>{t('rehearsals.notes')}:</strong> {selectedRehearsal.notes}
            </div>
          </div>
        )}

        {/* Pieces / Repertoire */}
        <div className="card mb-3">
          <div className="card-header">
            <h2 className="card-title">{t('rehearsals.pieces')}</h2>
            {isManager && !editingPieces && (
              <button className="btn btn-primary btn-sm" onClick={handleStartEditPieces}>
                {t('common.edit')}
              </button>
            )}
          </div>
          <div className="card-body">
            {editingPieces ? (
              <div>
                {pieces.map((p, i) => (
                  <div key={i} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'start' }}>
                    <input
                      type="text"
                      className="form-control"
                      placeholder={t('rehearsals.pieceTitle')}
                      value={p.title}
                      onChange={(e) => {
                        const next = [...pieces];
                        next[i].title = e.target.value;
                        setPieces(next);
                      }}
                      style={{ flex: 1 }}
                    />
                    <input
                      type="text"
                      className="form-control"
                      placeholder={t('rehearsals.pieceNotesPlaceholder')}
                      value={p.notes}
                      onChange={(e) => {
                        const next = [...pieces];
                        next[i].notes = e.target.value;
                        setPieces(next);
                      }}
                      style={{ flex: 2 }}
                    />
                    <button
                      className="btn btn-outline btn-sm"
                      onClick={() => setPieces(pieces.filter((_, j) => j !== i))}
                    >
                      &times;
                    </button>
                  </div>
                ))}
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => setPieces([...pieces, { title: '', notes: '' }])}
                  >
                    + {t('rehearsals.addPiece')}
                  </button>
                  <button className="btn btn-primary btn-sm" onClick={handleSavePieces}>
                    {t('rehearsals.savePieces')}
                  </button>
                  <button className="btn btn-outline btn-sm" onClick={() => setEditingPieces(false)}>
                    {t('common.cancel')}
                  </button>
                </div>
              </div>
            ) : selectedRehearsal.pieces.length > 0 ? (
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">#</th>
                    <th scope="col">{t('rehearsals.pieceTitle')}</th>
                    <th scope="col">{t('rehearsals.pieceNotes')}</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedRehearsal.pieces.map((p, i) => (
                    <tr key={p.id}>
                      <td>{i + 1}</td>
                      <td>
                        <strong>{p.title}</strong>
                      </td>
                      <td style={{ color: 'var(--text-light)' }}>{p.notes || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="piece-meta">{t('rehearsals.noPieces')}</p>
            )}
          </div>
        </div>

        {/* My Attendance */}
        <div className="card mb-3">
          <div className="card-header">
            <h2 className="card-title">{t('rehearsals.attendance.myAttendance')}</h2>
          </div>
          <div className="card-body">
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span>{t('rehearsals.attendance.currentStatus')}:</span>
                <span
                  className={`badge badge-${myAttendanceStatus === 'accepted' ? 'success' : myAttendanceStatus === 'declined' ? 'danger' : 'secondary'}`}
                >
                  {t(`rehearsals.attendance.statuses.${myAttendanceStatus}`)}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  className={`btn ${myAttendanceStatus === 'accepted' ? 'btn-success' : 'btn-outline'} btn-sm`}
                  onClick={() => handleUpdateMyAttendance(true)}
                  disabled={updateMyAttendanceMutation.isPending || myAttendanceStatus === 'accepted'}
                  style={
                    myAttendanceStatus === 'accepted'
                      ? { backgroundColor: 'var(--success)', borderColor: 'var(--success)', color: 'white' }
                      : {}
                  }
                >
                  {updateMyAttendanceMutation.isPending ? '...' : t('rehearsals.attendance.accept')}
                </button>
                <button
                  className={`btn ${myAttendanceStatus === 'declined' ? 'btn-danger' : 'btn-outline'} btn-sm`}
                  onClick={() => handleUpdateMyAttendance(false)}
                  disabled={updateMyAttendanceMutation.isPending || myAttendanceStatus === 'declined'}
                  style={
                    myAttendanceStatus === 'declined'
                      ? { backgroundColor: 'var(--danger)', borderColor: 'var(--danger)', color: 'white' }
                      : {}
                  }
                >
                  {updateMyAttendanceMutation.isPending ? '...' : t('rehearsals.attendance.decline')}
                </button>
              </div>
              {canSyncToSpond && (
                <span style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>
                  {t('rehearsals.attendance.willSyncToSpond')}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Attendance */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">{t('rehearsals.attendance.title')}</h2>
            {isManager && spondConfig?.configured && spondConfig.groupId && (
              <button
                className="btn btn-outline btn-sm"
                onClick={() => handleSyncRehearsal(selectedRehearsal.id)}
                disabled={isSyncing}
              >
                {isSyncing ? t('rehearsals.spond.syncing') : t('rehearsals.spond.syncNow')}
              </button>
            )}
          </div>
          <div className="card-body">
            {selectedRehearsal.attendance.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                {selectedRehearsal.attendance.map((a) => (
                  <div
                    key={a.id}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.25rem 0' }}
                  >
                    <span
                      style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        backgroundColor:
                          a.status === 'accepted'
                            ? 'var(--success)'
                            : a.status === 'declined'
                              ? 'var(--danger)'
                              : 'var(--secondary)',
                      }}
                    />
                    <span style={{ fontSize: '0.875rem' }}>{a.member_name}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="piece-meta">
                {spondConfig?.configured && spondConfig.groupId
                  ? t('rehearsals.spond.syncNow')
                  : t('rehearsals.spond.notConfigured')}
              </p>
            )}
          </div>
        </div>

        {/* Seating */}
        {isManager && (
          <div className="card mt-3">
            <div className="card-header">
              <h2 className="card-title">{t('seating.rehearsalSeating')}</h2>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => handleLoadSeating(selectedRehearsal.id)}
                  disabled={seatingLoading}
                >
                  {seatingLoading ? t('common.loading') : t('seating.viewSeating')}
                </button>
                {selectedRehearsal.attendance.filter((a) => a.status === 'accepted').length > 0 && (
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => handleGenerateSeating(selectedRehearsal.id)}
                    disabled={seatingLoading}
                  >
                    {t('seating.generateSeating')}
                  </button>
                )}
              </div>
            </div>
            {showSeating && (
              <div className="card-body">
                {rehearsalSeating.length > 0 ? (
                  <SeatingChartVisualization
                    chart={{
                      orchestraId: selectedRehearsal.orchestra_id || '',
                      orchestraName: selectedRehearsal.orchestra_name || t('rehearsals.allOrchestras'),
                      sections: [],
                      seats: rehearsalSeating.map((s) => ({
                        id: s.id,
                        userId: s.userId,
                        memberName: s.memberName,
                        instrumentName: s.instrumentName,
                        rowNumber: s.rowNumber,
                        positionInRow: s.positionInRow,
                        sectionName: s.sectionName,
                      })),
                      totalRows: Math.max(...rehearsalSeating.map((s) => s.rowNumber), 0),
                    }}
                  />
                ) : (
                  <p className="piece-meta">{t('seating.noAttendees')}</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Custom Fields Section */}
        <div className="card mt-3">
          <div className="card-header">
            <h2 className="card-title">{t('customFields.additionalFields')}</h2>
          </div>
          <div className="card-body">
            {isManager ? (
              <CustomFieldFormSection entityType="rehearsal" entityId={selectedRehearsal.id} autoSave={true} />
            ) : (
              <CustomFieldRenderer entityType="rehearsal" entityId={selectedRehearsal.id} layout="horizontal" />
            )}
          </div>
        </div>
      </div>
    );
  }

  // Overview
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h1>{t('rehearsals.title')}</h1>
        {isManager && activeTab === 'rehearsals' && (
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn btn-outline" onClick={() => setShowGenerate(!showGenerate)}>
              {t('rehearsals.generate')}
            </button>
            <button className="btn btn-outline" onClick={() => setShowRecurring(!showRecurring)}>
              {t('rehearsals.recurring.title')}
            </button>
            <button
              className="btn btn-primary"
              onClick={() => {
                setForm({ ...EMPTY_REHEARSAL_FORM });
                setFormSnapshot(JSON.stringify(EMPTY_REHEARSAL_FORM));
                setEditingId(null);
                setShowForm(true);
              }}
            >
              + {t('rehearsals.addRehearsal')}
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0', borderBottom: '2px solid var(--border)', marginBottom: '1.5rem' }}>
        <button
          onClick={() => setActiveTab('rehearsals')}
          style={{
            padding: '0.5rem 1.5rem',
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            fontWeight: activeTab === 'rehearsals' ? 'bold' : 'normal',
            borderBottom: activeTab === 'rehearsals' ? '2px solid var(--primary)' : '2px solid transparent',
            marginBottom: '-2px',
            color: activeTab === 'rehearsals' ? 'var(--primary)' : 'inherit',
          }}
        >
          {t('rehearsals.title')}
        </button>
        <button
          onClick={() => setActiveTab('attendance')}
          style={{
            padding: '0.5rem 1.5rem',
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            fontWeight: activeTab === 'attendance' ? 'bold' : 'normal',
            borderBottom: activeTab === 'attendance' ? '2px solid var(--primary)' : '2px solid transparent',
            marginBottom: '-2px',
            color: activeTab === 'attendance' ? 'var(--primary)' : 'inherit',
          }}
        >
          {t('rehearsals.attendance.title')}
        </button>
        <button
          onClick={() => setActiveTab('dashboard')}
          style={{
            padding: '0.5rem 1.5rem',
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            fontWeight: activeTab === 'dashboard' ? 'bold' : 'normal',
            borderBottom: activeTab === 'dashboard' ? '2px solid var(--primary)' : '2px solid transparent',
            marginBottom: '-2px',
            color: activeTab === 'dashboard' ? 'var(--primary)' : 'inherit',
          }}
        >
          {t('rehearsals.attendanceDashboard', 'Dashboard')}
        </button>
      </div>

      {/* ===== ATTENDANCE TAB ===== */}
      {activeTab === 'attendance' && (
        <div>
          {/* Filters */}
          <div className="card mb-3">
            <div className="card-body">
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'end', flexWrap: 'wrap' }}>
                <div className="form-group" style={{ flex: 1, minWidth: '140px' }}>
                  <label className="form-label">{t('rehearsals.attendance.from')}</label>
                  <input
                    type="date"
                    className="form-control"
                    value={attendanceFrom}
                    onChange={(e) => setAttendanceFrom(e.target.value)}
                  />
                </div>
                <div className="form-group" style={{ flex: 1, minWidth: '140px' }}>
                  <label className="form-label">{t('rehearsals.attendance.to')}</label>
                  <input
                    type="date"
                    className="form-control"
                    value={attendanceTo}
                    onChange={(e) => setAttendanceTo(e.target.value)}
                  />
                </div>
                {orchestras.length > 0 && (
                  <div className="form-group" style={{ flex: 1, minWidth: '160px' }}>
                    <label className="form-label">{t('rehearsals.orchestra')}</label>
                    <select
                      className="form-control form-select"
                      value={attendanceOrchestraId}
                      onChange={(e) => setAttendanceOrchestraId(e.target.value)}
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
              {attendanceRehearsalCount > 0 && (
                <div style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: 'var(--text-light)' }}>
                  {t('rehearsals.attendance.rehearsalCount', { count: attendanceRehearsalCount })}
                </div>
              )}
            </div>
          </div>

          {/* Attendance table */}
          {attendanceLoading ? (
            <SkeletonTable rows={8} columns={5} />
          ) : sortedAttendance.length === 0 ? (
            <p className="piece-meta" style={{ padding: '1rem' }}>
              {t('rehearsals.attendance.noData')}
            </p>
          ) : (
            <div className="card">
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th style={{ cursor: 'pointer' }} onClick={() => setAttendanceSortBy('name')}>
                        {t('rehearsals.attendance.name')} {attendanceSortBy === 'name' ? '▼' : ''}
                      </th>
                      <th
                        style={{ cursor: 'pointer', textAlign: 'center' }}
                        onClick={() => setAttendanceSortBy('count')}
                      >
                        {t('rehearsals.attendance.present')} {attendanceSortBy === 'count' ? '▼' : ''}
                      </th>
                      <th style={{ textAlign: 'center' }}>{t('rehearsals.attendance.absent')}</th>
                      <th style={{ textAlign: 'center' }}>{t('rehearsals.attendance.unknown')}</th>
                      <th
                        style={{ cursor: 'pointer', textAlign: 'center', minWidth: '120px' }}
                        onClick={() => setAttendanceSortBy('rate')}
                      >
                        {t('rehearsals.attendance.percentage')} {attendanceSortBy === 'rate' ? '▼' : ''}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedAttendance.map((member, i) => {
                      const rate = member.total > 0 ? Math.round((member.accepted / member.total) * 100) : 0;
                      return (
                        <tr key={member.spondMemberId || member.name + i}>
                          <td style={{ fontWeight: 500 }}>{member.name}</td>
                          <td style={{ textAlign: 'center', color: 'var(--success)' }}>{member.accepted}</td>
                          <td style={{ textAlign: 'center', color: 'var(--danger)' }}>{member.declined}</td>
                          <td style={{ textAlign: 'center', color: 'var(--text-light)' }}>{member.unknown}</td>
                          <td style={{ textAlign: 'center' }}>
                            <div
                              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center' }}
                            >
                              <div
                                style={{
                                  width: '60px',
                                  height: '8px',
                                  background: 'var(--border)',
                                  borderRadius: '4px',
                                  overflow: 'hidden',
                                }}
                              >
                                <div
                                  style={{
                                    width: `${rate}%`,
                                    height: '100%',
                                    background:
                                      rate >= 75
                                        ? 'var(--success)'
                                        : rate >= 50
                                          ? 'var(--warning, orange)'
                                          : 'var(--danger)',
                                    borderRadius: '4px',
                                  }}
                                />
                              </div>
                              <span style={{ fontSize: '0.8rem', fontWeight: 'bold', minWidth: '35px' }}>{rate}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===== DASHBOARD TAB ===== */}
      {activeTab === 'dashboard' && (
        <AttendanceDashboard
          members={sortedAttendance.map(
            (m, i) =>
              ({
                id: m.spondMemberId || `member-${i}`,
                name: m.name,
                instrument: '',
                presentCount: m.accepted,
                absentCount: m.declined,
                attendanceRate: m.total > 0 ? (m.accepted / m.total) * 100 : 0,
              }) as DashboardMember,
          )}
          rehearsals={rehearsals.map(
            (r) =>
              ({
                id: r.id,
                date: r.date,
                totalMembers: r.accepted_count + r.declined_count,
                presentCount: r.accepted_count,
                absentCount: r.declined_count,
                attendanceRate:
                  r.accepted_count + r.declined_count > 0
                    ? (r.accepted_count / (r.accepted_count + r.declined_count)) * 100
                    : 0,
              }) as RehearsalAttendance,
          )}
          trends={rehearsals.slice(0, 20).map(
            (r) =>
              ({
                date: r.date,
                attendanceRate:
                  r.accepted_count + r.declined_count > 0
                    ? (r.accepted_count / (r.accepted_count + r.declined_count)) * 100
                    : 0,
                presentCount: r.accepted_count,
                totalMembers: r.accepted_count + r.declined_count,
              }) as AttendanceTrend,
          )}
          sections={orchestras.map((o) => o.name)}
          onFilterChange={(filters: AttendanceFilters) => {
            setAttendanceFrom(filters.dateFrom);
            setAttendanceTo(filters.dateTo);
            if (filters.section) {
              const orchestra = orchestras.find((o) => o.name === filters.section);
              setAttendanceOrchestraId(orchestra?.id || '');
            } else {
              setAttendanceOrchestraId('');
            }
          }}
          isLoading={attendanceLoading}
        />
      )}

      {/* ===== REHEARSALS TAB ===== */}
      {activeTab === 'rehearsals' && (
        <>
          {/* Generate form */}
          {showGenerate && isManager && (
            <div className="card mb-3">
              <div className="card-header">
                <h2 className="card-title">{t('rehearsals.generate')}</h2>
              </div>
              <div className="card-body">
                <p className="piece-meta mb-2">{t('rehearsals.generateDescription')}</p>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'end' }}>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label className="form-label">{t('rehearsals.generateFrom')}</label>
                    <input
                      type="date"
                      className="form-control"
                      value={genFrom}
                      onChange={(e) => setGenFrom(e.target.value)}
                    />
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label className="form-label">{t('rehearsals.generateTo')}</label>
                    <input
                      type="date"
                      className="form-control"
                      value={genTo}
                      onChange={(e) => setGenTo(e.target.value)}
                    />
                  </div>
                  <button
                    className="btn btn-primary"
                    onClick={handleGenerate}
                    disabled={!genFrom || !genTo || generateRehearsalsMutation.isPending}
                  >
                    {generateRehearsalsMutation.isPending ? t('common.loading') : t('rehearsals.generateButton')}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Recurring rehearsals form */}
          {showRecurring && isManager && (
            <div className="card mb-3">
              <div className="card-header">
                <h2 className="card-title">{t('rehearsals.recurring.title')}</h2>
              </div>
              <div className="card-body">
                <p className="piece-meta mb-2">{t('rehearsals.recurring.description')}</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '1rem' }}>
                  <div className="form-group">
                    <label className="form-label">{t('rehearsals.recurring.dayOfWeek')}</label>
                    <select
                      className="form-control form-select"
                      value={recurringForm.dayOfWeek}
                      onChange={(e) => setRecurringForm({ ...recurringForm, dayOfWeek: Number(e.target.value) })}
                    >
                      {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                        <option key={d} value={d}>
                          {t(`rehearsals.days.${d}`)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">{t('rehearsals.recurring.interval')}</label>
                    <select
                      className="form-control form-select"
                      value={recurringForm.interval}
                      onChange={(e) => setRecurringForm({ ...recurringForm, interval: Number(e.target.value) })}
                    >
                      <option value={1}>{t('rehearsals.recurring.weekly')}</option>
                      <option value={2}>{t('rehearsals.recurring.biweekly')}</option>
                      <option value={3}>{t('rehearsals.recurring.every3weeks')}</option>
                      <option value={4}>{t('rehearsals.recurring.every4weeks')}</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">{t('rehearsals.startTime')}</label>
                    <input
                      type="time"
                      className="form-control"
                      value={recurringForm.startTime}
                      onChange={(e) => setRecurringForm({ ...recurringForm, startTime: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">{t('rehearsals.endTime')}</label>
                    <input
                      type="time"
                      className="form-control"
                      value={recurringForm.endTime}
                      onChange={(e) => setRecurringForm({ ...recurringForm, endTime: e.target.value })}
                    />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
                  <div className="form-group">
                    <label className="form-label">{t('rehearsals.location')}</label>
                    <input
                      type="text"
                      className="form-control"
                      value={recurringForm.location}
                      onChange={(e) => setRecurringForm({ ...recurringForm, location: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">{t('rehearsals.orchestra')}</label>
                    <select
                      className="form-control form-select"
                      value={recurringForm.orchestraId}
                      onChange={(e) => setRecurringForm({ ...recurringForm, orchestraId: e.target.value })}
                    >
                      <option value="">{t('rehearsals.allOrchestras')}</option>
                      {orchestras.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">{t('rehearsals.recurring.until')}</label>
                    <input
                      type="date"
                      className="form-control"
                      value={recurringForm.until}
                      onChange={(e) => setRecurringForm({ ...recurringForm, until: e.target.value })}
                    />
                  </div>
                </div>

                {/* Preview */}
                {recurringPreview.length > 0 && (
                  <div
                    style={{
                      marginTop: '1rem',
                      padding: '0.75rem',
                      background: 'var(--background)',
                      borderRadius: 'var(--radius-sm)',
                    }}
                  >
                    <strong style={{ fontSize: '0.875rem' }}>
                      {t('rehearsals.recurring.preview')} ({recurringPreview.length}):
                    </strong>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}>
                      {recurringPreview.slice(0, 12).map((date) => (
                        <span key={date} className="badge badge-secondary" style={{ fontSize: '0.75rem' }}>
                          {formatDate(date, t)}
                        </span>
                      ))}
                      {recurringPreview.length > 12 && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>
                          +{recurringPreview.length - 12} {t('rehearsals.recurring.more')}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                  <button
                    className="btn btn-primary"
                    onClick={handleCreateRecurring}
                    disabled={recurringLoading || !recurringForm.until || recurringPreview.length === 0}
                  >
                    {recurringLoading
                      ? t('common.loading')
                      : t('rehearsals.recurring.create', { count: recurringPreview.length })}
                  </button>
                  <button
                    className="btn btn-outline"
                    onClick={() => {
                      setShowRecurring(false);
                      setRecurringPreview([]);
                    }}
                  >
                    {t('common.cancel')}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Add/Edit form */}
          {showForm && isManager && (
            <div className="card mb-3">
              <div className="card-header">
                <h2 className="card-title">
                  {editingId ? t('rehearsals.editRehearsal') : t('rehearsals.addRehearsal')}
                </h2>
              </div>
              <div className="card-body">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                  <div className="form-group">
                    <label className="form-label">{t('rehearsals.date')}</label>
                    <input
                      type="date"
                      className="form-control"
                      value={form.date}
                      onChange={(e) => setForm({ ...form, date: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">{t('rehearsals.startTime')}</label>
                    <input
                      type="time"
                      className="form-control"
                      value={form.startTime}
                      onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">{t('rehearsals.endTime')}</label>
                    <input
                      type="time"
                      className="form-control"
                      value={form.endTime}
                      onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                    />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
                  <div className="form-group">
                    <label className="form-label">{t('rehearsals.location')}</label>
                    <input
                      type="text"
                      className="form-control"
                      value={form.location}
                      onChange={(e) => setForm({ ...form, location: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">{t('rehearsals.type')}</label>
                    <select
                      className="form-control form-select"
                      value={form.type}
                      onChange={(e) => setForm({ ...form, type: e.target.value })}
                    >
                      <option value="regular">{t('rehearsals.types.regular')}</option>
                      <option value="extra">{t('rehearsals.types.extra')}</option>
                      <option value="cancelled">{t('rehearsals.types.cancelled')}</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">{t('rehearsals.orchestra')}</label>
                    <select
                      className="form-control form-select"
                      value={form.orchestraId}
                      onChange={(e) => setForm({ ...form, orchestraId: e.target.value })}
                    >
                      <option value="">{t('rehearsals.allOrchestras')}</option>
                      {orchestras.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="form-group" style={{ marginTop: '1rem' }}>
                  <label className="form-label">{t('rehearsals.notes')}</label>
                  <input
                    type="text"
                    className="form-control"
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  />
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                  <button
                    className="btn btn-primary"
                    onClick={handleSaveRehearsal}
                    disabled={!form.date || saveRehearsalMutation.isPending}
                  >
                    {saveRehearsalMutation.isPending ? t('common.loading') : t('common.save')}
                  </button>
                  <button className="btn btn-outline" onClick={() => confirmClose(closeForm)}>
                    {t('common.cancel')}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Default days management */}
          {isManager && (
            <div className="card mb-3">
              <div className="card-header">
                <h2 className="card-title">{t('rehearsals.defaultDays')}</h2>
                <button className="btn btn-primary btn-sm" onClick={() => setShowDefaultForm(!showDefaultForm)}>
                  + {t('rehearsals.addDefaultDay')}
                </button>
              </div>
              <div className="card-body">
                <p className="piece-meta mb-2">{t('rehearsals.defaultDaysDescription')}</p>
                {showDefaultForm && (
                  <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', alignItems: 'end' }}>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label className="form-label">{t('rehearsals.date')}</label>
                      <select
                        className="form-control form-select"
                        value={defaultForm.dayOfWeek}
                        onChange={(e) => setDefaultForm({ ...defaultForm, dayOfWeek: Number(e.target.value) })}
                      >
                        {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                          <option key={d} value={d}>
                            {t(`rehearsals.days.${d}`)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">{t('rehearsals.startTime')}</label>
                      <input
                        type="time"
                        className="form-control"
                        value={defaultForm.startTime}
                        onChange={(e) => setDefaultForm({ ...defaultForm, startTime: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">{t('rehearsals.endTime')}</label>
                      <input
                        type="time"
                        className="form-control"
                        value={defaultForm.endTime}
                        onChange={(e) => setDefaultForm({ ...defaultForm, endTime: e.target.value })}
                      />
                    </div>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label className="form-label">{t('rehearsals.location')}</label>
                      <input
                        type="text"
                        className="form-control"
                        value={defaultForm.location}
                        onChange={(e) => setDefaultForm({ ...defaultForm, location: e.target.value })}
                      />
                    </div>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label className="form-label">{t('rehearsals.orchestra')}</label>
                      <select
                        className="form-control form-select"
                        value={defaultForm.orchestraId}
                        onChange={(e) => setDefaultForm({ ...defaultForm, orchestraId: e.target.value })}
                      >
                        <option value="">{t('rehearsals.allOrchestras')}</option>
                        {orchestras.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button className="btn btn-primary" onClick={handleAddDefaultDay}>
                      {t('common.save')}
                    </button>
                  </div>
                )}
                {defaultDays.length > 0 ? (
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {defaultDays.map((d) => (
                      <div
                        key={d.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          padding: '0.5rem 0.75rem',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius-sm)',
                          background: 'var(--background)',
                        }}
                      >
                        <strong>{t(`rehearsals.days.${d.day_of_week}`)}</strong>
                        <span>
                          {d.start_time} - {d.end_time}
                        </span>
                        {d.location && <span style={{ color: 'var(--text-light)' }}>· {d.location}</span>}
                        {d.orchestra_name && (
                          <span className="badge badge-secondary" style={{ fontSize: '0.7rem' }}>
                            {d.orchestra_name}
                          </span>
                        )}
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={() => handleDeleteDefaultDay(d.id)}
                          style={{ padding: '0.1rem 0.4rem', fontSize: '0.7rem' }}
                        >
                          &times;
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="piece-meta">{t('rehearsals.noDefaultDays')}</p>
                )}
              </div>
            </div>
          )}

          {/* Spond integration */}
          {isAdmin && (
            <div className="card mb-3">
              <div className="card-header">
                <h2 className="card-title">{t('rehearsals.spond.title')}</h2>
                {spondConfig?.configured && spondConfig.groupId && (
                  <button className="btn btn-primary btn-sm" onClick={handleSyncAll} disabled={isSyncing}>
                    {isSyncing ? t('rehearsals.spond.syncing') : t('rehearsals.spond.syncAll')}
                  </button>
                )}
              </div>
              <div className="card-body">
                <p className="piece-meta mb-2">{t('rehearsals.spond.description')}</p>

                {spondConfig?.configured ? (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.75rem' }}>
                      <span className={`badge badge-${spondConfig.syncEnabled ? 'success' : 'secondary'}`}>
                        {spondConfig.syncEnabled ? t('rehearsals.spond.enabled') : t('rehearsals.spond.disabled')}
                      </span>
                      <span style={{ fontSize: '0.875rem' }}>{spondConfig.username}</span>
                      {spondConfig.groupId && (
                        <span style={{ fontSize: '0.875rem', color: 'var(--text-light)' }}>
                          Groep: {spondConfig.groupId.slice(0, 8)}...
                        </span>
                      )}
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-light)' }}>
                        {t('rehearsals.spond.lastSync')}:{' '}
                        {spondConfig.lastSync
                          ? new Date(spondConfig.lastSync).toLocaleString()
                          : t('rehearsals.spond.never')}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        className="btn btn-outline btn-sm"
                        onClick={() => {
                          setSpondForm({
                            username: spondConfig.username || '',
                            password: '',
                            groupId: spondConfig.groupId || '',
                          });
                          setShowSpondSetup(true);
                          handleLoadGroups();
                        }}
                      >
                        {t('common.edit')}
                      </button>
                      <button
                        className="btn btn-outline btn-sm"
                        onClick={() => setRemovingSpondConfig(true)}
                        style={{ color: 'var(--danger)' }}
                      >
                        {t('rehearsals.spond.removeConfig')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <p style={{ marginBottom: '0.5rem' }}>{t('rehearsals.spond.notConfigured')}</p>
                    <button className="btn btn-primary btn-sm" onClick={() => setShowSpondSetup(true)}>
                      {t('rehearsals.spond.configure')}
                    </button>
                  </div>
                )}

                {/* Spond setup form */}
                {showSpondSetup && (
                  <div
                    style={{
                      marginTop: '1rem',
                      padding: '1rem',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius)',
                    }}
                  >
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                      <div className="form-group">
                        <label className="form-label">{t('rehearsals.spond.username')}</label>
                        <input
                          type="email"
                          className="form-control"
                          value={spondForm.username}
                          onChange={(e) => setSpondForm({ ...spondForm, username: e.target.value })}
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">{t('rehearsals.spond.password')}</label>
                        <input
                          type="password"
                          className="form-control"
                          value={spondForm.password}
                          onChange={(e) => setSpondForm({ ...spondForm, password: e.target.value })}
                          placeholder={spondConfig?.configured ? '••••••••' : ''}
                        />
                      </div>
                    </div>
                    <div className="form-group" style={{ marginTop: '0.75rem' }}>
                      <label className="form-label">{t('rehearsals.spond.selectGroup')}</label>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <select
                          className="form-control form-select"
                          value={spondForm.groupId}
                          onChange={(e) => setSpondForm({ ...spondForm, groupId: e.target.value })}
                          style={{ flex: 1 }}
                        >
                          <option value="">{t('rehearsals.spond.noGroup')}</option>
                          {spondGroups.map((g) => (
                            <option key={g.id} value={g.id}>
                              {g.name} ({g.memberCount} leden)
                            </option>
                          ))}
                        </select>
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={handleLoadGroups}
                          disabled={loadingGroups || !spondForm.username || !spondForm.password}
                        >
                          {loadingGroups ? t('rehearsals.spond.loadingGroups') : t('rehearsals.spond.selectGroup')}
                        </button>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                      <button
                        className="btn btn-primary"
                        onClick={handleSaveSpondConfig}
                        disabled={!spondForm.username || !spondForm.password}
                      >
                        {t('rehearsals.spond.saveConfig')}
                      </button>
                      <button className="btn btn-outline" onClick={() => setShowSpondSetup(false)}>
                        {t('common.cancel')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Rehearsal list */}
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">
                {t('rehearsals.upcoming')} ({upcoming.length})
              </h2>
            </div>
            <div className="card-body flush">
              <ResponsiveTable<Rehearsal>
                data={upcoming}
                keyExtractor={(r) => r.id}
                emptyMessage={t('rehearsals.noRehearsals')}
                emptyIcon="calendar"
                hoverable
                onRowClick={(r) => handleOpenDetail(r.id)}
                columns={[
                  {
                    id: 'date',
                    header: t('rehearsals.date'),
                    accessor: (r) => {
                      const holiday = getHolidayForDate(r.date);
                      return (
                        <div style={getTypeStyle(r.type)}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <strong>{formatDate(r.date, t)}</strong>
                            {holiday && (
                              <Tooltip
                                content={t('holidays.rehearsalInHoliday', { name: holiday.name })}
                                position="top"
                              >
                                <span
                                  style={{
                                    backgroundColor: 'var(--warning)',
                                    color: 'white',
                                    padding: '0.1rem 0.3rem',
                                    borderRadius: 'var(--radius-sm)',
                                    fontSize: '0.65rem',
                                    fontWeight: 500,
                                  }}
                                >
                                  {t('holidays.isHoliday')}
                                </span>
                              </Tooltip>
                            )}
                          </div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-light)' }}>
                            {r.start_time} - {r.end_time}
                          </div>
                        </div>
                      );
                    },
                    priority: 1,
                    showInCard: true,
                  },
                  {
                    id: 'location',
                    header: t('rehearsals.location'),
                    accessor: (r) => r.location || '-',
                    priority: 2,
                    hideOnMobile: true,
                  },
                  {
                    id: 'orchestra',
                    header: t('rehearsals.orchestra'),
                    accessor: (r) => r.orchestra_name || t('rehearsals.allOrchestras'),
                    priority: 3,
                    hideOnMobile: true,
                  },
                  {
                    id: 'type',
                    header: t('rehearsals.type'),
                    accessor: (r) =>
                      r.type !== 'regular' ? (
                        <span
                          className={`badge badge-${r.type === 'extra' ? 'warning' : 'danger'}`}
                          style={{ fontSize: '0.7rem' }}
                        >
                          {t(`rehearsals.types.${r.type}`)}
                        </span>
                      ) : (
                        <span className="badge badge-secondary" style={{ fontSize: '0.7rem' }}>
                          {t('rehearsals.types.regular')}
                        </span>
                      ),
                    priority: 4,
                    hideOnMobile: true,
                  },
                  {
                    id: 'pieces',
                    header: t('rehearsals.pieces'),
                    accessor: (r) =>
                      r.piece_count > 0 ? (
                        <span className="badge badge-primary" style={{ fontSize: '0.7rem' }}>
                          {r.piece_count}
                        </span>
                      ) : (
                        '-'
                      ),
                    priority: 5,
                    hideOnMobile: true,
                    align: 'center',
                  },
                  {
                    id: 'attendance',
                    header: t('rehearsals.attendance.title'),
                    accessor: (r) =>
                      r.accepted_count > 0 || r.declined_count > 0 ? (
                        <span style={{ fontSize: '0.75rem' }}>
                          <span
                            style={{
                              color: 'var(--success)',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.15rem',
                            }}
                          >
                            <Icon name="check" size={12} />
                            {r.accepted_count}
                          </span>{' '}
                          <span
                            style={{
                              color: 'var(--danger)',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.15rem',
                            }}
                          >
                            <Icon name="close" size={12} />
                            {r.declined_count}
                          </span>
                        </span>
                      ) : (
                        '-'
                      ),
                    priority: 3,
                    hideOnMobile: true,
                    align: 'center',
                  },
                  ...(isManager
                    ? ([
                        {
                          id: 'actions',
                          header: t('common.actions'),
                          accessor: (r: Rehearsal): ReactNode => (
                            <div
                              style={{ display: 'flex', gap: '0.25rem' }}
                              onClick={(e: React.MouseEvent) => e.stopPropagation()}
                            >
                              <Tooltip content={t('common.edit')} position="top">
                                <button
                                  className="btn btn-outline btn-sm"
                                  onClick={() => handleEdit(r)}
                                  style={{ padding: '0.2rem 0.4rem', fontSize: '0.7rem' }}
                                  aria-label={t('common.edit')}
                                >
                                  <Icon name="pencil" size={14} />
                                </button>
                              </Tooltip>
                              <Tooltip content={t('common.delete')} position="top">
                                <button
                                  className="btn btn-outline btn-sm"
                                  onClick={() => setDeletingRehearsalId(r.id)}
                                  style={{ padding: '0.2rem 0.4rem', fontSize: '0.7rem', color: 'var(--danger)' }}
                                  aria-label={t('common.delete')}
                                >
                                  <Icon name="trash" size={14} />
                                </button>
                              </Tooltip>
                            </div>
                          ),
                          priority: 1,
                          showInCard: false,
                          sortable: false,
                        },
                      ] as ColumnDefinition<Rehearsal>[])
                    : []),
                ]}
              />
            </div>
          </div>
        </>
      )}

      {/* Unsaved changes confirmation for the rehearsal form */}
      {unsavedChangesDialog}

      {/* Delete Rehearsal Confirmation */}
      {deletingRehearsalId && (
        <ConfirmDialog
          title={t('rehearsals.deleteTitle')}
          message={t('rehearsals.deleteConfirm')}
          confirmLabel={t('common.delete')}
          variant="danger"
          isLoading={deleteRehearsalMutation.isPending}
          onConfirm={() => handleDelete(deletingRehearsalId)}
          onCancel={() => setDeletingRehearsalId(null)}
        />
      )}

      {/* Remove Spond Config Confirmation */}
      {removingSpondConfig && (
        <ConfirmDialog
          title={t('rehearsals.spond.removeTitle')}
          message={t('rehearsals.spond.removeConfirm')}
          confirmLabel={t('common.remove')}
          variant="danger"
          onConfirm={handleRemoveSpondConfig}
          onCancel={() => setRemovingSpondConfig(false)}
        />
      )}
    </div>
  );
}

function formatDate(dateStr: string, t: any): string {
  const date = new Date(dateStr + 'T00:00:00');
  const dayName = t(`rehearsals.days.${date.getDay()}`);
  return `${dayName} ${date.getDate()}-${date.getMonth() + 1}-${date.getFullYear()}`;
}
