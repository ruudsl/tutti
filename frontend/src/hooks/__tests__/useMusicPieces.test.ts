import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';

// Alleen de api-functies die useMusicPieces importeert hoeven te bestaan.
vi.mock('../../api', () => ({
  getMusicPieces: vi.fn(),
  getMusicPiecesPaginated: vi.fn(),
  updateMusicPiece: vi.fn(),
  deleteMusicPiece: vi.fn(),
  deleteMusicPiecesBulk: vi.fn(),
  restoreMusicPiece: vi.fn(),
  bulkUpdatePieces: vi.fn(),
  refreshInstrumentLinks: vi.fn(),
}));

vi.mock('../../utils/toast', () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
  showUndoToast: vi.fn(),
}));

// De vertaalsleutel zelf teruggeven maakt de meldingen in de test leesbaar
// zonder dat we de hele i18n-configuratie hoeven op te tuigen.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (sleutel: string, opties?: Record<string, unknown>) =>
      opties && 'count' in opties ? `${sleutel}:${opties.count}` : sleutel,
  }),
}));

import {
  useMusicPieces,
  useMusicPiecesPaginated,
  useUpdateMusicPiece,
  useDeleteMusicPiece,
  useDeleteMusicPiecesBulk,
  useBulkUpdatePieces,
  useRefreshInstrumentLinks,
} from '../useMusicPieces';
import {
  getMusicPieces,
  getMusicPiecesPaginated,
  updateMusicPiece,
  deleteMusicPiece,
  deleteMusicPiecesBulk,
  restoreMusicPiece,
  bulkUpdatePieces,
  refreshInstrumentLinks,
} from '../../api';
import { showSuccess, showError, showUndoToast } from '../../utils/toast';

/** De api is gemockt; TypeScript kent alleen nog de echte signatuur. */
const alsMock = (fn: unknown) => fn as Mock;

/** Een axios-achtige fout zoals de backend hem teruggeeft. */
const serverfout = (melding: string) => ({
  isAxiosError: true,
  response: { data: { error: melding } },
});

/**
 * Drukt op de "ongedaan maken"-knop van de laatste meldingsbalk. De hook geeft
 * die knop mee als losse callback aan showUndoToast; hier roepen we hem aan
 * zoals de gebruiker dat met een klik zou doen.
 */
async function drukOpOngedaanMaken() {
  const aanroepen = alsMock(showUndoToast).mock.calls;
  const [, , terugdraaien] = aanroepen[aanroepen.length - 1] as [string, string, () => Promise<void>];
  await act(async () => {
    await terugdraaien();
  });
}

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

