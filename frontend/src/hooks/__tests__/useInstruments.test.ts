import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';

// Alleen de api-functies die useInstruments importeert hoeven te bestaan.
vi.mock('../../api', () => ({
  getInstruments: vi.fn(),
  createInstrument: vi.fn(),
  updateInstrument: vi.fn(),
  deleteInstrument: vi.fn(),
  addInstrumentAlias: vi.fn(),
  deleteInstrumentAlias: vi.fn(),
}));

vi.mock('../../utils/toast', () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}));

import {
  useInstruments,
  useCreateInstrument,
  useUpdateInstrument,
  useDeleteInstrument,
  useAddInstrumentAlias,
  useDeleteInstrumentAlias,
} from '../useInstruments';
import {
  getInstruments,
  createInstrument,
  updateInstrument,
  deleteInstrument,
  addInstrumentAlias,
  deleteInstrumentAlias,
} from '../../api';
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

describe('useInstruments - ophalen', () => {
  it('haalt de instrumentenlijst op', async () => {
    alsMock(getInstruments).mockResolvedValue([{ id: 'i1', name: 'Trompet' }]);

    const { result } = renderHook(() => useInstruments(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getInstruments).toHaveBeenCalledTimes(1);
    expect(result.current.data).toEqual([{ id: 'i1', name: 'Trompet' }]);
  });

  it('deelt de lijst tussen schermen in plaats van hem twee keer te halen', async () => {
    // De instrumentenlijst zit in vrijwel elk formulier als keuzelijst; twee
    // gelijktijdige gebruikers van dezelfde sleutel horen samen één verzoek
    // te doen.
    alsMock(getInstruments).mockResolvedValue([]);

    const { result } = renderHook(() => ({ een: useInstruments(), twee: useInstruments() }), { wrapper });

    await waitFor(() => expect(result.current.een.isSuccess).toBe(true));
    expect(getInstruments).toHaveBeenCalledTimes(1);
  });

  it('meldt een fout als de instrumentenlijst niet opgehaald kan worden', async () => {
    alsMock(getInstruments).mockRejectedValue(serverfout('Database niet bereikbaar'));

    const { result } = renderHook(() => useInstruments(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });
});

// ==================== BEHEREN ====================

describe('useInstruments - beheren', () => {
  it('maakt een instrument aan met naam, stemming, sleutel en aliassen als losse argumenten', async () => {
    // De api verwacht vier losse argumenten, geen object; de hook pakt het
    // formulierobject uit elkaar.
    alsMock(createInstrument).mockResolvedValue({ id: 'i9' });

    const { result } = renderHook(() => useCreateInstrument(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ name: 'Bugel', tuning: 'Bb', clef: 'G', aliases: ['flugelhorn'] });
    });

    expect(createInstrument).toHaveBeenCalledWith('Bugel', 'Bb', 'G', ['flugelhorn']);
    expect(isOngeldigGemaakt(['instruments'])).toBe(true);
    expect(showSuccess).toHaveBeenCalledWith('Instrument aangemaakt');
  });

  it('laat stemming, sleutel en aliassen weg als de gebruiker ze niet invult', async () => {
    alsMock(createInstrument).mockResolvedValue({ id: 'i9' });

    const { result } = renderHook(() => useCreateInstrument(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ name: 'Bugel' });
    });

    expect(createInstrument).toHaveBeenCalledWith('Bugel', undefined, undefined, undefined);
  });

  it('toont de foutmelding van de server als aanmaken mislukt', async () => {
    alsMock(createInstrument).mockRejectedValue(serverfout('Instrument bestaat al'));

    const { result } = renderHook(() => useCreateInstrument(), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync({ name: 'Bugel' })).rejects.toBeDefined();
    });

    expect(showError).toHaveBeenCalledWith('Instrument bestaat al');
    expect(showSuccess).not.toHaveBeenCalled();
    expect(ongeldigGemaakt).toHaveLength(0);
  });

  it('wijzigt een instrument met id en de drie velden als losse argumenten', async () => {
    alsMock(updateInstrument).mockResolvedValue(undefined);

    const { result } = renderHook(() => useUpdateInstrument(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ id: 'i1', data: { name: 'Flugelhorn', tuning: 'Bb', clef: 'G' } });
    });

    expect(updateInstrument).toHaveBeenCalledWith('i1', 'Flugelhorn', 'Bb', 'G');
    expect(isOngeldigGemaakt(['instruments'])).toBe(true);
    expect(showSuccess).toHaveBeenCalledWith('Instrument bijgewerkt');
  });

  it('vernieuwt na het hernoemen van een instrument ook de muziekstukken', async () => {
    // De stukkenlijst joint op instruments en toont de instrumentnaam per
    // partij (routes/music-pieces.ts: LEFT JOIN instruments i ON
    // mp.instrument_id = i.id). Zonder deze invalidatie blijft daar de oude
    // naam staan zolang de cache vers heet - vijf minuten volgens
    // lib/queryClient.ts.
    alsMock(updateInstrument).mockResolvedValue(undefined);

    const { result } = renderHook(() => useUpdateInstrument(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ id: 'i1', data: { name: 'Flugelhorn' } });
    });

    expect(isOngeldigGemaakt(['musicPieces'])).toBe(true);
  });

  it('verwijdert een instrument en vernieuwt de instrumentenlijst', async () => {
    alsMock(deleteInstrument).mockResolvedValue(undefined);

    const { result } = renderHook(() => useDeleteInstrument(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync('i1');
    });

    expect(deleteInstrument).toHaveBeenCalledWith('i1');
    expect(isOngeldigGemaakt(['instruments'])).toBe(true);
    expect(showSuccess).toHaveBeenCalledWith('Instrument verwijderd');
  });

  it('vernieuwt na het verwijderen van een instrument ook de muziekstukken', async () => {
    // music_pieces.instrument_id verwijst naar instruments met ON DELETE SET
    // NULL (database/schema.ts). Elke partij die aan dit instrument hing
    // raakt dus zijn koppeling kwijt. Zonder invalidatie blijft de
    // stukkenlijst ze als gekoppeld tonen en denkt de beheerder dat er niets
    // is gebeurd.
    alsMock(deleteInstrument).mockResolvedValue(undefined);

    const { result } = renderHook(() => useDeleteInstrument(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync('i1');
    });

    expect(isOngeldigGemaakt(['musicPieces'])).toBe(true);
  });

  it('meldt geen succes als verwijderen mislukt', async () => {
    alsMock(deleteInstrument).mockRejectedValue(serverfout('Instrument niet gevonden.'));

    const { result } = renderHook(() => useDeleteInstrument(), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync('i1')).rejects.toBeDefined();
    });

    expect(showError).toHaveBeenCalledWith('Instrument niet gevonden.');
    expect(showSuccess).not.toHaveBeenCalled();
    expect(ongeldigGemaakt).toHaveLength(0);
  });

  it('haalt de openstaande instrumentenlijst daadwerkelijk opnieuw op na een wijziging', async () => {
    alsMock(getInstruments).mockResolvedValue([{ id: 'i1', name: 'Bugel' }]);
    alsMock(updateInstrument).mockResolvedValue(undefined);

    const { result } = renderHook(() => ({ lijst: useInstruments(), wijzig: useUpdateInstrument() }), { wrapper });

    await waitFor(() => expect(result.current.lijst.isSuccess).toBe(true));

    alsMock(getInstruments).mockResolvedValue([{ id: 'i1', name: 'Flugelhorn' }]);
    await act(async () => {
      await result.current.wijzig.mutateAsync({ id: 'i1', data: { name: 'Flugelhorn' } });
    });

    await waitFor(() => expect(result.current.lijst.data).toEqual([{ id: 'i1', name: 'Flugelhorn' }]));
  });
});

