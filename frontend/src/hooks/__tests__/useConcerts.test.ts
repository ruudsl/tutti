import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';

// De api-module wordt volledig vervangen. Alleen de functies die useConcerts
// importeert hoeven te bestaan; alles wat de hook niet aanraakt laten we weg.
vi.mock('../../api', () => ({
  getConcerts: vi.fn(),
  getConcert: vi.fn(),
  getConcertTypes: vi.fn(),
  getConcertYears: vi.fn(),
  getConcertStatistics: vi.fn(),
  getPieceHistory: vi.fn(),
  createConcert: vi.fn(),
  updateConcert: vi.fn(),
  deleteConcert: vi.fn(),
  addConcertProgramItem: vi.fn(),
  updateConcertProgramItem: vi.fn(),
  deleteConcertProgramItem: vi.fn(),
  reorderConcertProgram: vi.fn(),
  exportConcertProgram: vi.fn(),
  exportBumaStemra: vi.fn(),
  addConcertMedia: vi.fn(),
  deleteConcertMedia: vi.fn(),
  addConcertAttendance: vi.fn(),
  addConcertAttendanceBulk: vi.fn(),
  updateConcertAttendance: vi.fn(),
  deleteConcertAttendance: vi.fn(),
  getAdminConcertTypes: vi.fn(),
  createConcertType: vi.fn(),
  updateConcertType: vi.fn(),
  deleteConcertType: vi.fn(),
  initDefaultConcertTypes: vi.fn(),
}));

vi.mock('../../utils/toast', () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}));

import {
  useConcertTypes,
  useAdminConcertTypes,
  useCreateConcertType,
  useUpdateConcertType,
  useDeleteConcertType,
  useInitDefaultConcertTypes,
  useConcertYears,
  useConcertStatistics,
  usePieceHistory,
  useConcerts,
  useConcert,
  useCreateConcert,
  useUpdateConcert,
  useDeleteConcert,
  useAddConcertProgramItem,
  useUpdateConcertProgramItem,
  useDeleteConcertProgramItem,
  useReorderConcertProgram,
  useExportConcertProgram,
  useExportBumaStemra,
  useAddConcertMedia,
  useDeleteConcertMedia,
  useAddConcertAttendance,
  useAddConcertAttendanceBulk,
  useUpdateConcertAttendance,
  useDeleteConcertAttendance,
} from '../useConcerts';
import {
  getConcerts,
  getConcert,
  getConcertTypes,
  getConcertYears,
  getConcertStatistics,
  getPieceHistory,
  createConcert,
  updateConcert,
  deleteConcert,
  addConcertProgramItem,
  updateConcertProgramItem,
  deleteConcertProgramItem,
  reorderConcertProgram,
  exportConcertProgram,
  exportBumaStemra,
  addConcertMedia,
  deleteConcertMedia,
  addConcertAttendance,
  addConcertAttendanceBulk,
  updateConcertAttendance,
  deleteConcertAttendance,
  getAdminConcertTypes,
  createConcertType,
  updateConcertType,
  deleteConcertType,
  initDefaultConcertTypes,
} from '../../api';
import { showSuccess, showError } from '../../utils/toast';

/**
 * De api-module is gemockt, maar TypeScript kent nog de echte signatuur.
 * Via deze hulpfunctie hoeven we niet in elke test het volledige responsetype
 * na te bouwen terwijl de test maar twee velden gebruikt.
 */
const alsMock = (fn: unknown) => fn as Mock;

/**
 * Waar een hook de api-functie rechtstreeks als mutationFn doorgeeft
 * (`mutationFn: createConcert`), plakt react-query er zelf nog een
 * context-object achter. Voor de test telt alleen het eerste argument:
 * dat is wat de gebruiker heeft ingevuld.
 */
const eersteArgument = (fn: unknown) => alsMock(fn).mock.calls[0][0];

/** Een axios-achtige fout zoals de backend hem teruggeeft. */
const serverfout = (melding: string) => ({
  isAxiosError: true,
  response: { data: { error: melding } },
});

let queryClient: QueryClient;
/** Alle queryKeys die de hooks ongeldig hebben gemaakt, in volgorde. */
let ongeldigGemaakt: unknown[];

