/**
 * Modules API Module
 *
 * Een beheerder kan modules uitzetten om het aanbod voor de vereniging in te
 * dammen. Uitzetten verbergt: navigatie en routes verdwijnen, de gegevens
 * blijven staan.
 *
 * @module api/modules
 */

import api from './client';

/** Een module met omschrijving en huidige stand, voor het beheerscherm. */
export interface ModuleSetting {
  key: string;
  title: string;
  description: string;
  enabled: boolean;
  /** Frontend-paden die verdwijnen als de module uit gaat. */
  navPaths: string[];
}

/** De sleutels van de modules die voor deze vereniging aan staan. */
export async function getEnabledModules(): Promise<string[]> {
  const response = await api.get<{ enabled: string[] }>('/modules');
  return response.data.enabled;
}

/** Alle modules met hun stand (alleen beheerders). */
export async function getModuleSettings(): Promise<ModuleSetting[]> {
  const response = await api.get<ModuleSetting[]>('/modules/settings');
  return response.data;
}

/** Zet een module aan of uit (alleen beheerders). */
export async function setModuleEnabled(key: string, enabled: boolean): Promise<void> {
  await api.put(`/modules/${key}`, { enabled });
}
