/**
 * AVG-verzoeken: gegevensuitvoer, verwijderverzoeken en het bewaarbeleid.
 *
 * Deze aanroepen stonden als kale `fetch` in GdprAdmin.tsx en DataExport.tsx,
 * elk met een eigen regel die de token uit localStorage plukte. Dat werkte,
 * maar het ging langs `client.ts` heen - en daar zit de afhandeling van een
 * 401. Een beheerder met een verlopen sessie bleef daardoor op deze twee
 * pagina's hangen bij "Failed to fetch...", terwijl elke andere pagina hem
 * netjes naar het inlogscherm stuurt.
 */

import api from './client';

export interface DeletionRequest {
  id: string;
  userId: string;
  email: string;
  name: string;
  reason?: string;
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  requestedAt: string;
  processedAt?: string;
  processedBy?: string;
}

export interface RetentionSetting {
  dataType: string;
  retentionDays: number;
  description: string;
}

export interface RetentionSettings {
  settings: RetentionSetting[];
  lastCleanup?: string;
  nextCleanup?: string;
}

export interface DataCategory {
  name: string;
  count: number;
  description: string;
}

export interface DataSummary {
  userId: string;
  exportDate: string;
  categories: DataCategory[];
  totalRecords: number;
}

/** De server praat in slangenkast; het scherm in kamelenkast. */
interface RauwVerwijderverzoek {
  id: string;
  user_id: string;
  email: string;
  first_name: string;
  last_name: string;
  reason?: string;
  status: DeletionRequest['status'];
  created_at: string;
  processed_at?: string;
  processed_by_name?: string;
}

interface RauweBewaarinstelling {
  data_type: string;
  retention_days: number;
  description?: string;
}

export const getDeletionRequests = async (): Promise<DeletionRequest[]> => {
  const { data } = await api.get('/gdpr/deletion-requests');
  return (data.requests as RauwVerwijderverzoek[]).map((r) => ({
    id: r.id,
    userId: r.user_id,
    email: r.email,
    name: `${r.first_name} ${r.last_name}`,
    reason: r.reason,
    status: r.status,
    requestedAt: r.created_at,
    processedAt: r.processed_at,
    processedBy: r.processed_by_name,
  }));
};

export const processDeletionRequest = async (
  requestId: string,
  action: 'approve' | 'reject',
  notes?: string,
): Promise<void> => {
  await api.post(`/gdpr/deletion-requests/${requestId}/process`, { action, notes });
};

export const getRetentionSettings = async (): Promise<RetentionSettings> => {
  const { data } = await api.get('/gdpr/retention-settings');
  return {
    settings: (data.settings as RauweBewaarinstelling[]).map((s) => ({
      dataType: s.data_type,
      retentionDays: s.retention_days,
      description: s.description || '',
    })),
  };
};

export const updateRetentionSettings = async (settings: RetentionSetting[]): Promise<void> => {
  await api.put('/gdpr/retention-settings', {
    settings: settings.map((s) => ({
      data_type: s.dataType,
      retention_days: s.retentionDays,
      auto_delete: s.retentionDays > 0,
    })),
  });
};

export const runCleanup = async (): Promise<{ deleted: Record<string, number> }> => {
  const { data } = await api.post('/gdpr/cleanup');
  return { deleted: data.deletedCounts || {} };
};

export const getDataSummary = async (): Promise<DataSummary> => {
  const { data } = await api.get('/gdpr/data-summary');
  return data;
};

/**
 * Haalt de uitvoer op en biedt hem aan als bestand.
 *
 * `responseType: 'blob'` is hier het punt: zonder dat probeert axios het
 * antwoord als JSON te lezen, en dan komt er van een zip niets bruikbaars uit.
 */
export const downloadExport = async (format: 'json' | 'zip'): Promise<void> => {
  const response = await api.get(`/gdpr/export?format=${format}`, { responseType: 'blob' });

  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement('a');
  link.href = url;
  link.download = format === 'zip' ? 'gdpr-export.zip' : 'gdpr-export.json';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
};

export const requestDeletion = async (reason?: string): Promise<{ message: string; requestId: string }> => {
  const { data } = await api.post('/gdpr/delete-request', { reason });
  return data;
};