describe('useMusicPieces - ophalen', () => {
  it('geeft de filters ongewijzigd door aan de api', async () => {
    alsMock(getMusicPieces).mockResolvedValue([]);
    const filters = { search: 'ammerland', instrumentId: 'i1', listId: 'l1' };

    const { result } = renderHook(() => useMusicPieces(filters), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getMusicPieces).toHaveBeenCalledWith(filters);
  });

  it('haalt opnieuw op als er op een ander instrument gefilterd wordt', async () => {
    alsMock(getMusicPieces).mockResolvedValue([]);

    const { result, rerender } = renderHook(
      ({ instrument }: { instrument: string }) => useMusicPieces({ instrumentId: instrument }),
      { wrapper, initialProps: { instrument: 'i1' } },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    rerender({ instrument: 'i2' });

    await waitFor(() => expect(getMusicPieces).toHaveBeenCalledTimes(2));
    expect(getMusicPieces).toHaveBeenLastCalledWith({ instrumentId: 'i2' });
  });

  it('meldt een fout als de stukkenlijst niet opgehaald kan worden', async () => {
    alsMock(getMusicPieces).mockRejectedValue(serverfout('Database niet bereikbaar'));

    const { result } = renderHook(() => useMusicPieces(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });
});

// ==================== PAGINERING ====================

describe('useMusicPieces - paginering', () => {
  it('geeft filters én paginering door aan de api', async () => {
    alsMock(getMusicPiecesPaginated).mockResolvedValue({ data: [], total: 0, page: 1, pageSize: 25 });
    const filters = { search: 'mars', page: 1, pageSize: 25 };

    const { result } = renderHook(() => useMusicPiecesPaginated(filters), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getMusicPiecesPaginated).toHaveBeenCalledWith(filters);
  });

  it('haalt bij het doorbladeren de volgende pagina daadwerkelijk op', async () => {
    // Pagina en paginagrootte zitten in de queryKey. Zonder dat zou "volgende"
    // dezelfde regels uit de cache opdienen.
    alsMock(getMusicPiecesPaginated).mockResolvedValue({ data: [{ id: 'p1' }], total: 50, page: 1, pageSize: 25 });

    const { result, rerender } = renderHook(
      ({ page }: { page: number }) => useMusicPiecesPaginated({ page, pageSize: 25 }),
      { wrapper, initialProps: { page: 1 } },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    rerender({ page: 2 });

    await waitFor(() => expect(getMusicPiecesPaginated).toHaveBeenCalledTimes(2));
    expect(getMusicPiecesPaginated).toHaveBeenLastCalledWith({ page: 2, pageSize: 25 });
  });

  it('houdt de vorige pagina in beeld terwijl de volgende laadt', async () => {
    // placeholderData: previousData. Zonder dat knippert de tabel bij elke
    // paginawissel leeg, en springt de pagina omhoog.
    alsMock(getMusicPiecesPaginated).mockResolvedValue({ data: [{ id: 'p1' }], total: 50, page: 1, pageSize: 25 });

    const { result, rerender } = renderHook(
      ({ page }: { page: number }) => useMusicPiecesPaginated({ page, pageSize: 25 }),
      { wrapper, initialProps: { page: 1 } },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    let losmaken: (waarde: unknown) => void = () => {};
    alsMock(getMusicPiecesPaginated).mockImplementation(() => new Promise((r) => (losmaken = r)));
    rerender({ page: 2 });

    // Pagina 2 is nog onderweg, maar de gebruiker ziet nog steeds pagina 1.
    expect(result.current.data?.data).toEqual([{ id: 'p1' }]);

    await act(async () => {
      losmaken({ data: [{ id: 'p26' }], total: 50, page: 2, pageSize: 25 });
    });
    await waitFor(() => expect(result.current.data?.data).toEqual([{ id: 'p26' }]));
  });

  it('gebruikt voor gepagineerd en ongepagineerd ophalen verschillende sleutels', async () => {
    // Beide sleutels beginnen met musicPieces plus dezelfde filters; alleen
    // het achtervoegsel 'paginated' scheidt ze. Zouden ze gelijk zijn, dan
    // kreeg de ene hook het antwoordformaat van de andere binnen.
    alsMock(getMusicPieces).mockResolvedValue([{ id: 'p1' }]);
    alsMock(getMusicPiecesPaginated).mockResolvedValue({ data: [{ id: 'p1' }], total: 1, page: 1, pageSize: 25 });

    const { result } = renderHook(
      () => ({ plat: useMusicPieces({ search: 'mars' }), gepagineerd: useMusicPiecesPaginated({ search: 'mars' }) }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.plat.isSuccess).toBe(true));
    await waitFor(() => expect(result.current.gepagineerd.isSuccess).toBe(true));
    expect(result.current.plat.data).toEqual([{ id: 'p1' }]);
    expect(result.current.gepagineerd.data?.total).toBe(1);
  });
});

// ==================== WIJZIGEN ====================

describe('useMusicPieces - wijzigen', () => {
  it('stuurt id en velden gescheiden door en vernieuwt de stukken', async () => {
    alsMock(updateMusicPiece).mockResolvedValue(undefined);

    const { result } = renderHook(() => useUpdateMusicPiece(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ id: 'p1', data: { title: 'Ammerland', instrumentId: 'i2' } });
    });

    expect(updateMusicPiece).toHaveBeenCalledWith('p1', { title: 'Ammerland', instrumentId: 'i2' });
    expect(isOngeldigGemaakt(['musicPieces'])).toBe(true);
    expect(showSuccess).toHaveBeenCalledWith('Muziekstuk bijgewerkt');
  });

  it('vernieuwt ook de gepagineerde weergave, die onder hetzelfde voorvoegsel hangt', async () => {
    alsMock(getMusicPiecesPaginated).mockResolvedValue({ data: [{ id: 'p1', title: 'Oud' }], total: 1 });
    alsMock(updateMusicPiece).mockResolvedValue(undefined);

    const { result } = renderHook(
      () => ({ tabel: useMusicPiecesPaginated({ page: 1 }), wijzig: useUpdateMusicPiece() }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.tabel.isSuccess).toBe(true));

    alsMock(getMusicPiecesPaginated).mockResolvedValue({ data: [{ id: 'p1', title: 'Nieuw' }], total: 1 });
    await act(async () => {
      await result.current.wijzig.mutateAsync({ id: 'p1', data: { title: 'Nieuw' } });
    });

    await waitFor(() => expect(result.current.tabel.data?.data).toEqual([{ id: 'p1', title: 'Nieuw' }]));
  });

  it('toont de foutmelding van de server als wijzigen mislukt', async () => {
    alsMock(updateMusicPiece).mockRejectedValue(serverfout('Titel is verplicht'));

    const { result } = renderHook(() => useUpdateMusicPiece(), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync({ id: 'p1', data: { title: '' } })).rejects.toBeDefined();
    });

    expect(showError).toHaveBeenCalledWith('Titel is verplicht');
    expect(showSuccess).not.toHaveBeenCalled();
    expect(ongeldigGemaakt).toHaveLength(0);
  });
});

// ==================== VERWIJDEREN MET ONGEDAAN MAKEN ====================

describe('useMusicPieces - verwijderen met ongedaan maken', () => {
  it('verwijdert een stuk en biedt het terugdraaien aan', async () => {
    alsMock(deleteMusicPiece).mockResolvedValue(undefined);

    const { result } = renderHook(() => useDeleteMusicPiece(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync('p1');
    });

    expect(deleteMusicPiece).toHaveBeenCalledWith('p1');
    expect(isOngeldigGemaakt(['musicPieces'])).toBe(true);
    expect(showUndoToast).toHaveBeenCalledWith('musicPieces.deleted', 'common.undo', expect.any(Function));
  });

  it('vernieuwt na het verwijderen ook de muzieklijsten met hun aantallen', async () => {
    // De lijstoverzichten tellen alleen stukken zonder deleted_at
    // (routes/music-lists.ts: WHERE ... mp.deleted_at IS NULL). Een verwijderd
    // stuk verlaagt dus pieceCount en titleCount. Op MusicPieces.tsx staat
    // useMyMusicLists naast deze verwijderknop; zonder invalidatie blijft daar
    // het oude aantal staan. Vergelijk useBulkUpdatePieces, die het wel doet.
    alsMock(deleteMusicPiece).mockResolvedValue(undefined);

    const { result } = renderHook(() => useDeleteMusicPiece(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync('p1');
    });

    expect(isOngeldigGemaakt(['musicLists'])).toBe(true);
  });

  it('zet het stuk terug als de gebruiker op ongedaan maken drukt', async () => {
    alsMock(deleteMusicPiece).mockResolvedValue(undefined);
    alsMock(restoreMusicPiece).mockResolvedValue(undefined);

    const { result } = renderHook(() => useDeleteMusicPiece(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync('p1');
    });

    await drukOpOngedaanMaken();

    expect(restoreMusicPiece).toHaveBeenCalledWith('p1');
    expect(showSuccess).toHaveBeenCalledWith('musicPieces.restored');
  });

  it('vernieuwt na het terugzetten opnieuw de stukken en de muzieklijsten', async () => {
    // Anders klopt het aantal na het terugdraaien nog steeds niet, nu de
    // andere kant op.
    alsMock(deleteMusicPiece).mockResolvedValue(undefined);
    alsMock(restoreMusicPiece).mockResolvedValue(undefined);

    const { result } = renderHook(() => useDeleteMusicPiece(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync('p1');
    });
    ongeldigGemaakt = [];

    await drukOpOngedaanMaken();

    expect(isOngeldigGemaakt(['musicPieces'])).toBe(true);
    expect(isOngeldigGemaakt(['musicLists'])).toBe(true);
  });

  it('meldt een fout als het terugzetten zelf mislukt', async () => {
    alsMock(deleteMusicPiece).mockResolvedValue(undefined);
    alsMock(restoreMusicPiece).mockRejectedValue(serverfout('Stuk is definitief opgeruimd'));

    const { result } = renderHook(() => useDeleteMusicPiece(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync('p1');
    });

    await drukOpOngedaanMaken();

    expect(showError).toHaveBeenCalledWith('Stuk is definitief opgeruimd');
    expect(showSuccess).not.toHaveBeenCalledWith('musicPieces.restored');
  });

  it('biedt geen terugdraaiknop aan als het verwijderen mislukt', async () => {
    alsMock(deleteMusicPiece).mockRejectedValue(serverfout('Stuk zit nog in een concertprogramma'));

    const { result } = renderHook(() => useDeleteMusicPiece(), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync('p1')).rejects.toBeDefined();
    });

    expect(showUndoToast).not.toHaveBeenCalled();
    expect(showError).toHaveBeenCalledWith('Stuk zit nog in een concertprogramma');
    expect(ongeldigGemaakt).toHaveLength(0);
  });

  it('noemt bij bulkverwijderen het aantal uit het serverantwoord', async () => {
    // Het aantal komt van de server, niet uit de selectie: de server slaat
    // stukken over die al verwijderd waren.
    alsMock(deleteMusicPiecesBulk).mockResolvedValue({ count: 2 });

    const { result } = renderHook(() => useDeleteMusicPiecesBulk(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(['p1', 'p2', 'p3']);
    });

    expect(deleteMusicPiecesBulk).toHaveBeenCalledWith(['p1', 'p2', 'p3']);
    expect(showUndoToast).toHaveBeenCalledWith('musicPieces.deletedBulk:2', 'common.undo', expect.any(Function));
  });

  it('vernieuwt na bulkverwijderen ook de muzieklijsten', async () => {
    alsMock(deleteMusicPiecesBulk).mockResolvedValue({ count: 2 });

    const { result } = renderHook(() => useDeleteMusicPiecesBulk(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(['p1', 'p2']);
    });

    expect(isOngeldigGemaakt(['musicPieces'])).toBe(true);
    expect(isOngeldigGemaakt(['musicLists'])).toBe(true);
  });

  it('zet bij het terugdraaien van een bulkverwijdering elk stuk afzonderlijk terug', async () => {
    alsMock(deleteMusicPiecesBulk).mockResolvedValue({ count: 3 });
    alsMock(restoreMusicPiece).mockResolvedValue(undefined);

    const { result } = renderHook(() => useDeleteMusicPiecesBulk(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(['p1', 'p2', 'p3']);
    });

    await drukOpOngedaanMaken();

    expect(alsMock(restoreMusicPiece).mock.calls.map((c) => c[0])).toEqual(['p1', 'p2', 'p3']);
    // De melding telt de teruggezette stukken, dus de verstuurde selectie.
    expect(showSuccess).toHaveBeenCalledWith('musicPieces.restoredBulk:3');
  });

  it('vernieuwt de stukken ook als het terugdraaien van een bulkverwijdering halverwege strandt', async () => {
    // Een deel kan al teruggezet zijn; het scherm moet dan alsnog de echte
    // stand ophalen in plaats van op de oude lijst te blijven staan.
    alsMock(deleteMusicPiecesBulk).mockResolvedValue({ count: 2 });
    alsMock(restoreMusicPiece).mockRejectedValue(serverfout('Stuk is definitief opgeruimd'));

    const { result } = renderHook(() => useDeleteMusicPiecesBulk(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(['p1', 'p2']);
    });
    ongeldigGemaakt = [];

    await drukOpOngedaanMaken();

    expect(showError).toHaveBeenCalledWith('Stuk is definitief opgeruimd');
    expect(isOngeldigGemaakt(['musicPieces'])).toBe(true);
  });
});

