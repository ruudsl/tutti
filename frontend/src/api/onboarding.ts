import api from './client';

export interface OnboardingRequest {
  firstName: string;
  lastName: string;
  email: string;
  privateEmail?: string;
  instrumentIds?: string[];
  orchestraIds?: string[];
  createM365Account?: boolean;
  m365Password?: string;
  addToPercussionGroup?: boolean;
  profilePhoto?: File;
}

export interface OnboardingResponse {
  success: boolean;
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  tempPassword: string;
  m365Created: boolean;
  m365Error: string | null;
  licenseAssigned?: boolean;
  groupsAdded?: string[];
  groupsFailed?: string[];
  emailForwardingSet?: boolean;
  photoUploaded?: boolean;
  spondLinkPending: boolean;
  message: string;
  instructions: string[];
}

export interface M365GroupMapping {
  id: string;
  orchestraId: string | null;
  orchestraName: string | null;
  groupName: string;
  groupType: 'orchestra' | 'percussion' | 'special';
}

export interface InstrumentJobTitleMapping {
  id: string;
  instrumentId: string;
  instrumentName: string;
  instrumentTuning: string | null;
  jobTitle: string;
}

export interface PendingSpondLink {
  id: string;
  userId: string;
  expectedEmail: string;
  expectedName: string;
  firstName: string;
  lastName: string;
  email: string;
  createdAt: string;
}

export interface OnboardingTask {
  id: string;
  taskType: string;
  status: string;
  errorMessage: string | null;
  metadata: Record<string, any> | null;
  completedAt: string | null;
  createdAt: string;
}

export interface OffboardResponse {
  success: boolean;
  m365Removed: boolean;
  m365Error: string | null;
  message: string;
  notes: string[];
}

export interface InactiveMember {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  offboardedAt: string | null;
  createdAt: string;
}

export const onboardMember = async (data: OnboardingRequest): Promise<OnboardingResponse> => {
  if (data.profilePhoto) {
    const formData = new FormData();
    formData.append('firstName', data.firstName);
    formData.append('lastName', data.lastName);
    formData.append('email', data.email);
    if (data.privateEmail) formData.append('privateEmail', data.privateEmail);
    if (data.instrumentIds) formData.append('instrumentIds', JSON.stringify(data.instrumentIds));
    if (data.orchestraIds) formData.append('orchestraIds', JSON.stringify(data.orchestraIds));
    if (data.createM365Account) formData.append('createM365Account', 'true');
    if (data.m365Password) formData.append('m365Password', data.m365Password);
    if (data.addToPercussionGroup) formData.append('addToPercussionGroup', 'true');
    formData.append('profilePhoto', data.profilePhoto);

    const { data: response } = await api.post('/onboarding/member', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response;
  } else {
    const { data: response } = await api.post('/onboarding/member', data);
    return response;
  }
};

// M365 Group Mappings
export const getM365GroupMappings = async (): Promise<M365GroupMapping[]> => {
  const { data } = await api.get('/onboarding/m365-groups');
  return data;
};

export const createM365GroupMapping = async (mappingData: {
  orchestraId?: string;
  groupName: string;
  groupType?: string;
}): Promise<{ id: string; message: string }> => {
  const { data } = await api.post('/onboarding/m365-groups', mappingData);
  return data;
};

export const updateM365GroupMapping = async (id: string, groupName: string): Promise<{ message: string }> => {
  const { data } = await api.put(`/onboarding/m365-groups/${id}`, { groupName });
  return data;
};

export const deleteM365GroupMapping = async (id: string): Promise<{ message: string }> => {
  const { data } = await api.delete(`/onboarding/m365-groups/${id}`);
  return data;
};

// Instrument Job Title Mappings
export const getInstrumentJobTitleMappings = async (): Promise<InstrumentJobTitleMapping[]> => {
  const { data } = await api.get('/onboarding/job-titles');
  return data;
};

export const createInstrumentJobTitleMapping = async (mappingData: {
  instrumentId: string;
  jobTitle: string;
}): Promise<{ id: string; message: string }> => {
  const { data } = await api.post('/onboarding/job-titles', mappingData);
  return data;
};

export const updateInstrumentJobTitleMapping = async (id: string, jobTitle: string): Promise<{ message: string }> => {
  const { data } = await api.put(`/onboarding/job-titles/${id}`, { jobTitle });
  return data;
};

export const deleteInstrumentJobTitleMapping = async (id: string): Promise<{ message: string }> => {
  const { data } = await api.delete(`/onboarding/job-titles/${id}`);
  return data;
};

export const getPendingSpondLinks = async (): Promise<PendingSpondLink[]> => {
  const { data } = await api.get('/onboarding/pending-links');
  return data;
};

export const deletePendingSpondLink = async (id: string): Promise<{ message: string }> => {
  const { data } = await api.delete(`/onboarding/pending-links/${id}`);
  return data;
};

export const getOnboardingTasks = async (userId: string): Promise<OnboardingTask[]> => {
  const { data } = await api.get(`/onboarding/tasks/${userId}`);
  return data;
};

export const retryEmailForwarding = async (userId: string): Promise<{ success: boolean; message: string }> => {
  const { data } = await api.post(`/onboarding/retry-email-forwarding/${userId}`);
  return data;
};

export const offboardMember = async (userId: string, removeFromM365?: boolean): Promise<OffboardResponse> => {
  const { data } = await api.post(`/onboarding/offboard/${userId}`, { removeFromM365 });
  return data;
};

export const reactivateMember = async (userId: string): Promise<{ success: boolean; message: string }> => {
  const { data } = await api.post(`/onboarding/reactivate/${userId}`);
  return data;
};

export const getInactiveMembers = async (): Promise<InactiveMember[]> => {
  const { data } = await api.get('/onboarding/inactive-members');
  return data;
};
