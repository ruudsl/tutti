import api from './client';
import type { AssociationSettings, ThemeSettings, Association } from '../types';

// Association Settings
export const getSettings = async (): Promise<AssociationSettings> => {
  const { data } = await api.get('/settings');
  return data;
};

/** Het opslaggebruik van de eigen vereniging per soort, in bytes. */
export interface Opslaggebruik {
  bladmuziek: number;
  mp3: number;
  musicxml: number;
  opnames: number;
  wikibijlagen: number;
  mailbijlagen: number;
  totaal: number;
}

/** Gebruik tegenover de grens; `limiet` is `null` als er geen grens is. */
export interface Opslag {
  gebruik: Opslaggebruik;
  limiet: number | null;
}

/** Opslaggebruik van de eigen vereniging (alleen voor de beheerder). */
export const getOpslag = async (): Promise<Opslag> => {
  const { data } = await api.get('/settings/opslag');
  return data;
};

export const updateSettings = async (settings: { displayName?: string }): Promise<void> => {
  await api.put('/settings', settings);
};

/** Wie tweestapsverificatie moet hebben: niemand, beheerders en bestuur, of iedereen. */
export type TweestapStand = 'uit' | 'beheer' | 'iedereen';

/** Een stap van de startlijst voor de beheerder (backend/src/services/startlijst.ts). */
export type StartStap = 'email' | 'tweestap' | 'modules' | 'orkesten' | 'leden' | 'repetities' | 'bewaartermijnen';

export const getStartlijst = async (): Promise<{ stappen: { sleutel: StartStap; gedaan: boolean }[] }> => {
  const { data } = await api.get('/settings/startlijst');
  return data;
};

/** De stand van de vereniging, en of de vragende beheerder het zelf aan heeft. */
export const getTweestapStand = async (): Promise<{ stand: TweestapStand; zelfAan: boolean }> => {
  const { data } = await api.get('/settings/tweestap');
  return data;
};

export const zetTweestapStand = async (stand: TweestapStand): Promise<void> => {
  await api.put('/settings/tweestap', { stand });
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