function maakOmgeving() {
  queryClient = new QueryClient({
    defaultOptions: {
      // Zonder retry:false blijft een faaltest seconden hangen op de
      // standaard herhaalpogingen van react-query.
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
}

const wrapper = ({ children }: { children: React.ReactNode }) =>
  createElement(QueryClientProvider, { client: queryClient }, children);

/** Controleert of precies deze queryKey ongeldig is gemaakt. */
const isOngeldigGemaakt = (key: unknown[]) => ongeldigGemaakt.some((k) => JSON.stringify(k) === JSON.stringify(key));

beforeEach(() => {
  vi.clearAllMocks();
  maakOmgeving();
});

// ==================== QUERIES ====================

describe('useConcerts - queries', () => {
  it('geeft de filters ongewijzigd door aan de api', async () => {
    alsMock(getConcerts).mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 });
    const filters = { search: 'voorjaar', year: '2024', concertType: 'gala' };

    const { result } = renderHook(() => useConcerts(filters), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(getConcerts).toHaveBeenCalledWith(filters);
  });

  it('geeft nog geen data terug zolang het verzoek loopt', async () => {
    // Een promise die we zelf openhouden, zodat we de laadtoestand kunnen zien.
    let losmaken: (waarde: unknown) => void = () => {};
    alsMock(getConcerts).mockImplementation(() => new Promise((r) => (losmaken = r)));

    const { result } = renderHook(() => useConcerts(), { wrapper });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();

    await act(async () => {
      losmaken({ data: [], total: 0, page: 1, limit: 20 });
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
  });

  it('geeft een leeg resultaat terug als de vereniging nog geen concerten heeft', async () => {
    alsMock(getConcerts).mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 });

    const { result } = renderHook(() => useConcerts(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.data).toEqual([]);
    expect(result.current.data?.total).toBe(0);
  });

  it('meldt een fout als de concertlijst niet opgehaald kan worden', async () => {
    alsMock(getConcerts).mockRejectedValue(serverfout('Database niet bereikbaar'));

    const { result } = renderHook(() => useConcerts(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });

  it('vraagt geen concertdetail op zolang er geen id is', () => {
    const { result } = renderHook(() => useConcert(''), { wrapper });

    expect(getConcert).not.toHaveBeenCalled();
    // fetchStatus 'idle' bevestigt dat de query bewust uitstaat en niet
    // gewoon nog aan het laden is.
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('haalt het concertdetail op zodra het id bekend is', async () => {
    alsMock(getConcert).mockResolvedValue({ id: 'c1', name: 'Voorjaarsconcert' });

    const { result } = renderHook(() => useConcert('c1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getConcert).toHaveBeenCalledWith('c1');
    expect(result.current.data).toEqual({ id: 'c1', name: 'Voorjaarsconcert' });
  });

  it('vraagt de stukgeschiedenis pas op als er een titel is', async () => {
    const { result, rerender } = renderHook(({ titel }: { titel: string }) => usePieceHistory(titel), {
      wrapper,
      initialProps: { titel: '' },
    });

    expect(getPieceHistory).not.toHaveBeenCalled();

    alsMock(getPieceHistory).mockResolvedValue({ title: 'Ammerland', performances: [] });
    rerender({ titel: 'Ammerland' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getPieceHistory).toHaveBeenCalledWith('Ammerland');
  });

  it('haalt concerttypes en mediatypes op', async () => {
    alsMock(getConcertTypes).mockResolvedValue({ concertTypes: [], mediaTypes: [] });

    const { result } = renderHook(() => useConcertTypes(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getConcertTypes).toHaveBeenCalledTimes(1);
  });

  it('haalt de beschikbare jaren op', async () => {
    alsMock(getConcertYears).mockResolvedValue(['2024', '2023']);

    const { result } = renderHook(() => useConcertYears(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(['2024', '2023']);
  });

  it('haalt de statistieken op', async () => {
    alsMock(getConcertStatistics).mockResolvedValue({ totalConcerts: 12 });

    const { result } = renderHook(() => useConcertStatistics(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getConcertStatistics).toHaveBeenCalledTimes(1);
  });

  it('gebruikt voor het beheerscherm de aparte beheer-endpoint', async () => {
    alsMock(getAdminConcertTypes).mockResolvedValue({ types: [], defaults: [] });

    const { result } = renderHook(() => useAdminConcertTypes(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getAdminConcertTypes).toHaveBeenCalledTimes(1);
    expect(getConcertTypes).not.toHaveBeenCalled();
  });
});

// ==================== CONCERT AANMAKEN / WIJZIGEN / VERWIJDEREN ====================

describe('useConcerts - concert aanmaken, wijzigen, verwijderen', () => {
  it('stuurt het nieuwe concert door en maakt de concertlijst ongeldig', async () => {
    alsMock(createConcert).mockResolvedValue({ id: 'c9' });
    const nieuw = { name: 'Kerstconcert', date: '2024-12-21' };

    const { result } = renderHook(() => useCreateConcert(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(nieuw);
    });

    expect(eersteArgument(createConcert)).toEqual(nieuw);
    // ['concerts'] is het gedeelde voorvoegsel van lijst, detail, jaren en
    // statistieken: alles onder dat voorvoegsel wordt hiermee vernieuwd.
    expect(isOngeldigGemaakt(['concerts'])).toBe(true);
    expect(showSuccess).toHaveBeenCalledWith('Concert aangemaakt');
  });

  it('toont de foutmelding van de server als aanmaken mislukt', async () => {
    alsMock(createConcert).mockRejectedValue(serverfout('Er bestaat al een concert op die datum'));

    const { result } = renderHook(() => useCreateConcert(), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync({ name: 'X', date: '2024-01-01' })).rejects.toBeDefined();
    });

    expect(showError).toHaveBeenCalledWith('Er bestaat al een concert op die datum');
    expect(showSuccess).not.toHaveBeenCalled();
    // Een mislukte aanmaak mag de cache niet aanraken.
    expect(ongeldigGemaakt).toHaveLength(0);
  });

  it('stuurt bij wijzigen het id en de velden gescheiden door', async () => {
    alsMock(updateConcert).mockResolvedValue(undefined);

    const { result } = renderHook(() => useUpdateConcert(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ id: 'c1', data: { name: 'Nieuwe naam' } });
    });

    expect(updateConcert).toHaveBeenCalledWith('c1', { name: 'Nieuwe naam' });
  });

  it('maakt na een wijziging zowel de lijst als het gewijzigde detail ongeldig', async () => {
    alsMock(updateConcert).mockResolvedValue(undefined);

    const { result } = renderHook(() => useUpdateConcert(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ id: 'c1', data: { name: 'Nieuwe naam' } });
    });

    expect(isOngeldigGemaakt(['concerts'])).toBe(true);
    expect(isOngeldigGemaakt(['concerts', 'c1'])).toBe(true);
    expect(showSuccess).toHaveBeenCalledWith('Concert bijgewerkt');
  });

  it('haalt het openstaande concertdetail daadwerkelijk opnieuw op na een wijziging', async () => {
    // Dit is de kern van de zaak: niet alleen dat invalidateQueries is
    // aangeroepen, maar dat de gebruiker zijn eigen wijziging ook echt ziet.
    alsMock(getConcert).mockResolvedValue({ id: 'c1', name: 'Oud' });
    alsMock(updateConcert).mockResolvedValue(undefined);

    const { result } = renderHook(() => ({ detail: useConcert('c1'), wijzig: useUpdateConcert() }), { wrapper });

    await waitFor(() => expect(result.current.detail.isSuccess).toBe(true));
    expect(getConcert).toHaveBeenCalledTimes(1);

    alsMock(getConcert).mockResolvedValue({ id: 'c1', name: 'Nieuw' });
    await act(async () => {
      await result.current.wijzig.mutateAsync({ id: 'c1', data: { name: 'Nieuw' } });
    });

    await waitFor(() => expect(result.current.detail.data).toEqual({ id: 'c1', name: 'Nieuw' }));
    // Meer dan een keer, niet exact twee: de hook maakt zowel ['concerts'] als
    // ['concerts', id] ongeldig, en het eerste voorvoegsel dekt het tweede al.
    // Dat levert een extra ophaalronde op - onnodig, maar niet fout.
    expect(alsMock(getConcert).mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('maakt bij verwijderen de lijst en de statistieken ongeldig', async () => {
    alsMock(deleteConcert).mockResolvedValue(undefined);

    const { result } = renderHook(() => useDeleteConcert(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync('c1');
    });

    expect(eersteArgument(deleteConcert)).toBe('c1');
    expect(isOngeldigGemaakt(['concerts'])).toBe(true);
    expect(isOngeldigGemaakt(['concerts', 'statistics'])).toBe(true);
    expect(showSuccess).toHaveBeenCalledWith('Concert verwijderd');
  });

  it('meldt geen succes als verwijderen mislukt', async () => {
    alsMock(deleteConcert).mockRejectedValue(serverfout('Concert heeft nog tickets'));

    const { result } = renderHook(() => useDeleteConcert(), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync('c1')).rejects.toBeDefined();
    });

    expect(showError).toHaveBeenCalledWith('Concert heeft nog tickets');
    expect(showSuccess).not.toHaveBeenCalled();
  });
});

// ==================== PROGRAMMA ====================

describe('useConcerts - programma', () => {
  it('voegt een programma-item toe en vernieuwt detail en lijst', async () => {
    alsMock(addConcertProgramItem).mockResolvedValue({ id: 'p1' });
    const item = { title: 'Ammerland', sortOrder: 1 };

    const { result } = renderHook(() => useAddConcertProgramItem(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ concertId: 'c1', item });
    });

    expect(addConcertProgramItem).toHaveBeenCalledWith('c1', item);
    expect(isOngeldigGemaakt(['concerts', 'c1'])).toBe(true);
    // De lijst toont het aantal programmastukken, dus die moet mee.
    expect(isOngeldigGemaakt(['concerts'])).toBe(true);
    expect(showSuccess).toHaveBeenCalledWith('Programma item toegevoegd');
  });

  it('geeft bij het wijzigen van een programma-item concert, item en velden door', async () => {
    alsMock(updateConcertProgramItem).mockResolvedValue(undefined);

    const { result } = renderHook(() => useUpdateConcertProgramItem(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ concertId: 'c1', programId: 'p1', item: { notes: 'zonder solo' } });
    });

    expect(updateConcertProgramItem).toHaveBeenCalledWith('c1', 'p1', { notes: 'zonder solo' });
    expect(isOngeldigGemaakt(['concerts', 'c1'])).toBe(true);
    expect(showSuccess).toHaveBeenCalledWith('Programma item bijgewerkt');
  });

  it('verwijdert een programma-item en vernieuwt detail en lijst', async () => {
    alsMock(deleteConcertProgramItem).mockResolvedValue(undefined);

    const { result } = renderHook(() => useDeleteConcertProgramItem(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ concertId: 'c1', programId: 'p1' });
    });

    expect(deleteConcertProgramItem).toHaveBeenCalledWith('c1', 'p1');
    expect(isOngeldigGemaakt(['concerts', 'c1'])).toBe(true);
    expect(isOngeldigGemaakt(['concerts'])).toBe(true);
  });

  it('stuurt de nieuwe volgorde als lijst door en vernieuwt het detail', async () => {
    alsMock(reorderConcertProgram).mockResolvedValue(undefined);
    const items = [
      { id: 'p2', sortOrder: 1 },
      { id: 'p1', sortOrder: 2 },
    ];

    const { result } = renderHook(() => useReorderConcertProgram(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ concertId: 'c1', items });
    });

    expect(reorderConcertProgram).toHaveBeenCalledWith('c1', items);
    expect(isOngeldigGemaakt(['concerts', 'c1'])).toBe(true);
    expect(showSuccess).toHaveBeenCalledWith('Volgorde bijgewerkt');
  });

  it('toont een foutmelding als een programma-item niet toegevoegd kan worden', async () => {
    alsMock(addConcertProgramItem).mockRejectedValue(serverfout('Titel is verplicht'));

    const { result } = renderHook(() => useAddConcertProgramItem(), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync({ concertId: 'c1', item: { title: '' } })).rejects.toBeDefined();
    });

    expect(showError).toHaveBeenCalledWith('Titel is verplicht');
    expect(ongeldigGemaakt).toHaveLength(0);
  });
});

