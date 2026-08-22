import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';

// Deze hook praat niet via losse api-functies maar rechtstreeks via de
// axios-client, dus we vervangen de client zelf. Zo kunnen we controleren
// welke url er precies wordt opgebouwd - daar zit de logica van deze hook.
vi.mock('../../api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

import {
  usePracticeSchedules,
  usePracticeSchedule,
  useCreatePracticeSchedule,
  useUpdatePracticeSchedule,
  useDeletePracticeSchedule,
  useAddMilestone,
  useUpdateMilestone,
  useDeleteMilestone,
  useUpdateSectionProgress,
  useInitializeSections,
} from '../usePracticeSchedules';
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
  // Standaardantwoorden; een test die iets anders nodig heeft overschrijft ze.
  get().mockResolvedValue({ data: [] });
  post().mockResolvedValue({ data: { id: 'nieuw' } });
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

// ==================== OVERZICHT ====================

describe('usePracticeSchedules - overzicht', () => {
  it('vraagt zonder filters de kale lijst op', async () => {
    const { result } = renderHook(() => usePracticeSchedules(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(get()).toHaveBeenCalledWith('/practice-schedules?');
  });

  it('zet de gekozen filters als queryparameters in de url', async () => {
    const { result } = renderHook(
      () => usePracticeSchedules({ orchestraId: 'o1', musicTitleId: 'm1', upcoming: true }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(get()).toHaveBeenCalledWith('/practice-schedules?orchestraId=o1&musicTitleId=m1&upcoming=true');
  });

  it('laat upcoming weg als het niet aangevinkt is', async () => {
    // De backend behandelt de enkele aanwezigheid van de parameter als "aan",
    // dus 'upcoming=false' meesturen zou juist alles wegfilteren.
    const { result } = renderHook(() => usePracticeSchedules({ orchestraId: 'o1', upcoming: false }), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(get()).toHaveBeenCalledWith('/practice-schedules?orchestraId=o1');
  });

  it('haalt opnieuw op als er een ander orkest gekozen wordt', async () => {
    // De filters horen in de queryKey; anders blijft de lijst van het vorige
    // orkest staan terwijl de gebruiker denkt te filteren.
    const { result, rerender } = renderHook(
      ({ orkest }: { orkest: string }) => usePracticeSchedules({ orchestraId: orkest }),
      { wrapper, initialProps: { orkest: 'o1' } },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    rerender({ orkest: 'o2' });

    await waitFor(() => expect(get()).toHaveBeenCalledTimes(2));
    expect(get()).toHaveBeenLastCalledWith('/practice-schedules?orchestraId=o2');
  });

  it('geeft de lijst uit het serverantwoord terug, niet het hele antwoord', async () => {
    get().mockResolvedValue({ data: [{ id: 's1', progress: 40 }] });

    const { result } = renderHook(() => usePracticeSchedules(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: 's1', progress: 40 }]);
  });

  it('meldt een fout als het overzicht niet opgehaald kan worden', async () => {
    get().mockRejectedValue(new Error('Netwerkfout'));

    const { result } = renderHook(() => usePracticeSchedules(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });
});

// ==================== DETAIL ====================

describe('usePracticeSchedules - detail', () => {
  it('vraagt geen detail op zolang er geen id is', () => {
    const { result } = renderHook(() => usePracticeSchedule(''), { wrapper });

    expect(get()).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('haalt het detail op zodra het id bekend is', async () => {
    get().mockResolvedValue({ data: { id: 's1', milestones: [] } });

    const { result } = renderHook(() => usePracticeSchedule('s1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(get()).toHaveBeenCalledWith('/practice-schedules/s1');
    expect(result.current.data).toEqual({ id: 's1', milestones: [] });
  });

  it('houdt het detail en het overzicht uit elkaar in de cache', async () => {
    // De sleutels 'practice-schedule' en 'practice-schedules' schelen één
    // letter. Deze test legt vast dat het twee losse queries zijn: een
    // verwarring hiertussen zou betekenen dat het detail het overzicht
    // overschrijft of andersom.
    get().mockImplementation((url: string) =>
      url === '/practice-schedules/s1'
        ? Promise.resolve({ data: { id: 's1', milestones: [] } })
        : Promise.resolve({ data: [{ id: 's1' }] }),
    );

    const { result } = renderHook(() => ({ lijst: usePracticeSchedules(), detail: usePracticeSchedule('s1') }), {
      wrapper,
    });

    await waitFor(() => expect(result.current.lijst.isSuccess).toBe(true));
    await waitFor(() => expect(result.current.detail.isSuccess).toBe(true));
    expect(result.current.lijst.data).toEqual([{ id: 's1' }]);
    expect(result.current.detail.data).toEqual({ id: 's1', milestones: [] });
  });
});

// ==================== SCHEMA AANMAKEN, WIJZIGEN, VERWIJDEREN ====================

describe('usePracticeSchedules - schema beheren', () => {
  it('stuurt het nieuwe schema door en vernieuwt het overzicht', async () => {
    const nieuw = {
      musicTitleId: 'm1',
      orchestraId: 'o1',
      targetDate: '2024-12-01',
      milestones: [{ title: 'Noten kennen', targetDate: '2024-10-01' }],
    };

    const { result } = renderHook(() => useCreatePracticeSchedule(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(nieuw);
    });

    expect(post()).toHaveBeenCalledWith('/practice-schedules', nieuw);
    expect(isOngeldigGemaakt(['practice-schedules'])).toBe(true);
  });

  it('haalt het schema-overzicht daadwerkelijk opnieuw op na het aanmaken', async () => {
    get().mockResolvedValue({ data: [] });

    const { result } = renderHook(() => ({ lijst: usePracticeSchedules(), maak: useCreatePracticeSchedule() }), {
      wrapper,
    });

    await waitFor(() => expect(result.current.lijst.isSuccess).toBe(true));

    get().mockResolvedValue({ data: [{ id: 's9' }] });
    await act(async () => {
      await result.current.maak.mutateAsync({ musicTitleId: 'm1', orchestraId: 'o1', targetDate: '2024-12-01' });
    });

    await waitFor(() => expect(result.current.lijst.data).toEqual([{ id: 's9' }]));
  });

  it('haalt het id uit de gegevens en stuurt de rest als body mee', async () => {
    const { result } = renderHook(() => useUpdatePracticeSchedule(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ id: 's1', priority: 2, notes: 'Voorrang' });
    });

    // Het id hoort in de url, niet in de body.
    expect(patch()).toHaveBeenCalledWith('/practice-schedules/s1', { priority: 2, notes: 'Voorrang' });
  });

  it('vernieuwt na een wijziging zowel het overzicht als de open detailweergave', async () => {
    const { result } = renderHook(() => useUpdatePracticeSchedule(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ id: 's1', priority: 2 });
    });

    expect(isOngeldigGemaakt(['practice-schedules'])).toBe(true);
    expect(isOngeldigGemaakt(['practice-schedule'])).toBe(true);
  });

  it('laat de cache met rust als het wijzigen mislukt', async () => {
    patch().mockRejectedValue(new Error('Datum ligt in het verleden'));

    const { result } = renderHook(() => useUpdatePracticeSchedule(), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync({ id: 's1', priority: 2 })).rejects.toThrow('Datum ligt in het verleden');
    });

    expect(ongeldigGemaakt).toHaveLength(0);
  });

  it('verwijdert een schema en vernieuwt het overzicht', async () => {
    const { result } = renderHook(() => useDeletePracticeSchedule(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync('s1');
    });

    expect(del()).toHaveBeenCalledWith('/practice-schedules/s1');
    expect(isOngeldigGemaakt(['practice-schedules'])).toBe(true);
  });
});

// ==================== MIJLPALEN ====================

describe('usePracticeSchedules - mijlpalen', () => {
  it('voegt een mijlpaal toe onder het juiste schema', async () => {
    const { result } = renderHook(() => useAddMilestone(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ scheduleId: 's1', title: 'Samenspel', targetDate: '2024-11-01' });
    });

    // Het schema-id hoort in de url, de rest in de body.
    expect(post()).toHaveBeenCalledWith('/practice-schedules/s1/milestones', {
      title: 'Samenspel',
      targetDate: '2024-11-01',
    });
    expect(isOngeldigGemaakt(['practice-schedule'])).toBe(true);
    // Het overzicht toont het aantal mijlpalen en de voortgang, dus die moet mee.
    expect(isOngeldigGemaakt(['practice-schedules'])).toBe(true);
  });

  it('wijzigt een mijlpaal via het mijlpaal-id, zonder schema in de url', async () => {
    const { result } = renderHook(() => useUpdateMilestone(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ milestoneId: 'mp1', isCompleted: true });
    });

    expect(patch()).toHaveBeenCalledWith('/practice-schedules/milestones/mp1', { isCompleted: true });
  });

  it('vernieuwt na het afvinken van een mijlpaal ook het overzicht', async () => {
    // Het overzicht rekent de voortgang uit als afgevinkte mijlpalen gedeeld
    // door het totaal. Zonder deze invalidatie blijft de voortgangsbalk op de
    // overzichtspagina op het oude percentage staan.
    const { result } = renderHook(() => useUpdateMilestone(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ milestoneId: 'mp1', isCompleted: true });
    });

    expect(isOngeldigGemaakt(['practice-schedules'])).toBe(true);
    expect(isOngeldigGemaakt(['practice-schedule'])).toBe(true);
  });

  it('verwijdert een mijlpaal en vernieuwt detail en overzicht', async () => {
    const { result } = renderHook(() => useDeleteMilestone(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync('mp1');
    });

    expect(del()).toHaveBeenCalledWith('/practice-schedules/milestones/mp1');
    expect(isOngeldigGemaakt(['practice-schedule'])).toBe(true);
    expect(isOngeldigGemaakt(['practice-schedules'])).toBe(true);
  });

  it('raakt de cache niet aan als een mijlpaal niet toegevoegd kan worden', async () => {
    post().mockRejectedValue(new Error('Titel is verplicht'));

    const { result } = renderHook(() => useAddMilestone(), { wrapper });
    await act(async () => {
      await expect(
        result.current.mutateAsync({ scheduleId: 's1', title: '', targetDate: '2024-11-01' }),
      ).rejects.toThrow('Titel is verplicht');
    });

    expect(ongeldigGemaakt).toHaveLength(0);
  });
});

