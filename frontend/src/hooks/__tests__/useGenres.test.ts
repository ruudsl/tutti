import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';

// Alleen de api-functies die useGenres importeert hoeven te bestaan.
vi.mock('../../api', () => ({
  getGenres: vi.fn(),
  createGenre: vi.fn(),
  updateGenre: vi.fn(),
  deleteGenre: vi.fn(),
}));

vi.mock('../../utils/toast', () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}));

import { useGenres, useCreateGenre, useUpdateGenre, useDeleteGenre } from '../useGenres';
import { getGenres, createGenre, updateGenre, deleteGenre } from '../../api';
import { showSuccess, showError } from '../../utils/toast';

/** De api is gemockt; TypeScript kent alleen nog de echte signatuur. */
const alsMock = (fn: unknown) => fn as Mock;

/** Een axios-achtige fout zoals de backend hem teruggeeft. */
const serverfout = (melding: string) => ({
  isAxiosError: true,
  response: { data: { error: melding } },
});

let queryClient: QueryClient;
/** Alle queryKeys die de hooks ongeldig hebben gemaakt, in volgorde. */
let ongeldigGemaakt: unknown[];

beforeEach(() => {
  vi.clearAllMocks();
  queryClient = new QueryClient({
    defaultOptions: {
      // retry:false, anders wacht een faaltest op de herhaalpogingen.
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  ongeldigGemaakt = [];
  const echteInvalidatie = queryClient.invalidateQueries.bind(queryClient);
  vi.spyOn(queryClient, 'invalidateQueries').mockImplementation((filters?: unknown) => {
    ongeldigGemaakt.push((filters as { queryKey?: unknown })?.queryKey);
    return echteInvalidatie(filters as never);
  });
});

const wrapper = ({ children }: { children: React.ReactNode }) =>
  createElement(QueryClientProvider, { client: queryClient }, children);

/** Controleert of precies deze queryKey ongeldig is gemaakt. */
const isOngeldigGemaakt = (key: unknown[]) => ongeldigGemaakt.some((k) => JSON.stringify(k) === JSON.stringify(key));

// ==================== OPHALEN ====================

describe('useGenres - ophalen', () => {
  it('haalt de genrelijst op', async () => {
    alsMock(getGenres).mockResolvedValue([{ id: 'g1', name: 'Mars' }]);

    const { result } = renderHook(() => useGenres(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getGenres).toHaveBeenCalledTimes(1);
    expect(result.current.data).toEqual([{ id: 'g1', name: 'Mars' }]);
  });

  it('deelt de genrelijst tussen schermen in plaats van hem twee keer te halen', async () => {
    alsMock(getGenres).mockResolvedValue([]);

    const { result } = renderHook(() => ({ een: useGenres(), twee: useGenres() }), { wrapper });

    await waitFor(() => expect(result.current.een.isSuccess).toBe(true));
    expect(getGenres).toHaveBeenCalledTimes(1);
  });

  it('geeft een lege lijst terug als de vereniging nog geen genres heeft', async () => {
    alsMock(getGenres).mockResolvedValue([]);

    const { result } = renderHook(() => useGenres(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it('meldt een fout als de genres niet opgehaald kunnen worden', async () => {
    alsMock(getGenres).mockRejectedValue(serverfout('Database niet bereikbaar'));

    const { result } = renderHook(() => useGenres(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });
});

// ==================== BEHEREN ====================

describe('useGenres - beheren', () => {
  it('maakt een genre aan met alleen de naam en vernieuwt de genrelijst', async () => {
    alsMock(createGenre).mockResolvedValue({ id: 'g9' });

    const { result } = renderHook(() => useCreateGenre(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync('Filmmuziek');
    });

    expect(createGenre).toHaveBeenCalledWith('Filmmuziek');
    expect(isOngeldigGemaakt(['genres'])).toBe(true);
    expect(showSuccess).toHaveBeenCalledWith('Genre aangemaakt');
  });

  it('vernieuwt bij het aanmaken alleen de genrelijst', async () => {
    // Aan een nieuw genre hangt nog geen enkele titel, dus er is verder
    // niets verouderd.
    alsMock(createGenre).mockResolvedValue({ id: 'g9' });

    const { result } = renderHook(() => useCreateGenre(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync('Filmmuziek');
    });

    expect(ongeldigGemaakt).toEqual([['genres']]);
  });

  it('toont de foutmelding van de server als aanmaken mislukt', async () => {
    alsMock(createGenre).mockRejectedValue(serverfout('Genre bestaat al'));

    const { result } = renderHook(() => useCreateGenre(), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync('Mars')).rejects.toBeDefined();
    });

    expect(showError).toHaveBeenCalledWith('Genre bestaat al');
    expect(showSuccess).not.toHaveBeenCalled();
    expect(ongeldigGemaakt).toHaveLength(0);
  });

  it('hernoemt een genre met id en naam als losse argumenten', async () => {
    alsMock(updateGenre).mockResolvedValue(undefined);

    const { result } = renderHook(() => useUpdateGenre(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ id: 'g1', name: 'Concertmars' });
    });

    expect(updateGenre).toHaveBeenCalledWith('g1', 'Concertmars');
    expect(isOngeldigGemaakt(['genres'])).toBe(true);
    expect(showSuccess).toHaveBeenCalledWith('Genre bijgewerkt');
  });

  it('vernieuwt na een hernoeming ook de muziektitels', async () => {
    // Elke muziektitel draagt zijn genres mee (MusicTitle.genres), en de
    // genrepagina zelf toont de titels per genre onder de sleutel
    // ['musicTitles', {genreId}]. Zonder deze invalidatie staat daar nog de
    // oude genrenaam.
    alsMock(updateGenre).mockResolvedValue(undefined);

    const { result } = renderHook(() => useUpdateGenre(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ id: 'g1', name: 'Concertmars' });
    });

    expect(isOngeldigGemaakt(['musicTitles'])).toBe(true);
  });

  it('verwijdert een genre en vernieuwt de genrelijst', async () => {
    alsMock(deleteGenre).mockResolvedValue(undefined);

    const { result } = renderHook(() => useDeleteGenre(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync('g1');
    });

    expect(deleteGenre).toHaveBeenCalledWith('g1');
    expect(isOngeldigGemaakt(['genres'])).toBe(true);
    expect(showSuccess).toHaveBeenCalledWith('Genre verwijderd');
  });

  it('vernieuwt na het verwijderen ook de muziektitels', async () => {
    // music_title_genres verwijst naar genres met ON DELETE CASCADE
    // (database/schema.ts): met het genre verdwijnt het bij alle titels.
    // Zonder invalidatie blijven die titels een genre tonen dat niet meer
    // bestaat.
    alsMock(deleteGenre).mockResolvedValue(undefined);

    const { result } = renderHook(() => useDeleteGenre(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync('g1');
    });

    expect(isOngeldigGemaakt(['musicTitles'])).toBe(true);
  });

  it('meldt geen succes als verwijderen mislukt', async () => {
    alsMock(deleteGenre).mockRejectedValue(serverfout('Genre niet gevonden.'));

    const { result } = renderHook(() => useDeleteGenre(), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync('g1')).rejects.toBeDefined();
    });

    expect(showError).toHaveBeenCalledWith('Genre niet gevonden.');
    expect(showSuccess).not.toHaveBeenCalled();
    expect(ongeldigGemaakt).toHaveLength(0);
  });

  it('haalt de openstaande genrelijst daadwerkelijk opnieuw op na een hernoeming', async () => {
    alsMock(getGenres).mockResolvedValue([{ id: 'g1', name: 'Mars' }]);
    alsMock(updateGenre).mockResolvedValue(undefined);

    const { result } = renderHook(() => ({ lijst: useGenres(), wijzig: useUpdateGenre() }), { wrapper });

    await waitFor(() => expect(result.current.lijst.isSuccess).toBe(true));

    alsMock(getGenres).mockResolvedValue([{ id: 'g1', name: 'Concertmars' }]);
    await act(async () => {
      await result.current.wijzig.mutateAsync({ id: 'g1', name: 'Concertmars' });
    });

    await waitFor(() => expect(result.current.lijst.data).toEqual([{ id: 'g1', name: 'Concertmars' }]));
  });
});