// ==================== EXPORT ====================

describe('useConcerts - exports', () => {
  let gedownload: { href: string | null; bestandsnaam: string } | null;

  beforeEach(() => {
    gedownload = null;
    // jsdom kent createObjectURL niet en volgt een klik op een <a> als
    // navigatie. Beide vervangen we, zodat we alleen de download-intentie
    // van de hook meten.
    window.URL.createObjectURL = vi.fn(() => 'blob:test');
    window.URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      gedownload = { href: this.getAttribute('href'), bestandsnaam: this.download };
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('biedt het programma aan als programma.txt', async () => {
    alsMock(exportConcertProgram).mockResolvedValue('1. Ammerland');

    const { result } = renderHook(() => useExportConcertProgram(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync('c1');
    });

    expect(eersteArgument(exportConcertProgram)).toBe('c1');
    expect(gedownload).toEqual({ href: 'blob:test', bestandsnaam: 'programma.txt' });
    expect(window.URL.revokeObjectURL).toHaveBeenCalledWith('blob:test');
    expect(showSuccess).toHaveBeenCalledWith('Programma geëxporteerd');
  });

  it('zet de gekozen periode in de bestandsnaam van de Buma/Stemra-export', async () => {
    alsMock(exportBumaStemra).mockResolvedValue('datum;titel');
    const periode = { startDate: '2024-01-01', endDate: '2024-12-31' };

    const { result } = renderHook(() => useExportBumaStemra(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(periode);
    });

    expect(eersteArgument(exportBumaStemra)).toEqual(periode);
    expect(gedownload?.bestandsnaam).toBe('buma_stemra_2024-01-01_2024-12-31.csv');
  });

  it('start geen download als de export mislukt', async () => {
    alsMock(exportConcertProgram).mockRejectedValue(serverfout('Geen programma gevonden'));

    const { result } = renderHook(() => useExportConcertProgram(), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync('c1')).rejects.toBeDefined();
    });

    expect(gedownload).toBeNull();
    expect(showError).toHaveBeenCalledWith('Geen programma gevonden');
  });
});

