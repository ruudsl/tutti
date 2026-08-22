import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';

// Alleen de api-functies die useOrchestras importeert hoeven te bestaan.
vi.mock('../../api', () => ({
  getOrchestras: vi.fn(),
  createOrchestra: vi.fn(),
  updateOrchestra: vi.fn(),
  deleteOrchestra: vi.fn(),
}));

vi.mock('../../utils/toast', () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}));

import { useOrchestras, useCreateOrchestra, useUpdateOrchestra, useDeleteOrchestra } from '../useOrchestras';
import { getOrchestras, createOrchestra, updateOrchestra, deleteOrchestra } from '../../api';
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

describe('useOrchestras - ophalen', () => {
  it('haalt de orkestenlijst op', async () => {
    alsMock(getOrchestras).mockResolvedValue([{ id: 'o1', name: 'Harmonie', memberCount: 42 }]);

    const { result } = renderHook(() => useOrchestras(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: 'o1', name: 'Harmonie', memberCount: 42 }]);
  });

  it('haalt de lijst opnieuw op bij elk nieuw scherm', async () => {
    // staleTime 0 met refetchOnMount 'always': de orkesten sturen de
    // rechtenweergave en de keuzelijsten op vrijwel elk scherm aan, dus ze
    // mogen nooit uit een oude cache komen. Een nieuw scherm dat de hook
    // aanroept moet dus echt opnieuw ophalen.
    alsMock(getOrchestras).mockResolvedValue([]);

    const eerste = renderHook(() => useOrchestras(), { wrapper });
    await waitFor(() => expect(eerste.result.current.isSuccess).toBe(true));
    expect(getOrchestras).toHaveBeenCalledTimes(1);

    const tweede = renderHook(() => useOrchestras(), { wrapper });
    await waitFor(() => expect(tweede.result.current.isSuccess).toBe(true));
    expect(getOrchestras).toHaveBeenCalledTimes(2);
  });

  it('meldt een fout als de orkesten niet opgehaald kunnen worden', async () => {
    alsMock(getOrchestras).mockRejectedValue(serverfout('Database niet bereikbaar'));

    const { result } = renderHook(() => useOrchestras(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });
});

// ==================== BEHEREN ====================

describe('useOrchestras - beheren', () => {
  it('maakt een orkest aan met alleen de naam en vernieuwt de orkesten', async () => {
    alsMock(createOrchestra).mockResolvedValue({ id: 'o9' });

    const { result } = renderHook(() => useCreateOrchestra(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync('Jeugdorkest');
    });

    expect(createOrchestra).toHaveBeenCalledWith('Jeugdorkest');
    expect(isOngeldigGemaakt(['orchestras'])).toBe(true);
    expect(showSuccess).toHaveBeenCalledWith('Orkest aangemaakt');
  });

  it('vernieuwt bij het aanmaken alleen de orkesten', async () => {
    // Een nieuw orkest heeft nog geen leden en geen muzieklijsten, dus er is
    // niets anders dat verouderd kan zijn.
    alsMock(createOrchestra).mockResolvedValue({ id: 'o9' });

    const { result } = renderHook(() => useCreateOrchestra(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync('Jeugdorkest');
    });

    expect(ongeldigGemaakt).toEqual([['orchestras']]);
  });

  it('toont de foutmelding van de server als aanmaken mislukt', async () => {
    alsMock(createOrchestra).mockRejectedValue(serverfout('Er bestaat al een orkest met die naam'));

    const { result } = renderHook(() => useCreateOrchestra(), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync('Harmonie')).rejects.toBeDefined();
    });

    expect(showError).toHaveBeenCalledWith('Er bestaat al een orkest met die naam');
    expect(showSuccess).not.toHaveBeenCalled();
    expect(ongeldigGemaakt).toHaveLength(0);
  });

  it('hernoemt een orkest met id en naam als losse argumenten', async () => {
    alsMock(updateOrchestra).mockResolvedValue(undefined);

    const { result } = renderHook(() => useUpdateOrchestra(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ id: 'o1', name: 'Harmonieorkest' });
    });

    expect(updateOrchestra).toHaveBeenCalledWith('o1', 'Harmonieorkest');
    expect(isOngeldigGemaakt(['orchestras'])).toBe(true);
    expect(showSuccess).toHaveBeenCalledWith('Orkest bijgewerkt');
  });

  it('vernieuwt na een hernoeming ook de muzieklijsten en de leden', async () => {
    // De muzieklijsten dragen orchestraName mee en de ledenlijst toont per
    // lid bij welke orkesten hij speelt (routes/users.ts joint op
    // user_orchestras). Zonder deze invalidaties staat daar nog de oude naam.
    alsMock(updateOrchestra).mockResolvedValue(undefined);

    const { result } = renderHook(() => useUpdateOrchestra(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ id: 'o1', name: 'Harmonieorkest' });
    });

    expect(isOngeldigGemaakt(['musicLists'])).toBe(true);
    expect(isOngeldigGemaakt(['users'])).toBe(true);
  });

  it('verwijdert een orkest en vernieuwt de orkesten', async () => {
    alsMock(deleteOrchestra).mockResolvedValue(undefined);

    const { result } = renderHook(() => useDeleteOrchestra(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync('o1');
    });

    expect(deleteOrchestra).toHaveBeenCalledWith('o1');
    expect(isOngeldigGemaakt(['orchestras'])).toBe(true);
    expect(showSuccess).toHaveBeenCalledWith('Orkest verwijderd');
  });

  it('vernieuwt na het verwijderen ook de muzieklijsten en de leden', async () => {
    // music_lists.orchestra_id en user_orchestras.orchestra_id verwijzen naar
    // orchestras met ON DELETE CASCADE (database/schema.ts). Met het orkest
    // verdwijnen dus al zijn muzieklijsten, en alle leden verliezen dat
    // orkest. Zonder invalidatie blijven die lijsten in beeld staan.
    alsMock(deleteOrchestra).mockResolvedValue(undefined);

    const { result } = renderHook(() => useDeleteOrchestra(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync('o1');
    });

    expect(isOngeldigGemaakt(['musicLists'])).toBe(true);
    expect(isOngeldigGemaakt(['users'])).toBe(true);
  });

  it('meldt geen succes als verwijderen mislukt', async () => {
    alsMock(deleteOrchestra).mockRejectedValue(serverfout('Orkest niet gevonden.'));

    const { result } = renderHook(() => useDeleteOrchestra(), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync('o1')).rejects.toBeDefined();
    });

    expect(showError).toHaveBeenCalledWith('Orkest niet gevonden.');
    expect(showSuccess).not.toHaveBeenCalled();
    expect(ongeldigGemaakt).toHaveLength(0);
  });

  it('haalt de openstaande orkestenlijst daadwerkelijk opnieuw op na een hernoeming', async () => {
    alsMock(getOrchestras).mockResolvedValue([{ id: 'o1', name: 'Harmonie' }]);
    alsMock(updateOrchestra).mockResolvedValue(undefined);

    const { result } = renderHook(() => ({ lijst: useOrchestras(), wijzig: useUpdateOrchestra() }), { wrapper });

    await waitFor(() => expect(result.current.lijst.isSuccess).toBe(true));

    alsMock(getOrchestras).mockResolvedValue([{ id: 'o1', name: 'Harmonieorkest' }]);
    await act(async () => {
      await result.current.wijzig.mutateAsync({ id: 'o1', name: 'Harmonieorkest' });
    });

    await waitFor(() => expect(result.current.lijst.data).toEqual([{ id: 'o1', name: 'Harmonieorkest' }]));
  });
});
