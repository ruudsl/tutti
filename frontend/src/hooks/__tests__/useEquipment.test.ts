import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';

// Alleen de api-functies die useEquipment importeert hoeven te bestaan.
vi.mock('../../api', () => ({
  getEquipment: vi.fn(),
  getEquipmentItem: vi.fn(),
  getEquipmentTypes: vi.fn(),
  getEquipmentDamageLogs: vi.fn(),
  createEquipment: vi.fn(),
  updateEquipment: vi.fn(),
  deleteEquipment: vi.fn(),
  addEquipmentDamageLog: vi.fn(),
  updateEquipmentDamageLog: vi.fn(),
  deleteEquipmentDamageLog: vi.fn(),
  createEquipmentLoan: vi.fn(),
  returnEquipmentLoan: vi.fn(),
  recordEquipmentMaintenance: vi.fn(),
}));

vi.mock('../../utils/toast', () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}));

import {
  useEquipmentTypes,
  useEquipmentDamageLogs,
  useEquipment,
  useEquipmentItem,
  useCreateEquipment,
  useUpdateEquipment,
  useDeleteEquipment,
  useAddEquipmentDamageLog,
  useUpdateEquipmentDamageLog,
  useDeleteEquipmentDamageLog,
  useCreateEquipmentLoan,
  useReturnEquipmentLoan,
  useRecordEquipmentMaintenance,
} from '../useEquipment';
import {
  getEquipment,
  getEquipmentItem,
  getEquipmentTypes,
  getEquipmentDamageLogs,
  createEquipment,
  updateEquipment,
  deleteEquipment,
  addEquipmentDamageLog,
  updateEquipmentDamageLog,
  deleteEquipmentDamageLog,
  createEquipmentLoan,
  returnEquipmentLoan,
  recordEquipmentMaintenance,
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

// ==================== OPHALEN ====================

describe('useEquipment - ophalen', () => {
  it('haalt de soorten materiaal op', async () => {
    alsMock(getEquipmentTypes).mockResolvedValue(['lessenaar', 'pauk']);

    const { result } = renderHook(() => useEquipmentTypes(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(['lessenaar', 'pauk']);
  });

  // Hier stond een test voor useMaintenanceAlerts. Die hook vroeg
  // /equipment/maintenance-alerts op, een route die de backend nooit heeft
  // gehad (Express antwoordde via /:id met 404). De hook is weg; de
  // schademeldingen zijn wel een eigen route en krijgen deze plek.
  it('haalt de schademeldingen van een item op', async () => {
    alsMock(getEquipmentDamageLogs).mockResolvedValue([{ id: 's1', severity: 'minor' }]);

    const { result } = renderHook(() => useEquipmentDamageLogs('e1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getEquipmentDamageLogs).toHaveBeenCalledWith('e1');
  });

  it('geeft de filters ongewijzigd door aan de api', async () => {
    alsMock(getEquipment).mockResolvedValue([]);
    const filters = { status: 'available', type: 'instrument', categoryId: 'c1' } as const;

    const { result } = renderHook(() => useEquipment(filters), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getEquipment).toHaveBeenCalledWith(filters);
  });

  it('haalt opnieuw op als het filter verandert', async () => {
    alsMock(getEquipment).mockResolvedValue([]);

    const { result, rerender } = renderHook(
      ({ status }: { status: 'available' | 'repair' }) => useEquipment({ status }),
      {
        wrapper,
        initialProps: { status: 'available' as 'available' | 'repair' },
      },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    rerender({ status: 'repair' });

    await waitFor(() => expect(getEquipment).toHaveBeenCalledTimes(2));
    expect(getEquipment).toHaveBeenLastCalledWith({ status: 'repair' });
  });

  it('meldt een fout als de materiaallijst niet opgehaald kan worden', async () => {
    alsMock(getEquipment).mockRejectedValue(serverfout('Database niet bereikbaar'));

    const { result } = renderHook(() => useEquipment(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });

  it('vraagt geen materiaaldetail op zolang er geen id is', () => {
    const { result } = renderHook(() => useEquipmentItem(''), { wrapper });

    expect(getEquipmentItem).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('haalt het materiaaldetail op zodra het id bekend is', async () => {
    alsMock(getEquipmentItem).mockResolvedValue({ id: 'e1', name: 'Pauk 26 inch' });

    const { result } = renderHook(() => useEquipmentItem('e1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getEquipmentItem).toHaveBeenCalledWith('e1');
  });
});

// ==================== AANMAKEN, WIJZIGEN, VERWIJDEREN ====================

describe('useEquipment - aanmaken, wijzigen, verwijderen', () => {
  it('stuurt het nieuwe materiaal door en vernieuwt alles onder equipment', async () => {
    alsMock(createEquipment).mockResolvedValue({ id: 'e9' });
    const nieuw = { name: 'Lessenaar', equipmentType: 'furniture', brand: 'Manhasset', model: '48' } as const;

    const { result } = renderHook(() => useCreateEquipment(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(nieuw);
    });

    expect(eersteArgument(createEquipment)).toEqual(nieuw);
    // ['equipment'] is het gedeelde voorvoegsel van lijst, detail, soorten en
    // onderhoudsmeldingen. De soortenlijst komt uit een DISTINCT over de
    // items, dus die verandert ook echt mee bij een nieuw soort.
    expect(isOngeldigGemaakt(['equipment'])).toBe(true);
    expect(showSuccess).toHaveBeenCalledWith('Instrument toegevoegd');
  });

  it('toont de foutmelding van de server als aanmaken mislukt', async () => {
    alsMock(createEquipment).mockRejectedValue(serverfout('Naam is verplicht'));

    const { result } = renderHook(() => useCreateEquipment(), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync({ name: '', equipmentType: 'misc' })).rejects.toBeDefined();
    });

    expect(showError).toHaveBeenCalledWith('Naam is verplicht');
    expect(showSuccess).not.toHaveBeenCalled();
    expect(ongeldigGemaakt).toHaveLength(0);
  });

  it('stuurt bij wijzigen id en velden gescheiden door', async () => {
    alsMock(updateEquipment).mockResolvedValue(undefined);

    const { result } = renderHook(() => useUpdateEquipment(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ id: 'e1', data: { name: 'Andere naam' } });
    });

    expect(updateEquipment).toHaveBeenCalledWith('e1', { name: 'Andere naam' });
    expect(isOngeldigGemaakt(['equipment'])).toBe(true);
    expect(isOngeldigGemaakt(['equipment', 'e1'])).toBe(true);
    expect(showSuccess).toHaveBeenCalledWith('Instrument bijgewerkt');
  });

  it('haalt het openstaande materiaaldetail daadwerkelijk opnieuw op na een wijziging', async () => {
    // De detailsleutel ['equipment', id] valt onder het voorvoegsel
    // ['equipment']; deze test bewijst dat het scherm daardoor echt ververst
    // en niet alleen dat er een invalidatie is aangeroepen.
    alsMock(getEquipmentItem).mockResolvedValue({ id: 'e1', name: 'Oud' });
    alsMock(updateEquipment).mockResolvedValue(undefined);

    const { result } = renderHook(() => ({ detail: useEquipmentItem('e1'), wijzig: useUpdateEquipment() }), {
      wrapper,
    });

    await waitFor(() => expect(result.current.detail.isSuccess).toBe(true));

    alsMock(getEquipmentItem).mockResolvedValue({ id: 'e1', name: 'Nieuw' });
    await act(async () => {
      await result.current.wijzig.mutateAsync({ id: 'e1', data: { name: 'Nieuw' } });
    });

    await waitFor(() => expect(result.current.detail.data).toEqual({ id: 'e1', name: 'Nieuw' }));
  });

  it('verwijdert materiaal en vernieuwt de lijst', async () => {
    alsMock(deleteEquipment).mockResolvedValue(undefined);

    const { result } = renderHook(() => useDeleteEquipment(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync('e1');
    });

    expect(eersteArgument(deleteEquipment)).toBe('e1');
    expect(isOngeldigGemaakt(['equipment'])).toBe(true);
    expect(showSuccess).toHaveBeenCalledWith('Instrument verwijderd');
  });

  it('meldt geen succes als verwijderen mislukt', async () => {
    alsMock(deleteEquipment).mockRejectedValue(serverfout('Item is nog uitgeleend'));

    const { result } = renderHook(() => useDeleteEquipment(), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync('e1')).rejects.toBeDefined();
    });

    expect(showError).toHaveBeenCalledWith('Item is nog uitgeleend');
    expect(showSuccess).not.toHaveBeenCalled();
  });
});

// ==================== SCHADEMELDINGEN ====================

describe('useEquipment - schademeldingen', () => {
  it('meldt schade met materiaal-id en gegevens gescheiden', async () => {
    alsMock(addEquipmentDamageLog).mockResolvedValue({ id: 's1' });
    const melding = { description: 'Vel gescheurd', severity: 'moderate' } as const;

    const { result } = renderHook(() => useAddEquipmentDamageLog(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ equipmentId: 'e1', log: melding });
    });

    expect(addEquipmentDamageLog).toHaveBeenCalledWith('e1', melding);
    // De backend past bij een schademelding de staat en de status van het
    // item aan, dus de overzichtslijst moet mee.
    expect(isOngeldigGemaakt(['equipment'])).toBe(true);
    expect(isOngeldigGemaakt(['equipment', 'e1'])).toBe(true);
    expect(showSuccess).toHaveBeenCalledWith('Schademelding toegevoegd');
  });

  it('wijzigt een schademelding met materiaal-, melding-id en velden', async () => {
    alsMock(updateEquipmentDamageLog).mockResolvedValue(undefined);

    const { result } = renderHook(() => useUpdateEquipmentDamageLog(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ equipmentId: 'e1', logId: 's1', log: { repairedAt: '2024-04-10' } });
    });

    expect(updateEquipmentDamageLog).toHaveBeenCalledWith('e1', 's1', { repairedAt: '2024-04-10' });
    // Met een reparatiedatum zet de backend het item terug op 'available'; zonder
    // de lijst mee te vernieuwen blijft het overzicht 'in reparatie' tonen.
    expect(isOngeldigGemaakt(['equipment'])).toBe(true);
    expect(isOngeldigGemaakt(['equipment', 'e1'])).toBe(true);
    expect(showSuccess).toHaveBeenCalledWith('Schademelding bijgewerkt');
  });

  it('verwijdert een schademelding en vernieuwt alleen het detail', async () => {
    // Bewust alleen het detail: de backend raakt bij het verwijderen van een
    // schaderapport het item zelf niet aan, en de overzichtslijst toont geen
    // schadegegevens. Een bredere invalidatie zou hier alleen extra
    // netwerkverkeer opleveren.
    alsMock(deleteEquipmentDamageLog).mockResolvedValue(undefined);

    const { result } = renderHook(() => useDeleteEquipmentDamageLog(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ equipmentId: 'e1', logId: 's1' });
    });

    expect(deleteEquipmentDamageLog).toHaveBeenCalledWith('e1', 's1');
    expect(ongeldigGemaakt).toEqual([['equipment', 'e1']]);
    expect(showSuccess).toHaveBeenCalledWith('Schademelding verwijderd');
  });

  it('haalt de schademeldingen daadwerkelijk opnieuw op na een nieuwe melding', async () => {
    // GET /equipment/:id stuurt geen schade mee; de lijst komt van een eigen
    // route. Haar sleutel hangt onder die van het item, dus de invalidatie
    // van het item moet haar meenemen.
    alsMock(getEquipmentDamageLogs).mockResolvedValue([]);
    alsMock(addEquipmentDamageLog).mockResolvedValue({ id: 's1' });

    const { result } = renderHook(
      () => ({ meldingen: useEquipmentDamageLogs('e1'), meld: useAddEquipmentDamageLog() }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.meldingen.isSuccess).toBe(true));

    alsMock(getEquipmentDamageLogs).mockResolvedValue([{ id: 's1', description: 'Deuk', severity: 'minor' }]);
    await act(async () => {
      await result.current.meld.mutateAsync({ equipmentId: 'e1', log: { description: 'Deuk', severity: 'minor' } });
    });

    await waitFor(() => expect(result.current.meldingen.data).toHaveLength(1));
  });

  it('raakt de cache niet aan als een schademelding niet opgeslagen kan worden', async () => {
    alsMock(addEquipmentDamageLog).mockRejectedValue(serverfout('Omschrijving is verplicht'));

    const { result } = renderHook(() => useAddEquipmentDamageLog(), { wrapper });
    await act(async () => {
      await expect(
        result.current.mutateAsync({ equipmentId: 'e1', log: { description: '', severity: 'minor' } }),
      ).rejects.toBeDefined();
    });

    expect(showError).toHaveBeenCalledWith('Omschrijving is verplicht');
    expect(ongeldigGemaakt).toHaveLength(0);
  });
});