// ==================== MEDIA ====================

describe('useConcerts - media', () => {
  it('voegt media toe en vernieuwt detail en lijst', async () => {
    alsMock(addConcertMedia).mockResolvedValue({ id: 'm1' });
    const media = { mediaType: 'photo', url: 'https://example.org/foto.jpg' };

    const { result } = renderHook(() => useAddConcertMedia(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ concertId: 'c1', media });
    });

    expect(addConcertMedia).toHaveBeenCalledWith('c1', media);
    expect(isOngeldigGemaakt(['concerts', 'c1'])).toBe(true);
    expect(isOngeldigGemaakt(['concerts'])).toBe(true);
    expect(showSuccess).toHaveBeenCalledWith('Media toegevoegd');
  });

  it('verwijdert media met concert- en media-id', async () => {
    alsMock(deleteConcertMedia).mockResolvedValue(undefined);

    const { result } = renderHook(() => useDeleteConcertMedia(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ concertId: 'c1', mediaId: 'm1' });
    });

    expect(deleteConcertMedia).toHaveBeenCalledWith('c1', 'm1');
    expect(isOngeldigGemaakt(['concerts', 'c1'])).toBe(true);
    expect(showSuccess).toHaveBeenCalledWith('Media verwijderd');
  });
});

// ==================== BEZETTING ====================

