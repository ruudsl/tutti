import api from './client';

export interface DirectoryMember {
  id: string;
  firstName: string;
  lastName: string;
  photoUrl: string | null;
  instruments: { id: string; name: string; tuning: string | null }[];
  orchestras: { id: string; name: string }[];
}

export const getMemberDirectory = async (filters?: {
  orchestraId?: string;
  instrumentId?: string;
  search?: string;
}): Promise<DirectoryMember[]> => {
  const { data } = await api.get('/users/directory', { params: filters });
  return data;
};

export const exportUserData = async (): Promise<Blob> => {
  const { data } = await api.get('/users/export-data', { responseType: 'blob' });
  return data;
};
