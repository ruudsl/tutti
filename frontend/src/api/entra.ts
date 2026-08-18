import api from './client';

export interface JobTitleMapping {
  id: string;
  job_title: string;
  instrument_id: string;
  instrument_name: string;
  instrument_tuning: string | null;
}

export interface EntraUser {
  id: string;
  displayName: string;
  firstName: string;
  lastName: string;
  email: string;
  jobTitle: string | null;
  department: string | null;
  departments: string[];
  isImported: boolean;
  hasMapping: boolean;
  mappedInstrumentId: string | null;
}

export interface EntraUsersResponse {
  users: EntraUser[];
  uniqueJobTitles: string[];
  uniqueDepartments: string[];
  newDepartments: string[];
  totalCount: number;
  importedCount: number;
}

export interface EntraImportResult {
  message: string;
  imported: number;
  skipped: number;
  errors: string[];
}

export interface EntraSyncResult {
  message: string;
  updated: number;
  created: number;
  skipped: number;
}

// Job Title Mappings
export const getJobTitleMappings = async (): Promise<JobTitleMapping[]> => {
  const { data } = await api.get('/entra/mappings');
  return data;
};

export const createJobTitleMapping = async (mapping: {
  jobTitle: string;
  instrumentId: string;
}): Promise<{ id: string; message: string }> => {
  const { data } = await api.post('/entra/mappings', mapping);
  return data;
};

export const updateJobTitleMapping = async (id: string, instrumentId: string): Promise<void> => {
  await api.put(`/entra/mappings/${id}`, { instrumentId });
};

export const deleteJobTitleMapping = async (id: string): Promise<void> => {
  await api.delete(`/entra/mappings/${id}`);
};

// Entra Users
export const getEntraUsers = async (): Promise<EntraUsersResponse> => {
  const { data } = await api.get('/entra/users');
  return data;
};

export const importEntraUsers = async (userIds: string[]): Promise<EntraImportResult> => {
  const { data } = await api.post('/entra/users/import', { userIds });
  return data;
};

export const syncEntraUsers = async (createNew: boolean = false): Promise<EntraSyncResult> => {
  const { data } = await api.post('/entra/users/sync', { createNew });
  return data;
};

export const syncEntraPhotos = async (): Promise<{
  message: string;
  synced: number;
  skipped: number;
  failed: number;
}> => {
  const { data } = await api.post('/entra/sync-photos');
  return data;
};
