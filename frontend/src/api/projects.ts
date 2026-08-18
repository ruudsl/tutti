import api from './client';

export type ProjectStatus = 'planning' | 'active' | 'completed' | 'cancelled' | 'archived';
export type ProjectType = 'concert' | 'competition' | 'festival' | 'tour' | 'recording' | 'other';

export interface Project {
  id: string;
  name: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  status: ProjectStatus;
  projectType: ProjectType;
  orchestraId?: string;
  orchestraName?: string;
  budget?: number;
  notes?: string;
  memberCount: number;
  concertCount: number;
  rehearsalCount: number;
  createdAt: string;
}

export interface ProjectMember {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  status: string;
  notes?: string;
}

export interface ProjectDetail extends Project {
  coverImagePath?: string;
  createdBy: string;
  createdByName: string;
  members: ProjectMember[];
  concerts: { id: string; name: string; date: string; venue?: string; sortOrder: number }[];
  rehearsals: { id: string; date: string; startTime: string; endTime: string; location?: string; sortOrder: number }[];
  setlist: {
    id: string;
    musicTitleId?: string;
    musicTitleName?: string;
    customTitle?: string;
    sortOrder: number;
    durationMinutes?: number;
    notes?: string;
  }[];
}

export interface CreateProjectData {
  name: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  projectType?: ProjectType;
  orchestraId?: string;
  budget?: number;
  notes?: string;
}

export async function getProjects(filters?: {
  status?: ProjectStatus;
  type?: ProjectType;
  orchestraId?: string;
}): Promise<Project[]> {
  const params = new URLSearchParams();
  if (filters?.status) params.append('status', filters.status);
  if (filters?.type) params.append('type', filters.type);
  if (filters?.orchestraId) params.append('orchestraId', filters.orchestraId);
  const response = await api.get(`/projects?${params.toString()}`);
  return response.data;
}

export async function getProject(id: string): Promise<ProjectDetail> {
  const response = await api.get(`/projects/${id}`);
  return response.data;
}

export async function createProject(data: CreateProjectData): Promise<{ id: string; message: string }> {
  const response = await api.post('/projects', data);
  return response.data;
}

export async function updateProject(id: string, data: Partial<CreateProjectData>): Promise<{ message: string }> {
  const response = await api.patch(`/projects/${id}`, data);
  return response.data;
}

export async function updateProjectStatus(id: string, status: ProjectStatus): Promise<{ message: string }> {
  const response = await api.patch(`/projects/${id}/status`, { status });
  return response.data;
}

export async function deleteProject(id: string): Promise<{ message: string }> {
  const response = await api.delete(`/projects/${id}`);
  return response.data;
}

export async function addProjectMember(
  projectId: string,
  userId: string,
  role: string,
): Promise<{ id: string; message: string }> {
  const response = await api.post(`/projects/${projectId}/members`, { userId, role });
  return response.data;
}

export async function removeProjectMember(projectId: string, memberId: string): Promise<{ message: string }> {
  const response = await api.delete(`/projects/${projectId}/members/${memberId}`);
  return response.data;
}

export async function addSetlistItem(
  projectId: string,
  item: { musicTitleId?: string; customTitle?: string; durationMinutes?: number; notes?: string },
): Promise<{ id: string; message: string }> {
  const response = await api.post(`/projects/${projectId}/setlist`, item);
  return response.data;
}

export async function removeSetlistItem(projectId: string, itemId: string): Promise<{ message: string }> {
  const response = await api.delete(`/projects/${projectId}/setlist/${itemId}`);
  return response.data;
}

// Concert linking
export async function linkConcertToProject(projectId: string, concertId: string): Promise<{ message: string }> {
  const response = await api.post(`/projects/${projectId}/concerts`, { concertId });
  return response.data;
}

export async function unlinkConcertFromProject(projectId: string, concertId: string): Promise<{ message: string }> {
  const response = await api.delete(`/projects/${projectId}/concerts/${concertId}`);
  return response.data;
}

// Rehearsal linking
export async function linkRehearsalToProject(projectId: string, rehearsalId: string): Promise<{ message: string }> {
  const response = await api.post(`/projects/${projectId}/rehearsals`, { rehearsalId });
  return response.data;
}

export async function unlinkRehearsalFromProject(projectId: string, rehearsalId: string): Promise<{ message: string }> {
  const response = await api.delete(`/projects/${projectId}/rehearsals/${rehearsalId}`);
  return response.data;
}

// Setlist reorder
export async function reorderProjectSetlist(projectId: string, itemIds: string[]): Promise<{ message: string }> {
  const response = await api.put(`/projects/${projectId}/setlist/reorder`, { itemIds });
  return response.data;
}
