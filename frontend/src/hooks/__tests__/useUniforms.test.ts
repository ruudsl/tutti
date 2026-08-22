import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';

// Alleen de api-functies die useUniforms importeert hoeven te bestaan.
vi.mock('../../api', () => ({
  getUniformItems: vi.fn(),
  getUniformItem: vi.fn(),
  getUniformItemTypes: vi.fn(),
  getUniformAvailabilityBySize: vi.fn(),
  searchUniformsBySize: vi.fn(),
  createUniformItem: vi.fn(),
  createUniformItemsBulk: vi.fn(),
  updateUniformItem: vi.fn(),
  deleteUniformItem: vi.fn(),
  assignUniformItem: vi.fn(),
  returnUniformItem: vi.fn(),
  getUniformSets: vi.fn(),
  getUniformSet: vi.fn(),
  createUniformSet: vi.fn(),
  updateUniformSet: vi.fn(),
  deleteUniformSet: vi.fn(),
  getUserUniforms: vi.fn(),
}));

vi.mock('../../utils/toast', () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}));

import {
  useUniformItemTypes,
  useUniformItems,
  useUniformItem,
  useUniformAvailabilityBySize,
  useSearchUniformsBySize,
  useUserUniforms,
  useCreateUniformItem,
  useCreateUniformItemsBulk,
  useUpdateUniformItem,
  useDeleteUniformItem,
  useAssignUniformItem,
  useReturnUniformItem,
  useUniformSets,
  useUniformSet,
  useCreateUniformSet,
  useUpdateUniformSet,
  useDeleteUniformSet,
} from '../useUniforms';
import {
  getUniformItems,
  getUniformItem,
  getUniformItemTypes,
  getUniformAvailabilityBySize,
  searchUniformsBySize,
  createUniformItem,
  createUniformItemsBulk,
  updateUniformItem,
  deleteUniformItem,
  assignUniformItem,
  returnUniformItem,
  getUniformSets,
  getUniformSet,
  createUniformSet,
  updateUniformSet,
  deleteUniformSet,
  getUserUniforms,
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

// ==================== ONDERDELEN OPHALEN ====================

describe('useUniforms - onderdelen ophalen', () => {
  it('haalt de soorten onderdelen op', async () => {
    alsMock(getUniformItemTypes).mockResolvedValue([{ value: 'jacket', label: 'Jas' }]);

    const { result } = renderHook(() => useUniformItemTypes(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ value: 'jacket', label: 'Jas' }]);
  });

  it('geeft de filters ongewijzigd door aan de api', async () => {
    alsMock(getUniformItems).mockResolvedValue([]);
    const filters = { search: 'jas', status: 'available', itemType: 'jacket', size: '52' };

    const { result } = renderHook(() => useUniformItems(filters), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getUniformItems).toHaveBeenCalledWith(filters);
  });

  it('haalt opnieuw op als het filter verandert', async () => {
    // De filters horen in de queryKey; anders krijgt de gebruiker bij een
    // ander filter gewoon de vorige lijst te zien.
    alsMock(getUniformItems).mockResolvedValue([]);

    const { result, rerender } = renderHook(({ status }: { status: string }) => useUniformItems({ status }), {
      wrapper,
      initialProps: { status: 'available' },
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    rerender({ status: 'assigned' });

    await waitFor(() => expect(getUniformItems).toHaveBeenCalledTimes(2));
    expect(getUniformItems).toHaveBeenLastCalledWith({ status: 'assigned' });
  });

  it('vraagt geen onderdeeldetail op zolang er geen id is', () => {
    const { result } = renderHook(() => useUniformItem(''), { wrapper });

    expect(getUniformItem).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('haalt het onderdeeldetail op zodra het id bekend is', async () => {
    alsMock(getUniformItem).mockResolvedValue({ id: 'i1', itemType: 'jacket' });

    const { result } = renderHook(() => useUniformItem('i1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getUniformItem).toHaveBeenCalledWith('i1');
  });

  it('haalt de beschikbaarheid per maat op, ook zonder soortfilter', async () => {
    alsMock(getUniformAvailabilityBySize).mockResolvedValue([{ size: '52', available: 3 }]);

    const { result } = renderHook(() => useUniformAvailabilityBySize(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getUniformAvailabilityBySize).toHaveBeenCalledWith(undefined);
  });

  it('haalt de beschikbaarheid opnieuw op voor een andere soort', async () => {
    alsMock(getUniformAvailabilityBySize).mockResolvedValue([]);

    const { result, rerender } = renderHook(
      ({ soort }: { soort: string | undefined }) => useUniformAvailabilityBySize(soort),
      { wrapper, initialProps: { soort: undefined as string | undefined } },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    rerender({ soort: 'trousers' });

    await waitFor(() => expect(getUniformAvailabilityBySize).toHaveBeenCalledTimes(2));
    expect(getUniformAvailabilityBySize).toHaveBeenLastCalledWith('trousers');
  });

  it('zoekt pas op maat als er een maat is ingevuld', async () => {
    const { result, rerender } = renderHook(({ maat }: { maat: string }) => useSearchUniformsBySize(maat, 'jacket'), {
      wrapper,
      initialProps: { maat: '' },
    });

    expect(searchUniformsBySize).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');

    alsMock(searchUniformsBySize).mockResolvedValue([]);
    rerender({ maat: '52' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(searchUniformsBySize).toHaveBeenCalledWith('52', 'jacket');
  });

  it('vraagt de uniformen van een lid pas op als het lid bekend is', async () => {
    const { result, rerender } = renderHook(({ id }: { id: string }) => useUserUniforms(id), {
      wrapper,
      initialProps: { id: '' },
    });

    expect(getUserUniforms).not.toHaveBeenCalled();

    alsMock(getUserUniforms).mockResolvedValue([]);
    rerender({ id: 'u1' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getUserUniforms).toHaveBeenCalledWith('u1');
  });
});

// ==================== ONDERDELEN BEHEREN ====================

describe('useUniforms - onderdelen beheren', () => {
  it('voegt een onderdeel toe en vernieuwt lijst en beschikbaarheid', async () => {
    alsMock(createUniformItem).mockResolvedValue({ id: 'i9' });
    const nieuw = { itemType: 'jacket', sizeStandard: '52' };

    const { result } = renderHook(() => useCreateUniformItem(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(nieuw);
    });

    expect(eersteArgument(createUniformItem)).toEqual(nieuw);
    expect(isOngeldigGemaakt(['uniforms', 'items'])).toBe(true);
    // De beschikbaarheid per maat staat op hetzelfde scherm en telt dit
    // onderdeel meteen mee.
    expect(isOngeldigGemaakt(['uniforms', 'availability'])).toBe(true);
    expect(showSuccess).toHaveBeenCalledWith('Onderdeel toegevoegd');
  });

  it('noemt in de melding hoeveel onderdelen er in bulk zijn toegevoegd', async () => {
    // Het aantal komt uit het serverantwoord, niet uit het formulier.
    alsMock(createUniformItemsBulk).mockResolvedValue({ ids: ['i1', 'i2', 'i3'], count: 3 });

    const { result } = renderHook(() => useCreateUniformItemsBulk(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ itemType: 'jacket', count: 3 });
    });

    expect(showSuccess).toHaveBeenCalledWith('3 onderdelen toegevoegd');
    expect(isOngeldigGemaakt(['uniforms', 'items'])).toBe(true);
    expect(isOngeldigGemaakt(['uniforms', 'availability'])).toBe(true);
  });

  it('toont de foutmelding van de server als toevoegen mislukt', async () => {
    alsMock(createUniformItem).mockRejectedValue(serverfout('Maat is verplicht'));

    const { result } = renderHook(() => useCreateUniformItem(), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync({ itemType: 'jacket' })).rejects.toBeDefined();
    });

    expect(showError).toHaveBeenCalledWith('Maat is verplicht');
    expect(showSuccess).not.toHaveBeenCalled();
    expect(ongeldigGemaakt).toHaveLength(0);
  });

  it('stuurt bij wijzigen id en velden gescheiden door', async () => {
    alsMock(updateUniformItem).mockResolvedValue(undefined);

    const { result } = renderHook(() => useUpdateUniformItem(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ id: 'i1', data: { condition: 'poor' } });
    });

    expect(updateUniformItem).toHaveBeenCalledWith('i1', { condition: 'poor' });
    expect(isOngeldigGemaakt(['uniforms', 'items'])).toBe(true);
    expect(isOngeldigGemaakt(['uniforms', 'items', 'i1'])).toBe(true);
    expect(isOngeldigGemaakt(['uniforms', 'availability'])).toBe(true);
    expect(showSuccess).toHaveBeenCalledWith('Onderdeel bijgewerkt');
  });

  it('vernieuwt na het wijzigen van een onderdeel ook de uniformen van de leden', async () => {
    // GET /uniforms/user/:userId geeft de velden van het onderdeel zelf terug
    // (maat, kleur, staat, notities). Precies die velden wijzigt deze mutatie.
    // Zonder invalidatie van ['uniforms','user'] blijft op de pagina van het
    // lid de oude maat staan - vijf minuten lang, want dat is de staleTime
    // uit lib/queryClient.ts. Vergelijk useAssignUniformItem, die dit wel doet.
    alsMock(updateUniformItem).mockResolvedValue(undefined);

    const { result } = renderHook(() => useUpdateUniformItem(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ id: 'i1', data: { sizeStandard: '54' } });
    });

    expect(isOngeldigGemaakt(['uniforms', 'user'])).toBe(true);
  });

  it('verwijdert een onderdeel en vernieuwt lijst en beschikbaarheid', async () => {
    alsMock(deleteUniformItem).mockResolvedValue(undefined);

    const { result } = renderHook(() => useDeleteUniformItem(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync('i1');
    });

    expect(eersteArgument(deleteUniformItem)).toBe('i1');
    expect(isOngeldigGemaakt(['uniforms', 'items'])).toBe(true);
    expect(isOngeldigGemaakt(['uniforms', 'availability'])).toBe(true);
    expect(showSuccess).toHaveBeenCalledWith('Onderdeel verwijderd');
  });

  it('vernieuwt na het verwijderen van een onderdeel ook de uniformen van de leden', async () => {
    // Een verwijderd onderdeel verdwijnt uit uniform_items en dus ook uit de
    // lijst van het lid dat het in bruikleen had. Zonder invalidatie blijft
    // het bij dat lid in beeld staan.
    alsMock(deleteUniformItem).mockResolvedValue(undefined);

    const { result } = renderHook(() => useDeleteUniformItem(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync('i1');
    });

    expect(isOngeldigGemaakt(['uniforms', 'user'])).toBe(true);
  });

  it('laat de cache met rust als verwijderen mislukt', async () => {
    alsMock(deleteUniformItem).mockRejectedValue(serverfout('Uniform onderdeel niet gevonden.'));

    const { result } = renderHook(() => useDeleteUniformItem(), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync('i1')).rejects.toBeDefined();
    });

    expect(showError).toHaveBeenCalledWith('Uniform onderdeel niet gevonden.');
    expect(ongeldigGemaakt).toHaveLength(0);
  });
});

// ==================== UITGEVEN EN INNEMEN ====================

describe('useUniforms - uitgeven en innemen', () => {
  it('geeft een onderdeel uit aan een lid en vernieuwt alle vier de lijsten', async () => {
    alsMock(assignUniformItem).mockResolvedValue({ id: 'a1' });
    const uitgifte = { userId: 'u1', assignedDate: '2024-03-01', conditionAtAssignment: 'good' };

    const { result } = renderHook(() => useAssignUniformItem(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ itemId: 'i1', assignment: uitgifte });
    });

    expect(assignUniformItem).toHaveBeenCalledWith('i1', uitgifte);
    expect(isOngeldigGemaakt(['uniforms', 'items'])).toBe(true);
    expect(isOngeldigGemaakt(['uniforms', 'items', 'i1'])).toBe(true);
    expect(isOngeldigGemaakt(['uniforms', 'availability'])).toBe(true);
    // Zonder voorvoegsel-id: het onderdeel verandert van eigenaar, dus de
    // lijst van elk lid kan geraakt zijn.
    expect(isOngeldigGemaakt(['uniforms', 'user'])).toBe(true);
    expect(showSuccess).toHaveBeenCalledWith('Onderdeel uitgegeven');
  });

  it('neemt een onderdeel in met datum en staat bij teruggave', async () => {
    alsMock(returnUniformItem).mockResolvedValue(undefined);
    const teruggave = { returnedDate: '2024-09-01', conditionAtReturn: 'fair' };

    const { result } = renderHook(() => useReturnUniformItem(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ itemId: 'i1', returnData: teruggave });
    });

    expect(returnUniformItem).toHaveBeenCalledWith('i1', teruggave);
    expect(isOngeldigGemaakt(['uniforms', 'items'])).toBe(true);
    expect(isOngeldigGemaakt(['uniforms', 'items', 'i1'])).toBe(true);
    expect(isOngeldigGemaakt(['uniforms', 'availability'])).toBe(true);
    expect(isOngeldigGemaakt(['uniforms', 'user'])).toBe(true);
    expect(showSuccess).toHaveBeenCalledWith('Onderdeel teruggebracht');
  });

  it('haalt de uniformen van het lid daadwerkelijk opnieuw op na een uitgifte', async () => {
    // De kern: de pagina van het lid moet het zojuist uitgegeven onderdeel
    // ook echt tonen, niet alleen "ongeldig verklaard" zijn.
    alsMock(getUserUniforms).mockResolvedValue([]);
    alsMock(assignUniformItem).mockResolvedValue({ id: 'a1' });

    const { result } = renderHook(() => ({ lijst: useUserUniforms('u1'), uitgifte: useAssignUniformItem() }), {
      wrapper,
    });

    await waitFor(() => expect(result.current.lijst.isSuccess).toBe(true));

    alsMock(getUserUniforms).mockResolvedValue([{ id: 'i1', itemType: 'jacket' }]);
    await act(async () => {
      await result.current.uitgifte.mutateAsync({
        itemId: 'i1',
        assignment: { userId: 'u1', assignedDate: '2024-03-01' },
      });
    });

    await waitFor(() => expect(result.current.lijst.data).toEqual([{ id: 'i1', itemType: 'jacket' }]));
  });

  it('meldt geen succes als het uitgeven mislukt', async () => {
    alsMock(assignUniformItem).mockRejectedValue(serverfout('Onderdeel is al uitgegeven'));

    const { result } = renderHook(() => useAssignUniformItem(), { wrapper });
    await act(async () => {
      await expect(
        result.current.mutateAsync({
          itemId: 'i1',
          assignment: { userId: 'u1', assignedDate: '2024-03-01' },
        }),
      ).rejects.toBeDefined();
    });

    expect(showError).toHaveBeenCalledWith('Onderdeel is al uitgegeven');
    expect(showSuccess).not.toHaveBeenCalled();
    expect(ongeldigGemaakt).toHaveLength(0);
  });
});

