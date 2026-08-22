import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';

// Deze hooks praten rechtstreeks via de axios-client, dus we vervangen de
// client zelf. Zo kunnen we url én queryparameters controleren.
vi.mock('../../api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

import {
  useInstrumentSearch,
  useInstruments,
  useInstrumentTree,
  useGenreSearch,
  useGenres,
  useGenreTree,
  useTitleMetadata,
  useUpdateTitleMetadata,
  useUploadMusicXML,
  useDeleteMusicXML,
  useLookupConcepts,
} from '../useVocabulary';
import api from '../../api';

/** De client is gemockt; TypeScript kent alleen nog de echte signatuur. */
const alsMock = (fn: unknown) => fn as Mock;

const get = () => alsMock(api.get);
const post = () => alsMock(api.post);
const patch = () => alsMock(api.patch);
const del = () => alsMock(api.delete);

let queryClient: QueryClient;
/** Alle queryKeys die de hooks ongeldig hebben gemaakt, in volgorde. */
let ongeldigGemaakt: unknown[];

beforeEach(() => {
  vi.clearAllMocks();
  get().mockResolvedValue({ data: {} });
  post().mockResolvedValue({ data: {} });
  patch().mockResolvedValue({ data: {} });
  del().mockResolvedValue({ data: {} });

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

// ==================== ZOEKEN ====================

describe('useVocabulary - zoeken', () => {
  it('zoekt nog niet bij één letter', () => {
    // Zonder deze drempel gaat er bij elke toetsaanslag in het zoekveld een
    // verzoek naar de server, met een antwoord van duizenden begrippen.
    const { result } = renderHook(() => useInstrumentSearch('t'), { wrapper });

    expect(get()).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('zoekt zodra er twee letters staan, met een limiet van twintig', async () => {
    get().mockResolvedValue({ data: { instruments: [{ uri: 'x:1', label: 'Trompet' }], total: 1 } });

    const { result } = renderHook(() => useInstrumentSearch('tr'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(get()).toHaveBeenCalledWith('/vocabularies/instruments', { params: { q: 'tr', limit: 20 } });
    expect(result.current.data).toEqual({ instruments: [{ uri: 'x:1', label: 'Trompet' }], total: 1 });
  });

  it('zoekt niet als de aanroeper het zoeken heeft uitgezet', () => {
    // Het scherm zet dit uit zolang het invoerveld geen focus heeft.
    const { result } = renderHook(() => useInstrumentSearch('trompet', false), { wrapper });

    expect(get()).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('zoekt opnieuw bij een aangevulde zoekterm', async () => {
    // De zoekterm zit in de queryKey; anders blijft het resultaat van de
    // vorige term staan terwijl de gebruiker doortypt.
    const { result, rerender } = renderHook(({ term }: { term: string }) => useInstrumentSearch(term), {
      wrapper,
      initialProps: { term: 'tr' },
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    rerender({ term: 'tro' });

    await waitFor(() => expect(get()).toHaveBeenCalledTimes(2));
    expect(get()).toHaveBeenLastCalledWith('/vocabularies/instruments', { params: { q: 'tro', limit: 20 } });
  });

  it('zoekt genres langs hetzelfde stramien', async () => {
    get().mockResolvedValue({ data: { genres: [], total: 0 } });

    const { result, rerender } = renderHook(({ term }: { term: string }) => useGenreSearch(term), {
      wrapper,
      initialProps: { term: 'm' },
    });

    expect(get()).not.toHaveBeenCalled();

    rerender({ term: 'mars' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(get()).toHaveBeenCalledWith('/vocabularies/genres', { params: { q: 'mars', limit: 20 } });
  });

  it('houdt de zoekresultaten van instrumenten en genres uit elkaar', async () => {
    // Beide sleutels beginnen met 'vocabularies'. Zouden ze verder gelijk
    // zijn, dan verscheen een genre in de instrumentenkiezer.
    get().mockImplementation((url: string) =>
      url === '/vocabularies/instruments'
        ? Promise.resolve({ data: { instruments: [{ uri: 'i:1' }], total: 1 } })
        : Promise.resolve({ data: { genres: [{ uri: 'g:1' }], total: 1 } }),
    );

    const { result } = renderHook(
      () => ({ instrumenten: useInstrumentSearch('mars'), genres: useGenreSearch('mars') }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.instrumenten.isSuccess).toBe(true));
    await waitFor(() => expect(result.current.genres.isSuccess).toBe(true));
    expect(result.current.instrumenten.data).toEqual({ instruments: [{ uri: 'i:1' }], total: 1 });
    expect(result.current.genres.data).toEqual({ genres: [{ uri: 'g:1' }], total: 1 });
  });

  it('meldt een fout als het zoeken mislukt', async () => {
    get().mockRejectedValue(new Error('Vocabulaire niet bereikbaar'));

    const { result } = renderHook(() => useInstrumentSearch('trompet'), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });
});

// ==================== VOLLEDIGE LIJSTEN EN BOMEN ====================

describe('useVocabulary - volledige lijsten en bomen', () => {
  it('haalt alle instrumenten op zonder zoekparameters', async () => {
    get().mockResolvedValue({ data: { instruments: [], total: 0 } });

    const { result } = renderHook(() => useInstruments(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(get()).toHaveBeenCalledWith('/vocabularies/instruments');
  });

  it('haalt de instrumentenboom van een eigen endpoint', async () => {
    get().mockResolvedValue({ data: { tree: [] } });

    const { result } = renderHook(() => useInstrumentTree(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(get()).toHaveBeenCalledWith('/vocabularies/instruments/tree');
  });

  it('haalt alle genres op', async () => {
    get().mockResolvedValue({ data: { genres: [], total: 0 } });

    const { result } = renderHook(() => useGenres(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(get()).toHaveBeenCalledWith('/vocabularies/genres');
  });

  it('haalt de genreboom van een eigen endpoint', async () => {
    get().mockResolvedValue({ data: { tree: [] } });

    const { result } = renderHook(() => useGenreTree(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(get()).toHaveBeenCalledWith('/vocabularies/genres/tree');
  });

  it('deelt de volledige lijst tussen schermen in plaats van hem twee keer te halen', async () => {
    // Het vocabulaire verandert vrijwel nooit; de lange staleTime hoort te
    // voorkomen dat elk scherm zijn eigen kopie ophaalt.
    get().mockResolvedValue({ data: { instruments: [], total: 0 } });

    const { result } = renderHook(() => ({ een: useInstruments(), twee: useInstruments() }), { wrapper });

    await waitFor(() => expect(result.current.een.isSuccess).toBe(true));
    expect(get()).toHaveBeenCalledTimes(1);
  });
});

// ==================== BEGRIPPEN OPZOEKEN ====================

describe('useVocabulary - begrippen opzoeken', () => {
  it('zoekt niets op bij een lege lijst uri’s', () => {
    const { result } = renderHook(() => useLookupConcepts([]), { wrapper });

    expect(get()).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('stuurt de uri’s als komma-gescheiden lijst mee', async () => {
    get().mockResolvedValue({ data: { concepts: [] } });

    const { result } = renderHook(() => useLookupConcepts(['mimo:1', 'mimo:2']), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(get()).toHaveBeenCalledWith('/vocabularies/lookup', { params: { uris: 'mimo:1,mimo:2' } });
  });

  it('haalt niet opnieuw op als dezelfde uri’s in een nieuwe array binnenkomen', async () => {
    // Een scherm dat bij elke render `uris.map(...)` doorgeeft, levert telkens
    // een nieuwe array met dezelfde inhoud. De sleutel wordt op inhoud
    // vergeleken, dus dat mag geen extra verzoek opleveren.
    get().mockResolvedValue({ data: { concepts: [] } });

    const { result, rerender } = renderHook(() => useLookupConcepts(['mimo:1', 'mimo:2']), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    rerender();
    rerender();

    expect(get()).toHaveBeenCalledTimes(1);
  });

  it('haalt wel opnieuw op bij een andere set uri’s', async () => {
    get().mockResolvedValue({ data: { concepts: [] } });

    const { result, rerender } = renderHook(({ uris }: { uris: string[] }) => useLookupConcepts(uris), {
      wrapper,
      initialProps: { uris: ['mimo:1'] },
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    rerender({ uris: ['mimo:1', 'mimo:2'] });

    await waitFor(() => expect(get()).toHaveBeenCalledTimes(2));
    expect(get()).toHaveBeenLastCalledWith('/vocabularies/lookup', { params: { uris: 'mimo:1,mimo:2' } });
  });
});

// ==================== UITGEBREIDE TITELGEGEVENS ====================

describe('useVocabulary - uitgebreide titelgegevens', () => {
  it('vraagt de titelgegevens pas op als er een titel is', () => {
    const { result } = renderHook(() => useTitleMetadata(''), { wrapper });

    expect(get()).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('haalt de titelgegevens op zodra de titel bekend is', async () => {
    get().mockResolvedValue({ data: { workNumber: 'op. 27', instruments: [] } });

    const { result } = renderHook(() => useTitleMetadata('t1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(get()).toHaveBeenCalledWith('/music-pieces/title-metadata/t1');
  });

  it('stuurt de gewijzigde gegevens naar de titel-endpoint', async () => {
    const gegevens = {
      workNumber: 'op. 27',
      movementNumber: 2,
      lyricist: 'Anoniem',
      instruments: [{ uri: 'mimo:1', label: 'Trompet', count: 3, isOptional: false }],
      genres: ['jskos:mars'],
    };

    const { result } = renderHook(() => useUpdateTitleMetadata(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ titleId: 't1', metadata: gegevens });
    });

    // De titel hoort in de url, de gegevens in de body.
    expect(patch()).toHaveBeenCalledWith('/music-pieces/title-metadata/t1', gegevens);
  });

  it('vernieuwt na een wijziging de titelgegevens van precies die titel', async () => {
    const { result } = renderHook(() => useUpdateTitleMetadata(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ titleId: 't1', metadata: { workNumber: 'op. 27' } });
    });

    expect(isOngeldigGemaakt(['music-pieces', 'metadata', 't1'])).toBe(true);
    // En de muziekstukkencache onder de sleutel die de rest van de app
    // gebruikt: 'musicPieces', niet 'music-pieces'.
    expect(isOngeldigGemaakt(['musicPieces'])).toBe(true);
  });

  it('haalt de openstaande titelgegevens daadwerkelijk opnieuw op na een wijziging', async () => {
    get().mockResolvedValue({ data: { workNumber: 'oud' } });

    const { result } = renderHook(() => ({ gegevens: useTitleMetadata('t1'), wijzig: useUpdateTitleMetadata() }), {
      wrapper,
    });

    await waitFor(() => expect(result.current.gegevens.isSuccess).toBe(true));

    get().mockResolvedValue({ data: { workNumber: 'op. 27' } });
    await act(async () => {
      await result.current.wijzig.mutateAsync({ titleId: 't1', metadata: { workNumber: 'op. 27' } });
    });

    await waitFor(() => expect(result.current.gegevens.data).toEqual({ workNumber: 'op. 27' }));
  });

  it('laat de titelgegevens van een andere titel met rust', async () => {
    // De sleutel bevat de titel-id, dus een wijziging aan de ene titel mag
    // niet de gegevens van een andere titel opnieuw laten ophalen.
    get().mockResolvedValue({ data: { workNumber: 'anders' } });

    const { result } = renderHook(() => ({ andere: useTitleMetadata('t2'), wijzig: useUpdateTitleMetadata() }), {
      wrapper,
    });

    await waitFor(() => expect(result.current.andere.isSuccess).toBe(true));
    const aantalVoor = get().mock.calls.length;

    await act(async () => {
      await result.current.wijzig.mutateAsync({ titleId: 't1', metadata: { workNumber: 'op. 27' } });
    });

    expect(get().mock.calls.length).toBe(aantalVoor);
  });

  it('raakt de cache niet aan als het opslaan mislukt', async () => {
    patch().mockRejectedValue(new Error('Titel niet gevonden'));

    const { result } = renderHook(() => useUpdateTitleMetadata(), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync({ titleId: 't1', metadata: {} })).rejects.toThrow('Titel niet gevonden');
    });

    expect(ongeldigGemaakt).toHaveLength(0);
  });
});

// ==================== MUSICXML ====================

describe('useVocabulary - MusicXML', () => {
  it('verstuurt het bestand als formulierveld musicxml, met de juiste inhoudssoort', async () => {
    const bestand = new File(['<score/>'], 'ammerland.musicxml', { type: 'application/xml' });

    const { result } = renderHook(() => useUploadMusicXML(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ titleId: 't1', file: bestand });
    });

    const [url, body, opties] = post().mock.calls[0];
    expect(url).toBe('/music-pieces/title-musicxml/t1');
    expect(body).toBeInstanceOf(FormData);
    // De backend leest het veld 'musicxml'; een andere veldnaam levert een
    // 400 op zonder dat het formulier iets anders laat zien.
    expect((body as FormData).get('musicxml')).toBe(bestand);
    expect(opties).toEqual({ headers: { 'Content-Type': 'multipart/form-data' } });
  });

  it('vernieuwt na een upload de titelgegevens van die titel', async () => {
    const bestand = new File(['<score/>'], 'ammerland.musicxml', { type: 'application/xml' });

    const { result } = renderHook(() => useUploadMusicXML(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ titleId: 't1', file: bestand });
    });

    expect(isOngeldigGemaakt(['music-pieces', 'metadata', 't1'])).toBe(true);
  });

  it('vernieuwt na een mislukte upload niets', async () => {
    post().mockRejectedValue(new Error('Bestand is geen geldige MusicXML'));
    const bestand = new File(['rommel'], 'kapot.musicxml', { type: 'application/xml' });

    const { result } = renderHook(() => useUploadMusicXML(), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync({ titleId: 't1', file: bestand })).rejects.toThrow(
        'Bestand is geen geldige MusicXML',
      );
    });

    expect(ongeldigGemaakt).toHaveLength(0);
  });

  it('verwijdert de MusicXML van een titel en vernieuwt alleen die titelgegevens', async () => {
    const { result } = renderHook(() => useDeleteMusicXML(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync('t1');
    });

    expect(del()).toHaveBeenCalledWith('/music-pieces/title-musicxml/t1');
    expect(ongeldigGemaakt).toEqual([['music-pieces', 'metadata', 't1']]);
  });
});
