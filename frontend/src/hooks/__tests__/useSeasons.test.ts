import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';

// Alleen de api-functies die useSeasons importeert hoeven te bestaan.
vi.mock('../../api', () => ({
  getSeasons: vi.fn(),
  getSeason: vi.fn(),
  createSeason: vi.fn(),
  updateSeason: vi.fn(),
  deleteSeason: vi.fn(),
  getSeasonTemplates: vi.fn(),
  createSeasonTemplate: vi.fn(),
  updateSeasonTemplate: vi.fn(),
  deleteSeasonTemplate: vi.fn(),
  addSeasonEvent: vi.fn(),
  removeSeasonEvent: vi.fn(),
  generateSeasonEvents: vi.fn(),
}));

vi.mock('../../utils/toast', () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}));

import {
  seasonQueryKeys,
  useSeasons,
  useSeason,
  useSeasonTemplates,
  useCreateSeason,
  useUpdateSeason,
  useDeleteSeason,
  useCreateSeasonTemplate,
  useUpdateSeasonTemplate,
  useDeleteSeasonTemplate,
  useAddSeasonEvent,
  useRemoveSeasonEvent,
  useGenerateSeasonEvents,
} from '../useSeasons';
import {
  getSeasons,
  getSeason,
  createSeason,
  updateSeason,
  deleteSeason,
  getSeasonTemplates,
  createSeasonTemplate,
  updateSeasonTemplate,
  deleteSeasonTemplate,
  addSeasonEvent,
  removeSeasonEvent,
  generateSeasonEvents,
} from '../../api';
import { showSuccess, showError } from '../../utils/toast';

/** De api is gemockt; TypeScript kent alleen nog de echte signatuur. */
const alsMock = (fn: unknown) => fn as Mock;

/** Het eerste argument waarmee een rechtstreeks doorgegeven mutationFn is aangeroepen. */
const eersteArgument = (fn: unknown) => alsMock(fn).mock.calls[0][0];

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

// ==================== SLEUTELS ====================

describe('useSeasons - sleutelopbouw', () => {
  it('hangt lijst, detail en templates onder hetzelfde voorvoegsel', () => {
    // Hierop leunt de hele invalidatiestrategie van dit bestand: één
    // invalidatie van ['seasons'] raakt lijst, detail én templates. Wijzigt
    // iemand dit voorvoegsel voor één van de drie, dan lopen de mutaties
    // stilletjes langs die cache heen.
    expect(seasonQueryKeys.all).toEqual(['seasons']);
    expect(seasonQueryKeys.list('active').slice(0, 1)).toEqual(['seasons']);
    expect(seasonQueryKeys.detail('s1').slice(0, 1)).toEqual(['seasons']);
    expect(seasonQueryKeys.templates.slice(0, 1)).toEqual(['seasons']);
  });

  it('geeft elke statusfilter een eigen sleutel', () => {
    expect(seasonQueryKeys.list('active')).not.toEqual(seasonQueryKeys.list('archived'));
  });
});

// ==================== OPHALEN ====================

