import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm, Controller } from 'react-hook-form';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useInstruments } from '../hooks/useInstruments';
import { useOrchestras } from '../hooks/useOrchestras';
import { showSuccess, showError } from '../utils/toast';
import { ConfirmDialog } from '../components/ConfirmDialog';
import {
  onboardMember,
  getPendingSpondLinks,
  deletePendingSpondLink,
  getInactiveMembers,
  reactivateMember,
  offboardMember,
  getMicrosoftConfig,
  type OnboardingResponse,
  type PendingSpondLink,
  type InactiveMember,
} from '../api';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface OnboardingFormData {
  firstName: string;
  lastName: string;
  email: string;
  instrumentIds: string[];
  orchestraIds: string[];
  createM365Account: boolean;
}

type WizardStep = 'form' | 'result';
type ActiveTab = 'onboard' | 'pending' | 'inactive';

export default function Onboarding() {
  const { t } = useTranslation();
  useDocumentTitle('pageTitle.onboarding');
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<ActiveTab>('onboard');
  const [wizardStep, setWizardStep] = useState<WizardStep>('form');
  const [onboardingResult, setOnboardingResult] = useState<OnboardingResponse | null>(null);
  const [confirmReactivate, setConfirmReactivate] = useState<InactiveMember | null>(null);
  const [confirmOffboard, setConfirmOffboard] = useState<{ id: string; name: string } | null>(null);
  const [passwordCopied, setPasswordCopied] = useState(false);

  const { data: instruments = [] } = useInstruments();
  const { data: orchestras = [] } = useOrchestras();
  const { data: msConfig } = useQuery({
    queryKey: ['microsoftConfig'],
    queryFn: getMicrosoftConfig,
    retry: false,
  });

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
      instrumentIds: [],
      orchestraIds: [],
      createM365Account: false,
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
      showError(error.response?.data?.error || t('onboarding.errorCreating'));
    },
  });

  const deletePendingMutation = useMutation({
    mutationFn: deletePendingSpondLink,
    onSuccess: () => {
      showSuccess(t('onboarding.pendingLinkRemoved'));
      queryClient.invalidateQueries({ queryKey: ['pendingSpondLinks'] });
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || t('onboarding.errorRemovingLink'));
    },
  });

  const reactivateMutation = useMutation({
    mutationFn: reactivateMember,
    onSuccess: () => {
      showSuccess(t('onboarding.memberReactivated'));
      setConfirmReactivate(null);
      queryClient.invalidateQueries({ queryKey: ['inactiveMembers'] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || t('onboarding.errorReactivating'));
    },
  });

  const handleSubmit = (data: OnboardingFormData) => {
    onboardMutation.mutate({
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      instrumentIds: data.instrumentIds,
      orchestraIds: data.orchestraIds,
      createM365Account: data.createM365Account,
    });
  };

  const handleNewOnboarding = () => {
    form.reset();
    setOnboardingResult(null);
    setWizardStep('form');
    setPasswordCopied(false);
  };

  const copyPassword = () => {
    if (onboardingResult?.tempPassword) {
      navigator.clipboard.writeText(onboardingResult.tempPassword);
      setPasswordCopied(true);
      showSuccess(t('onboarding.passwordCopied'));
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('nl-NL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  return (
    <div>
      <h1 className="mb-3">{t('onboarding.title')}</h1>

      {/* Tab Navigation */}
      <div className="flex gap-2 mb-3">
        <button
          className={`btn ${activeTab === 'onboard' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setActiveTab('onboard')}
        >
          {t('onboarding.tabNewMember')}
        </button>
        <button
          className={`btn ${activeTab === 'pending' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setActiveTab('pending')}
        >
          {t('onboarding.tabPendingLinks')}
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
          {t('onboarding.tabInactive')}
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
      </div>

      {/* Onboard New Member Tab */}
      {activeTab === 'onboard' && (
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">{t('onboarding.newMemberTitle')}</h2>
          </div>
          <div className="card-body">
            {wizardStep === 'form' ? (
              <form onSubmit={form.handleSubmit(handleSubmit)}>
                <p className="piece-meta mb-3">{t('onboarding.newMemberDescription')}</p>

                <div className="grid grid-cols-2 gap-3">
                  <div className="form-group">
                    <label className="form-label">{t('onboarding.firstName')} *</label>
                    <input
                      type="text"
                      className="form-control"
                      {...form.register('firstName', { required: true })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">{t('onboarding.lastName')} *</label>
                    <input
                      type="text"
                      className="form-control"
                      {...form.register('lastName', { required: true })}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">{t('onboarding.email')} *</label>
                  <input
                    type="email"
                    className="form-control"
                    {...form.register('email', { required: true })}
                  />
                  <small className="text-secondary">{t('onboarding.emailHint')}</small>
                </div>

                <div className="form-group">
                  <label className="form-label">{t('onboarding.instruments')}</label>
                  <Controller
                    name="instrumentIds"
                    control={form.control}
                    render={({ field }) => (
                      <select
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
                  <small className="text-secondary">{t('onboarding.instrumentsHint')}</small>
                </div>

                <div className="form-group">
                  <label className="form-label">{t('onboarding.orchestras')}</label>
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
                  <div className="form-group">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" {...form.register('createM365Account')} />
                      {t('onboarding.createM365')}
                    </label>
                    <small className="text-secondary">{t('onboarding.createM365Hint')}</small>
                  </div>
                )}

                <div className="flex gap-2 mt-4">
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={onboardMutation.isPending}
                  >
                    {onboardMutation.isPending ? t('common.loading') : t('onboarding.createMember')}
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
                    {onboardingResult?.success ? t('onboarding.successTitle') : t('onboarding.errorTitle')}
                  </h3>
                  <p style={{ margin: 0 }}>{onboardingResult?.message}</p>
                </div>

                {onboardingResult?.success && (
                  <>
                    <div className="mb-3">
                      <h4>{t('onboarding.memberDetails')}</h4>
                      <p>
                        <strong>{t('onboarding.name')}:</strong> {onboardingResult.firstName} {onboardingResult.lastName}
                      </p>
                      <p>
                        <strong>{t('onboarding.email')}:</strong> {onboardingResult.email}
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
                      <h4 style={{ marginTop: 0 }}>{t('onboarding.tempPasswordTitle')}</h4>
                      <div className="flex items-center gap-2">
                        <code
                          style={{
                            background: 'white',
                            padding: '0.5rem 1rem',
                            borderRadius: '0.25rem',
                            fontSize: '1.1rem',
                            fontFamily: 'monospace',
                          }}
                        >
                          {onboardingResult.tempPassword}
                        </code>
                        <button className="btn btn-outline btn-sm" onClick={copyPassword}>
                          {passwordCopied ? t('onboarding.copied') : t('onboarding.copy')}
                        </button>
                      </div>
                      <small className="text-secondary">{t('onboarding.tempPasswordHint')}</small>
                    </div>

                    <div className="mb-3">
                      <h4>{t('onboarding.statusTitle')}</h4>
                      <ul style={{ paddingLeft: '1.5rem' }}>
                        <li style={{ color: 'var(--success)' }}>
                          {t('onboarding.harmonieCreated')}
                        </li>
                        {onboardingResult.m365Created ? (
                          <li style={{ color: 'var(--success)' }}>
                            {t('onboarding.m365Created')}
                          </li>
                        ) : onboardingResult.m365Error ? (
                          <li style={{ color: 'var(--danger)' }}>
                            {t('onboarding.m365Error')}: {onboardingResult.m365Error}
                          </li>
                        ) : null}
                        <li style={{ color: 'var(--warning)' }}>
                          {t('onboarding.spondPending')}
                        </li>
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
                      <h4 style={{ marginTop: 0 }}>{t('onboarding.nextStepsTitle')}</h4>
                      <ol style={{ paddingLeft: '1.5rem', margin: 0 }}>
                        {onboardingResult.instructions.map((instruction, idx) => (
                          <li key={idx}>{instruction}</li>
                        ))}
                      </ol>
                    </div>
                  </>
                )}

                <button className="btn btn-primary" onClick={handleNewOnboarding}>
                  {t('onboarding.addAnother')}
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
            <h2 className="card-title">{t('onboarding.pendingLinksTitle')}</h2>
          </div>
          <div className="card-body">
            <p className="piece-meta mb-3">{t('onboarding.pendingLinksDescription')}</p>

            {pendingLoading ? (
              <div className="loading">
                <div className="spinner"></div>
              </div>
            ) : pendingLinks.length === 0 ? (
              <p className="text-secondary">{t('onboarding.noPendingLinks')}</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('onboarding.columnName')}</th>
                    <th>{t('onboarding.columnEmail')}</th>
                    <th>{t('onboarding.columnExpectedName')}</th>
                    <th>{t('onboarding.columnCreatedAt')}</th>
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
                          {t('onboarding.removePending')}
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
            <h2 className="card-title">{t('onboarding.inactiveTitle')}</h2>
          </div>
          <div className="card-body">
            <p className="piece-meta mb-3">{t('onboarding.inactiveDescription')}</p>

            {inactiveLoading ? (
              <div className="loading">
                <div className="spinner"></div>
              </div>
            ) : inactiveMembers.length === 0 ? (
              <p className="text-secondary">{t('onboarding.noInactive')}</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('onboarding.columnName')}</th>
                    <th>{t('onboarding.columnEmail')}</th>
                    <th>{t('onboarding.columnOffboardedAt')}</th>
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
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={() => setConfirmReactivate(member)}
                        >
                          {t('onboarding.reactivate')}
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

      {/* Reactivate Confirmation Dialog */}
      {confirmReactivate && (
        <ConfirmDialog
          title={t('onboarding.reactivateTitle')}
          message={t('onboarding.reactivateConfirm', {
            name: `${confirmReactivate.firstName} ${confirmReactivate.lastName}`,
          })}
          confirmLabel={t('onboarding.reactivate')}
          onConfirm={() => reactivateMutation.mutate(confirmReactivate.id)}
          onCancel={() => setConfirmReactivate(null)}
          isLoading={reactivateMutation.isPending}
          variant="primary"
        />
      )}
    </div>
  );
}
