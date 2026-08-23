/**
 * Podiumindelingen: de plattegrond van een concertpodium, en de kaartjes die
 * je erbij kunt afdrukken.
 *
 * Verhuisd uit src/api.ts; zie de toelichting in failed-imports.ts.
 */

import api from './client';

// ==================== STAGE LAYOUTS (PODIUMPLOT DESIGNER) ====================

import type {
  StageLayout,
  StageLayoutData,
  ConcertStageResponse,
  PrintableSeatCardsResponse,
  StageAssignment,
} from '../types';

export const getStageLayouts = async (includeTemplates = false): Promise<StageLayout[]> => {
  const { data } = await api.get('/stage-layouts', {
    params: { includeTemplates: includeTemplates ? 'true' : 'false' },
  });
  return data;
};

export const getStageLayout = async (id: string): Promise<StageLayout> => {
  const { data } = await api.get(`/stage-layouts/${id}`);
  return data;
};

export const createStageLayout = async (layout: {
  name: string;
  description?: string;
  venueName?: string;
  stageWidth?: number;
  stageDepth?: number;
  isTemplate?: boolean;
  isDefault?: boolean;
  layoutData?: StageLayoutData;
  thumbnailUrl?: string;
}): Promise<{ id: string; message: string }> => {
  const { data } = await api.post('/stage-layouts', layout);
  return data;
};

export const updateStageLayout = async (
  id: string,
  layout: {
    name?: string;
    description?: string;
    venueName?: string;
    stageWidth?: number;
    stageDepth?: number;
    isTemplate?: boolean;
    isDefault?: boolean;
    layoutData?: StageLayoutData;
    thumbnailUrl?: string;
  },
): Promise<{ message: string }> => {
  const { data } = await api.put(`/stage-layouts/${id}`, layout);
  return data;
};

export const deleteStageLayout = async (id: string): Promise<{ message: string }> => {
  const { data } = await api.delete(`/stage-layouts/${id}`);
  return data;
};

export const duplicateStageLayout = async (id: string, name?: string): Promise<{ id: string; message: string }> => {
  const { data } = await api.post(`/stage-layouts/${id}/duplicate`, { name });
  return data;
};

export const getConcertStage = async (concertId: string): Promise<ConcertStageResponse> => {
  const { data } = await api.get(`/concerts/${concertId}/stage`);
  return data;
};

export const saveConcertStage = async (
  concertId: string,
  layoutId: string,
  assignments: Record<string, StageAssignment>,
): Promise<{ message: string }> => {
  const { data } = await api.put(`/concerts/${concertId}/stage`, {
    layoutId,
    assignments,
  });
  return data;
};

export const deleteConcertStage = async (concertId: string): Promise<{ message: string }> => {
  const { data } = await api.delete(`/concerts/${concertId}/stage`);
  return data;
};

export const getPrintableSeatCards = async (concertId: string): Promise<PrintableSeatCardsResponse> => {
  const { data } = await api.get(`/concerts/${concertId}/stage/print`);
  return data;
};