describe('useSeasons - ophalen', () => {
  it('haalt alle seizoenen op als er geen status is gekozen', async () => {
    alsMock(getSeasons).mockResolvedValue([{ id: 's1', name: '2024-2025' }]);

    const { result } = renderHook(() => useSeasons(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getSeasons).toHaveBeenCalledWith(undefined);
    expect(result.current.data).toEqual([{ id: 's1', name: '2024-2025' }]);
  });

  it('geeft de gekozen status door aan de api', async () => {
    alsMock(getSeasons).mockResolvedValue([]);

    const { result } = renderHook(() => useSeasons('active'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getSeasons).toHaveBeenCalledWith('active');
  });

  it('haalt opnieuw op als de status verandert', async () => {
    // De status zit in de queryKey; anders zou het archief de actieve
    // seizoenen blijven tonen.
    alsMock(getSeasons).mockResolvedValue([]);

    const { result, rerender } = renderHook(({ status }: { status: string }) => useSeasons(status), {
      wrapper,
      initialProps: { status: 'active' },
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    rerender({ status: 'archived' });

    await waitFor(() => expect(getSeasons).toHaveBeenCalledTimes(2));
    expect(getSeasons).toHaveBeenLastCalledWith('archived');
  });

  it('meldt een fout als de seizoenenlijst niet opgehaald kan worden', async () => {
    alsMock(getSeasons).mockRejectedValue(serverfout('Database niet bereikbaar'));

    const { result } = renderHook(() => useSeasons(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });

  it('vraagt geen seizoendetail op zolang er geen id is', () => {
    const { result } = renderHook(() => useSeason(''), { wrapper });

    expect(getSeason).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('haalt het seizoendetail op zodra het id bekend is', async () => {
    alsMock(getSeason).mockResolvedValue({ id: 's1', events: [] });

    const { result } = renderHook(() => useSeason('s1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getSeason).toHaveBeenCalledWith('s1');
  });

  it('haalt de seizoenstemplates op', async () => {
    alsMock(getSeasonTemplates).mockResolvedValue([]);

    const { result } = renderHook(() => useSeasonTemplates(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getSeasonTemplates).toHaveBeenCalledTimes(1);
  });
});

// ==================== SEIZOEN BEHEREN ====================

describe('useSeasons - seizoen beheren', () => {
  it('stuurt het nieuwe seizoen door en vernieuwt alles onder seasons', async () => {
    alsMock(createSeason).mockResolvedValue({ id: 's9', message: 'ok' });
    const nieuw = { name: '2025-2026', startDate: '2025-09-01', endDate: '2026-06-30' };

    const { result } = renderHook(() => useCreateSeason(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(nieuw);
    });

    expect(eersteArgument(createSeason)).toEqual(nieuw);
    expect(isOngeldigGemaakt(['seasons'])).toBe(true);
    expect(showSuccess).toHaveBeenCalledWith('Seizoen aangemaakt');
  });

  it('toont de foutmelding van de server als aanmaken mislukt', async () => {
    alsMock(createSeason).mockRejectedValue(serverfout('Er bestaat al een seizoen in die periode'));

    const { result } = renderHook(() => useCreateSeason(), { wrapper });
    await act(async () => {
      await expect(
        result.current.mutateAsync({ name: 'X', startDate: '2025-09-01', endDate: '2026-06-30' }),
      ).rejects.toBeDefined();
    });

    expect(showError).toHaveBeenCalledWith('Er bestaat al een seizoen in die periode');
    expect(showSuccess).not.toHaveBeenCalled();
    expect(ongeldigGemaakt).toHaveLength(0);
  });

  it('stuurt bij wijzigen id en velden gescheiden door', async () => {
    alsMock(updateSeason).mockResolvedValue({ message: 'ok' });

    const { result } = renderHook(() => useUpdateSeason(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ id: 's1', data: { name: 'Jubileumseizoen' } });
    });

    expect(updateSeason).toHaveBeenCalledWith('s1', { name: 'Jubileumseizoen' });
    expect(isOngeldigGemaakt(['seasons'])).toBe(true);
    expect(isOngeldigGemaakt(['seasons', 'detail', 's1'])).toBe(true);
    expect(showSuccess).toHaveBeenCalledWith('Seizoen bijgewerkt');
  });

  it('haalt het openstaande seizoendetail daadwerkelijk opnieuw op na een wijziging', async () => {
    alsMock(getSeason).mockResolvedValue({ id: 's1', name: 'Oud' });
    alsMock(updateSeason).mockResolvedValue({ message: 'ok' });

    const { result } = renderHook(() => ({ detail: useSeason('s1'), wijzig: useUpdateSeason() }), { wrapper });

    await waitFor(() => expect(result.current.detail.isSuccess).toBe(true));

    alsMock(getSeason).mockResolvedValue({ id: 's1', name: 'Nieuw' });
    await act(async () => {
      await result.current.wijzig.mutateAsync({ id: 's1', data: { name: 'Nieuw' } });
    });

    await waitFor(() => expect(result.current.detail.data).toEqual({ id: 's1', name: 'Nieuw' }));
  });

  it('verwijdert een seizoen en vernieuwt de seizoenenlijst', async () => {
    alsMock(deleteSeason).mockResolvedValue({ message: 'ok' });

    const { result } = renderHook(() => useDeleteSeason(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync('s1');
    });

    expect(eersteArgument(deleteSeason)).toBe('s1');
    expect(isOngeldigGemaakt(['seasons'])).toBe(true);
    expect(showSuccess).toHaveBeenCalledWith('Seizoen verwijderd');
  });

  it('meldt geen succes als verwijderen mislukt', async () => {
    alsMock(deleteSeason).mockRejectedValue(serverfout('Seizoen niet gevonden.'));

    const { result } = renderHook(() => useDeleteSeason(), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync('s1')).rejects.toBeDefined();
    });

    expect(showError).toHaveBeenCalledWith('Seizoen niet gevonden.');
    expect(showSuccess).not.toHaveBeenCalled();
  });
});

// ==================== TEMPLATES ====================

describe('useSeasons - templates', () => {
  it('maakt een template aan en vernieuwt alleen de templatelijst', async () => {
    // Bewust alleen de templates: een nieuw sjabloon verandert nog geen enkel
    // bestaand seizoen, dus de seizoenenlijst hoeft niet opnieuw opgehaald.
    alsMock(createSeasonTemplate).mockResolvedValue({ id: 't9', message: 'ok' });
    const template = { name: 'Standaardseizoen', defaultRehearsalDay: 2 };

    const { result } = renderHook(() => useCreateSeasonTemplate(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(template);
    });

    expect(eersteArgument(createSeasonTemplate)).toEqual(template);
    expect(ongeldigGemaakt).toEqual([['seasons', 'templates']]);
    expect(showSuccess).toHaveBeenCalledWith('Seizoenstemplate aangemaakt');
  });

  it('wijzigt een template met id en velden gescheiden', async () => {
    alsMock(updateSeasonTemplate).mockResolvedValue({ message: 'ok' });

    const { result } = renderHook(() => useUpdateSeasonTemplate(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ id: 't1', data: { defaultRehearsalTime: '20:00' } });
    });

    expect(updateSeasonTemplate).toHaveBeenCalledWith('t1', { defaultRehearsalTime: '20:00' });
    expect(isOngeldigGemaakt(['seasons', 'templates'])).toBe(true);
    expect(showSuccess).toHaveBeenCalledWith('Seizoenstemplate bijgewerkt');
  });

  it('verwijdert een template en vernieuwt de templatelijst', async () => {
    alsMock(deleteSeasonTemplate).mockResolvedValue({ message: 'ok' });

    const { result } = renderHook(() => useDeleteSeasonTemplate(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync('t1');
    });

    expect(eersteArgument(deleteSeasonTemplate)).toBe('t1');
    expect(isOngeldigGemaakt(['seasons', 'templates'])).toBe(true);
    expect(showSuccess).toHaveBeenCalledWith('Seizoenstemplate verwijderd');
  });

  it('toont een foutmelding als een template niet verwijderd kan worden', async () => {
    alsMock(deleteSeasonTemplate).mockRejectedValue(serverfout('Seizoenstemplate niet gevonden.'));

    const { result } = renderHook(() => useDeleteSeasonTemplate(), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync('t1')).rejects.toBeDefined();
    });

    expect(showError).toHaveBeenCalledWith('Seizoenstemplate niet gevonden.');
    expect(ongeldigGemaakt).toHaveLength(0);
  });
});

// ==================== EVENTS IN EEN SEIZOEN ====================

describe('useSeasons - events in een seizoen', () => {
  it('koppelt een event aan een seizoen en vernieuwt lijst en detail', async () => {
    alsMock(addSeasonEvent).mockResolvedValue({ id: 'e1', message: 'ok' });
    const event = { eventType: 'concert' as const, plannedDate: '2025-12-20', budgetAmount: 1500 };

    const { result } = renderHook(() => useAddSeasonEvent(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ seasonId: 's1', event });
    });

    expect(addSeasonEvent).toHaveBeenCalledWith('s1', event);
    // De lijst toont per seizoen het aantal events en het besteed budget.
    expect(isOngeldigGemaakt(['seasons'])).toBe(true);
    expect(isOngeldigGemaakt(['seasons', 'detail', 's1'])).toBe(true);
    expect(showSuccess).toHaveBeenCalledWith('Event toegevoegd aan seizoen');
  });

  it('haalt een event uit een seizoen met seizoen- en event-id', async () => {
    alsMock(removeSeasonEvent).mockResolvedValue({ message: 'ok' });

    const { result } = renderHook(() => useRemoveSeasonEvent(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ seasonId: 's1', eventId: 'e1' });
    });

    expect(removeSeasonEvent).toHaveBeenCalledWith('s1', 'e1');
    expect(isOngeldigGemaakt(['seasons'])).toBe(true);
    expect(isOngeldigGemaakt(['seasons', 'detail', 's1'])).toBe(true);
    expect(showSuccess).toHaveBeenCalledWith('Event verwijderd uit seizoen');
  });

  it('raakt de cache niet aan als het koppelen mislukt', async () => {
    alsMock(addSeasonEvent).mockRejectedValue(serverfout('Datum valt buiten het seizoen'));

    const { result } = renderHook(() => useAddSeasonEvent(), { wrapper });
    await act(async () => {
      await expect(
        result.current.mutateAsync({ seasonId: 's1', event: { eventType: 'concert', plannedDate: '2030-01-01' } }),
      ).rejects.toBeDefined();
    });

    expect(showError).toHaveBeenCalledWith('Datum valt buiten het seizoen');
    expect(ongeldigGemaakt).toHaveLength(0);
  });
});