// ==================== SETS ====================

describe('useUniforms - sets', () => {
  it('haalt de sets op', async () => {
    alsMock(getUniformSets).mockResolvedValue([{ id: 's1', name: 'Gala' }]);

    const { result } = renderHook(() => useUniformSets(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: 's1', name: 'Gala' }]);
  });

  it('vraagt geen setdetail op zolang er geen id is', () => {
    const { result } = renderHook(() => useUniformSet(''), { wrapper });

    expect(getUniformSet).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('haalt het setdetail op zodra het id bekend is', async () => {
    alsMock(getUniformSet).mockResolvedValue({ id: 's1', requirements: [] });

    const { result } = renderHook(() => useUniformSet('s1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getUniformSet).toHaveBeenCalledWith('s1');
  });

  it('maakt een set aan en vernieuwt de setlijst', async () => {
    alsMock(createUniformSet).mockResolvedValue({ id: 's9' });
    const set = { name: 'Zomertenue', requirements: [{ itemType: 'jacket', quantity: 1 }] };

    const { result } = renderHook(() => useCreateUniformSet(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(set);
    });

    expect(eersteArgument(createUniformSet)).toEqual(set);
    expect(isOngeldigGemaakt(['uniforms', 'sets'])).toBe(true);
    expect(showSuccess).toHaveBeenCalledWith('Set aangemaakt');
  });

  it('wijzigt een set en vernieuwt de setlijst en het setdetail', async () => {
    alsMock(updateUniformSet).mockResolvedValue(undefined);

    const { result } = renderHook(() => useUpdateUniformSet(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ id: 's1', data: { name: 'Wintertenue' } });
    });

    expect(updateUniformSet).toHaveBeenCalledWith('s1', { name: 'Wintertenue' });
    expect(isOngeldigGemaakt(['uniforms', 'sets'])).toBe(true);
    expect(isOngeldigGemaakt(['uniforms', 'sets', 's1'])).toBe(true);
    expect(showSuccess).toHaveBeenCalledWith('Set bijgewerkt');
  });

  it('verwijdert een set en vernieuwt de setlijst', async () => {
    alsMock(deleteUniformSet).mockResolvedValue(undefined);

    const { result } = renderHook(() => useDeleteUniformSet(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync('s1');
    });

    expect(eersteArgument(deleteUniformSet)).toBe('s1');
    expect(isOngeldigGemaakt(['uniforms', 'sets'])).toBe(true);
    expect(showSuccess).toHaveBeenCalledWith('Set verwijderd');
  });

  it('toont een foutmelding als een set niet verwijderd kan worden', async () => {
    alsMock(deleteUniformSet).mockRejectedValue(serverfout('Set is nog in gebruik'));

    const { result } = renderHook(() => useDeleteUniformSet(), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync('s1')).rejects.toBeDefined();
    });

    expect(showError).toHaveBeenCalledWith('Set is nog in gebruik');
    expect(ongeldigGemaakt).toHaveLength(0);
  });
});
