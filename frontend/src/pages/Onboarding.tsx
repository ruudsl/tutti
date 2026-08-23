import { currentLocale } from '../utils/locale';
import { useId, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm, Controller } from 'react-hook-form';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useInstruments } from '../hooks/useInstruments';
import { useOrchestras } from '../hooks/useOrchestras';
import { showSuccess, showError } from '../utils/toast';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { FormField } from '../components/FormField';
import {
  onboardMember,
  getPendingSpondLinks,
  deletePendingSpondLink,
  getInactiveMembers,
  reactivateMember,
  getMicrosoftConfig,
  getM365GroupMappings,
  getInstrumentJobTitleMappings,
  createInstrumentJobTitleMapping,
  updateInstrumentJobTitleMapping,
  deleteInstrumentJobTitleMapping,
  retryEmailForwarding,
  type OnboardingResponse,
  type InactiveMember,
  type M365GroupMapping,
  type InstrumentJobTitleMapping,
} from '../api';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface OnboardingFormData {
  firstName: string;
  lastName: string;
  email: string;
  privateEmail: string;
  instrumentIds: string[];
  orchestraIds: string[];
  createM365Account: boolean;
  addToPercussionGroup: boolean;
}

type WizardStep = 'form' | 'result';
type ActiveTab = 'onboard' | 'pending' | 'inactive' | 'm365';