// ==================== VOORTGANG PER SECTIE ====================

describe('usePracticeSchedules - voortgang per sectie', () => {
  it('stuurt instrument, status en notitie mee bij het bijwerken van een sectie', async () => {
    const { result } = renderHook(() => useUpdateSectionProgress(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({
        milestoneId: 'mp1',
        instrumentId: 'i1',
        status: 'in_progress',
        notes: 'Maat 40 blijft lastig',
      });
    });

    expect(post()).toHaveBeenCalledWith('/practice-schedules/milestones/mp1/section-progress', {
      instrumentId: 'i1',
      status: 'in_progress',
      notes: 'Maat 40 blijft lastig',
    });
  });

  it('vernieuwt alleen de detailweergave bij sectievoortgang', async () => {
    // Bewust alleen het detail: de backend vinkt bij sectievoortgang geen
    // mijlpaal af, dus de voortgang in het overzicht (afgevinkte mijlpalen
    // gedeeld door totaal) verandert niet. Het overzicht meevernieuwen zou
    // alleen extra netwerkverkeer opleveren bij elke klik.
    const { result } = renderHook(() => useUpdateSectionProgress(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ milestoneId: 'mp1', instrumentId: 'i1', status: 'completed' });
    });

    expect(ongeldigGemaakt).toEqual([['practice-schedule']]);
  });

  it('zet de secties klaar voor een schema en vernieuwt de detailweergave', async () => {
    const { result } = renderHook(() => useInitializeSections(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync('s1');
    });

    expect(post()).toHaveBeenCalledWith('/practice-schedules/s1/initialize-sections');
    expect(isOngeldigGemaakt(['practice-schedule'])).toBe(true);
  });

  it('haalt de open detailweergave daadwerkelijk opnieuw op na sectievoortgang', async () => {
    get().mockResolvedValue({ data: { id: 's1', milestones: [{ id: 'mp1', sectionsCompleted: 0 }] } });

    const { result } = renderHook(
      () => ({ detail: usePracticeSchedule('s1'), voortgang: useUpdateSectionProgress() }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.detail.isSuccess).toBe(true));

    get().mockResolvedValue({ data: { id: 's1', milestones: [{ id: 'mp1', sectionsCompleted: 1 }] } });
    await act(async () => {
      await result.current.voortgang.mutateAsync({ milestoneId: 'mp1', instrumentId: 'i1', status: 'completed' });
    });

    await waitFor(() =>
      expect(result.current.detail.data).toEqual({ id: 's1', milestones: [{ id: 'mp1', sectionsCompleted: 1 }] }),
    );
  });
});
