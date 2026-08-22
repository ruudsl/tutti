import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';

// Alleen de api-functies die useMusicLists importeert hoeven te bestaan.
vi.mock('../../api', () => ({
  getMusicLists: vi.fn(),
  getMyMusicLists: vi.fn(),
  getMusicList: vi.fn(),
  createMusicList: vi.fn(),
  updateMusicList: vi.fn(),
  deleteMusicList: vi.fn(),
  addPieceToList: vi.fn(),
  removePieceFromList: vi.fn(),
  addTitleToList: vi.fn(),
  removeTitleFromList: vi.fn(),
  toggleMusicListActive: vi.fn(),
}));

vi.mock('../../utils/toast', () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}));

import {
  useMusicLists,
  useMyMusicLists,
  useMusicList,
  useCreateMusicList,
  useUpdateMusicList,
  useDeleteMusicList,
  useAddPieceToList,
  useRemovePieceFromList,
  useAddTitleToList,
  useRemoveTitleFromList,
  useToggleMusicListActive,
} from '../useMusicLists';
import {
  getMusicLists,
  getMyMusicLists,
  getMusicList,
  createMusicList,
  updateMusicList,
  deleteMusicList,
  addPieceToList,
  removePieceFromList,
  addTitleToList,
  removeTitleFromList,
  toggleMusicListActive,
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

describe('useMusicLists - ophalen', () => {
  it('vraagt geen lijsten op zolang er geen orkest gekozen is', () => {
    const { result } = renderHook(() => useMusicLists(undefined), { wrapper });

    expect(getMusicLists).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('haalt de lijsten van het gekozen orkest op', async () => {
    alsMock(getMusicLists).mockResolvedValue([{ id: 'l1', name: 'Concertmap', pieceCount: 12 }]);

    const { result } = renderHook(() => useMusicLists('o1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getMusicLists).toHaveBeenCalledWith('o1');
    expect(result.current.data).toEqual([{ id: 'l1', name: 'Concertmap', pieceCount: 12 }]);
  });

  it('haalt opnieuw op bij een ander orkest', async () => {
    // Het orkest zit in de queryKey; anders toont het tweede orkest de
    // lijsten van het eerste.
    alsMock(getMusicLists).mockResolvedValue([]);

    const { result, rerender } = renderHook(({ orkest }: { orkest: string }) => useMusicLists(orkest), {
      wrapper,
      initialProps: { orkest: 'o1' },
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    rerender({ orkest: 'o2' });

    await waitFor(() => expect(getMusicLists).toHaveBeenCalledTimes(2));
    expect(getMusicLists).toHaveBeenLastCalledWith('o2');
  });

  it('haalt de eigen lijsten van een aparte endpoint', async () => {
    alsMock(getMyMusicLists).mockResolvedValue([{ id: 'l1', titleCount: 8 }]);

    const { result } = renderHook(() => useMyMusicLists(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getMyMusicLists).toHaveBeenCalledTimes(1);
    expect(getMusicLists).not.toHaveBeenCalled();
  });

  it('vraagt geen lijstdetail op zolang er geen lijst gekozen is', () => {
    const { result } = renderHook(() => useMusicList(undefined), { wrapper });

    expect(getMusicList).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('haalt het lijstdetail met stukken op zodra de lijst bekend is', async () => {
    alsMock(getMusicList).mockResolvedValue({ id: 'l1', name: 'Concertmap', pieces: [] });

    const { result } = renderHook(() => useMusicList('l1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getMusicList).toHaveBeenCalledWith('l1');
  });

  it('meldt een fout als de lijsten niet opgehaald kunnen worden', async () => {
    alsMock(getMusicLists).mockRejectedValue(serverfout('Database niet bereikbaar'));

    const { result } = renderHook(() => useMusicLists('o1'), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });
});

// ==================== LIJST BEHEREN ====================

describe('useMusicLists - lijst beheren', () => {
  it('maakt een lijst aan met naam en orkest als losse argumenten', async () => {
    alsMock(createMusicList).mockResolvedValue({ id: 'l9' });

    const { result } = renderHook(() => useCreateMusicList(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ name: 'Kerstmap', orchestraId: 'o1' });
    });

    expect(createMusicList).toHaveBeenCalledWith('Kerstmap', 'o1');
    // Alleen de lijsten van dít orkest, plus de orkestenlijst: die toont per
    // orkest de mappen met hun aantallen.
    expect(isOngeldigGemaakt(['musicLists', 'o1'])).toBe(true);
    expect(isOngeldigGemaakt(['orchestras'])).toBe(true);
    expect(showSuccess).toHaveBeenCalledWith('Muzieklijst aangemaakt');
  });

  it('toont de foutmelding van de server als aanmaken mislukt', async () => {
    alsMock(createMusicList).mockRejectedValue(serverfout('Er bestaat al een lijst met die naam'));

    const { result } = renderHook(() => useCreateMusicList(), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync({ name: 'Kerstmap', orchestraId: 'o1' })).rejects.toBeDefined();
    });

    expect(showError).toHaveBeenCalledWith('Er bestaat al een lijst met die naam');
    expect(showSuccess).not.toHaveBeenCalled();
    expect(ongeldigGemaakt).toHaveLength(0);
  });

  it('haalt het id uit de gegevens en stuurt de rest als body mee bij wijzigen', async () => {
    alsMock(updateMusicList).mockResolvedValue(undefined);

    const { result } = renderHook(() => useUpdateMusicList(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({
        id: 'l1',
        name: 'Kerstconcert 2024',
        listType: 'concert',
        concertDate: '2024-12-21',
      });
    });

    expect(updateMusicList).toHaveBeenCalledWith('l1', {
      name: 'Kerstconcert 2024',
      listType: 'concert',
      concertDate: '2024-12-21',
    });
    // Zonder orkest-id in beeld moet het hele voorvoegsel mee, anders blijft
    // de lijst van het orkest waar deze map onder hangt op de oude naam staan.
    expect(isOngeldigGemaakt(['musicLists'])).toBe(true);
    expect(showSuccess).toHaveBeenCalledWith('Muzieklijst bijgewerkt');
  });

  it('verwijdert een lijst en vernieuwt lijsten en orkesten', async () => {
    alsMock(deleteMusicList).mockResolvedValue(undefined);

    const { result } = renderHook(() => useDeleteMusicList(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync('l1');
    });

    expect(deleteMusicList).toHaveBeenCalledWith('l1');
    expect(isOngeldigGemaakt(['musicLists'])).toBe(true);
    expect(isOngeldigGemaakt(['orchestras'])).toBe(true);
    expect(showSuccess).toHaveBeenCalledWith('Muzieklijst verwijderd');
  });

  it('zet een lijst aan of uit en vernieuwt lijsten en orkesten', async () => {
    alsMock(toggleMusicListActive).mockResolvedValue({ isActive: false });

    const { result } = renderHook(() => useToggleMusicListActive(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync('l1');
    });

    expect(toggleMusicListActive).toHaveBeenCalledWith('l1');
    expect(isOngeldigGemaakt(['musicLists'])).toBe(true);
    expect(isOngeldigGemaakt(['orchestras'])).toBe(true);
    // Dit is een stille schakelaar: geen succesmelding.
    expect(showSuccess).not.toHaveBeenCalled();
  });

  it('haalt de openstaande lijstenlijst daadwerkelijk opnieuw op na een wijziging', async () => {
    alsMock(getMusicLists).mockResolvedValue([{ id: 'l1', name: 'Oud' }]);
    alsMock(updateMusicList).mockResolvedValue(undefined);

    const { result } = renderHook(() => ({ lijsten: useMusicLists('o1'), wijzig: useUpdateMusicList() }), {
      wrapper,
    });

    await waitFor(() => expect(result.current.lijsten.isSuccess).toBe(true));

    alsMock(getMusicLists).mockResolvedValue([{ id: 'l1', name: 'Nieuw' }]);
    await act(async () => {
      await result.current.wijzig.mutateAsync({ id: 'l1', name: 'Nieuw' });
    });

    await waitFor(() => expect(result.current.lijsten.data).toEqual([{ id: 'l1', name: 'Nieuw' }]));
  });
});

// ==================== STUKKEN EN TITELS IN EEN LIJST ====================

describe('useMusicLists - stukken en titels in een lijst', () => {
  it('voegt een stuk toe met lijst- en stuk-id', async () => {
    alsMock(addPieceToList).mockResolvedValue(undefined);

    const { result } = renderHook(() => useAddPieceToList(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ listId: 'l1', pieceId: 'p1' });
    });

    expect(addPieceToList).toHaveBeenCalledWith('l1', 'p1');
    expect(isOngeldigGemaakt(['musicLists', 'detail', 'l1'])).toBe(true);
  });

  it('vernieuwt na het toevoegen van een stuk ook de lijstoverzichten met hun aantallen', async () => {
    // De overzichten geven per lijst pieceCount en titleCount terug
    // (routes/music-lists.ts telt music_list_pieces). Die tellers staan onder
    // ['musicLists', orkestId] en ['musicLists','my'] - buiten het bereik van
    // de detailsleutel. Zonder deze invalidatie blijft er "12 stukken" staan
    // terwijl het er dertien zijn. MusicListManager.tsx doet daarom na
    // addTitleToList handmatig ook refreshLists().
    alsMock(addPieceToList).mockResolvedValue(undefined);

    const { result } = renderHook(() => useAddPieceToList(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ listId: 'l1', pieceId: 'p1' });
    });

    expect(isOngeldigGemaakt(['musicLists'])).toBe(true);
  });

  it('vernieuwt na het toevoegen van een stuk ook de op lijst gefilterde stukken', async () => {
    // useMusicPieces({ listId }) filtert op lijst. Vergelijk
    // useBulkUpdatePieces, die bij addToListId/removeFromListId wel zowel
    // musicPieces als musicLists vernieuwt.
    alsMock(addPieceToList).mockResolvedValue(undefined);

    const { result } = renderHook(() => useAddPieceToList(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ listId: 'l1', pieceId: 'p1' });
    });

    expect(isOngeldigGemaakt(['musicPieces'])).toBe(true);
  });

  it('haalt een stuk uit een lijst en vernieuwt detail en overzichten', async () => {
    alsMock(removePieceFromList).mockResolvedValue(undefined);

    const { result } = renderHook(() => useRemovePieceFromList(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ listId: 'l1', pieceId: 'p1' });
    });

    expect(removePieceFromList).toHaveBeenCalledWith('l1', 'p1');
    expect(isOngeldigGemaakt(['musicLists', 'detail', 'l1'])).toBe(true);
    expect(isOngeldigGemaakt(['musicLists'])).toBe(true);
    expect(isOngeldigGemaakt(['musicPieces'])).toBe(true);
  });

  it('noemt in de melding hoeveel partijen er bij een titel zijn toegevoegd', async () => {
    // Eén titel staat voor alle partijen van dat stuk; het aantal komt uit
    // het serverantwoord omdat de gebruiker alleen de titel aanwijst.
    alsMock(addTitleToList).mockResolvedValue({ added: 24, total: 26 });

    const { result } = renderHook(() => useAddTitleToList(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ listId: 'l1', title: 'Ammerland' });
    });

    expect(addTitleToList).toHaveBeenCalledWith('l1', 'Ammerland');
    expect(showSuccess).toHaveBeenCalledWith('24 stuk(ken) toegevoegd aan lijst');
  });

  it('vernieuwt na het toevoegen van een titel detail, overzichten en stukken', async () => {
    alsMock(addTitleToList).mockResolvedValue({ added: 24, total: 26 });

    const { result } = renderHook(() => useAddTitleToList(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ listId: 'l1', title: 'Ammerland' });
    });

    expect(isOngeldigGemaakt(['musicLists', 'detail', 'l1'])).toBe(true);
    expect(isOngeldigGemaakt(['musicLists'])).toBe(true);
    expect(isOngeldigGemaakt(['musicPieces'])).toBe(true);
  });

  it('noemt in de melding hoeveel partijen er bij een titel zijn verwijderd', async () => {
    alsMock(removeTitleFromList).mockResolvedValue({ removed: 24 });

    const { result } = renderHook(() => useRemoveTitleFromList(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ listId: 'l1', title: 'Ammerland' });
    });

    expect(removeTitleFromList).toHaveBeenCalledWith('l1', 'Ammerland');
    expect(showSuccess).toHaveBeenCalledWith('24 stuk(ken) verwijderd uit lijst');
    expect(isOngeldigGemaakt(['musicLists'])).toBe(true);
  });

  it('haalt het openstaande lijstdetail daadwerkelijk opnieuw op na het toevoegen van een titel', async () => {
    alsMock(getMusicList).mockResolvedValue({ id: 'l1', pieces: [] });
    alsMock(addTitleToList).mockResolvedValue({ added: 1, total: 1 });

    const { result } = renderHook(() => ({ detail: useMusicList('l1'), voegToe: useAddTitleToList() }), { wrapper });

    await waitFor(() => expect(result.current.detail.isSuccess).toBe(true));

    alsMock(getMusicList).mockResolvedValue({ id: 'l1', pieces: [{ id: 'p1', title: 'Ammerland' }] });
    await act(async () => {
      await result.current.voegToe.mutateAsync({ listId: 'l1', title: 'Ammerland' });
    });

    await waitFor(() =>
      expect(result.current.detail.data).toEqual({ id: 'l1', pieces: [{ id: 'p1', title: 'Ammerland' }] }),
    );
  });

  it('meldt geen succes en raakt de cache niet aan als een titel niet toegevoegd kan worden', async () => {
    alsMock(addTitleToList).mockRejectedValue(serverfout('Titel bestaat niet'));

    const { result } = renderHook(() => useAddTitleToList(), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync({ listId: 'l1', title: 'Onzin' })).rejects.toBeDefined();
    });

    expect(showError).toHaveBeenCalledWith('Titel bestaat niet');
    expect(showSuccess).not.toHaveBeenCalled();
    expect(ongeldigGemaakt).toHaveLength(0);
  });
});
