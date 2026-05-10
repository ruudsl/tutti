import api from './client';

export type PrivacyVisibility = 'admin_only' | 'committee' | 'orchestra' | 'section' | 'all_members' | 'public';

export interface PrivacySetting {
  fieldName: string;
  fieldLabel?: string;
  customFieldId?: string;
  visibility: PrivacyVisibility;
  isDefault: boolean;
  purposeStatement?: string;
  isRequired: boolean;
  updatedAt?: string;
}

export interface AssociationPrivacyDefault {
  id: string;
  fieldName: string;
  defaultVisibility: PrivacyVisibility;
  purposeStatement?: string;
  isRequired: boolean;
}

export interface PrivacyConsent {
  id: string;
  consentVersion: string;
  consentedAt: string;
  ipAddress?: string;
}

// User Privacy Settings
export const getMyPrivacySettings = async (): Promise<Record<string, PrivacySetting>> => {
  const { data } = await api.get('/privacy-settings/my-settings');
  return data;
};

export const updateMyPrivacySettings = async (settings: { fieldName: string; visibility: PrivacyVisibility; customFieldId?: string }[]): Promise<void> => {
  await api.put('/privacy-settings/my-settings', { settings });
};

export const getUserPrivacySettings = async (userId: string): Promise<{ visibleFields: string[] }> => {
  const { data } = await api.get(`/privacy-settings/user/${userId}`);
  return data;
};

// Association Privacy Defaults (Admin only)
export const getPrivacyDefaults = async (): Promise<AssociationPrivacyDefault[]> => {
  const { data } = await api.get('/privacy-settings/defaults');
  return data;
};

export const updatePrivacyDefaults = async (defaults: { fieldName: string; defaultVisibility: PrivacyVisibility; purposeStatement?: string; isRequired?: boolean }[]): Promise<void> => {
  await api.put('/privacy-settings/defaults', { defaults });
};

export const deletePrivacyDefault = async (fieldName: string): Promise<void> => {
  await api.delete(`/privacy-settings/defaults/${fieldName}`);
};

// Privacy Consent
export const getMyConsents = async (): Promise<PrivacyConsent[]> => {
  const { data } = await api.get('/privacy-settings/consent');
  return data;
};

export const recordConsent = async (consentVersion: string): Promise<{ id: string; message: string; alreadyConsented?: boolean }> => {
  const { data } = await api.post('/privacy-settings/consent', { consentVersion });
  return data;
};

export const checkConsent = async (version: string): Promise<{ hasConsented: boolean; consentedAt?: string }> => {
  const { data } = await api.get(`/privacy-settings/consent/check/${version}`);
  return data;
};
