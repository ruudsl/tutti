/**
 * Zoeken in de applicatie: resultaten, suggesties en recente zoekopdrachten.
 *
 * De zoekhook (hooks/useSearch.ts) deed dit met een eigen `fetch` en zette het
 * token er zelf bij. Daarmee liep hij langs de interceptor van client.ts: bij
 * een verlopen sessie gaf zoeken stilletjes niets, waar elke andere pagina de
 * gebruiker naar het inlogscherm stuurt.
 */

import api from './client';

export interface Zoekresultaat {
  id: string;
  type: 'music' | 'member' | 'orchestra' | 'list' | 'rehearsal' | 'settings';
  title: string;
  subtitle?: string;
  path: string;
  icon: string;
  metadata?: Record<string, unknown>;
}

export interface RecenteZoekopdracht {
  id: string;
  query: string;
  timestamp: string;
}

export interface Zoekfilters {
  type?: string;
  orchestraId?: string;
}

export interface Zoekantwoord {
  results: Zoekresultaat[];
  total: number;
  query: string;
}

export async function zoeken(term: string, filters: Zoekfilters = {}, signal?: AbortSignal): Promise<Zoekantwoord> {
  const params: Record<string, string> = { q: term };
  if (filters.type) params.type = filters.type;
  if (filters.orchestraId) params.orchestraId = filters.orchestraId;
  const { data } = await api.get<Zoekantwoord>('/search', { params, signal });
  return data;
}

export async function getZoeksuggesties(term: string): Promise<string[]> {
  const { data } = await api.get<{ suggestions: string[] }>('/search/suggestions', { params: { q: term } });
  return data.suggestions;
}

export async function getRecenteZoekopdrachten(): Promise<RecenteZoekopdracht[]> {
  const { data } = await api.get<{ searches: RecenteZoekopdracht[] }>('/search/recent');
  return data.searches;
}

export async function bewaarZoekopdracht(term: string): Promise<void> {
  await api.post('/search/recent', { query: term });
}

export async function verwijderZoekopdracht(id: string): Promise<void> {
  await api.delete(`/search/recent/${encodeURIComponent(id)}`);
}

export async function wisZoekopdrachten(): Promise<void> {
  await api.delete('/search/recent');
}
