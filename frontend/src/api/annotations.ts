import api from './client';

export interface Annotation {
  id: string;
  pageNumber: number;
  annotationType: 'highlight' | 'note' | 'drawing' | 'text';
  xPosition: number;
  yPosition: number;
  width?: number;
  height?: number;
  content?: string;
  color: string;
  createdAt: string;
  updatedAt: string;
}

export const getAnnotations = async (musicPieceId: string, pageNumber?: number): Promise<Annotation[]> => {
  const { data } = await api.get(`/annotations/piece/${musicPieceId}`, {
    params: { pageNumber },
  });
  return data;
};

export const createAnnotation = async (annotation: {
  musicPieceId: string;
  pageNumber: number;
  annotationType: 'highlight' | 'note' | 'drawing' | 'text';
  xPosition: number;
  yPosition: number;
  width?: number;
  height?: number;
  content?: string;
  color?: string;
}): Promise<{ id: string; message: string }> => {
  const { data } = await api.post('/annotations', annotation);
  return data;
};

export const updateAnnotation = async (
  id: string,
  updates: {
    xPosition?: number;
    yPosition?: number;
    width?: number;
    height?: number;
    content?: string;
    color?: string;
  },
): Promise<{ message: string }> => {
  const { data } = await api.put(`/annotations/${id}`, updates);
  return data;
};

export const deleteAnnotation = async (id: string): Promise<{ message: string }> => {
  const { data } = await api.delete(`/annotations/${id}`);
  return data;
};

export const deleteAllAnnotations = async (musicPieceId: string): Promise<{ message: string; deleted: number }> => {
  const { data } = await api.delete(`/annotations/piece/${musicPieceId}`);
  return data;
};
