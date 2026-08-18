import api from './client';
import type { UniformItem, UniformItemDetail, UniformSet, UniformItemType, UniformSizeAvailability } from '../types';

export const getUniformItemTypes = async (): Promise<UniformItemType[]> => {
  const { data } = await api.get('/uniforms/item-types');
  return data;
};

export const searchUniformsBySize = async (size: string, itemType?: string): Promise<UniformItem[]> => {
  const { data } = await api.get('/uniforms/size-search', { params: { size, itemType } });
  return data;
};

export const getUniformAvailabilityBySize = async (itemType?: string): Promise<UniformSizeAvailability[]> => {
  const { data } = await api.get('/uniforms/available-by-size', { params: { itemType } });
  return data;
};

export const getUniformItems = async (filters?: {
  search?: string;
  status?: string;
  itemType?: string;
  size?: string;
}): Promise<{ data: UniformItem[]; total: number; page: number; limit: number }> => {
  const { data } = await api.get('/uniforms/items', { params: filters });
  return data;
};

export const getUniformItem = async (id: string): Promise<UniformItemDetail> => {
  const { data } = await api.get(`/uniforms/items/${id}`);
  return data;
};

export const createUniformItem = async (item: {
  itemType: string;
  sizeStandard?: string;
  sizeLength?: number;
  sizeWidth?: number;
  color?: string;
  condition?: string;
  status?: string;
  currentUserId?: string | null;
  notes?: string;
  purchaseDate?: string;
  purchasePrice?: number;
}): Promise<{ id: string }> => {
  const { data } = await api.post('/uniforms/items', item);
  return data;
};

export const createUniformItemsBulk = async (item: {
  itemType: string;
  sizeStandard?: string;
  sizeLength?: number;
  sizeWidth?: number;
  color?: string;
  condition?: string;
  status?: string;
  notes?: string;
  purchaseDate?: string;
  purchasePrice?: number;
  count: number;
}): Promise<{ ids: string[]; count: number }> => {
  const { data } = await api.post('/uniforms/items/bulk', item);
  return data;
};

export const updateUniformItem = async (
  id: string,
  item: {
    itemType?: string;
    sizeStandard?: string;
    sizeLength?: number;
    sizeWidth?: number;
    color?: string;
    condition?: string;
    status?: string;
    currentUserId?: string | null;
    notes?: string;
    purchaseDate?: string;
    purchasePrice?: number;
  },
): Promise<void> => {
  await api.put(`/uniforms/items/${id}`, item);
};

export const deleteUniformItem = async (id: string): Promise<void> => {
  await api.delete(`/uniforms/items/${id}`);
};

export const assignUniformItem = async (
  itemId: string,
  assignment: {
    userId: string;
    assignedDate: string;
    conditionAtAssignment?: string;
    notes?: string;
  },
): Promise<{ id: string }> => {
  const { data } = await api.post(`/uniforms/items/${itemId}/assign`, assignment);
  return data;
};

export const returnUniformItem = async (
  itemId: string,
  returnData: {
    returnedDate: string;
    conditionAtReturn?: string;
  },
): Promise<void> => {
  await api.post(`/uniforms/items/${itemId}/return`, returnData);
};

export const getUniformSets = async (): Promise<UniformSet[]> => {
  const { data } = await api.get('/uniforms/sets');
  return data;
};

export const getUniformSet = async (id: string): Promise<UniformSet> => {
  const { data } = await api.get(`/uniforms/sets/${id}`);
  return data;
};

export const createUniformSet = async (set: {
  name: string;
  description?: string;
  requirements?: { itemType: string; quantity: number }[];
}): Promise<{ id: string }> => {
  const { data } = await api.post('/uniforms/sets', set);
  return data;
};

export const updateUniformSet = async (
  id: string,
  set: {
    name?: string;
    description?: string;
    requirements?: { itemType: string; quantity: number }[];
  },
): Promise<void> => {
  await api.put(`/uniforms/sets/${id}`, set);
};

export const deleteUniformSet = async (id: string): Promise<void> => {
  await api.delete(`/uniforms/sets/${id}`);
};

export const getUserUniforms = async (userId: string): Promise<UniformItem[]> => {
  const { data } = await api.get(`/uniforms/user/${userId}`);
  return data;
};
