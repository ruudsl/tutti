/**
 * Mislukte imports: bestanden die bij het inlezen zijn blijven steken.
 *
 * Verhuisd uit src/api.ts. Dat bestand schaduwde deze map - `import ... from
 * '../api'` kwam er altijd bij uit - waardoor alles hier ernaast onbereikbaar
 * was. Deze functies hadden nog geen module-thuis en stonden dus alleen daar.
 */

import api from './client';

// =============================================
// FAILED IMPORTS API
// =============================================

export interface FailedImport {
  id: string;
  originalFilename: string;
  filePath: string | null;
  importType: string;
  errorMessage: string;
  errorCode: string | null;
  metadata: Record<string, unknown> | null;
  sourceInfo: string | null;
  listId: string | null;
  listName: string | null;
  retryCount: number;
  maxRetries: number;
  status: 'failed' | 'retrying' | 'recovered' | 'dismissed';
  createdByName: string | null;
  createdAt: string;
  lastRetryAt: string | null;
  recoveredAt: string | null;
}

export interface FailedImportStats {
  total: number;
  failed: number;
  retrying: number;
  recovered: number;
  dismissed: number;
}

export const getFailedImports = async (status?: string): Promise<FailedImport[]> => {
  const params = status ? { status } : {};
  const { data } = await api.get('/failed-imports', { params });
  return data;
};

export const getFailedImportStats = async (): Promise<FailedImportStats> => {
  const { data } = await api.get('/failed-imports/stats');
  return data;
};

export const retryFailedImport = async (id: string): Promise<{ message: string; pieceId?: string }> => {
  const { data } = await api.post(`/failed-imports/${id}/retry`);
  return data;
};

export const dismissFailedImport = async (id: string): Promise<{ message: string }> => {
  const { data } = await api.post(`/failed-imports/${id}/dismiss`);
  return data;
};

export const deleteFailedImport = async (id: string): Promise<{ message: string }> => {
  const { data } = await api.delete(`/failed-imports/${id}`);
  return data;
};

export const bulkDismissFailedImports = async (ids: string[]): Promise<{ message: string; dismissed: number }> => {
  const { data } = await api.post('/failed-imports/bulk-dismiss', { ids });
  return data;
};