describe('useConcerts - bezetting', () => {
  it('voegt een enkel bezettingsregel toe', async () => {
    alsMock(addConcertAttendance).mockResolvedValue({ id: 'a1' });
    const regel = { memberName: 'Jan Jansen', instrumentPlayed: 'Trompet' };

    const { result } = renderHook(() => useAddConcertAttendance(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ concertId: 'c1', attendance: regel });
    });

    expect(addConcertAttendance).toHaveBeenCalledWith('c1', regel);
    expect(isOngeldigGemaakt(['concerts', 'c1'])).toBe(true);
    expect(showSuccess).toHaveBeenCalledWith('Bezetting toegevoegd');
  });

  it('noemt in de melding hoeveel leden er in bulk zijn toegevoegd', async () => {
    // Het aantal komt uit het serverantwoord, niet uit de verstuurde lijst:
    // de server kan leden overslaan die al in de bezetting stonden.
    alsMock(addConcertAttendanceBulk).mockResolvedValue({ ids: ['a1', 'a2'], count: 2 });

    const { result } = renderHook(() => useAddConcertAttendanceBulk(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ concertId: 'c1', userIds: ['u1', 'u2', 'u3'] });
    });

    expect(addConcertAttendanceBulk).toHaveBeenCalledWith('c1', ['u1', 'u2', 'u3']);
    expect(showSuccess).toHaveBeenCalledWith('2 leden toegevoegd aan bezetting');
  });

  it('wijzigt een bezettingsregel met concert- en regel-id', async () => {
    alsMock(updateConcertAttendance).mockResolvedValue(undefined);

    const { result } = renderHook(() => useUpdateConcertAttendance(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({
        concertId: 'c1',
        attendanceId: 'a1',
        attendance: { instrumentPlayed: 'Bugel' },
      });
    });

    expect(updateConcertAttendance).toHaveBeenCalledWith('c1', 'a1', { instrumentPlayed: 'Bugel' });
    expect(isOngeldigGemaakt(['concerts', 'c1'])).toBe(true);
  });

  it('verwijdert een bezettingsregel en vernieuwt detail en lijst', async () => {
    alsMock(deleteConcertAttendance).mockResolvedValue(undefined);

    const { result } = renderHook(() => useDeleteConcertAttendance(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ concertId: 'c1', attendanceId: 'a1' });
    });

    expect(deleteConcertAttendance).toHaveBeenCalledWith('c1', 'a1');
    expect(isOngeldigGemaakt(['concerts', 'c1'])).toBe(true);
    expect(isOngeldigGemaakt(['concerts'])).toBe(true);
  });
});

