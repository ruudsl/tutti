import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Icon } from '../components/Icon';
import {
  getMyPrivacySettings,
  updateMyPrivacySettings,
  PrivacySetting,
  PrivacyVisibility,
} from '../api/privacy-settings';
import { showSuccess, showError } from '../utils/toast';
import { SkeletonCard } from '../components/Skeleton';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

const VISIBILITY_OPTIONS: { value: PrivacyVisibility; labelKey: string; icon: string }[] = [
  { value: 'admin_only', labelKey: 'privacy.visibility.admin_only', icon: 'lock' },
  { value: 'committee', labelKey: 'privacy.visibility.committee', icon: 'users' },
  { value: 'orchestra', labelKey: 'privacy.visibility.orchestra', icon: 'music' },
  { value: 'section', labelKey: 'privacy.visibility.section', icon: 'users' },
  { value: 'all_members', labelKey: 'privacy.visibility.all_members', icon: 'users' },
  { value: 'public', labelKey: 'privacy.visibility.public', icon: 'globe' },
];

const FIELD_GROUPS: { key: string; labelKey: string; fields: string[] }[] = [
  {
    key: 'contact',
    labelKey: 'privacy.groups.contact',
    fields: ['email'],
  },
  {
    key: 'personal',
    labelKey: 'privacy.groups.personal',
    fields: ['profile_photo'],
  },
  {
    key: 'musical',
    labelKey: 'privacy.groups.musical',
    fields: ['instruments', 'orchestras'],
  },
];

export default function PrivacySettings() {
  const { t } = useTranslation();
  useDocumentTitle('pageTitle.privacySettings');
  const queryClient = useQueryClient();

  const [changes, setChanges] = useState<Record<string, PrivacyVisibility>>({});
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const { data: settings, isLoading } = useQuery({
    queryKey: ['my-privacy-settings'],
    queryFn: getMyPrivacySettings,
  });

  const updateMutation = useMutation({
    mutationFn: (settingsList: { fieldName: string; visibility: PrivacyVisibility }[]) =>
      updateMyPrivacySettings(settingsList),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-privacy-settings'] });
      showSuccess(t('privacy.saved'));
      setChanges({});
      setHasUnsavedChanges(false);
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || t('privacy.errorSave'));
    },
  });

  const handleVisibilityChange = (fieldName: string, visibility: PrivacyVisibility) => {
    setChanges((prev) => ({ ...prev, [fieldName]: visibility }));
    setHasUnsavedChanges(true);
  };

  const handleSave = () => {
    const settingsList = Object.entries(changes).map(([fieldName, visibility]) => ({
      fieldName,
      visibility,
    }));
    updateMutation.mutate(settingsList);
  };

  const getFieldValue = (fieldName: string): PrivacyVisibility => {
    if (changes[fieldName]) return changes[fieldName];
    if (settings && settings[fieldName]) return settings[fieldName].visibility;
    return 'all_members';
  };

  const getFieldSetting = (fieldName: string): PrivacySetting | undefined => {
    return settings?.[fieldName];
  };

  if (isLoading) {
    return (
      <div>
        <h1>{t('privacy.title')}</h1>
        <SkeletonCard />
      </div>
    );
  }

  const customFields = settings
    ? Object.entries(settings).filter(([key]) => key.startsWith('custom_'))
    : [];

  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <h1>{t('privacy.title')}</h1>
        {hasUnsavedChanges && (
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={updateMutation.isPending}
          >
            <Icon name="check" /> {updateMutation.isPending ? t('common.saving') : t('common.save')}
          </button>
        )}
      </div>

      <div className="alert alert-info mb-3">
        <Icon name="info" /> {t('privacy.description')}
      </div>

      {FIELD_GROUPS.map((group) => (
        <div key={group.key} className="card mb-2">
          <div className="card-header">
            <strong>{t(group.labelKey)}</strong>
          </div>
          <div className="card-body">
            {group.fields.map((fieldName) => {
              const setting = getFieldSetting(fieldName);
              const currentValue = getFieldValue(fieldName);

              return (
                <div key={fieldName} className="form-group privacy-field-row">
                  <div className="privacy-field-info">
                    <label className="privacy-field-label">
                      {t(`privacy.fields.${fieldName}`)}
                      {setting?.isRequired && (
                        <span className="badge badge-warning ml-1">{t('privacy.required')}</span>
                      )}
                    </label>
                    {setting?.purposeStatement && (
                      <small className="text-muted d-block">{setting.purposeStatement}</small>
                    )}
                  </div>
                  <select
                    className="form-control privacy-visibility-select"
                    value={currentValue}
                    onChange={(e) =>
                      handleVisibilityChange(fieldName, e.target.value as PrivacyVisibility)
                    }
                    disabled={setting?.isRequired && currentValue === 'admin_only'}
                  >
                    {VISIBILITY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {t(option.labelKey)}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {customFields.length > 0 && (
        <div className="card mb-2">
          <div className="card-header">
            <strong>{t('privacy.groups.custom')}</strong>
          </div>
          <div className="card-body">
            {customFields.map(([fieldName, setting]) => {
              const currentValue = getFieldValue(fieldName);

              return (
                <div key={fieldName} className="form-group privacy-field-row">
                  <div className="privacy-field-info">
                    <label className="privacy-field-label">
                      {setting.fieldLabel || fieldName.replace('custom_', '')}
                      {setting.isRequired && (
                        <span className="badge badge-warning ml-1">{t('privacy.required')}</span>
                      )}
                    </label>
                    {setting.purposeStatement && (
                      <small className="text-muted d-block">{setting.purposeStatement}</small>
                    )}
                  </div>
                  <select
                    className="form-control privacy-visibility-select"
                    value={currentValue}
                    onChange={(e) =>
                      handleVisibilityChange(fieldName, e.target.value as PrivacyVisibility)
                    }
                  >
                    {VISIBILITY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {t(option.labelKey)}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <style>{`
        .privacy-field-row {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          padding: 0.75rem 0;
          border-bottom: 1px solid var(--border);
        }
        .privacy-field-row:last-child {
          border-bottom: none;
        }
        .privacy-field-info {
          flex: 1;
          padding-right: 1rem;
        }
        .privacy-field-label {
          font-weight: 500;
          margin-bottom: 0;
        }
        .privacy-visibility-select {
          width: 200px;
          flex-shrink: 0;
        }
      `}</style>
    </div>
  );
}
