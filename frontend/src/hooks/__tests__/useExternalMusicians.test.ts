/**
 * De haken rond externe muzikanten (invallers).
 *
 * Dezelfde vorm als useReplacementRequests, en om dezelfde reden getoetst: het
 * gaat hier niet om het ophalen maar om wat er na een mutatie vernieuwd wordt.
 * Een muzikant staat in de lijst én in zijn eigen detailvenster met zijn
 * instrumenten; wie na het toevoegen van een instrument alleen het detail
 * vernieuwt, laat de zoekfunctie op instrument een muzikant missen die er wél
 * bij hoort.
 *
 * Twee dingen liggen hier verder vast:
 *
 *   - "verwijderen" is aan deze kant een deactivering. De melding zegt dat ook,
 *     en dat hoort zo te blijven: wie hier "verwijderd" leest, denkt dat de
 *     gegevens weg zijn.
 *   - de zoekopdracht op instrument neemt de opties op in zijn sleutel. Zonder
 *     dat deelt "alleen actieve muzikanten" zijn cache met "alle muzikanten".
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';

vi.mock('../../api/external-musicians', () => ({
  getExternalMusicians: vi.fn(),
  getExternalMusician: vi.fn(),
  createExternalMusician: vi.fn(),
  updateExternalMusician: vi.fn(),
  deleteExternalMusician: vi.fn(),
  searchExternalMusiciansByInstrument: vi.fn(),
  addInstrumentToMusician: vi.fn(),
  removeInstrumentFromMusician: vi.fn(),
}));

vi.mock('../../utils/toast', () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}));

import {
  externalMusicianKeys,
  useExternalMusicians,
  useExternalMusician,
  useExternalMusicianSearch,
  useCreateExternalMusician,
  useUpdateExternalMusician,
  useDeleteExternalMusician,
  useAddMusicianInstrument,
  useRemoveMusicianInstrument,
} from '../useExternalMusicians';
import {
  getExternalMusicians,
  getExternalMusician,
  createExternalMusician,
  updateExternalMusician,
  deleteExternalMusician,
  searchExternalMusiciansByInstrument,
  addInstrumentToMusician,
  removeInstrumentFromMusician,
} from '../../api/external-musicians';
import { showSuccess, showError } from '../../utils/toast';

/** De api is gemockt; TypeScript kent alleen nog de echte signatuur. */
const alsMock = (fn: unknown) => fn as Mock;

/** Een axios-achtige fout zoals de backend hem teruggeeft. */
const serverfout = (melding: string) => ({
  isAxiosError: true,
  response: { data: { error: melding } },
});

let queryClient: QueryClient;
/** Alle queryKeys die de haken ongeldig hebben gemaakt, in volgorde. */
let ongeldigGemaakt: unknown[];

