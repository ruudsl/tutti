import api from './client';
import type { SpondConfig, SpondGroup, SpondSyncResult, SpondOrchestraGroup, SpondMemberLink } from '../types';

// Spond integration
export const getSpondConfig = async (): Promise<SpondConfig> => {
  const { data } = await api.get('/spond/config');
  return data;
};

export const saveSpondConfig = async (config: {
  username: string;
  password: string;
  groupId?: string;
  syncEnabled?: boolean;
}): Promise<void> => {
  await api.put('/spond/config', config);
};

export const removeSpondConfig = async (): Promise<void> => {
  await api.delete('/spond/config');
};

export const getSpondGroups = async (): Promise<SpondGroup[]> => {
  const { data } = await api.get('/spond/groups');
  return data;
};

export const syncSpond = async (): Promise<SpondSyncResult> => {
  const { data } = await api.post('/spond/sync');
  return data;
};

export const syncSpondRehearsal = async (rehearsalId: string): Promise<{ message: string; attendanceCount: number }> => {
  const { data } = await api.post(`/spond/sync/${rehearsalId}`);
  return data;
};

// Spond Orchestra Groups
export const getSpondOrchestraGroups = async (): Promise<SpondOrchestraGroup[]> => {
  const { data } = await api.get('/spond/orchestra-groups');
  return data;
};

export const setSpondOrchestraGroup = async (orchestraId: string, spondGroupId: string | null, spondGroupName?: string): Promise<void> => {
  await api.put(`/spond/orchestra-groups/${orchestraId}`, { spondGroupId, spondGroupName });
};

// Spond Member Links
export const getSpondMemberLinks = async (): Promise<SpondMemberLink[]> => {
  const { data } = await api.get('/spond/member-links');
  return data;
};

export const createSpondMemberLink = async (spondMemberId: string, userId: string, spondMemberName?: string): Promise<void> => {
  await api.post('/spond/member-links', { spondMemberId, userId, spondMemberName });
};

export const deleteSpondMemberLink = async (id: string): Promise<void> => {
  await api.delete(`/spond/member-links/${id}`);
};

// Spond Attendance (bidirectional sync)
export const updateMyAttendance = async (rehearsalId: string, accepted: boolean): Promise<{
  message: string;
  status: string;
  spondSynced: boolean;
}> => {
  const { data } = await api.put(`/spond/attendance/${rehearsalId}`, { accepted });
  return data;
};

export const getMyAttendanceStatus = async (rehearsalId: string): Promise<{
  status: string;
  canSyncToSpond: boolean;
}> => {
  const { data } = await api.get(`/spond/attendance/${rehearsalId}/my-status`);
  return data;
};
