import { useState, useEffect, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import {
  checkConsent,
  recordConsent,
  getMyPrivacySettings,
  updateMyPrivacySettings,
  type PrivacyVisibility,
} from '../api/privacy-settings';
import { Icon } from './Icon';
import { showSuccess, showError } from '../utils/toast';

const CURRENT_CONSENT_VERSION = '1.0';

interface PrivacyConsentGateProps {
  children: ReactNode;
}

export function PrivacyConsentGate({ children }: PrivacyConsentGateProps) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<'loading' | 'consent' | 'privacy' | 'done'>('loading');
  const [privacySettings, setPrivacySettings] = useState<Record<string, PrivacyVisibility>>({});

  const { data: consentStatus, isLoading: consentLoading } = useQuery({
    queryKey: ['privacy-consent-check', CURRENT_CONSENT_VERSION],
    queryFn: () => checkConsent(CURRENT_CONSENT_VERSION),
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const { data: currentSettings, isLoading: settingsLoading } = useQuery({
    queryKey: ['privacy-settings-onboarding'],
    queryFn: getMyPrivacySettings,
    enabled: !!user && step === 'privacy',
  });

  useEffect(() => {
    if (!user) {
      setStep('done');
      return;
    }
    if (consentLoading) {
      setStep('loading');
      return;
    }
    if (consentStatus?.hasConsented) {
      setStep('done');
    } else {
      setStep('consent');
    }
  }, [user, consentStatus, consentLoading]);

  useEffect(() => {
    if (currentSettings) {
      const initial: Record<string, PrivacyVisibility> = {};
      Object.entries(currentSettings).forEach(([fieldName, setting]) => {
        initial[fieldName] = setting.visibility;
      });
      setPrivacySettings(initial);
    }
  }, [currentSettings]);

  const consentMutation = useMutation({
    mutationFn: () => recordConsent(CURRENT_CONSENT_VERSION),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['privacy-consent-check'] });
      setStep('privacy');
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || t('privacy.errorConsent'));
    },
  });

  const saveSettingsMutation = useMutation({
    mutationFn: (settings: { fieldName: string; visibility: PrivacyVisibility }[]) => updateMyPrivacySettings(settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['privacy-settings'] });
      showSuccess(t('privacy.saved'));
      setStep('done');
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || t('privacy.errorSave'));
    },
  });

  const handleConsent = () => {
    consentMutation.mutate();
  };

  const handleSavePrivacy = () => {
    const settings = Object.entries(privacySettings).map(([fieldName, visibility]) => ({
      fieldName,
      visibility,
    }));
    saveSettingsMutation.mutate(settings);
  };

  const handleSkipPrivacy = () => {
    setStep('done');
  };

  const handlePrivacyChange = (fieldName: string, visibility: PrivacyVisibility) => {
    setPrivacySettings((prev) => ({ ...prev, [fieldName]: visibility }));
  };

  if (step === 'loading' || step === 'done') {
    return <>{children}</>;
  }

  const visibilityOptions: { value: PrivacyVisibility; label: string }[] = [
    { value: 'admin_only', label: t('privacy.visibility.admin_only') },
    { value: 'committee', label: t('privacy.visibility.committee') },
    { value: 'orchestra', label: t('privacy.visibility.orchestra') },
    { value: 'section', label: t('privacy.visibility.section') },
    { value: 'all_members', label: t('privacy.visibility.all_members') },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-base-100">
      <div className="max-w-2xl w-full mx-4 bg-base-100 rounded-lg shadow-xl border border-base-300 max-h-[90vh] overflow-y-auto">
        {step === 'consent' && (
          <div className="p-8">
            <div className="text-center mb-6">
              <Icon name="lock" size={48} className="text-primary mx-auto mb-4" />
              <h1 className="text-2xl font-bold mb-2">{t('privacy.consentTitle')}</h1>
              <p className="text-base-content/60">{t('privacy.consentSubtitle')}</p>
            </div>

            <div className="bg-base-200 rounded-lg p-4 mb-6">
              <h2 className="font-semibold mb-3">{t('privacy.whatWeCollect')}</h2>
              <ul className="space-y-2 text-sm">
                <li className="flex items-start gap-2">
                  <Icon name="check" size={16} className="text-success mt-0.5 flex-shrink-0" />
                  <span>{t('privacy.collectContactInfo')}</span>
                </li>
                <li className="flex items-start gap-2">
                  <Icon name="check" size={16} className="text-success mt-0.5 flex-shrink-0" />
                  <span>{t('privacy.collectMembership')}</span>
                </li>
                <li className="flex items-start gap-2">
                  <Icon name="check" size={16} className="text-success mt-0.5 flex-shrink-0" />
                  <span>{t('privacy.collectAttendance')}</span>
                </li>
              </ul>
            </div>

            <div className="bg-base-200 rounded-lg p-4 mb-6">
              <h2 className="font-semibold mb-3">{t('privacy.yourRights')}</h2>
              <ul className="space-y-2 text-sm">
                <li className="flex items-start gap-2">
                  <Icon name="settings" size={16} className="text-primary mt-0.5 flex-shrink-0" />
                  <span>{t('privacy.rightControl')}</span>
                </li>
                <li className="flex items-start gap-2">
                  <Icon name="download" size={16} className="text-primary mt-0.5 flex-shrink-0" />
                  <span>{t('privacy.rightExport')}</span>
                </li>
                <li className="flex items-start gap-2">
                  <Icon name="trash" size={16} className="text-primary mt-0.5 flex-shrink-0" />
                  <span>{t('privacy.rightDelete')}</span>
                </li>
              </ul>
            </div>

            <p className="text-sm text-base-content/60 mb-6">{t('privacy.consentNote')}</p>

            <button className="btn btn-primary w-full" onClick={handleConsent} disabled={consentMutation.isPending}>
              {consentMutation.isPending ? t('common.loading') : t('privacy.agreeAndContinue')}
            </button>
          </div>
        )}

        {step === 'privacy' && (
          <div className="p-8">
            <div className="text-center mb-6">
              <Icon name="eye" size={48} className="text-primary mx-auto mb-4" />
              <h1 className="text-2xl font-bold mb-2">{t('privacy.settingsTitle')}</h1>
              <p className="text-base-content/60">{t('privacy.settingsSubtitle')}</p>
            </div>

            {settingsLoading ? (
              <div className="flex justify-center py-8">
                <div className="loading loading-spinner loading-lg" />
              </div>
            ) : (
              <div className="space-y-4 mb-6">
                {currentSettings &&
                  Object.entries(currentSettings).map(([fieldName, setting]) => (
                    <div key={fieldName} className="flex items-center justify-between gap-4 p-3 bg-base-200 rounded-lg">
                      <div className="flex-1">
                        <div className="font-medium">{setting.fieldLabel || fieldName}</div>
                        {setting.purposeStatement && (
                          <div className="text-sm text-base-content/60">{setting.purposeStatement}</div>
                        )}
                        {setting.isRequired && (
                          <div className="text-xs text-warning">{t('privacy.requiredByAssociation')}</div>
                        )}
                      </div>
                      <select
                        className="select select-bordered select-sm"
                        value={privacySettings[fieldName] || setting.visibility}
                        onChange={(e) => handlePrivacyChange(fieldName, e.target.value as PrivacyVisibility)}
                        disabled={setting.isRequired}
                      >
                        {visibilityOptions.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
              </div>
            )}

            <div className="flex gap-3">
              <button className="btn btn-ghost flex-1" onClick={handleSkipPrivacy}>
                {t('privacy.skipForNow')}
              </button>
              <button
                className="btn btn-primary flex-1"
                onClick={handleSavePrivacy}
                disabled={saveSettingsMutation.isPending}
              >
                {saveSettingsMutation.isPending ? t('common.saving') : t('common.save')}
              </button>
            </div>

            <p className="text-sm text-base-content/60 text-center mt-4">{t('privacy.canChangeAnytime')}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default PrivacyConsentGate;