// ==================== CONCERTTYPES BEHEREN ====================

describe('useConcerts - concerttypes beheren', () => {
  it('maakt een concerttype aan en vernieuwt zowel de beheerlijst als de keuzelijst', async () => {
    alsMock(createConcertType).mockResolvedValue({ id: 't1', message: 'ok' });

    const { result } = renderHook(() => useCreateConcertType(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ value: 'gala', label: 'Galaconcert', sortOrder: 3 });
    });

    // De api verwacht drie losse argumenten, geen object.
    expect(createConcertType).toHaveBeenCalledWith('gala', 'Galaconcert', 3);
    expect(isOngeldigGemaakt(['admin', 'concertTypes'])).toBe(true);
    expect(isOngeldigGemaakt(['concerts', 'types'])).toBe(true);
    expect(showSuccess).toHaveBeenCalledWith('Concert type aangemaakt');
  });

  it('wijzigt een concerttype en vernieuwt beide lijsten', async () => {
    alsMock(updateConcertType).mockResolvedValue({ message: 'ok' });

    const { result } = renderHook(() => useUpdateConcertType(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ id: 't1', updates: { label: 'Gala' } });
    });

    expect(updateConcertType).toHaveBeenCalledWith('t1', { label: 'Gala' });
    expect(isOngeldigGemaakt(['admin', 'concertTypes'])).toBe(true);
    expect(isOngeldigGemaakt(['concerts', 'types'])).toBe(true);
  });

  it('verwijdert een concerttype en vernieuwt beide lijsten', async () => {
    alsMock(deleteConcertType).mockResolvedValue({ message: 'ok' });

    const { result } = renderHook(() => useDeleteConcertType(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync('t1');
    });

    expect(eersteArgument(deleteConcertType)).toBe('t1');
    expect(isOngeldigGemaakt(['admin', 'concertTypes'])).toBe(true);
    expect(isOngeldigGemaakt(['concerts', 'types'])).toBe(true);
    expect(showSuccess).toHaveBeenCalledWith('Concert type verwijderd');
  });

  it('zet de standaardtypes klaar en vernieuwt beide lijsten', async () => {
    alsMock(initDefaultConcertTypes).mockResolvedValue({ message: 'ok' });

    const { result } = renderHook(() => useInitDefaultConcertTypes(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(undefined);
    });

    expect(initDefaultConcertTypes).toHaveBeenCalled();
    expect(isOngeldigGemaakt(['admin', 'concertTypes'])).toBe(true);
    expect(isOngeldigGemaakt(['concerts', 'types'])).toBe(true);
    expect(showSuccess).toHaveBeenCalledWith('Standaard concert types aangemaakt');
  });

  it('toont een foutmelding als een concerttype niet aangemaakt kan worden', async () => {
    alsMock(createConcertType).mockRejectedValue(serverfout('Waarde bestaat al'));

    const { result } = renderHook(() => useCreateConcertType(), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync({ value: 'gala', label: 'Gala' })).rejects.toBeDefined();
    });

    expect(showError).toHaveBeenCalledWith('Waarde bestaat al');
    expect(ongeldigGemaakt).toHaveLength(0);
  });
});
