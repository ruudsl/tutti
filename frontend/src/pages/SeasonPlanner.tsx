import { currentLocale } from '../utils/locale';
import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useAuth } from '../context/AuthContext';
import { Icon } from '../components/Icon';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { SkeletonTable } from '../components/Skeleton';
import { ROLES } from '../utils/constants';
import { getOrchestras, getConcertTypes } from '../api';
import type { PlannedConcert, Season, SeasonTemplate } from '../api';
import {
  useSeasons,
  useSeason,
  useSeasonTemplates,
  useCreateSeason,
  useUpdateSeason,
  useDeleteSeason,
  useCreateSeasonTemplate,
  useDeleteSeasonTemplate,
  useGenerateSeasonEvents,
} from '../hooks/useSeasons';
import { useQuery } from '@tanstack/react-query';

const MANAGER_ROLES = [ROLES.ADMIN, ROLES.MUSIC_COMMITTEE, ROLES.CONDUCTOR];

type WizardStep = 'info' | 'rehearsals' | 'concerts' | 'budget' | 'review';

const WEEKDAYS = [
  { value: 0, label: 'Zondag' },
  { value: 1, label: 'Maandag' },
  { value: 2, label: 'Dinsdag' },
  { value: 3, label: 'Woensdag' },
  { value: 4, label: 'Donderdag' },
  { value: 5, label: 'Vrijdag' },
  { value: 6, label: 'Zaterdag' },
];

interface WizardState {
  // Step 1: Basic Info
  name: string;
  startDate: string;
  endDate: string;
  templateId: string;
  budgetTotal: number | null;
  notes: string;

  // Step 2: Rehearsals
  generateRehearsals: boolean;
  rehearsalDay: number;
  rehearsalTime: string;
  rehearsalEndTime: string;
  rehearsalLocation: string;
  orchestraId: string;
  excludedDates: string[];

  // Step 3: Concerts
  generateConcerts: boolean;
  concerts: PlannedConcert[];

  // Step 4: Budget
  // Budget per concert is in concerts array
}

const defaultWizardState: WizardState = {
  name: '',
  startDate: '',
  endDate: '',
  templateId: '',
  budgetTotal: null,
  notes: '',
  generateRehearsals: true,
  rehearsalDay: 2, // Tuesday
  rehearsalTime: '19:30',
  rehearsalEndTime: '21:30',
  rehearsalLocation: '',
  orchestraId: '',
  excludedDates: [],
  generateConcerts: true,
  concerts: [],
};

