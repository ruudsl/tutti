import api from './client';
import type { AssociationSettings, ThemeSettings, Association } from '../types';

// Association Settings
export const getSettings = async (): Promise<AssociationSettings> => {
  const { data } = await api.get('/settings');
  return data;
};

export const updateSettings = async (settings: { displayName?: string }): Promise<void> => {
  await api.put('/settings', settings);
};

export const uploadLogo = async (file: File): Promise<{ logoUrl: string }> => {
  const formData = new FormData();
  formData.append('logo', file);
  const { data } = await api.post('/settings/logo', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
};

export const removeLogo = async (): Promise<void> => {
  await api.delete('/settings/logo');
};

// Theme
export const updateTheme = async (theme: ThemeSettings | null): Promise<void> => {
  await api.put('/settings/theme', { theme });
};

// Associations
export const getAssociations = async (): Promise<Association[]> => {
  const { data } = await api.get('/associations');
  return data;
};

export const getCurrentAssociation = async (): Promise<Association> => {
  const { data } = await api.get('/associations/current');
  return data;
};

export const updateCurrentAssociation = async (name: string): Promise<void> => {
  await api.put('/associations/current', { name });
};

export const createAssociation = async (name: string): Promise<{ id: string }> => {
  const { data } = await api.post('/associations', { name });
  return data;
};

// Changelog
export const getChangelog = async (lang?: string): Promise<{ content: string }> => {
  const { data } = await api.get('/changelog', { params: { lang } });
  return data;
};