// ==================== UITLENEN ====================

describe('useEquipment - uitlenen', () => {
  it('leent materiaal uit met materiaal-id en leengegevens gescheiden', async () => {
    alsMock(createEquipmentLoan).mockResolvedValue({ id: 'u1' });
    const bruikleen = { userId: 'u1', expectedReturnDate: '2024-12-01', conditionAtCheckout: 'good' };

    const { result } = renderHook(() => useCreateEquipmentLoan(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ equipmentId: 'e1', loan: bruikleen });
    });

    expect(createEquipmentLoan).toHaveBeenCalledWith('e1', bruikleen);
    // De lijst telt het aantal lopende bruiklenen per item.
    expect(isOngeldigGemaakt(['equipment'])).toBe(true);
    expect(isOngeldigGemaakt(['equipment', 'e1'])).toBe(true);
    expect(showSuccess).toHaveBeenCalledWith('Instrument uitgeleend');
  });

  it('neemt materiaal terug op de bruikleen-id en vernieuwt het item waar hij bij hoort', async () => {
    alsMock(returnEquipmentLoan).mockResolvedValue(undefined);

    const { result } = renderHook(() => useReturnEquipmentLoan(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({
        equipmentId: 'e1',
        loanId: 'l1',
        returnData: { conditionAtReturn: 'good', returnNotes: 'Kras op de klep' },
      });
    });

    // De backend neemt in via PATCH /equipment/loans/:id/return: alleen de
    // bruikleen-id gaat mee naar de api. Het materiaal-id is voor de cache.
    expect(returnEquipmentLoan).toHaveBeenCalledWith('l1', {
      conditionAtReturn: 'good',
      returnNotes: 'Kras op de klep',
    });
    expect(isOngeldigGemaakt(['equipment'])).toBe(true);
    expect(isOngeldigGemaakt(['equipment', 'e1'])).toBe(true);
    expect(showSuccess).toHaveBeenCalledWith('Instrument teruggebracht');
  });

  it('toont een foutmelding als uitlenen mislukt', async () => {
    alsMock(createEquipmentLoan).mockRejectedValue(serverfout('Item is al uitgeleend'));

    const { result } = renderHook(() => useCreateEquipmentLoan(), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync({ equipmentId: 'e1', loan: { userId: 'u1' } })).rejects.toBeDefined();
    });

    expect(showError).toHaveBeenCalledWith('Item is al uitgeleend');
    expect(ongeldigGemaakt).toHaveLength(0);
  });
});