export default function SeasonPlanner() {
  const { t } = useTranslation();
  const { user } = useAuth();
  useDocumentTitle('pageTitle.seasonPlanner');

  const isManager = user && MANAGER_ROLES.includes(user.role as (typeof MANAGER_ROLES)[number]);

  // Data queries
  const { data: seasons = [], isLoading: seasonsLoading } = useSeasons();
  const { data: templates = [] } = useSeasonTemplates();
  const { data: orchestras = [] } = useQuery({
    queryKey: ['orchestras'],
    queryFn: getOrchestras,
  });
  const { data: concertTypesData } = useQuery({
    queryKey: ['concertTypes'],
    queryFn: getConcertTypes,
  });
  const concertTypes = concertTypesData?.concertTypes || [];

  // Mutations
  const createSeason = useCreateSeason();
  const updateSeason = useUpdateSeason();
  const deleteSeason = useDeleteSeason();
  const createTemplate = useCreateSeasonTemplate();
  const deleteTemplate = useDeleteSeasonTemplate();
  const generateEvents = useGenerateSeasonEvents();

  // UI state
  const [activeTab, setActiveTab] = useState<'seasons' | 'templates' | 'wizard'>('seasons');
  const [wizardStep, setWizardStep] = useState<WizardStep>('info');
  const [wizardState, setWizardState] = useState<WizardState>(defaultWizardState);
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null);
  const [deletingSeasonId, setDeletingSeasonId] = useState<string | null>(null);
  const [deletingTemplateId, setDeletingTemplateId] = useState<string | null>(null);
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [templateForm, setTemplateForm] = useState({
    name: '',
    description: '',
    defaultRehearsalDay: 2,
    defaultRehearsalTime: '19:30',
    defaultRehearsalDuration: 120,
    defaultRehearsalLocation: '',
    typicalConcertsCount: 4,
  });

  // Selected season detail
  const { data: selectedSeason } = useSeason(selectedSeasonId || '');

  // Calculated rehearsal preview
  const rehearsalPreview = useMemo(() => {
    if (!wizardState.startDate || !wizardState.endDate || !wizardState.generateRehearsals) {
      return [];
    }

    const dates: string[] = [];
    const start = new Date(wizardState.startDate);
    const end = new Date(wizardState.endDate);
    const excludeSet = new Set(wizardState.excludedDates);

    // Find first occurrence of selected day
    const current = new Date(start);
    while (current.getDay() !== wizardState.rehearsalDay && current <= end) {
      current.setDate(current.getDate() + 1);
    }

    // Generate dates
    while (current <= end && dates.length < 60) {
      const dateStr = current.toISOString().split('T')[0];
      if (!excludeSet.has(dateStr)) {
        dates.push(dateStr);
      }
      current.setDate(current.getDate() + 7);
    }

    return dates;
  }, [
    wizardState.startDate,
    wizardState.endDate,
    wizardState.rehearsalDay,
    wizardState.excludedDates,
    wizardState.generateRehearsals,
  ]);

  // Calculate total budget from concerts
  const totalConcertBudget = useMemo(() => {
    return wizardState.concerts.reduce((sum, c) => sum + (c.budgetAmount || 0), 0);
  }, [wizardState.concerts]);

  // Apply template to wizard state
  const applyTemplate = (template: SeasonTemplate) => {
    setWizardState((prev) => ({
      ...prev,
      templateId: template.id,
      rehearsalDay: template.defaultRehearsalDay ?? prev.rehearsalDay,
      rehearsalTime: template.defaultRehearsalTime || prev.rehearsalTime,
      rehearsalLocation: template.defaultRehearsalLocation || prev.rehearsalLocation,
      // Generate default concert slots based on template
      concerts:
        prev.concerts.length === 0
          ? Array(template.typicalConcertsCount)
              .fill(null)
              .map((_, i) => ({
                name: `Concert ${i + 1}`,
                date: '',
                location: '',
                type: '',
                budgetAmount: 0,
              }))
          : prev.concerts,
    }));
  };

  // Step validation
  const isStepValid = (step: WizardStep): boolean => {
    switch (step) {
      case 'info':
        return !!wizardState.name && !!wizardState.startDate && !!wizardState.endDate;
      case 'rehearsals':
        return !wizardState.generateRehearsals || rehearsalPreview.length > 0;
      case 'concerts':
        return !wizardState.generateConcerts || wizardState.concerts.every((c) => !c.name || (c.name && c.date));
      case 'budget':
        return true;
      case 'review':
        return true;
      default:
        return true;
    }
  };

  const steps: { id: WizardStep; label: string }[] = [
    { id: 'info', label: t('seasonPlanner.steps.info') },
    { id: 'rehearsals', label: t('seasonPlanner.steps.rehearsals') },
    { id: 'concerts', label: t('seasonPlanner.steps.concerts') },
    { id: 'budget', label: t('seasonPlanner.steps.budget') },
    { id: 'review', label: t('seasonPlanner.steps.review') },
  ];

  const currentStepIndex = steps.findIndex((s) => s.id === wizardStep);

  const goToNextStep = () => {
    if (currentStepIndex < steps.length - 1) {
      setWizardStep(steps[currentStepIndex + 1].id);
    }
  };

  const goToPreviousStep = () => {
    if (currentStepIndex > 0) {
      setWizardStep(steps[currentStepIndex - 1].id);
    }
  };

  const startWizard = () => {
    setWizardState(defaultWizardState);
    setWizardStep('info');
    setActiveTab('wizard');
  };

  const handleFinishWizard = async () => {
    try {
      // Create the season
      const result = await createSeason.mutateAsync({
        name: wizardState.name,
        startDate: wizardState.startDate,
        endDate: wizardState.endDate,
        templateId: wizardState.templateId || undefined,
        budgetTotal: wizardState.budgetTotal || undefined,
        notes: wizardState.notes || undefined,
      });

      // Generate events
      const validConcerts = wizardState.concerts.filter((c) => c.name && c.date);

      await generateEvents.mutateAsync({
        seasonId: result.id,
        params: {
          generateRehearsals: wizardState.generateRehearsals,
          generateConcerts: wizardState.generateConcerts && validConcerts.length > 0,
          rehearsalDay: wizardState.rehearsalDay,
          rehearsalTime: wizardState.rehearsalTime,
          rehearsalEndTime: wizardState.rehearsalEndTime,
          rehearsalLocation: wizardState.rehearsalLocation || undefined,
          orchestraId: wizardState.orchestraId || undefined,
          excludeDates: wizardState.excludedDates,
          concerts: validConcerts,
        },
      });

      setActiveTab('seasons');
      setSelectedSeasonId(result.id);
    } catch (error) {
      // Error is handled by the mutation
    }
  };

  const handleCreateTemplate = async () => {
    if (!templateForm.name) return;

    await createTemplate.mutateAsync({
      name: templateForm.name,
      description: templateForm.description || undefined,
      defaultRehearsalDay: templateForm.defaultRehearsalDay,
      defaultRehearsalTime: templateForm.defaultRehearsalTime,
      defaultRehearsalDuration: templateForm.defaultRehearsalDuration,
      defaultRehearsalLocation: templateForm.defaultRehearsalLocation || undefined,
      typicalConcertsCount: templateForm.typicalConcertsCount,
    });

    setShowTemplateForm(false);
    setTemplateForm({
      name: '',
      description: '',
      defaultRehearsalDay: 2,
      defaultRehearsalTime: '19:30',
      defaultRehearsalDuration: 120,
      defaultRehearsalLocation: '',
      typicalConcertsCount: 4,
    });
  };

  const handleDeleteSeason = async (id: string) => {
    await deleteSeason.mutateAsync(id);
    setDeletingSeasonId(null);
    if (selectedSeasonId === id) {
      setSelectedSeasonId(null);
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    await deleteTemplate.mutateAsync(id);
    setDeletingTemplateId(null);
  };

  const addConcert = () => {
    setWizardState((prev) => ({
      ...prev,
      concerts: [...prev.concerts, { name: '', date: '', location: '', type: '', budgetAmount: 0 }],
    }));
  };

  const removeConcert = (index: number) => {
    setWizardState((prev) => ({
      ...prev,
      concerts: prev.concerts.filter((_, i) => i !== index),
    }));
  };

  const updateConcert = (index: number, field: keyof PlannedConcert, value: string | number) => {
    setWizardState((prev) => ({
      ...prev,
      concerts: prev.concerts.map((c, i) => (i === index ? { ...c, [field]: value } : c)),
    }));
  };

  const toggleExcludeDate = (date: string) => {
    setWizardState((prev) => ({
      ...prev,
      excludedDates: prev.excludedDates.includes(date)
        ? prev.excludedDates.filter((d) => d !== date)
        : [...prev.excludedDates, date],
    }));
  };

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(currentLocale(), {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const getStatusBadge = (status: Season['status']) => {
    const colors: Record<string, string> = {
      draft: 'secondary',
      active: 'success',
      completed: 'primary',
    };
    return <span className={`badge badge-${colors[status]}`}>{t(`seasonPlanner.status.${status}`)}</span>;
  };

  if (!isManager) {
    return (
      <div className="card">
        <div className="card-body">
          <p>{t('common.noPermission')}</p>
        </div>
      </div>
    );
  }

  if (seasonsLoading) {
    return (
      <div>
        <h1>{t('seasonPlanner.title')}</h1>
        <SkeletonTable rows={5} columns={5} />
      </div>
    );
  }

  // Season Detail View
  if (selectedSeasonId && selectedSeason) {
    return (
      <div>
        <button className="btn btn-outline mb-3" onClick={() => setSelectedSeasonId(null)}>
          &larr; {t('common.back')}
        </button>

        <div className="flex justify-between items-start mb-4">
          <div>
            <h1>{selectedSeason.name}</h1>
            <p className="piece-meta">
              {formatDate(selectedSeason.startDate)} - {formatDate(selectedSeason.endDate)}{' '}
              {getStatusBadge(selectedSeason.status)}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              className="btn btn-outline"
              onClick={() =>
                updateSeason.mutate({
                  id: selectedSeasonId,
                  data: {
                    status:
                      selectedSeason.status === 'draft'
                        ? 'active'
                        : selectedSeason.status === 'active'
                          ? 'completed'
                          : 'draft',
                  },
                })
              }
            >
              {selectedSeason.status === 'draft'
                ? t('seasonPlanner.activate')
                : selectedSeason.status === 'active'
                  ? t('seasonPlanner.complete')
                  : t('seasonPlanner.reopen')}
            </button>
          </div>
        </div>

        {selectedSeason.notes && (
          <div className="card mb-3">
            <div className="card-body">
              <strong>{t('common.notes')}:</strong> {selectedSeason.notes}
            </div>
          </div>
        )}

        {/* Budget Summary */}
        {selectedSeason.budgetTotal && (
          <div className="card mb-3">
            <div className="card-header">
              <h2 className="card-title">{t('seasonPlanner.budget.title')}</h2>
            </div>
            <div className="card-body">
              <div className="flex gap-4">
                <div>
                  <span className="piece-meta">{t('seasonPlanner.budget.total')}</span>
                  <div className="text-lg font-bold">
                    {selectedSeason.budgetTotal.toLocaleString(currentLocale(), { style: 'currency', currency: 'EUR' })}
                  </div>
                </div>
                <div>
                  <span className="piece-meta">{t('seasonPlanner.budget.allocated')}</span>
                  <div className="text-lg font-bold">
                    {selectedSeason.budgetAllocated.toLocaleString(currentLocale(), {
                      style: 'currency',
                      currency: 'EUR',
                    })}
                  </div>
                </div>
                <div>
                  <span className="piece-meta">{t('seasonPlanner.budget.remaining')}</span>
                  <div
                    className="text-lg font-bold"
                    style={{
                      color:
                        selectedSeason.budgetTotal - selectedSeason.budgetAllocated < 0
                          ? 'var(--danger)'
                          : 'var(--success)',
                    }}
                  >
                    {(selectedSeason.budgetTotal - selectedSeason.budgetAllocated).toLocaleString(currentLocale(), {
                      style: 'currency',
                      currency: 'EUR',
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Events */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">
              {t('seasonPlanner.events.title')} ({selectedSeason.events.length})
            </h2>
          </div>
          <div className="card-body flush">
            {selectedSeason.events.length > 0 ? (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t('common.date')}</th>
                    <th>{t('seasonPlanner.events.type')}</th>
                    <th>{t('common.name')}</th>
                    <th>{t('seasonPlanner.budget.amount')}</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedSeason.events.map((event) => (
                    <tr key={event.id}>
                      <td>{formatDate(event.plannedDate)}</td>
                      <td>
                        <span
                          className={`badge badge-${event.eventType === 'concert' ? 'primary' : event.eventType === 'rehearsal' ? 'secondary' : 'outline'}`}
                        >
                          {t(`seasonPlanner.events.types.${event.eventType}`)}
                        </span>
                      </td>
                      <td>{event.eventName || '-'}</td>
                      <td>
                        {event.budgetAmount
                          ? event.budgetAmount.toLocaleString(currentLocale(), { style: 'currency', currency: 'EUR' })
                          : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="piece-meta p-4">{t('seasonPlanner.events.empty')}</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Wizard View
  if (activeTab === 'wizard') {
    return (
      <div>
        <button className="btn btn-outline mb-3" onClick={() => setActiveTab('seasons')}>
          &larr; {t('common.back')}
        </button>

        <h1>{t('seasonPlanner.wizard.title')}</h1>

        {/* Progress Steps */}
        <div className="flex gap-1 mb-4" style={{ marginTop: '1rem' }}>
          {steps.map((step, index) => (
            <div
              key={step.id}
              className="flex-1"
              style={{
                padding: '0.75rem',
                background:
                  index === currentStepIndex
                    ? 'var(--primary)'
                    : index < currentStepIndex
                      ? 'var(--success)'
                      : 'var(--border)',
                color: index <= currentStepIndex ? 'white' : 'inherit',
                borderRadius: 'var(--radius-sm)',
                textAlign: 'center',
                cursor: index < currentStepIndex ? 'pointer' : 'default',
                fontSize: '0.875rem',
              }}
              onClick={() => index < currentStepIndex && setWizardStep(step.id)}
            >
              {index + 1}. {step.label}
            </div>
          ))}
        </div>

        {/* Step Content */}
        <div className="card">
          <div className="card-body">
            {/* Step 1: Basic Info */}
            {wizardStep === 'info' && (
              <div>
                <h2 className="card-title mb-3">{t('seasonPlanner.wizard.infoTitle')}</h2>

                <div className="form-group">
                  <label className="form-label">{t('seasonPlanner.fields.name')} *</label>
                  <input
                    type="text"
                    className="form-control"
                    value={wizardState.name}
                    onChange={(e) => setWizardState((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder={t('seasonPlanner.fields.namePlaceholder')}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group">
                    <label className="form-label">{t('seasonPlanner.fields.startDate')} *</label>
                    <input
                      type="date"
                      className="form-control"
                      value={wizardState.startDate}
                      onChange={(e) => setWizardState((prev) => ({ ...prev, startDate: e.target.value }))}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">{t('seasonPlanner.fields.endDate')} *</label>
                    <input
                      type="date"
                      className="form-control"
                      value={wizardState.endDate}
                      onChange={(e) => setWizardState((prev) => ({ ...prev, endDate: e.target.value }))}
                    />
                  </div>
                </div>

                {templates.length > 0 && (
                  <div className="form-group">
                    <label className="form-label">{t('seasonPlanner.fields.template')}</label>
                    <select
                      className="form-control form-select"
                      value={wizardState.templateId}
                      onChange={(e) => {
                        const template = templates.find((t) => t.id === e.target.value);
                        if (template) {
                          applyTemplate(template);
                        } else {
                          setWizardState((prev) => ({ ...prev, templateId: '' }));
                        }
                      }}
                    >
                      <option value="">{t('seasonPlanner.fields.noTemplate')}</option>
                      {templates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label">{t('seasonPlanner.fields.budgetTotal')}</label>
                  <input
                    type="number"
                    className="form-control"
                    value={wizardState.budgetTotal || ''}
                    onChange={(e) =>
                      setWizardState((prev) => ({
                        ...prev,
                        budgetTotal: e.target.value ? Number(e.target.value) : null,
                      }))
                    }
                    placeholder="0.00"
                    step="0.01"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">{t('common.notes')}</label>
                  <textarea
                    className="form-control"
                    value={wizardState.notes}
                    onChange={(e) => setWizardState((prev) => ({ ...prev, notes: e.target.value }))}
                    rows={3}
                  />
                </div>
              </div>
            )}

            {/* Step 2: Rehearsals */}
            {wizardStep === 'rehearsals' && (
              <div>
                <h2 className="card-title mb-3">{t('seasonPlanner.wizard.rehearsalsTitle')}</h2>

                <div className="form-group">
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input
                      type="checkbox"
                      checked={wizardState.generateRehearsals}
                      onChange={(e) => setWizardState((prev) => ({ ...prev, generateRehearsals: e.target.checked }))}
                    />
                    {t('seasonPlanner.fields.generateRehearsals')}
                  </label>
                </div>

                {wizardState.generateRehearsals && (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                      <div className="form-group">
                        <label className="form-label">{t('seasonPlanner.fields.rehearsalDay')}</label>
                        <select
                          className="form-control form-select"
                          value={wizardState.rehearsalDay}
                          onChange={(e) =>
                            setWizardState((prev) => ({ ...prev, rehearsalDay: Number(e.target.value) }))
                          }
                        >
                          {WEEKDAYS.map((day) => (
                            <option key={day.value} value={day.value}>
                              {t(`rehearsals.days.${day.value}`)}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="form-group">
                        <label className="form-label">{t('rehearsals.startTime')}</label>
                        <input
                          type="time"
                          className="form-control"
                          value={wizardState.rehearsalTime}
                          onChange={(e) => setWizardState((prev) => ({ ...prev, rehearsalTime: e.target.value }))}
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">{t('rehearsals.endTime')}</label>
                        <input
                          type="time"
                          className="form-control"
                          value={wizardState.rehearsalEndTime}
                          onChange={(e) => setWizardState((prev) => ({ ...prev, rehearsalEndTime: e.target.value }))}
                        />
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                      <div className="form-group">
                        <label className="form-label">{t('rehearsals.location')}</label>
                        <input
                          type="text"
                          className="form-control"
                          value={wizardState.rehearsalLocation}
                          onChange={(e) => setWizardState((prev) => ({ ...prev, rehearsalLocation: e.target.value }))}
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">{t('rehearsals.orchestra')}</label>
                        <select
                          className="form-control form-select"
                          value={wizardState.orchestraId}
                          onChange={(e) => setWizardState((prev) => ({ ...prev, orchestraId: e.target.value }))}
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

                    {/* Preview */}
                    {rehearsalPreview.length > 0 && (
                      <div
                        style={{
                          marginTop: '1rem',
                          padding: '1rem',
                          background: 'var(--background)',
                          borderRadius: 'var(--radius)',
                        }}
                      >
                        <strong>
                          {t('seasonPlanner.wizard.rehearsalPreview')} ({rehearsalPreview.length})
                        </strong>
                        <p className="piece-meta mb-2">{t('seasonPlanner.wizard.clickToExclude')}</p>
                        <div
                          style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: '0.5rem',
                            maxHeight: '200px',
                            overflowY: 'auto',
                          }}
                        >
                          {rehearsalPreview.map((date) => {
                            const isExcluded = wizardState.excludedDates.includes(date);
                            return (
                              <button
                                key={date}
                                type="button"
                                className={`badge ${isExcluded ? 'badge-danger' : 'badge-secondary'}`}
                                onClick={() => toggleExcludeDate(date)}
                                style={{ cursor: 'pointer', textDecoration: isExcluded ? 'line-through' : 'none' }}
                              >
                                {formatDate(date)}
                              </button>
                            );
                          })}
                        </div>
                        {wizardState.excludedDates.length > 0 && (
                          <p className="piece-meta mt-2">
                            {t('seasonPlanner.wizard.excludedCount', { count: wizardState.excludedDates.length })}
                          </p>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Step 3: Concerts */}
            {wizardStep === 'concerts' && (
              <div>
                <h2 className="card-title mb-3">{t('seasonPlanner.wizard.concertsTitle')}</h2>

                <div className="form-group">
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input
                      type="checkbox"
                      checked={wizardState.generateConcerts}
                      onChange={(e) => setWizardState((prev) => ({ ...prev, generateConcerts: e.target.checked }))}
                    />
                    {t('seasonPlanner.fields.generateConcerts')}
                  </label>
                </div>

                {wizardState.generateConcerts && (
                  <>
                    {wizardState.concerts.map((concert, index) => (
                      <div key={index} className="card mb-2" style={{ background: 'var(--background)' }}>
                        <div className="card-body" style={{ padding: '0.75rem' }}>
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              marginBottom: '0.5rem',
                            }}
                          >
                            <strong>
                              {t('seasonPlanner.wizard.concert')} {index + 1}
                            </strong>
                            <button
                              type="button"
                              className="btn btn-outline btn-sm"
                              onClick={() => removeConcert(index)}
                              style={{ color: 'var(--danger)' }}
                            >
                              <Icon name="trash" size={14} />
                            </button>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: '0.5rem' }}>
                            <input
                              type="text"
                              className="form-control"
                              placeholder={t('seasonPlanner.fields.concertName')}
                              value={concert.name}
                              onChange={(e) => updateConcert(index, 'name', e.target.value)}
                            />
                            <input
                              type="date"
                              className="form-control"
                              value={concert.date}
                              onChange={(e) => updateConcert(index, 'date', e.target.value)}
                            />
                            <input
                              type="text"
                              className="form-control"
                              placeholder={t('rehearsals.location')}
                              value={concert.location || ''}
                              onChange={(e) => updateConcert(index, 'location', e.target.value)}
                            />
                            <select
                              className="form-control form-select"
                              value={concert.type || ''}
                              onChange={(e) => updateConcert(index, 'type', e.target.value)}
                            >
                              <option value="">{t('seasonPlanner.fields.concertType')}</option>
                              {concertTypes.map((ct) => (
                                <option key={ct.value} value={ct.value}>
                                  {ct.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>
                    ))}
                    <button type="button" className="btn btn-outline" onClick={addConcert}>
                      + {t('seasonPlanner.wizard.addConcert')}
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Step 4: Budget */}
            {wizardStep === 'budget' && (
              <div>
                <h2 className="card-title mb-3">{t('seasonPlanner.wizard.budgetTitle')}</h2>

                {wizardState.budgetTotal && (
                  <div className="card mb-3" style={{ background: 'var(--background)' }}>
                    <div className="card-body">
                      <div className="flex gap-4">
                        <div>
                          <span className="piece-meta">{t('seasonPlanner.budget.total')}</span>
                          <div className="text-lg font-bold">
                            {wizardState.budgetTotal.toLocaleString(currentLocale(), {
                              style: 'currency',
                              currency: 'EUR',
                            })}
                          </div>
                        </div>
                        <div>
                          <span className="piece-meta">{t('seasonPlanner.budget.allocated')}</span>
                          <div className="text-lg font-bold">
                            {totalConcertBudget.toLocaleString(currentLocale(), { style: 'currency', currency: 'EUR' })}
                          </div>
                        </div>
                        <div>
                          <span className="piece-meta">{t('seasonPlanner.budget.remaining')}</span>
                          <div
                            className="text-lg font-bold"
                            style={{
                              color:
                                wizardState.budgetTotal - totalConcertBudget < 0 ? 'var(--danger)' : 'var(--success)',
                            }}
                          >
                            {(wizardState.budgetTotal - totalConcertBudget).toLocaleString(currentLocale(), {
                              style: 'currency',
                              currency: 'EUR',
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {wizardState.generateConcerts && wizardState.concerts.length > 0 && (
                  <div>
                    <h3>{t('seasonPlanner.wizard.concertBudgets')}</h3>
                    {wizardState.concerts
                      .filter((c) => c.name)
                      .map((concert, index) => (
                        <div key={index} className="flex items-center gap-2 mb-2">
                          <span style={{ minWidth: '200px' }}>{concert.name || `Concert ${index + 1}`}</span>
                          <input
                            type="number"
                            className="form-control"
                            style={{ width: '150px' }}
                            value={concert.budgetAmount || ''}
                            onChange={(e) =>
                              updateConcert(index, 'budgetAmount', e.target.value ? Number(e.target.value) : 0)
                            }
                            placeholder="0.00"
                            step="0.01"
                          />
                          <span>EUR</span>
                        </div>
                      ))}
                  </div>
                )}

                {!wizardState.budgetTotal && <p className="piece-meta">{t('seasonPlanner.wizard.noBudgetSet')}</p>}
              </div>
            )}

            {/* Step 5: Review */}
            {wizardStep === 'review' && (
              <div>
                <h2 className="card-title mb-3">{t('seasonPlanner.wizard.reviewTitle')}</h2>

                <div className="card mb-3" style={{ background: 'var(--background)' }}>
                  <div className="card-body">
                    <h3>{t('seasonPlanner.wizard.summary')}</h3>
                    <table className="table">
                      <tbody>
                        <tr>
                          <td>
                            <strong>{t('seasonPlanner.fields.name')}</strong>
                          </td>
                          <td>{wizardState.name}</td>
                        </tr>
                        <tr>
                          <td>
                            <strong>{t('seasonPlanner.fields.period')}</strong>
                          </td>
                          <td>
                            {formatDate(wizardState.startDate)} - {formatDate(wizardState.endDate)}
                          </td>
                        </tr>
                        {wizardState.budgetTotal && (
                          <tr>
                            <td>
                              <strong>{t('seasonPlanner.budget.total')}</strong>
                            </td>
                            <td>
                              {wizardState.budgetTotal.toLocaleString(currentLocale(), {
                                style: 'currency',
                                currency: 'EUR',
                              })}
                            </td>
                          </tr>
                        )}
                        <tr>
                          <td>
                            <strong>{t('seasonPlanner.wizard.rehearsalsToCreate')}</strong>
                          </td>
                          <td>
                            {wizardState.generateRehearsals
                              ? rehearsalPreview.length - wizardState.excludedDates.length
                              : 0}
                          </td>
                        </tr>
                        <tr>
                          <td>
                            <strong>{t('seasonPlanner.wizard.concertsToCreate')}</strong>
                          </td>
                          <td>
                            {wizardState.generateConcerts
                              ? wizardState.concerts.filter((c) => c.name && c.date).length
                              : 0}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {wizardState.generateConcerts && wizardState.concerts.filter((c) => c.name && c.date).length > 0 && (
                  <div className="card mb-3" style={{ background: 'var(--background)' }}>
                    <div className="card-body">
                      <h3>{t('seasonPlanner.wizard.plannedConcerts')}</h3>
                      <ul>
                        {wizardState.concerts
                          .filter((c) => c.name && c.date)
                          .map((concert, index) => (
                            <li key={index}>
                              <strong>{concert.name}</strong> - {formatDate(concert.date)}
                              {concert.location && ` @ ${concert.location}`}
                              {concert.budgetAmount
                                ? ` (${concert.budgetAmount.toLocaleString(currentLocale(), { style: 'currency', currency: 'EUR' })})`
                                : ''}
                            </li>
                          ))}
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Navigation Buttons */}
          <div className="card-footer" style={{ display: 'flex', justifyContent: 'space-between' }}>
            <button
              type="button"
              className="btn btn-outline"
              onClick={goToPreviousStep}
              disabled={currentStepIndex === 0}
            >
              &larr; {t('common.previous')}
            </button>
            <div className="flex gap-2">
              {wizardStep === 'review' ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleFinishWizard}
                  disabled={!isStepValid(wizardStep) || createSeason.isPending || generateEvents.isPending}
                >
                  {createSeason.isPending || generateEvents.isPending
                    ? t('common.loading')
                    : t('seasonPlanner.wizard.finish')}
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={goToNextStep}
                  disabled={!isStepValid(wizardStep)}
                >
                  {t('common.next')} &rarr;
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Main View (Seasons List / Templates)
  return (
    <div>
      <div className="page-header">
        <h1>{t('seasonPlanner.title')}</h1>
        <button className="btn btn-primary" onClick={startWizard}>
          <Icon name="plus" size={16} /> {t('seasonPlanner.newSeason')}
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0', borderBottom: '2px solid var(--border)', marginBottom: '1.5rem' }}>
        <button
          onClick={() => setActiveTab('seasons')}
          style={{
            padding: '0.5rem 1.5rem',
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            fontWeight: activeTab === 'seasons' ? 'bold' : 'normal',
            borderBottom: activeTab === 'seasons' ? '2px solid var(--primary)' : '2px solid transparent',
            marginBottom: '-2px',
            color: activeTab === 'seasons' ? 'var(--primary)' : 'inherit',
          }}
        >
          {t('seasonPlanner.tabs.seasons')}
        </button>
        <button
          onClick={() => setActiveTab('templates')}
          style={{
            padding: '0.5rem 1.5rem',
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            fontWeight: activeTab === 'templates' ? 'bold' : 'normal',
            borderBottom: activeTab === 'templates' ? '2px solid var(--primary)' : '2px solid transparent',
            marginBottom: '-2px',
            color: activeTab === 'templates' ? 'var(--primary)' : 'inherit',
          }}
        >
          {t('seasonPlanner.tabs.templates')}
        </button>
      </div>

      {/* Seasons Tab */}
      {activeTab === 'seasons' && (
        <div className="card">
          <div className="card-body flush">
            {seasons.length > 0 ? (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t('common.name')}</th>
                    <th>{t('seasonPlanner.fields.period')}</th>
                    <th>{t('common.status')}</th>
                    <th>{t('seasonPlanner.events.title')}</th>
                    <th>{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {seasons.map((season) => (
                    <tr key={season.id} onClick={() => setSelectedSeasonId(season.id)} style={{ cursor: 'pointer' }}>
                      <td>
                        <strong>{season.name}</strong>
                      </td>
                      <td>
                        {formatDate(season.startDate)} - {formatDate(season.endDate)}
                      </td>
                      <td>{getStatusBadge(season.status)}</td>
                      <td>
                        <span className="badge badge-secondary">
                          {season.rehearsalCount} {t('seasonPlanner.rehearsals')}
                        </span>{' '}
                        <span className="badge badge-primary">
                          {season.concertCount} {t('seasonPlanner.concerts')}
                        </span>
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={() => setDeletingSeasonId(season.id)}
                          style={{ color: 'var(--danger)' }}
                        >
                          <Icon name="trash" size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="p-4 text-center">
                <Icon name="calendar" size={48} style={{ opacity: 0.3, marginBottom: '1rem' }} />
                <p className="piece-meta">{t('seasonPlanner.empty')}</p>
                <button className="btn btn-primary mt-2" onClick={startWizard}>
                  {t('seasonPlanner.createFirst')}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Templates Tab */}
      {activeTab === 'templates' && (
        <div>
          <div className="flex justify-end mb-3">
            <button className="btn btn-outline" onClick={() => setShowTemplateForm(true)}>
              <Icon name="plus" size={16} /> {t('seasonPlanner.newTemplate')}
            </button>
          </div>

          {showTemplateForm && (
            <div className="card mb-3">
              <div className="card-header">
                <h2 className="card-title">{t('seasonPlanner.newTemplate')}</h2>
              </div>
              <div className="card-body">
                <div className="form-group">
                  <label className="form-label">{t('common.name')} *</label>
                  <input
                    type="text"
                    className="form-control"
                    value={templateForm.name}
                    onChange={(e) => setTemplateForm((prev) => ({ ...prev, name: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('common.description')}</label>
                  <textarea
                    className="form-control"
                    value={templateForm.description}
                    onChange={(e) => setTemplateForm((prev) => ({ ...prev, description: e.target.value }))}
                    rows={2}
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                  <div className="form-group">
                    <label className="form-label">{t('seasonPlanner.fields.defaultRehearsalDay')}</label>
                    <select
                      className="form-control form-select"
                      value={templateForm.defaultRehearsalDay}
                      onChange={(e) =>
                        setTemplateForm((prev) => ({ ...prev, defaultRehearsalDay: Number(e.target.value) }))
                      }
                    >
                      {WEEKDAYS.map((day) => (
                        <option key={day.value} value={day.value}>
                          {t(`rehearsals.days.${day.value}`)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">{t('seasonPlanner.fields.defaultRehearsalTime')}</label>
                    <input
                      type="time"
                      className="form-control"
                      value={templateForm.defaultRehearsalTime}
                      onChange={(e) => setTemplateForm((prev) => ({ ...prev, defaultRehearsalTime: e.target.value }))}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">{t('seasonPlanner.fields.typicalConcerts')}</label>
                    <input
                      type="number"
                      className="form-control"
                      value={templateForm.typicalConcertsCount}
                      onChange={(e) =>
                        setTemplateForm((prev) => ({ ...prev, typicalConcertsCount: Number(e.target.value) }))
                      }
                      min={0}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">{t('seasonPlanner.fields.defaultRehearsalLocation')}</label>
                  <input
                    type="text"
                    className="form-control"
                    value={templateForm.defaultRehearsalLocation}
                    onChange={(e) => setTemplateForm((prev) => ({ ...prev, defaultRehearsalLocation: e.target.value }))}
                  />
                </div>
                <div className="flex gap-2 mt-3">
                  <button
                    className="btn btn-primary"
                    onClick={handleCreateTemplate}
                    disabled={!templateForm.name || createTemplate.isPending}
                  >
                    {createTemplate.isPending ? t('common.loading') : t('common.save')}
                  </button>
                  <button className="btn btn-outline" onClick={() => setShowTemplateForm(false)}>
                    {t('common.cancel')}
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="card">
            <div className="card-body flush">
              {templates.length > 0 ? (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{t('common.name')}</th>
                      <th>{t('common.description')}</th>
                      <th>{t('seasonPlanner.fields.defaultRehearsalDay')}</th>
                      <th>{t('seasonPlanner.fields.typicalConcerts')}</th>
                      <th>{t('common.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {templates.map((template) => (
                      <tr key={template.id}>
                        <td>
                          <strong>{template.name}</strong>
                        </td>
                        <td>{template.description || '-'}</td>
                        <td>
                          {template.defaultRehearsalDay !== null
                            ? t(`rehearsals.days.${template.defaultRehearsalDay}`)
                            : '-'}
                        </td>
                        <td>{template.typicalConcertsCount}</td>
                        <td>
                          <button
                            className="btn btn-outline btn-sm"
                            onClick={() => setDeletingTemplateId(template.id)}
                            style={{ color: 'var(--danger)' }}
                          >
                            <Icon name="trash" size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="p-4 text-center">
                  <Icon name="fileText" size={48} style={{ opacity: 0.3, marginBottom: '1rem' }} />
                  <p className="piece-meta">{t('seasonPlanner.templates.empty')}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Season Confirmation */}
      {deletingSeasonId && (
        <ConfirmDialog
          title={t('seasonPlanner.deleteSeason')}
          message={t('seasonPlanner.deleteSeasonConfirm')}
          confirmLabel={t('common.delete')}
          variant="danger"
          isLoading={deleteSeason.isPending}
          onConfirm={() => handleDeleteSeason(deletingSeasonId)}
          onCancel={() => setDeletingSeasonId(null)}
        />
      )}

      {/* Delete Template Confirmation */}
      {deletingTemplateId && (
        <ConfirmDialog
          title={t('seasonPlanner.deleteTemplate')}
          message={t('seasonPlanner.deleteTemplateConfirm')}
          confirmLabel={t('common.delete')}
          variant="danger"
          isLoading={deleteTemplate.isPending}
          onConfirm={() => handleDeleteTemplate(deletingTemplateId)}
          onCancel={() => setDeletingTemplateId(null)}
        />
      )}
    </div>
  );
}
