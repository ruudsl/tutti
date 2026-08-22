import { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import { showSuccess, showError } from '../../utils/toast';
import { getErrorMessage } from '../../utils/errorHandling';
import { ConfirmDialog } from '../../components/ConfirmDialog';
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
} from '../../api';
import type { AttendanceMember, Holiday } from '../../api';
import type { Rehearsal, RehearsalDetail, SpondGroup, RehearsalSeat } from '../../types';
import { ROLES } from '../../utils/constants';
import { SkeletonTable } from '../../components/Skeleton';
import { AddToCalendarButton } from '../../components/CalendarSync';
import { CustomFieldFormSection, CustomFieldRenderer } from '../../components/CustomFields';
import {
  EMPTY_REHEARSAL_FORM,
  MANAGER_ROLES,
  WEEKDAY_CODES,
  berekenHerhaalVoorbeeld,
  formatDate,
  type DefaultDayFormState,
  type RecurringFormState,
  type RehearsalTab,
  type SpondFormState,
} from './hulpfuncties';
import { TabBar } from './TabBar';
import { AttendanceTab } from './AttendanceTab';
import { DashboardTab } from './DashboardTab';
import { GenerateForm } from './GenerateForm';
import { RecurringForm } from './RecurringForm';
import { RehearsalForm } from './RehearsalForm';
import { DefaultDaysCard } from './DefaultDaysCard';
import { SpondCard } from './SpondCard';
import { RehearsalList } from './RehearsalList';
import { PiecesCard } from './PiecesCard';
import { MyAttendanceCard } from './MyAttendanceCard';
import { AttendanceListCard } from './AttendanceListCard';
import { SeatingCard } from './SeatingCard';

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
  const [defaultForm, setDefaultForm] = useState<DefaultDayFormState>({
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
  const [recurringForm, setRecurringForm] = useState<RecurringFormState>({
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
  const [spondForm, setSpondForm] = useState<SpondFormState>({ username: '', password: '', groupId: '' });
  const [spondGroups, setSpondGroups] = useState<SpondGroup[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const isAdmin = user?.role === ROLES.ADMIN;

  // Tabs
  const [activeTab, setActiveTab] = useState<RehearsalTab>('rehearsals');

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

  // De opstellingskaart hoort bij één repetitie. Hij werd nergens teruggezet,
  // dus wie repetitie A bekeek en daarna B opende, kreeg bij B de indeling van
  // A te zien - met stoelnummers en al.
  const verbergOpstelling = () => {
    setShowSeating(false);
    setRehearsalSeating([]);
  };

  const handleOpenDetail = async (id: string) => {
    try {
      const detail = await getRehearsal(id);
      // Alleen bij een ándere repetitie. `handleOpenDetail` wordt ook gebruikt
      // om hetzelfde detailscherm te verversen (na het opslaan van stukken of
      // een spond-synchronisatie); daar zou de kaart onder de gebruiker
      // vandaan dichtklappen.
      if (id !== selectedRehearsal?.id) verbergOpstelling();
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
      // Mislukte de aanroep, dan bleef de gebruiker met alleen een
      // console.error op de lijst staan, alsof zijn klik niet aankwam. Zelfde
      // melding als de rest van de pagina bij een mislukt ophalen.
      showError(getErrorMessage(e, t('common.error')));
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

  const buildRrule = () => {
    const byDay = WEEKDAY_CODES[recurringForm.dayOfWeek];
    let rrule = `FREQ=WEEKLY;BYDAY=${byDay}`;
    if (recurringForm.interval > 1) {
      rrule += `;INTERVAL=${recurringForm.interval}`;
    }
    return rrule;
  };

  // Het formulier kent geen begindatum: een reeks loopt vanaf vandaag, net als
  // aan de serverkant. `today` is dezelfde kale datum waarmee de pagina ook de
  // repetities opvraagt, zodat het voorbeeld en de lijst het over dezelfde dag
  // hebben. Het rekenwerk zelf staat in hulpfuncties.ts.
  const calculateRecurringPreview = () => {
    setRecurringPreview(
      berekenHerhaalVoorbeeld(today, recurringForm.dayOfWeek, recurringForm.interval, recurringForm.until),
    );
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
  // Bij een bestaande koppeling ligt het wachtwoord al versleuteld in de
  // database. Het bewerkscherm maakt dat veld leeg, dus wie alleen een andere
  // groep koos kon niet opslaan: de knop bleef uit. Leeg laten betekent nu
  // "houd het huidige wachtwoord".
  const spondWachtwoordBekend = Boolean(spondConfig?.configured);
  const spondFormBruikbaar = Boolean(spondForm.username) && (Boolean(spondForm.password) || spondWachtwoordBekend);

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
        <button
          className="btn btn-outline mb-3"
          onClick={() => {
            setSelectedRehearsal(null);
            verbergOpstelling();
          }}
        >
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

        <PiecesCard
          selectedRehearsal={selectedRehearsal}
          isManager={isManager}
          editingPieces={editingPieces}
          setEditingPieces={setEditingPieces}
          handleStartEditPieces={handleStartEditPieces}
          pieces={pieces}
          setPieces={setPieces}
          handleSavePieces={handleSavePieces}
        />

        <MyAttendanceCard
          myAttendanceStatus={myAttendanceStatus}
          handleUpdateMyAttendance={handleUpdateMyAttendance}
          isUpdatingAttendance={updateMyAttendanceMutation.isPending}
          canSyncToSpond={canSyncToSpond}
        />

        <AttendanceListCard
          selectedRehearsal={selectedRehearsal}
          isManager={isManager}
          spondConfig={spondConfig}
          isSyncing={isSyncing}
          handleSyncRehearsal={handleSyncRehearsal}
        />

        {isManager && (
          <SeatingCard
            selectedRehearsal={selectedRehearsal}
            seatingLoading={seatingLoading}
            handleLoadSeating={handleLoadSeating}
            handleGenerateSeating={handleGenerateSeating}
            showSeating={showSeating}
            rehearsalSeating={rehearsalSeating}
          />
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
      <TabBar activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* ===== ATTENDANCE TAB ===== */}
      {activeTab === 'attendance' && (
        <AttendanceTab
          attendanceFrom={attendanceFrom}
          setAttendanceFrom={setAttendanceFrom}
          attendanceTo={attendanceTo}
          setAttendanceTo={setAttendanceTo}
          orchestras={orchestras}
          attendanceOrchestraId={attendanceOrchestraId}
          setAttendanceOrchestraId={setAttendanceOrchestraId}
          attendanceRehearsalCount={attendanceRehearsalCount}
          attendanceLoading={attendanceLoading}
          sortedAttendance={sortedAttendance}
          attendanceSortBy={attendanceSortBy}
          setAttendanceSortBy={setAttendanceSortBy}
        />
      )}

      {/* ===== DASHBOARD TAB ===== */}
      {activeTab === 'dashboard' && (
        <DashboardTab
          sortedAttendance={sortedAttendance}
          rehearsals={rehearsals}
          orchestras={orchestras}
          setAttendanceFrom={setAttendanceFrom}
          setAttendanceTo={setAttendanceTo}
          setAttendanceOrchestraId={setAttendanceOrchestraId}
          attendanceLoading={attendanceLoading}
        />
      )}

      {/* ===== REHEARSALS TAB ===== */}
      {activeTab === 'rehearsals' && (
        <>
          {/* Generate form */}
          {showGenerate && isManager && (
            <GenerateForm
              genFrom={genFrom}
              setGenFrom={setGenFrom}
              genTo={genTo}
              setGenTo={setGenTo}
              handleGenerate={handleGenerate}
              isGenerating={generateRehearsalsMutation.isPending}
            />
          )}

          {/* Recurring rehearsals form */}
          {showRecurring && isManager && (
            <RecurringForm
              recurringForm={recurringForm}
              setRecurringForm={setRecurringForm}
              orchestras={orchestras}
              recurringPreview={recurringPreview}
              setRecurringPreview={setRecurringPreview}
              recurringLoading={recurringLoading}
              handleCreateRecurring={handleCreateRecurring}
              setShowRecurring={setShowRecurring}
            />
          )}

          {/* Add/Edit form */}
          {showForm && isManager && (
            <RehearsalForm
              form={form}
              setForm={setForm}
              editingId={editingId}
              orchestras={orchestras}
              handleSaveRehearsal={handleSaveRehearsal}
              isSaving={saveRehearsalMutation.isPending}
              confirmClose={confirmClose}
              closeForm={closeForm}
            />
          )}

          {/* Default days management */}
          {isManager && (
            <DefaultDaysCard
              showDefaultForm={showDefaultForm}
              setShowDefaultForm={setShowDefaultForm}
              defaultForm={defaultForm}
              setDefaultForm={setDefaultForm}
              orchestras={orchestras}
              handleAddDefaultDay={handleAddDefaultDay}
              defaultDays={defaultDays}
              handleDeleteDefaultDay={handleDeleteDefaultDay}
            />
          )}

          {/* Spond integration */}
          {isAdmin && (
            <SpondCard
              spondConfig={spondConfig}
              isSyncing={isSyncing}
              handleSyncAll={handleSyncAll}
              showSpondSetup={showSpondSetup}
              setShowSpondSetup={setShowSpondSetup}
              spondForm={spondForm}
              setSpondForm={setSpondForm}
              handleLoadGroups={handleLoadGroups}
              spondGroups={spondGroups}
              loadingGroups={loadingGroups}
              spondWachtwoordBekend={spondWachtwoordBekend}
              spondFormBruikbaar={spondFormBruikbaar}
              handleSaveSpondConfig={handleSaveSpondConfig}
              setRemovingSpondConfig={setRemovingSpondConfig}
            />
          )}

          {/* Rehearsal list */}
          <RehearsalList
            upcoming={upcoming}
            isManager={isManager}
            getHolidayForDate={getHolidayForDate}
            handleOpenDetail={handleOpenDetail}
            handleEdit={handleEdit}
            setDeletingRehearsalId={setDeletingRehearsalId}
          />
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
