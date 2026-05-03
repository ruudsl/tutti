import api from './client';
import type { MicrosoftConfig, SmtpConfig, TelegramConfig, WhatsAppConfig, LoginResponse } from '../types';

// Microsoft Entra ID (SSO)
export const getMicrosoftEnabled = async (): Promise<{ enabled: boolean }> => {
  const { data } = await api.get('/auth/microsoft/enabled');
  return data;
};

export const getMicrosoftLoginUrl = async (): Promise<{ authUrl: string }> => {
  const { data } = await api.get('/auth/microsoft/login');
  return data;
};

export const microsoftCallback = async (code: string, state: string): Promise<LoginResponse> => {
  const { data } = await api.post('/auth/microsoft/callback', { code, state });
  return data;
};

export const getMicrosoftConfig = async (): Promise<MicrosoftConfig> => {
  const { data } = await api.get('/auth/microsoft/config');
  return data;
};

export const saveMicrosoftConfig = async (config: {
  clientId: string;
  clientSecret?: string;
  tenantId: string;
  enabled: boolean;
}): Promise<void> => {
  await api.put('/auth/microsoft/config', config);
};

export const removeMicrosoftConfig = async (): Promise<void> => {
  await api.delete('/auth/microsoft/config');
};

// SMTP Configuration
export const getSmtpConfig = async (): Promise<SmtpConfig> => {
  const { data } = await api.get('/settings/smtp');
  return data;
};

export const saveSmtpConfig = async (config: {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password?: string;
  from: string;
  enabled: boolean;
}): Promise<void> => {
  await api.put('/settings/smtp', config);
};

export const removeSmtpConfig = async (): Promise<void> => {
  await api.delete('/settings/smtp');
};

export const testSmtpConfig = async (): Promise<{ message: string }> => {
  const { data } = await api.post('/settings/smtp/test');
  return data;
};

// Telegram Configuration
export const getTelegramConfig = async (): Promise<TelegramConfig> => {
  const { data } = await api.get('/settings/telegram');
  return data;
};

export const saveTelegramConfig = async (config: { botToken?: string; enabled: boolean }): Promise<{ message: string }> => {
  const { data } = await api.put('/settings/telegram', config);
  return data;
};

export const deleteTelegramConfig = async (): Promise<{ message: string }> => {
  const { data } = await api.delete('/settings/telegram');
  return data;
};

// WhatsApp Configuration
export const getWhatsAppConfig = async (): Promise<WhatsAppConfig> => {
  const { data } = await api.get('/settings/whatsapp');
  return data;
};

export const saveWhatsAppConfig = async (config: {
  provider: 'meta' | 'twilio';
  enabled: boolean;
  meta?: { phoneNumberId?: string; accessToken?: string };
  twilio?: { accountSid?: string; authToken?: string; whatsappFrom?: string };
}): Promise<{ message: string }> => {
  const { data } = await api.put('/settings/whatsapp', config);
  return data;
};

export const deleteWhatsAppConfig = async (): Promise<{ message: string }> => {
  const { data } = await api.delete('/settings/whatsapp');
  return data;
};

// Google Drive Settings
export interface GoogleDriveSettings {
  clientId: string;
  apiKey: string;
  enabled: boolean;
  configured: boolean;
}

export const getGoogleDriveSettings = async (): Promise<GoogleDriveSettings> => {
  const { data } = await api.get('/settings/google-drive');
  return data;
};

export const updateGoogleDriveSettings = async (params: {
  clientId: string;
  apiKey: string;
  enabled: boolean;
}): Promise<{ message: string }> => {
  const { data } = await api.put('/settings/google-drive', params);
  return data;
};

export const deleteGoogleDriveSettings = async (): Promise<{ message: string }> => {
  const { data } = await api.delete('/settings/google-drive');
  return data;
};

// Cloud Import Config
export interface CloudImportConfig {
  onedrive: {
    enabled: boolean;
    clientId: string | null;
    tenantId: string;
  };
  googleDrive: {
    enabled: boolean;
    clientId: string | null;
    apiKey: string | null;
  };
}

export interface CloudImportFile {
  id: string;
  name: string;
  downloadUrl?: string;
}

export interface CloudImportResult {
  message: string;
  uploaded: Array<{
    id: string;
    filename: string;
    title: string;
    instrumentId: string | null;
    instrumentFound: boolean;
  }>;
  errors?: Array<{ filename: string; error: string }>;
}

export const getCloudImportConfig = async (): Promise<CloudImportConfig> => {
  const { data } = await api.get('/cloud-import/config');
  return data;
};

export const importFromOneDrive = async (params: {
  files: CloudImportFile[];
  accessToken: string;
  listId?: string;
}): Promise<CloudImportResult> => {
  const { data } = await api.post('/cloud-import/onedrive', params);
  return data;
};

export const importFromGoogleDrive = async (params: {
  files: CloudImportFile[];
  accessToken: string;
  listId?: string;
}): Promise<CloudImportResult> => {
  const { data } = await api.post('/cloud-import/google-drive', params);
  return data;
};