// ==================== BULKBEWERKINGEN ====================

describe('useMusicPieces - bulkbewerkingen', () => {
  it('stuurt de selectie en de wijzigingen gescheiden door', async () => {
    alsMock(bulkUpdatePieces).mockResolvedValue({ updated: 3 });
    const wijzigingen = { instrumentId: 'i2', addToListId: 'l1' };

    const { result } = renderHook(() => useBulkUpdatePieces(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ pieceIds: ['p1', 'p2', 'p3'], updates: wijzigingen });
    });

    expect(bulkUpdatePieces).toHaveBeenCalledWith(['p1', 'p2', 'p3'], wijzigingen);
    expect(showSuccess).toHaveBeenCalledWith('3 muziekstukken bijgewerkt');
  });

  it('vernieuwt na een bulkbewerking zowel de stukken als de muzieklijsten', async () => {
    // addToListId en removeFromListId veranderen de inhoud van een lijst en
    // daarmee de aantallen in de lijstoverzichten.
    alsMock(bulkUpdatePieces).mockResolvedValue({ updated: 3 });

    const { result } = renderHook(() => useBulkUpdatePieces(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ pieceIds: ['p1'], updates: { removeFromListId: 'l1' } });
    });

    expect(isOngeldigGemaakt(['musicPieces'])).toBe(true);
    expect(isOngeldigGemaakt(['musicLists'])).toBe(true);
  });

  it('laat het instrument los als de gebruiker de koppeling weghaalt', async () => {
    // null betekent "geen instrument"; undefined zou betekenen "niet
    // aanraken". Dat onderscheid moet ongeschonden naar de api.
    alsMock(bulkUpdatePieces).mockResolvedValue({ updated: 1 });

    const { result } = renderHook(() => useBulkUpdatePieces(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ pieceIds: ['p1'], updates: { instrumentId: null } });
    });

    expect(bulkUpdatePieces).toHaveBeenCalledWith(['p1'], { instrumentId: null });
  });

  it('raakt de cache niet aan als de bulkbewerking mislukt', async () => {
    alsMock(bulkUpdatePieces).mockRejectedValue(serverfout('Lijst bestaat niet'));

    const { result } = renderHook(() => useBulkUpdatePieces(), { wrapper });
    await act(async () => {
      await expect(
        result.current.mutateAsync({ pieceIds: ['p1'], updates: { addToListId: 'weg' } }),
      ).rejects.toBeDefined();
    });

    expect(showError).toHaveBeenCalledWith('Lijst bestaat niet');
    expect(ongeldigGemaakt).toHaveLength(0);
  });

  it('meldt na het herstellen van instrumentkoppelingen hoeveel er gekoppeld zijn', async () => {
    alsMock(refreshInstrumentLinks).mockResolvedValue({
      updated: 12,
      alreadyLinked: 30,
      notFound: 2,
      total: 44,
    });

    const { result } = renderHook(() => useRefreshInstrumentLinks(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(undefined);
    });

    expect(showSuccess).toHaveBeenCalledWith('Instrumenten bijgewerkt: 12 gekoppeld, 30 waren al gekoppeld');
    expect(isOngeldigGemaakt(['musicPieces'])).toBe(true);
  });

  it('toont een foutmelding als het herstellen van de koppelingen mislukt', async () => {
    alsMock(refreshInstrumentLinks).mockRejectedValue(serverfout('Instrumentenlijst is leeg'));

    const { result } = renderHook(() => useRefreshInstrumentLinks(), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync(undefined)).rejects.toBeDefined();
    });

    expect(showError).toHaveBeenCalledWith('Instrumentenlijst is leeg');
    expect(ongeldigGemaakt).toHaveLength(0);
  });
});
