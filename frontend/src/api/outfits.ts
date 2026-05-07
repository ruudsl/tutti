import api from './client';

export interface Outfit {
  id: string;
  name: string;
  description?: string;
  colorCode?: string;
  imagePath?: string;
  items: string[];
  isDefault: boolean;
  sortOrder: number;
  usageCount: number;
  createdAt: string;
}

export interface OutfitDetail extends Outfit {
  createdByName?: string;
  updatedAt?: string;
  recentConcerts: { id: string; name: string; date: string }[];
}

export interface CreateOutfitData {
  name: string;
  description?: string;
  colorCode?: string;
  items?: string[];
  isDefault?: boolean;
}

export const getOutfits = async (): Promise<Outfit[]> => {
  const { data } = await api.get('/outfits');
  return data;
};

export const getOutfit = async (id: string): Promise<OutfitDetail> => {
  const { data } = await api.get(`/outfits/${id}`);
  return data;
};

export const createOutfit = async (outfit: CreateOutfitData): Promise<{ id: string; message: string }> => {
  const { data } = await api.post('/outfits', outfit);
  return data;
};

export const updateOutfit = async (id: string, updates: Partial<CreateOutfitData>): Promise<{ message: string }> => {
  const { data } = await api.patch(`/outfits/${id}`, updates);
  return data;
};

export const deleteOutfit = async (id: string): Promise<{ message: string }> => {
  const { data } = await api.delete(`/outfits/${id}`);
  return data;
};

export const linkOutfitToConcert = async (outfitId: string, concertId: string): Promise<{ message: string }> => {
  const { data } = await api.post(`/outfits/${outfitId}/concerts/${concertId}`);
  return data;
};

export const unlinkOutfitFromConcert = async (outfitId: string, concertId: string): Promise<{ message: string }> => {
  const { data } = await api.delete(`/outfits/${outfitId}/concerts/${concertId}`);
  return data;
};