// ==================== SEIZOEN GENEREREN ====================

describe('useSeasons - seizoen genereren', () => {
  it('geeft seizoen en instellingen gescheiden door aan de api', async () => {
    alsMock(generateSeasonEvents).mockResolvedValue({ message: '38 repetities aangemaakt', rehearsalsCreated: 38 });
    const instellingen = {
      rehearsalDay: 2,
      rehearsalTime: '20:00',
      generateRehearsals: true,
      excludeDates: ['2025-12-25'],
    };

    const { result } = renderHook(() => useGenerateSeasonEvents(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ seasonId: 's1', params: instellingen });
    });

    expect(generateSeasonEvents).toHaveBeenCalledWith('s1', instellingen);
  });

  it('toont de melding van de server, met het werkelijke aantal aangemaakte events', async () => {
    // Het aantal komt uit het serverantwoord: de generator slaat vakanties en
    // bestaande repetities over, dus het formulier weet het aantal niet.
    alsMock(generateSeasonEvents).mockResolvedValue({ message: '38 repetities aangemaakt' });

    const { result } = renderHook(() => useGenerateSeasonEvents(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ seasonId: 's1', params: { generateRehearsals: true } });
    });

    expect(showSuccess).toHaveBeenCalledWith('38 repetities aangemaakt');
  });

  it('vernieuwt na het genereren ook de repetitie- en concertlijsten', async () => {
    // De generator maakt echte repetities en concerten aan. Die staan onder
    // eigen sleutels, buiten ['seasons']; zonder deze twee invalidaties blijft
    // de repetitieagenda leeg terwijl er zojuist 38 repetities zijn gepland.
    alsMock(generateSeasonEvents).mockResolvedValue({ message: 'ok' });

    const { result } = renderHook(() => useGenerateSeasonEvents(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ seasonId: 's1', params: { generateRehearsals: true } });
    });

    expect(isOngeldigGemaakt(['seasons'])).toBe(true);
    expect(isOngeldigGemaakt(['seasons', 'detail', 's1'])).toBe(true);
    expect(isOngeldigGemaakt(['rehearsals'])).toBe(true);
    expect(isOngeldigGemaakt(['concerts'])).toBe(true);
  });

  it('laat de agenda ongemoeid als het genereren mislukt', async () => {
    alsMock(generateSeasonEvents).mockRejectedValue(serverfout('Seizoen heeft geen einddatum'));

    const { result } = renderHook(() => useGenerateSeasonEvents(), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync({ seasonId: 's1', params: {} })).rejects.toBeDefined();
    });

    expect(showError).toHaveBeenCalledWith('Seizoen heeft geen einddatum');
    expect(ongeldigGemaakt).toHaveLength(0);
  });
});