// ==================== ALIASSEN ====================

describe('useInstruments - aliassen', () => {
  it('voegt een alias toe met instrument-id en alias gescheiden', async () => {
    alsMock(addInstrumentAlias).mockResolvedValue({ id: 'a1' });

    const { result } = renderHook(() => useAddInstrumentAlias(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ instrumentId: 'i1', alias: 'flugelhorn' });
    });

    expect(addInstrumentAlias).toHaveBeenCalledWith('i1', 'flugelhorn');
    // De aliassen komen mee in de instrumentenlijst zelf; een eigen sleutel
    // is er niet.
    expect(isOngeldigGemaakt(['instruments'])).toBe(true);
    expect(showSuccess).toHaveBeenCalledWith('Alias toegevoegd');
  });

  it('verwijdert een alias met instrument- en alias-id', async () => {
    alsMock(deleteInstrumentAlias).mockResolvedValue(undefined);

    const { result } = renderHook(() => useDeleteInstrumentAlias(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ instrumentId: 'i1', aliasId: 'a1' });
    });

    expect(deleteInstrumentAlias).toHaveBeenCalledWith('i1', 'a1');
    expect(isOngeldigGemaakt(['instruments'])).toBe(true);
    expect(showSuccess).toHaveBeenCalledWith('Alias verwijderd');
  });

  it('toont een foutmelding als een alias al bestaat', async () => {
    alsMock(addInstrumentAlias).mockRejectedValue(serverfout('Deze alias bestaat al'));

    const { result } = renderHook(() => useAddInstrumentAlias(), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync({ instrumentId: 'i1', alias: 'flugelhorn' })).rejects.toBeDefined();
    });

    expect(showError).toHaveBeenCalledWith('Deze alias bestaat al');
    expect(ongeldigGemaakt).toHaveLength(0);
  });
});