// ==================== ONDERHOUD ====================

describe('useEquipment - onderhoud', () => {
  const onderhoud = {
    maintenanceType: 'service',
    description: 'Vel vervangen',
    performedDate: '2024-05-01',
  } as const;

  it('registreert onderhoud en vernieuwt lijst en detail', async () => {
    alsMock(recordEquipmentMaintenance).mockResolvedValue({ id: 'm1' });

    const { result } = renderHook(() => useRecordEquipmentMaintenance(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ equipmentId: 'e1', maintenance: onderhoud });
    });

    expect(recordEquipmentMaintenance).toHaveBeenCalledWith('e1', onderhoud);
    expect(isOngeldigGemaakt(['equipment'])).toBe(true);
    // De backend zet laatste en volgende onderhoudsdatum op het item zelf;
    // het detail moet die nieuwe datums tonen.
    expect(isOngeldigGemaakt(['equipment', 'e1'])).toBe(true);
    expect(showSuccess).toHaveBeenCalledWith('Onderhoud geregistreerd');
  });

  it('haalt het materiaaldetail daadwerkelijk opnieuw op na een registratie', async () => {
    // Hier stond dezelfde test voor de onderhoudsmeldingen van
    // /equipment/maintenance-alerts, een route die niet bestaat. Wat na een
    // registratie echt verandert is `nextMaintenance` op het detail.
    alsMock(getEquipmentItem).mockResolvedValue({ id: 'e1', nextMaintenance: '2024-01-01' });
    alsMock(recordEquipmentMaintenance).mockResolvedValue({ id: 'm1' });

    const { result } = renderHook(
      () => ({ detail: useEquipmentItem('e1'), registreer: useRecordEquipmentMaintenance() }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.detail.isSuccess).toBe(true));

    alsMock(getEquipmentItem).mockResolvedValue({ id: 'e1', nextMaintenance: '2025-05-01' });
    await act(async () => {
      await result.current.registreer.mutateAsync({ equipmentId: 'e1', maintenance: onderhoud });
    });

    await waitFor(() => expect(result.current.detail.data).toEqual({ id: 'e1', nextMaintenance: '2025-05-01' }));
  });

  it('raakt de cache niet aan als de registratie mislukt', async () => {
    alsMock(recordEquipmentMaintenance).mockRejectedValue(serverfout('Datum is verplicht'));

    const { result } = renderHook(() => useRecordEquipmentMaintenance(), { wrapper });
    await act(async () => {
      await expect(
        result.current.mutateAsync({ equipmentId: 'e1', maintenance: { ...onderhoud, performedDate: '' } }),
      ).rejects.toBeDefined();
    });

    expect(showError).toHaveBeenCalledWith('Datum is verplicht');
    expect(ongeldigGemaakt).toHaveLength(0);
  });
});