beforeEach(() => {
  vi.clearAllMocks();
  queryClient = new QueryClient({
    defaultOptions: {
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

const isOngeldigGemaakt = (key: readonly unknown[]) =>
  ongeldigGemaakt.some((k) => JSON.stringify(k) === JSON.stringify(key));

// ==================== SLEUTELS ====================

describe('externalMusicianKeys', () => {
  it('hangt lijst, detail en zoekopdracht onder dezelfde stam', () => {
    expect(externalMusicianKeys.all).toEqual(['externalMusicians']);
    expect(externalMusicianKeys.lists()).toEqual(['externalMusicians', 'list']);
    expect(externalMusicianKeys.list({ type: 'invaller' })).toEqual([
      'externalMusicians',
      'list',
      { type: 'invaller' },
    ]);
    expect(externalMusicianKeys.detail('m-1')).toEqual(['externalMusicians', 'detail', 'm-1']);
  });

  it('neemt de zoekopties op in de sleutel', () => {
    // Zonder de opties in de sleutel deelt "alleen actieve muzikanten" zijn
    // antwoord met "iedereen", en dat is precies het verschil dat de gebruiker
    // aan het zoeken was.
    expect(externalMusicianKeys.search('inst-1', { activeOnly: true })).not.toEqual(
      externalMusicianKeys.search('inst-1', { activeOnly: false }),
    );
    expect(externalMusicianKeys.search('inst-1')).toEqual(['externalMusicians', 'search', 'inst-1', undefined]);
  });
});

// ==================== OPHALEN ====================

describe('useExternalMusicians - de lijst', () => {
  it('haalt de muzikanten op', async () => {
    alsMock(getExternalMusicians).mockResolvedValue([{ id: 'm-1', firstName: 'Wim' }]);

    const { result } = renderHook(() => useExternalMusicians(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: 'm-1', firstName: 'Wim' }]);
  });

  it('geeft de filters ongewijzigd door', async () => {
    alsMock(getExternalMusicians).mockResolvedValue([]);
    const filters = { type: 'freelance', instrumentId: 'inst-1', isActive: true, search: 'wim' };

    const { result } = renderHook(() => useExternalMusicians(filters), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getExternalMusicians).toHaveBeenCalledWith(filters);
  });

  it('haalt opnieuw op bij een andere zoekterm', async () => {
    alsMock(getExternalMusicians).mockResolvedValue([]);

    const { result, rerender } = renderHook(({ search }: { search: string }) => useExternalMusicians({ search }), {
      wrapper,
      initialProps: { search: 'wim' },
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    rerender({ search: 'wimmie' });

    await waitFor(() => expect(getExternalMusicians).toHaveBeenCalledTimes(2));
    expect(getExternalMusicians).toHaveBeenLastCalledWith({ search: 'wimmie' });
  });

  it('houdt isActive:false uit elkaar met isActive weglaten', async () => {
    alsMock(getExternalMusicians).mockResolvedValue([]);

    const { result, rerender } = renderHook(
      ({ filters }: { filters?: { isActive?: boolean } }) => useExternalMusicians(filters),
      { wrapper, initialProps: { filters: undefined as { isActive?: boolean } | undefined } },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    rerender({ filters: { isActive: false } });

    // false is een keuze ("laat de gedeactiveerden zien"), undefined is er geen.
    // Vielen die twee op dezelfde sleutel, dan bleef het antwoord van de eerste
    // in beeld.
    await waitFor(() => expect(getExternalMusicians).toHaveBeenCalledTimes(2));
    expect(getExternalMusicians).toHaveBeenLastCalledWith({ isActive: false });
  });

  it('meldt een fout in plaats van een lege lijst', async () => {
    alsMock(getExternalMusicians).mockRejectedValue(serverfout('Database niet bereikbaar'));

    const { result } = renderHook(() => useExternalMusicians(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });
});

describe('useExternalMusician - het detail', () => {
  it('vraagt niets op zolang er geen muzikant gekozen is', () => {
    const { result } = renderHook(() => useExternalMusician(null), { wrapper });

    expect(getExternalMusician).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('haalt het detail op zodra het id bekend is', async () => {
    alsMock(getExternalMusician).mockResolvedValue({ id: 'm-1', instruments: [] });

    const { result } = renderHook(() => useExternalMusician('m-1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getExternalMusician).toHaveBeenCalledWith('m-1');
  });
});

describe('useExternalMusicianSearch', () => {
  it('zoekt niet zonder instrument', () => {
    const { result } = renderHook(() => useExternalMusicianSearch(null, { activeOnly: true }), { wrapper });

    expect(searchExternalMusiciansByInstrument).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('geeft instrument en opties door', async () => {
    alsMock(searchExternalMusiciansByInstrument).mockResolvedValue([{ id: 'm-1' }]);

    const { result } = renderHook(() => useExternalMusicianSearch('inst-1', { activeOnly: true }), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(searchExternalMusiciansByInstrument).toHaveBeenCalledWith('inst-1', { activeOnly: true });
  });

  it('zoekt opnieuw als het niveau verandert', async () => {
    alsMock(searchExternalMusiciansByInstrument).mockResolvedValue([]);

    const { result, rerender } = renderHook(
      ({ skillLevel }: { skillLevel: string }) => useExternalMusicianSearch('inst-1', { skillLevel }),
      { wrapper, initialProps: { skillLevel: 'advanced' } },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    rerender({ skillLevel: 'professional' });

    await waitFor(() => expect(searchExternalMusiciansByInstrument).toHaveBeenCalledTimes(2));
    expect(searchExternalMusiciansByInstrument).toHaveBeenLastCalledWith('inst-1', { skillLevel: 'professional' });
  });
});

// ==================== MUTATIES ====================

const NIEUWE_MUZIKANT = {
  firstName: 'Wim',
  lastName: 'de Vries',
  email: 'wim@example.org',
};

describe('useCreateExternalMusician', () => {
  it('stuurt de muzikant door en vernieuwt alles eronder', async () => {
    alsMock(createExternalMusician).mockResolvedValue({ id: 'm-9' });

    const { result } = renderHook(() => useCreateExternalMusician(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(NIEUWE_MUZIKANT);
    });

    expect(createExternalMusician).toHaveBeenCalledWith(NIEUWE_MUZIKANT);
    expect(isOngeldigGemaakt(externalMusicianKeys.all)).toBe(true);
    expect(showSuccess).toHaveBeenCalledWith('Externe muzikant toegevoegd');
  });

  it('toont de foutmelding van de server en vernieuwt niets', async () => {
    alsMock(createExternalMusician).mockRejectedValue(serverfout('E-mailadres bestaat al'));

    const { result } = renderHook(() => useCreateExternalMusician(), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync(NIEUWE_MUZIKANT)).rejects.toBeDefined();
    });

    expect(showError).toHaveBeenCalledWith('E-mailadres bestaat al');
    expect(showSuccess).not.toHaveBeenCalled();
    expect(ongeldigGemaakt).toEqual([]);
  });

  it('valt terug op een algemene melding als de server niets zegt', async () => {
    alsMock(createExternalMusician).mockRejectedValue(new Error('Network Error'));

    const { result } = renderHook(() => useCreateExternalMusician(), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync(NIEUWE_MUZIKANT)).rejects.toBeDefined();
    });

    expect(showError).toHaveBeenCalledWith('Network Error');
  });
});

describe('useUpdateExternalMusician', () => {
  it('vernieuwt de stam én het detail van deze muzikant', async () => {
    alsMock(updateExternalMusician).mockResolvedValue({ message: 'ok' });

    const { result } = renderHook(() => useUpdateExternalMusician(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ id: 'm-1', data: { phone: '0612345678' } });
    });

    expect(updateExternalMusician).toHaveBeenCalledWith('m-1', { phone: '0612345678' });
    expect(isOngeldigGemaakt(externalMusicianKeys.all)).toBe(true);
    expect(isOngeldigGemaakt(externalMusicianKeys.detail('m-1'))).toBe(true);
    expect(isOngeldigGemaakt(externalMusicianKeys.detail('m-2'))).toBe(false);
    expect(showSuccess).toHaveBeenCalledWith('Externe muzikant bijgewerkt');
  });
});

describe('useDeleteExternalMusician', () => {
  it('deactiveert de muzikant en zegt dat ook zo', async () => {
    alsMock(deleteExternalMusician).mockResolvedValue({ message: 'ok' });

    const { result } = renderHook(() => useDeleteExternalMusician(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync('m-1');
    });

    expect(deleteExternalMusician).toHaveBeenCalledWith('m-1');
    expect(isOngeldigGemaakt(externalMusicianKeys.all)).toBe(true);
    // De gegevens blijven staan; alleen de vlag gaat om. De melding zegt
    // "gedeactiveerd" en niet "verwijderd", en dat verschil is voor wie de
    // knop indrukt niet gering.
    expect(showSuccess).toHaveBeenCalledWith('Externe muzikant gedeactiveerd');
  });

  it('meldt de fout als deactiveren niet mag', async () => {
    alsMock(deleteExternalMusician).mockRejectedValue(serverfout('Muzikant heeft open uitnodigingen'));

    const { result } = renderHook(() => useDeleteExternalMusician(), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync('m-1')).rejects.toBeDefined();
    });

    expect(showError).toHaveBeenCalledWith('Muzikant heeft open uitnodigingen');
    expect(ongeldigGemaakt).toEqual([]);
  });
});

describe('useAddMusicianInstrument', () => {
  const INSTRUMENT = { instrumentId: 'inst-1', skillLevel: 'professional' as const, isPrimary: true };

  it('vernieuwt het detail én de lijsten', async () => {
    alsMock(addInstrumentToMusician).mockResolvedValue({ message: 'ok' });

    const { result } = renderHook(() => useAddMusicianInstrument(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ musicianId: 'm-1', instrumentData: INSTRUMENT });
    });

    expect(addInstrumentToMusician).toHaveBeenCalledWith('m-1', INSTRUMENT);
    // De lijst hoort erbij: zoeken op instrument gaat langs dezelfde gegevens,
    // en een nieuw instrument verandert wie daar gevonden wordt.
    expect(isOngeldigGemaakt(externalMusicianKeys.detail('m-1'))).toBe(true);
    expect(isOngeldigGemaakt(externalMusicianKeys.lists())).toBe(true);
    expect(showSuccess).toHaveBeenCalledWith('Instrument toegevoegd');
  });

  it('meldt de fout van de server', async () => {
    alsMock(addInstrumentToMusician).mockRejectedValue(serverfout('Instrument staat er al bij'));

    const { result } = renderHook(() => useAddMusicianInstrument(), { wrapper });
    await act(async () => {
      await expect(
        result.current.mutateAsync({ musicianId: 'm-1', instrumentData: INSTRUMENT }),
      ).rejects.toBeDefined();
    });

    expect(showError).toHaveBeenCalledWith('Instrument staat er al bij');
  });
});

describe('useRemoveMusicianInstrument', () => {
  it('geeft muzikant en instrument in die volgorde door', async () => {
    alsMock(removeInstrumentFromMusician).mockResolvedValue({ message: 'ok' });

    const { result } = renderHook(() => useRemoveMusicianInstrument(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ musicianId: 'm-1', instrumentId: 'inst-1' });
    });

    // Twee ids achter elkaar: verwisseld gaat het verzoek naar een bestaand
    // pad, maar over de verkeerde muzikant.
    expect(removeInstrumentFromMusician).toHaveBeenCalledWith('m-1', 'inst-1');
    expect(isOngeldigGemaakt(externalMusicianKeys.detail('m-1'))).toBe(true);
    expect(isOngeldigGemaakt(externalMusicianKeys.lists())).toBe(true);
    expect(showSuccess).toHaveBeenCalledWith('Instrument verwijderd');
  });

  it('meldt de fout en vernieuwt niets', async () => {
    alsMock(removeInstrumentFromMusician).mockRejectedValue(serverfout('Laatste instrument kan niet weg'));

    const { result } = renderHook(() => useRemoveMusicianInstrument(), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync({ musicianId: 'm-1', instrumentId: 'inst-1' })).rejects.toBeDefined();
    });

    expect(showError).toHaveBeenCalledWith('Laatste instrument kan niet weg');
    expect(ongeldigGemaakt).toEqual([]);
  });
});