export default function Onboarding() {
  const { t } = useTranslation();
  useDocumentTitle('pageTitle.onboarding');
  const queryClient = useQueryClient();

  // Ids voor de velden die niet via FormField lopen; zie de opmerkingen daar.
  const veldId = useId();
  const emailId = `${veldId}-email`;
  const priveEmailId = `${veldId}-prive-email`;
  const instrumentenId = `${veldId}-instrumenten`;
  const orkestenLabelId = `${veldId}-orkesten`;
  const fotoLabelId = `${veldId}-foto`;

  const [activeTab, setActiveTab] = useState<ActiveTab>('onboard');
  const [wizardStep, setWizardStep] = useState<WizardStep>('form');
  const [onboardingResult, setOnboardingResult] = useState<OnboardingResponse | null>(null);
  const [confirmReactivate, setConfirmReactivate] = useState<InactiveMember | null>(null);
  const [passwordCopied, setPasswordCopied] = useState(false);
  // Of er bij deze aanmelding een privé-adres is opgegeven. De server stuurt
  // e-mail alleen door als dat er is, en meldt anders `emailForwardingSet:
  // false` - hetzelfde antwoord als bij een mislukte poging. Zonder dit
  // onderscheid staat er na elke aanmelding een waarschuwing over doorsturen
  // dat "nog niet is ingesteld", terwijl er niets door te sturen viel.
  const [priveEmailOpgegeven, setPriveEmailOpgegeven] = useState(false);
  const [profilePhoto, setProfilePhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Job title mapping state
  const [newMappingInstrumentId, setNewMappingInstrumentId] = useState('');
  const [newMappingJobTitle, setNewMappingJobTitle] = useState('');
  const [editingMapping, setEditingMapping] = useState<{ id: string; jobTitle: string } | null>(null);
  const [confirmDeleteMapping, setConfirmDeleteMapping] = useState<InstrumentJobTitleMapping | null>(null);

  const { data: instruments = [] } = useInstruments();
  const { data: orchestras = [] } = useOrchestras();
  const { data: msConfig } = useQuery({
    queryKey: ['microsoftConfig'],
    queryFn: getMicrosoftConfig,
    retry: false,
  });

  const { data: m365Groups = [] } = useQuery({
    queryKey: ['m365GroupMappings'],
    queryFn: getM365GroupMappings,
    enabled: !!msConfig?.configured,
  });

  // Query for instrument job title mappings
  const { data: jobTitleMappings = [], isLoading: jobTitleMappingsLoading } = useQuery({
    queryKey: ['instrumentJobTitleMappings'],
    queryFn: getInstrumentJobTitleMappings,
    enabled: !!msConfig?.configured,
  });

  // Mutations for job title mappings
  const createJobTitleMappingMutation = useMutation({
    mutationFn: createInstrumentJobTitleMapping,
    onSuccess: () => {
      showSuccess(t('memberOnboarding.m365Settings.mappingCreated'));
      queryClient.invalidateQueries({ queryKey: ['instrumentJobTitleMappings'] });
      setNewMappingInstrumentId('');
      setNewMappingJobTitle('');
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || t('memberOnboarding.m365Settings.errorCreatingMapping'));
    },
  });

  const updateJobTitleMappingMutation = useMutation({
    mutationFn: ({ id, jobTitle }: { id: string; jobTitle: string }) => updateInstrumentJobTitleMapping(id, jobTitle),
    onSuccess: () => {
      showSuccess(t('memberOnboarding.m365Settings.mappingUpdated'));
      queryClient.invalidateQueries({ queryKey: ['instrumentJobTitleMappings'] });
      setEditingMapping(null);
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || t('memberOnboarding.m365Settings.errorUpdatingMapping'));
    },
  });

  const deleteJobTitleMappingMutation = useMutation({
    mutationFn: deleteInstrumentJobTitleMapping,
    onSuccess: () => {
      showSuccess(t('memberOnboarding.m365Settings.mappingDeleted'));
      queryClient.invalidateQueries({ queryKey: ['instrumentJobTitleMappings'] });
      setConfirmDeleteMapping(null);
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || t('memberOnboarding.m365Settings.errorDeletingMapping'));
    },
  });

  // Check if there's a percussion group configured
  const hasPercussionGroup = m365Groups.some((g: M365GroupMapping) => g.groupType === 'percussion');

  const { data: pendingLinks = [], isLoading: pendingLoading } = useQuery({
    queryKey: ['pendingSpondLinks'],
    queryFn: getPendingSpondLinks,
  });

  const { data: inactiveMembers = [], isLoading: inactiveLoading } = useQuery({
    queryKey: ['inactiveMembers'],
    queryFn: getInactiveMembers,
  });

  const form = useForm<OnboardingFormData>({
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      privateEmail: '',
      instrumentIds: [],
      orchestraIds: [],
      createM365Account: false,
      addToPercussionGroup: false,
    },
  });

  const onboardMutation = useMutation({
    mutationFn: onboardMember,
    onSuccess: (result) => {
      setOnboardingResult(result);
      setWizardStep('result');
      queryClient.invalidateQueries({ queryKey: ['pendingSpondLinks'] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || t('memberOnboarding.errorCreating'));
    },
  });

  const deletePendingMutation = useMutation({
    mutationFn: deletePendingSpondLink,
    onSuccess: () => {
      showSuccess(t('memberOnboarding.pendingLinkRemoved'));
      queryClient.invalidateQueries({ queryKey: ['pendingSpondLinks'] });
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || t('memberOnboarding.errorRemovingLink'));
    },
  });

  const reactivateMutation = useMutation({
    mutationFn: reactivateMember,
    onSuccess: () => {
      showSuccess(t('memberOnboarding.memberReactivated'));
      setConfirmReactivate(null);
      queryClient.invalidateQueries({ queryKey: ['inactiveMembers'] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || t('memberOnboarding.errorReactivating'));
    },
  });

  const retryEmailForwardingMutation = useMutation({
    mutationFn: retryEmailForwarding,
    onSuccess: (result) => {
      showSuccess(result.message);
      // Update the onboarding result to reflect the successful forwarding
      if (onboardingResult) {
        setOnboardingResult({
          ...onboardingResult,
          emailForwardingSet: true,
        });
      }
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || t('memberOnboarding.emailForwardingRetryFailed'));
    },
  });

  const handleSubmit = (data: OnboardingFormData) => {
    setPriveEmailOpgegeven(!!data.privateEmail?.trim());
    onboardMutation.mutate({
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      privateEmail: data.privateEmail || undefined,
      instrumentIds: data.instrumentIds,
      orchestraIds: data.orchestraIds,
      createM365Account: data.createM365Account,
      addToPercussionGroup: data.addToPercussionGroup,
      profilePhoto: profilePhoto || undefined,
    });
  };

  const handlePhotoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        showError(t('memberOnboarding.photoTooLarge'));
        return;
      }
      if (!['image/jpeg', 'image/jpg', 'image/png'].includes(file.type)) {
        showError(t('memberOnboarding.photoInvalidType'));
        return;
      }
      setProfilePhoto(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemovePhoto = () => {
    setProfilePhoto(null);
    setPhotoPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleNewOnboarding = () => {
    form.reset();
    setOnboardingResult(null);
    setWizardStep('form');
    setPasswordCopied(false);
    setPriveEmailOpgegeven(false);
    setProfilePhoto(null);
    setPhotoPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const copyPassword = () => {
    if (onboardingResult?.tempPassword) {
      navigator.clipboard.writeText(onboardingResult.tempPassword);
      setPasswordCopied(true);
      showSuccess(t('memberOnboarding.passwordCopied'));
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString(currentLocale(), {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  return (
    <div className="page">
      <h1>{t('memberOnboarding.title')}</h1>

      {/* Tab Navigation */}
      <div className="flex gap-2 mb-3">
        <button
          className={`btn ${activeTab === 'onboard' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setActiveTab('onboard')}
        >
          {t('memberOnboarding.tabNewMember')}
        </button>
        <button
          className={`btn ${activeTab === 'pending' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setActiveTab('pending')}
        >
          {t('memberOnboarding.tabPendingLinks')}
          {pendingLinks.length > 0 && (
            <span
              style={{
                marginLeft: '0.5rem',
                background: 'var(--warning)',
                color: 'white',
                borderRadius: '1rem',
                padding: '0.1rem 0.5rem',
                fontSize: '0.75rem',
              }}
            >
              {pendingLinks.length}
            </span>
          )}
        </button>
        <button
          className={`btn ${activeTab === 'inactive' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setActiveTab('inactive')}
        >
          {t('memberOnboarding.tabInactive')}
          {inactiveMembers.length > 0 && (
            <span
              style={{
                marginLeft: '0.5rem',
                background: 'var(--text-secondary)',
                color: 'white',
                borderRadius: '1rem',
                padding: '0.1rem 0.5rem',
                fontSize: '0.75rem',
              }}
            >
              {inactiveMembers.length}
            </span>
          )}
        </button>
        {msConfig?.configured && (
          <button
            className={`btn ${activeTab === 'm365' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setActiveTab('m365')}
          >
            {t('memberOnboarding.tabM365Settings')}
          </button>
        )}
      </div>

      {/* Onboard New Member Tab */}
      {activeTab === 'onboard' && (
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">{t('memberOnboarding.newMemberTitle')}</h2>
          </div>
          <div className="card-body">
            {wizardStep === 'form' ? (
              <form onSubmit={form.handleSubmit(handleSubmit)}>
                <p className="piece-meta mb-3">{t('memberOnboarding.newMemberDescription')}</p>

                <div className="grid grid-cols-2 gap-3">
                  <FormField label={`${t('memberOnboarding.firstName')} *`}>
                    <input type="text" className="form-control" {...form.register('firstName', { required: true })} />
                  </FormField>
                  <FormField label={`${t('memberOnboarding.lastName')} *`}>
                    <input type="text" className="form-control" {...form.register('lastName', { required: true })} />
                  </FormField>
                </div>

                {/* Met de hand gekoppeld: onder het veld staat een hulptekst die binnen
                    dezelfde form-group hoort te blijven, en FormField neemt één kind. */}
                <div className="form-group">
                  <label className="form-label" htmlFor={emailId}>
                    {t('memberOnboarding.email')} *
                  </label>
                  <input
                    id={emailId}
                    aria-describedby={`${emailId}-hulp`}
                    type="email"
                    className="form-control"
                    {...form.register('email', { required: true })}
                  />
                  <small id={`${emailId}-hulp`} className="text-secondary">
                    {t('memberOnboarding.emailHint')}
                  </small>
                </div>

                {msConfig?.configured && (
                  <div className="form-group">
                    <label className="form-label" htmlFor={priveEmailId}>
                      {t('memberOnboarding.privateEmail')}
                    </label>
                    <input
                      id={priveEmailId}
                      aria-describedby={`${priveEmailId}-hulp`}
                      type="email"
                      className="form-control"
                      {...form.register('privateEmail')}
                    />
                    <small id={`${priveEmailId}-hulp`} className="text-secondary">
                      {t('memberOnboarding.privateEmailHint')}
                    </small>
                  </div>
                )}

                {/* Met de hand gekoppeld: het kind is hier een <Controller>, en die geeft
                    een id niet door aan de <select> eronder. Bovendien staat er nog een
                    hulptekst in dezelfde form-group. */}
                <div className="form-group">
                  <label className="form-label" htmlFor={instrumentenId}>
                    {t('memberOnboarding.instruments')}
                  </label>
                  <Controller
                    name="instrumentIds"
                    control={form.control}
                    render={({ field }) => (
                      <select
                        id={instrumentenId}
                        aria-describedby={`${instrumentenId}-hulp`}
                        multiple
                        className="form-control"
                        style={{ height: '120px' }}
                        value={field.value}
                        onChange={(e) => {
                          const selected = Array.from(e.target.selectedOptions, (opt) => opt.value);
                          field.onChange(selected);
                        }}
                      >
                        {instruments.map((inst) => (
                          <option key={inst.id} value={inst.id}>
                            {inst.name} {inst.tuning && `(${inst.tuning})`}
                          </option>
                        ))}
                      </select>
                    )}
                  />
                  <small id={`${instrumentenId}-hulp`} className="text-secondary">
                    {t('memberOnboarding.instrumentsHint')}
                  </small>
                </div>

                {/* Geen veld maar een groep aankruisvakjes die elk hun eigen label om
                    zich heen hebben: een groepskop, dus een <span> in plaats van een
                    <label> die naar niets wijst. */}
                <div className="form-group" role="group" aria-labelledby={orkestenLabelId}>
                  <span id={orkestenLabelId} className="form-label">
                    {t('memberOnboarding.orchestras')}
                  </span>
                  <Controller
                    name="orchestraIds"
                    control={form.control}
                    render={({ field }) => (
                      <div className="flex gap-3 flex-wrap">
                        {orchestras.map((orch) => (
                          <label key={orch.id} className="flex items-center gap-1">
                            <input
                              type="checkbox"
                              checked={field.value.includes(orch.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  field.onChange([...field.value, orch.id]);
                                } else {
                                  field.onChange(field.value.filter((id) => id !== orch.id));
                                }
                              }}
                            />
                            {orch.name}
                          </label>
                        ))}
                      </div>
                    )}
                  />
                </div>

                {msConfig?.configured && (
                  <>
                    <div className="form-group">
                      <label className="flex items-center gap-2">
                        <input type="checkbox" {...form.register('createM365Account')} />
                        {t('memberOnboarding.createM365')}
                      </label>
                      <small className="text-secondary">{t('memberOnboarding.createM365Hint')}</small>
                    </div>

                    {form.watch('createM365Account') && hasPercussionGroup && (
                      <div className="form-group">
                        <label className="flex items-center gap-2">
                          <input type="checkbox" {...form.register('addToPercussionGroup')} />
                          {t('memberOnboarding.addToPercussionGroup')}
                        </label>
                        <small className="text-secondary">{t('memberOnboarding.addToPercussionGroupHint')}</small>
                      </div>
                    )}
                  </>
                )}

                {/* Ook hier geen veldlabel: het bestandsveld staat op display:none en
                    wordt door de knop eronder geopend. Een <label> ernaartoe zou naar
                    iets wijzen wat een schermlezer niet eens ziet staan; de knop draagt
                    zijn eigen naam. Dus een groepskop. */}
                <div className="form-group" role="group" aria-labelledby={fotoLabelId}>
                  <span id={fotoLabelId} className="form-label">
                    {t('memberOnboarding.profilePhoto')}
                  </span>
                  <div className="flex items-center gap-3">
                    {photoPreview ? (
                      <div style={{ position: 'relative' }}>
                        <img
                          src={photoPreview}
                          alt="Preview"
                          style={{
                            width: '80px',
                            height: '80px',
                            borderRadius: '50%',
                            objectFit: 'cover',
                          }}
                        />
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={handleRemovePhoto}
                          style={{
                            position: 'absolute',
                            top: '-8px',
                            right: '-8px',
                            borderRadius: '50%',
                            padding: '2px 6px',
                            fontSize: '12px',
                            background: 'var(--danger)',
                            color: 'white',
                          }}
                        >
                          ×
                        </button>
                      </div>
                    ) : (
                      <div
                        style={{
                          width: '80px',
                          height: '80px',
                          borderRadius: '50%',
                          background: 'var(--bg-secondary)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        ?
                      </div>
                    )}
                    <div>
                      <input
                        type="file"
                        ref={fileInputRef}
                        accept="image/jpeg,image/jpg,image/png"
                        onChange={handlePhotoChange}
                        style={{ display: 'none' }}
                      />
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        {t('memberOnboarding.selectPhoto')}
                      </button>
                    </div>
                  </div>
                  <small className="text-secondary">{t('memberOnboarding.profilePhotoHint')}</small>
                </div>

                <div className="flex gap-2 mt-4">
                  <button type="submit" className="btn btn-primary" disabled={onboardMutation.isPending}>
                    {onboardMutation.isPending ? t('common.loading') : t('memberOnboarding.createMember')}
                  </button>
                </div>
              </form>
            ) : (
              /* Result Step */
              <div>
                <div
                  style={{
                    background: onboardingResult?.success ? 'var(--success-bg, #d4edda)' : 'var(--danger-bg, #f8d7da)',
                    border: `1px solid ${onboardingResult?.success ? 'var(--success)' : 'var(--danger)'}`,
                    borderRadius: '0.5rem',
                    padding: '1rem',
                    marginBottom: '1rem',
                  }}
                >
                  <h3 style={{ margin: 0, marginBottom: '0.5rem' }}>
                    {onboardingResult?.success ? t('memberOnboarding.successTitle') : t('memberOnboarding.errorTitle')}
                  </h3>
                  <p style={{ margin: 0 }}>{onboardingResult?.message}</p>
                </div>

                {onboardingResult?.success && (
                  <>
                    <div className="mb-3">
                      <h4>{t('memberOnboarding.memberDetails')}</h4>
                      <p>
                        <strong>{t('memberOnboarding.name')}:</strong> {onboardingResult.firstName}{' '}
                        {onboardingResult.lastName}
                      </p>
                      <p>
                        <strong>{t('memberOnboarding.email')}:</strong> {onboardingResult.email}
                      </p>
                    </div>

                    <div
                      style={{
                        background: 'var(--bg-secondary)',
                        padding: '1rem',
                        borderRadius: '0.5rem',
                        marginBottom: '1rem',
                      }}
                    >
                      <h4 style={{ marginTop: 0 }}>{t('memberOnboarding.tempPasswordTitle')}</h4>
                      <div className="flex items-center gap-2">
                        <code
                          style={{
                            // Stond op een vaste witte achtergrond terwijl de
                            // tekstkleur van de ouder wordt geërfd. In het
                            // donkere thema is die licht, dus stond hier lichte
                            // tekst op wit: het tijdelijke wachtwoord dat de
                            // gebruiker moet overtypen was onleesbaar. Beide
                            // komen nu uit het thema.
                            background: 'var(--surface)',
                            color: 'var(--text)',
                            padding: '0.5rem 1rem',
                            borderRadius: '0.25rem',
                            fontSize: '1.1rem',
                            fontFamily: 'monospace',
                          }}
                        >
                          {onboardingResult.tempPassword}
                        </code>
                        <button className="btn btn-outline btn-sm" onClick={copyPassword}>
                          {passwordCopied ? t('memberOnboarding.copied') : t('memberOnboarding.copy')}
                        </button>
                      </div>
                      <small className="text-secondary">{t('memberOnboarding.tempPasswordHint')}</small>
                    </div>

                    <div className="mb-3">
                      <h4>{t('memberOnboarding.statusTitle')}</h4>
                      <ul style={{ paddingLeft: '1.5rem' }}>
                        <li style={{ color: 'var(--success)' }}>{t('memberOnboarding.harmonieCreated')}</li>
                        {onboardingResult.m365Created ? (
                          <li style={{ color: 'var(--success)' }}>{t('memberOnboarding.m365Created')}</li>
                        ) : onboardingResult.m365Error ? (
                          <li style={{ color: 'var(--danger)' }}>
                            {t('memberOnboarding.m365Error')}: {onboardingResult.m365Error}
                          </li>
                        ) : null}
                        <li style={{ color: 'var(--warning)' }}>{t('memberOnboarding.spondPending')}</li>
                      </ul>
                    </div>

                    <div
                      style={{
                        background: 'var(--info-bg, #cfe2ff)',
                        border: '1px solid var(--info)',
                        borderRadius: '0.5rem',
                        padding: '1rem',
                        marginBottom: '1rem',
                      }}
                    >
                      <h4 style={{ marginTop: 0 }}>{t('memberOnboarding.nextStepsTitle')}</h4>
                      <ol style={{ paddingLeft: '1.5rem', margin: 0 }}>
                        {onboardingResult.instructions.map((instruction, idx) => (
                          <li key={idx}>{instruction}</li>
                        ))}
                      </ol>
                    </div>

                    {/* Retry email forwarding button when it wasn't set up */}
                    {/* Alleen als er een privé-adres was: het herstelpunt op de
                        server weigert zonder zo'n adres met "Gebruiker heeft geen
                        privé emailadres geconfigureerd", dus zonder deze
                        voorwaarde stond hier een rode vlag bij een aanmelding die
                        vlekkeloos ging, met een knop die niet kón slagen. */}
                    {onboardingResult.m365Created &&
                      onboardingResult.licenseAssigned &&
                      priveEmailOpgegeven &&
                      !onboardingResult.emailForwardingSet && (
                        <div
                          style={{
                            background: 'var(--warning-bg, #fff3cd)',
                            border: '1px solid var(--warning)',
                            borderRadius: '0.5rem',
                            padding: '1rem',
                            marginBottom: '1rem',
                          }}
                        >
                          <h4 style={{ marginTop: 0, marginBottom: '0.5rem' }}>
                            {t('memberOnboarding.emailForwardingPending')}
                          </h4>
                          <p style={{ margin: 0, marginBottom: '0.75rem' }}>
                            {t('memberOnboarding.emailForwardingPendingDesc')}
                          </p>
                          <button
                            className="btn btn-warning btn-sm"
                            onClick={() => retryEmailForwardingMutation.mutate(onboardingResult.userId)}
                            disabled={retryEmailForwardingMutation.isPending}
                          >
                            {retryEmailForwardingMutation.isPending
                              ? t('memberOnboarding.retryingEmailForwarding')
                              : t('memberOnboarding.retryEmailForwarding')}
                          </button>
                        </div>
                      )}
                  </>
                )}

                <button className="btn btn-primary" onClick={handleNewOnboarding}>
                  {t('memberOnboarding.addAnother')}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Pending Spond Links Tab */}
      {activeTab === 'pending' && (
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">{t('memberOnboarding.pendingLinksTitle')}</h2>
          </div>
          <div className="card-body">
            <p className="piece-meta mb-3">{t('memberOnboarding.pendingLinksDescription')}</p>

            {pendingLoading ? (
              <div className="loading">
                <div className="spinner"></div>
              </div>
            ) : pendingLinks.length === 0 ? (
              <p className="text-secondary">{t('memberOnboarding.noPendingLinks')}</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('memberOnboarding.columnName')}</th>
                    <th>{t('memberOnboarding.columnEmail')}</th>
                    <th>{t('memberOnboarding.columnExpectedName')}</th>
                    <th>{t('memberOnboarding.columnCreatedAt')}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {pendingLinks.map((link) => (
                    <tr key={link.id}>
                      <td>
                        {link.firstName} {link.lastName}
                      </td>
                      <td>{link.email}</td>
                      <td>{link.expectedName}</td>
                      <td>{formatDate(link.createdAt)}</td>
                      <td>
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={() => deletePendingMutation.mutate(link.id)}
                          disabled={deletePendingMutation.isPending}
                        >
                          {t('memberOnboarding.removePending')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Inactive Members Tab */}
      {activeTab === 'inactive' && (
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">{t('memberOnboarding.inactiveTitle')}</h2>
          </div>
          <div className="card-body">
            <p className="piece-meta mb-3">{t('memberOnboarding.inactiveDescription')}</p>

            {inactiveLoading ? (
              <div className="loading">
                <div className="spinner"></div>
              </div>
            ) : inactiveMembers.length === 0 ? (
              <p className="text-secondary">{t('memberOnboarding.noInactive')}</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('memberOnboarding.columnName')}</th>
                    <th>{t('memberOnboarding.columnEmail')}</th>
                    <th>{t('memberOnboarding.columnOffboardedAt')}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {inactiveMembers.map((member) => (
                    <tr key={member.id}>
                      <td>
                        {member.firstName} {member.lastName}
                      </td>
                      <td>{member.email}</td>
                      <td>{formatDate(member.offboardedAt)}</td>
                      <td>
                        <button className="btn btn-outline btn-sm" onClick={() => setConfirmReactivate(member)}>
                          {t('memberOnboarding.reactivate')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* M365 Settings Tab */}
      {activeTab === 'm365' && msConfig?.configured && (
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">{t('memberOnboarding.m365Settings.title')}</h2>
          </div>
          <div className="card-body">
            <h3>{t('memberOnboarding.m365Settings.jobTitleMappingsTitle')}</h3>
            <p className="piece-meta mb-3">{t('memberOnboarding.m365Settings.jobTitleMappingsDescription')}</p>

            {/* Add new mapping form */}
            <div
              style={{
                background: 'var(--bg-secondary)',
                padding: '1rem',
                borderRadius: '0.5rem',
                marginBottom: '1rem',
              }}
            >
              <h4 style={{ marginTop: 0 }}>{t('memberOnboarding.m365Settings.addMapping')}</h4>
              <div className="grid grid-cols-3 gap-2" style={{ alignItems: 'end' }}>
                <FormField label={t('memberOnboarding.m365Settings.instrument')} style={{ marginBottom: 0 }}>
                  <select
                    className="form-control"
                    value={newMappingInstrumentId}
                    onChange={(e) => setNewMappingInstrumentId(e.target.value)}
                  >
                    <option value="">{t('memberOnboarding.m365Settings.selectInstrument')}</option>
                    {instruments
                      .filter((inst) => !jobTitleMappings.some((m) => m.instrumentId === inst.id))
                      .map((inst) => (
                        <option key={inst.id} value={inst.id}>
                          {inst.name} {inst.tuning && `(${inst.tuning})`}
                        </option>
                      ))}
                  </select>
                </FormField>
                <FormField label={t('memberOnboarding.m365Settings.jobTitle')} style={{ marginBottom: 0 }}>
                  <input
                    type="text"
                    className="form-control"
                    placeholder={t('memberOnboarding.m365Settings.jobTitlePlaceholder')}
                    value={newMappingJobTitle}
                    onChange={(e) => setNewMappingJobTitle(e.target.value)}
                  />
                </FormField>
                <button
                  className="btn btn-primary"
                  disabled={
                    !newMappingInstrumentId || !newMappingJobTitle.trim() || createJobTitleMappingMutation.isPending
                  }
                  onClick={() =>
                    createJobTitleMappingMutation.mutate({
                      instrumentId: newMappingInstrumentId,
                      jobTitle: newMappingJobTitle.trim(),
                    })
                  }
                >
                  {createJobTitleMappingMutation.isPending
                    ? t('common.loading')
                    : t('memberOnboarding.m365Settings.add')}
                </button>
              </div>
            </div>

            {/* Existing mappings table */}
            {jobTitleMappingsLoading ? (
              <div className="loading">
                <div className="spinner"></div>
              </div>
            ) : jobTitleMappings.length === 0 ? (
              <p className="text-secondary">{t('memberOnboarding.m365Settings.noMappings')}</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('memberOnboarding.m365Settings.instrument')}</th>
                    <th>{t('memberOnboarding.m365Settings.jobTitle')}</th>
                    <th style={{ width: '150px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {jobTitleMappings.map((mapping) => (
                    <tr key={mapping.id}>
                      <td>
                        {mapping.instrumentName}
                        {mapping.instrumentTuning && ` (${mapping.instrumentTuning})`}
                      </td>
                      <td>
                        {editingMapping?.id === mapping.id ? (
                          <input
                            type="text"
                            className="form-control"
                            value={editingMapping.jobTitle}
                            onChange={(e) => setEditingMapping({ ...editingMapping, jobTitle: e.target.value })}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && editingMapping.jobTitle.trim()) {
                                updateJobTitleMappingMutation.mutate({
                                  id: mapping.id,
                                  jobTitle: editingMapping.jobTitle.trim(),
                                });
                              } else if (e.key === 'Escape') {
                                setEditingMapping(null);
                              }
                            }}
                            autoFocus
                          />
                        ) : (
                          mapping.jobTitle
                        )}
                      </td>
                      <td>
                        {editingMapping?.id === mapping.id ? (
                          <div className="flex gap-1">
                            <button
                              className="btn btn-primary btn-sm"
                              disabled={!editingMapping.jobTitle.trim() || updateJobTitleMappingMutation.isPending}
                              onClick={() =>
                                updateJobTitleMappingMutation.mutate({
                                  id: mapping.id,
                                  jobTitle: editingMapping.jobTitle.trim(),
                                })
                              }
                            >
                              {t('common.save')}
                            </button>
                            <button className="btn btn-outline btn-sm" onClick={() => setEditingMapping(null)}>
                              {t('common.cancel')}
                            </button>
                          </div>
                        ) : (
                          <div className="flex gap-1">
                            <button
                              className="btn btn-outline btn-sm"
                              onClick={() => setEditingMapping({ id: mapping.id, jobTitle: mapping.jobTitle })}
                            >
                              {t('common.edit')}
                            </button>
                            <button
                              className="btn btn-outline btn-sm"
                              style={{ color: 'var(--danger)' }}
                              onClick={() => setConfirmDeleteMapping(mapping)}
                            >
                              {t('common.delete')}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Reactivate Confirmation Dialog */}
      {confirmReactivate && (
        <ConfirmDialog
          title={t('memberOnboarding.reactivateTitle')}
          message={t('memberOnboarding.reactivateConfirm', {
            name: `${confirmReactivate.firstName} ${confirmReactivate.lastName}`,
          })}
          confirmLabel={t('memberOnboarding.reactivate')}
          onConfirm={() => reactivateMutation.mutate(confirmReactivate.id)}
          onCancel={() => setConfirmReactivate(null)}
          isLoading={reactivateMutation.isPending}
          variant="info"
        />
      )}

      {/* Delete Mapping Confirmation Dialog */}
      {confirmDeleteMapping && (
        <ConfirmDialog
          title={t('memberOnboarding.m365Settings.deleteMapping')}
          message={t('memberOnboarding.m365Settings.deleteMappingConfirm', {
            instrument: confirmDeleteMapping.instrumentName,
          })}
          confirmLabel={t('common.delete')}
          onConfirm={() => deleteJobTitleMappingMutation.mutate(confirmDeleteMapping.id)}
          onCancel={() => setConfirmDeleteMapping(null)}
          isLoading={deleteJobTitleMappingMutation.isPending}
          variant="danger"
        />
      )}
    </div>
  );
}
