import api from './client';
import type { Instrument } from '../types';

/** De instrumenten die de vereniging ziet; met `alles` ook de verborgen standaardinstrumenten (voor het beheer). */
export const getInstruments = async (alles = false): Promise<Instrument[]> => {
  const { data } = await api.get('/instruments', alles ? { params: { alles: 'true' } } : undefined);
  return data;
};

export const createInstrument = async (
  name: string,
  tuning?: string,
  clef?: string,
  aliases?: string[],
): Promise<{ id: string }> => {
  const { data } = await api.post('/instruments', { name, tuning, clef, aliases });
  return data;
};

export const updateInstrument = async (id: string, name: string, tuning?: string, clef?: string): Promise<void> => {
  await api.put(`/instruments/${id}`, { name, tuning, clef });
};

export const deleteInstrument = async (id: string): Promise<void> => {
  await api.delete(`/instruments/${id}`);
};

export const addInstrumentAlias = async (instrumentId: string, alias: string): Promise<{ id: string }> => {
  const { data } = await api.post(`/instruments/${instrumentId}/aliases`, { alias });
  return data;
};

export const deleteInstrumentAlias = async (instrumentId: string, aliasId: string): Promise<void> => {
  await api.delete(`/instruments/${instrumentId}/aliases/${aliasId}`);
};

/** Een standaardinstrument verbergen of weer tonen voor de eigen vereniging. */
export const zetInstrumentVerborgen = async (id: string, verborgen: boolean): Promise<void> => {
  if (verborgen) await api.post(`/instruments/${id}/verbergen`);
  else await api.delete(`/instruments/${id}/verbergen`);
};
