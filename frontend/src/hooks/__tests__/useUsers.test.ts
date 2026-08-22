import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';

// Alleen de api-functies die useUsers importeert hoeven te bestaan.
vi.mock('../../api', () => ({
  getUsers: vi.fn(),
  getUsersPaginated: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  deleteUser: vi.fn(),
}));

vi.mock('../../utils/toast', () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}));

import {
  useUsers,
  useUsersPaginated,
  useUsersInfinite,
  useCreateUser,
  useUpdateUser,
  useDeleteUser,
} from '../useUsers';
import { getUsers, getUsersPaginated, createUser, updateUser, deleteUser } from '../../api';
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

describe('useUsers - ophalen', () => {
  it('geeft de filters ongewijzigd door aan de api', async () => {
    alsMock(getUsers).mockResolvedValue([]);
    const filters = { search: 'jansen', role: 'member', orchestraId: 'o1' };

    const { result } = renderHook(() => useUsers(filters), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getUsers).toHaveBeenCalledWith(filters);
  });

  it('haalt opnieuw op als er op een andere rol gefilterd wordt', async () => {
    // De filters horen in de queryKey; anders blijft de vorige selectie staan.
    alsMock(getUsers).mockResolvedValue([]);

    const { result, rerender } = renderHook(({ rol }: { rol: string }) => useUsers({ role: rol }), {
      wrapper,
      initialProps: { rol: 'member' },
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    rerender({ rol: 'admin' });

    await waitFor(() => expect(getUsers).toHaveBeenCalledTimes(2));
    expect(getUsers).toHaveBeenLastCalledWith({ role: 'admin' });
  });

  it('meldt een fout als de ledenlijst niet opgehaald kan worden', async () => {
    alsMock(getUsers).mockRejectedValue(serverfout('Database niet bereikbaar'));

    const { result } = renderHook(() => useUsers(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });

  it('houdt de volledige lijst en de gepagineerde lijst uit elkaar', async () => {
    // Beide beginnen met 'users'; alleen het tussenstuk 'paginated' scheidt ze.
    // Zouden ze samenvallen, dan kreeg het ene scherm het antwoordformaat van
    // het andere binnen: een array tegenover een object met een data-veld.
    alsMock(getUsers).mockResolvedValue([{ id: 'u1' }]);
    alsMock(getUsersPaginated).mockResolvedValue({ data: [{ id: 'u1' }], total: 1, page: 1, totalPages: 1 });

    const { result } = renderHook(() => ({ alles: useUsers(), pagina: useUsersPaginated({ page: 1 }) }), { wrapper });

    await waitFor(() => expect(result.current.alles.isSuccess).toBe(true));
    await waitFor(() => expect(result.current.pagina.isSuccess).toBe(true));
    expect(result.current.alles.data).toEqual([{ id: 'u1' }]);
    expect(result.current.pagina.data?.total).toBe(1);
  });

  it('haalt de volgende pagina op bij het doorbladeren', async () => {
    alsMock(getUsersPaginated).mockResolvedValue({ data: [], total: 50, page: 1, totalPages: 2 });

    const { result, rerender } = renderHook(({ page }: { page: number }) => useUsersPaginated({ page }), {
      wrapper,
      initialProps: { page: 1 },
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    rerender({ page: 2 });

    await waitFor(() => expect(getUsersPaginated).toHaveBeenCalledTimes(2));
    expect(getUsersPaginated).toHaveBeenLastCalledWith({ page: 2 });
  });
});

// ==================== ONEINDIG SCROLLEN ====================

describe('useUsers - oneindig scrollen', () => {
  it('begint bij pagina één en houdt de filters aan', async () => {
    alsMock(getUsersPaginated).mockResolvedValue({ data: [{ id: 'u1' }], total: 60, page: 1, totalPages: 3 });

    const { result } = renderHook(() => useUsersInfinite({ search: 'jansen' }), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getUsersPaginated).toHaveBeenCalledWith({ search: 'jansen', page: 1 });
  });

  it('biedt een volgende pagina aan zolang er nog pagina’s zijn', async () => {
    alsMock(getUsersPaginated).mockResolvedValue({ data: [{ id: 'u1' }], total: 60, page: 1, totalPages: 3 });

    const { result } = renderHook(() => useUsersInfinite(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.hasNextPage).toBe(true);
  });

  it('haalt bij doorscrollen de volgende pagina op en plakt hem achter de vorige', async () => {
    alsMock(getUsersPaginated).mockResolvedValue({ data: [{ id: 'u1' }], total: 4, page: 1, totalPages: 2 });

    const { result } = renderHook(() => useUsersInfinite(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    alsMock(getUsersPaginated).mockResolvedValue({ data: [{ id: 'u2' }], total: 4, page: 2, totalPages: 2 });
    await act(async () => {
      await result.current.fetchNextPage();
    });

    expect(getUsersPaginated).toHaveBeenLastCalledWith({ page: 2 });
    // De opgehaalde pagina's worden achter elkaar geplakt in dezelfde
    // cache-ingang; we lezen die rechtstreeks uit, zodat de test niet afhangt
    // van het moment waarop React opnieuw tekent.
    const opgeslagen = queryClient.getQueryData(['users', 'infinite', undefined]) as {
      pages: { data: { id: string }[] }[];
    };
    expect(opgeslagen.pages.map((p) => p.data)).toEqual([[{ id: 'u1' }], [{ id: 'u2' }]]);
  });

  it('stopt met doorscrollen op de laatste pagina', async () => {
    // Zonder deze grens blijft de lijst pagina 3 van 2 opvragen en groeit hij
    // eindeloos met lege blokken.
    alsMock(getUsersPaginated).mockResolvedValue({ data: [{ id: 'u1' }], total: 1, page: 1, totalPages: 1 });

    const { result } = renderHook(() => useUsersInfinite(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.hasNextPage).toBe(false);
  });
});

// ==================== LEDEN BEHEREN ====================

describe('useUsers - leden beheren', () => {
  it('stuurt het nieuwe lid door en vernieuwt de ledenlijst', async () => {
    alsMock(createUser).mockResolvedValue({ id: 'u9' });
    const nieuw = {
      email: 'jan@example.org',
      password: 'geheim',
      firstName: 'Jan',
      lastName: 'Jansen',
      orchestraIds: ['o1'],
    };

    const { result } = renderHook(() => useCreateUser(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(nieuw);
    });

    expect(createUser).toHaveBeenCalledWith(nieuw);
    // ['users'] dekt de volledige lijst, de gepagineerde lijst en het
    // oneindige scrollen in één keer.
    expect(isOngeldigGemaakt(['users'])).toBe(true);
    expect(showSuccess).toHaveBeenCalledWith('Lid aangemaakt');
  });

  it('vernieuwt na het aanmaken van een lid ook de orkesten', async () => {
    // createUser schrijft de gekozen orkesten weg in user_orchestras
    // (routes/users.ts: INSERT INTO user_orchestras). De orkestenlijst telt
    // daaruit memberCount, en het orkestdetail toont de namen van de leden.
    // Zonder deze invalidatie mist het nieuwe lid daar.
    alsMock(createUser).mockResolvedValue({ id: 'u9' });

    const { result } = renderHook(() => useCreateUser(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({
        email: 'jan@example.org',
        password: 'geheim',
        firstName: 'Jan',
        lastName: 'Jansen',
        orchestraIds: ['o1'],
      });
    });

    expect(isOngeldigGemaakt(['orchestras'])).toBe(true);
  });

  it('toont de foutmelding van de server als aanmaken mislukt', async () => {
    alsMock(createUser).mockRejectedValue(serverfout('E-mailadres is al in gebruik'));

    const { result } = renderHook(() => useCreateUser(), { wrapper });
    await act(async () => {
      await expect(
        result.current.mutateAsync({ email: 'jan@example.org', password: 'x', firstName: 'Jan', lastName: 'Jansen' }),
      ).rejects.toBeDefined();
    });

    expect(showError).toHaveBeenCalledWith('E-mailadres is al in gebruik');
    expect(showSuccess).not.toHaveBeenCalled();
    expect(ongeldigGemaakt).toHaveLength(0);
  });

  it('stuurt bij wijzigen id en velden gescheiden door', async () => {
    alsMock(updateUser).mockResolvedValue(undefined);

    const { result } = renderHook(() => useUpdateUser(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ id: 'u1', data: { role: 'board' } });
    });

    expect(updateUser).toHaveBeenCalledWith('u1', { role: 'board' });
    expect(isOngeldigGemaakt(['users'])).toBe(true);
    expect(showSuccess).toHaveBeenCalledWith('Lid bijgewerkt');
  });

  it('vernieuwt na het wijzigen van de orkesten van een lid ook de orkesten', async () => {
    // updateUser gooit user_orchestras leeg en vult hem opnieuw
    // (routes/users.ts: DELETE FROM user_orchestras ... INSERT INTO ...).
    alsMock(updateUser).mockResolvedValue(undefined);

    const { result } = renderHook(() => useUpdateUser(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ id: 'u1', data: { orchestraIds: ['o2'] } });
    });

    expect(isOngeldigGemaakt(['orchestras'])).toBe(true);
  });

  it('haalt de openstaande ledenlijst daadwerkelijk opnieuw op na een wijziging', async () => {
    alsMock(getUsers).mockResolvedValue([{ id: 'u1', firstName: 'Jan' }]);
    alsMock(updateUser).mockResolvedValue(undefined);

    const { result } = renderHook(() => ({ leden: useUsers(), wijzig: useUpdateUser() }), { wrapper });

    await waitFor(() => expect(result.current.leden.isSuccess).toBe(true));

    alsMock(getUsers).mockResolvedValue([{ id: 'u1', firstName: 'Johan' }]);
    await act(async () => {
      await result.current.wijzig.mutateAsync({ id: 'u1', data: { firstName: 'Johan' } });
    });

    await waitFor(() => expect(result.current.leden.data).toEqual([{ id: 'u1', firstName: 'Johan' }]));
  });

  it('verwijdert een lid en vernieuwt ledenlijst en orkesten', async () => {
    alsMock(deleteUser).mockResolvedValue(undefined);

    const { result } = renderHook(() => useDeleteUser(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync('u1');
    });

    expect(deleteUser).toHaveBeenCalledWith('u1');
    expect(isOngeldigGemaakt(['users'])).toBe(true);
    expect(isOngeldigGemaakt(['orchestras'])).toBe(true);
    expect(showSuccess).toHaveBeenCalledWith('Lid verwijderd');
  });

  it('meldt geen succes als verwijderen mislukt', async () => {
    alsMock(deleteUser).mockRejectedValue(serverfout('Je kunt jezelf niet verwijderen'));

    const { result } = renderHook(() => useDeleteUser(), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync('u1')).rejects.toBeDefined();
    });

    expect(showError).toHaveBeenCalledWith('Je kunt jezelf niet verwijderen');
    expect(showSuccess).not.toHaveBeenCalled();
    expect(ongeldigGemaakt).toHaveLength(0);
  });
});
