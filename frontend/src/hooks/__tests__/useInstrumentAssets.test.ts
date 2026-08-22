import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';

// De hele instrument-assets-api wordt vervangen. De typen die de api-module
// ook exporteert zijn puur type-informatie en verdwijnen bij het compileren.
vi.mock('../../api/instrument-assets', () => ({
  getAssetCategories: vi.fn(),
  getAssetStatuses: vi.fn(),
  getAssetConditions: vi.fn(),
  getInstrumentAssets: vi.fn(),
  getInstrumentAssetsSummary: vi.fn(),
  getMaintenanceDueAssets: vi.fn(),
  getInstrumentAsset: vi.fn(),
  createInstrumentAsset: vi.fn(),
  updateInstrumentAsset: vi.fn(),
  deleteInstrumentAsset: vi.fn(),
  recordAssetMaintenance: vi.fn(),
  getAssetValuations: vi.fn(),
  createAssetValuation: vi.fn(),
  getAssetRepairs: vi.fn(),
  createAssetRepair: vi.fn(),
  updateAssetRepair: vi.fn(),
  getAssetLoans: vi.fn(),
  createAssetLoan: vi.fn(),
  returnAssetLoan: vi.fn(),
  getAssetDocuments: vi.fn(),
  createAssetDocument: vi.fn(),
  deleteAssetDocument: vi.fn(),
  getAssetHistory: vi.fn(),
  getInsurancePolicies: vi.fn(),
  getInsurancePoliciesSummary: vi.fn(),
  getExpiringPolicies: vi.fn(),
  getInsurancePolicy: vi.fn(),
  createInsurancePolicy: vi.fn(),
  updateInsurancePolicy: vi.fn(),
  deleteInsurancePolicy: vi.fn(),
  addAssetToPolicyCoverage: vi.fn(),
  removeAssetFromPolicyCoverage: vi.fn(),
  getInsuranceClaims: vi.fn(),
  getInsuranceClaim: vi.fn(),
  createInsuranceClaim: vi.fn(),
  updateInsuranceClaim: vi.fn(),
}));

vi.mock('../../utils/toast', () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}));

import {
  useAssetCategories,
  useAssetStatuses,
  useAssetConditions,
  useInstrumentAssets,
  useInstrumentAssetsSummary,
  useMaintenanceDueAssets,
  useInstrumentAsset,
  useCreateInstrumentAsset,
  useUpdateInstrumentAsset,
  useDeleteInstrumentAsset,
  useRecordAssetMaintenance,
  useAssetValuations,
  useCreateAssetValuation,
  useAssetRepairs,
  useCreateAssetRepair,
  useUpdateAssetRepair,
  useAssetLoans,
  useCreateAssetLoan,
  useReturnAssetLoan,
  useAssetDocuments,
  useCreateAssetDocument,
  useDeleteAssetDocument,
  useAssetHistory,
  useInsurancePolicies,
  useInsurancePoliciesSummary,
  useExpiringPolicies,
  useInsurancePolicy,
  useCreateInsurancePolicy,
  useUpdateInsurancePolicy,
  useDeleteInsurancePolicy,
  useAddAssetToPolicyCoverage,
  useRemoveAssetFromPolicyCoverage,
  useInsuranceClaims,
  useInsuranceClaim,
  useCreateInsuranceClaim,
  useUpdateInsuranceClaim,
} from '../useInstrumentAssets';
import {
  getAssetCategories,
  getAssetStatuses,
  getAssetConditions,
  getInstrumentAssets,
  getInstrumentAssetsSummary,
  getMaintenanceDueAssets,
  getInstrumentAsset,
  createInstrumentAsset,
  updateInstrumentAsset,
  deleteInstrumentAsset,
  recordAssetMaintenance,
  getAssetValuations,
  createAssetValuation,
  getAssetRepairs,
  createAssetRepair,
  updateAssetRepair,
  getAssetLoans,
  createAssetLoan,
  returnAssetLoan,
  getAssetDocuments,
  createAssetDocument,
  deleteAssetDocument,
  getAssetHistory,
  getInsurancePolicies,
  getInsurancePoliciesSummary,
  getExpiringPolicies,
  getInsurancePolicy,
  createInsurancePolicy,
  updateInsurancePolicy,
  deleteInsurancePolicy,
  addAssetToPolicyCoverage,
  removeAssetFromPolicyCoverage,
  getInsuranceClaims,
  getInsuranceClaim,
  createInsuranceClaim,
  updateInsuranceClaim,
} from '../../api/instrument-assets';
import { showSuccess, showError } from '../../utils/toast';

/** De api is gemockt; TypeScript kent alleen nog de echte signatuur. */
const alsMock = (fn: unknown) => fn as Mock;

/**
 * Waar een hook de api-functie rechtstreeks als mutationFn doorgeeft
 * (`mutationFn: createInstrumentAsset`), plakt react-query er zelf nog een
 * context-object achter. Voor de test telt alleen het eerste argument.
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

// ==================== KEUZELIJSTEN ====================

describe('useInstrumentAssets - keuzelijsten', () => {
  it('haalt de categorieën op', async () => {
    alsMock(getAssetCategories).mockResolvedValue(['brass', 'woodwind']);

    const { result } = renderHook(() => useAssetCategories(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(['brass', 'woodwind']);
  });

  it('haalt de statussen op', async () => {
    alsMock(getAssetStatuses).mockResolvedValue(['available', 'in_repair']);

    const { result } = renderHook(() => useAssetStatuses(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getAssetStatuses).toHaveBeenCalledTimes(1);
  });

  it('haalt de conditiewaarden op', async () => {
    alsMock(getAssetConditions).mockResolvedValue(['excellent', 'poor']);

    const { result } = renderHook(() => useAssetConditions(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getAssetConditions).toHaveBeenCalledTimes(1);
  });

  it('houdt de keuzelijsten permanent vers, zodat elk scherm ze uit de cache haalt', async () => {
    // staleTime: Infinity. Twee schermen die dezelfde lijst gebruiken mogen
    // samen maar één verzoek doen - dit zijn lijsten die nooit veranderen.
    alsMock(getAssetCategories).mockResolvedValue(['brass']);

    const { result } = renderHook(() => ({ een: useAssetCategories(), twee: useAssetCategories() }), { wrapper });

    await waitFor(() => expect(result.current.een.isSuccess).toBe(true));
    expect(getAssetCategories).toHaveBeenCalledTimes(1);
  });
});

// ==================== INSTRUMENTEN ====================

describe('useInstrumentAssets - instrumentenlijst', () => {
  it('geeft de filters ongewijzigd door aan de api', async () => {
    alsMock(getInstrumentAssets).mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 });
    const filters = { search: 'trompet', status: 'available', category: 'brass' };

    const { result } = renderHook(() => useInstrumentAssets(filters), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getInstrumentAssets).toHaveBeenCalledWith(filters);
  });

  it('haalt opnieuw op als het filter verandert', async () => {
    // De filters zitten in de queryKey. Zonder dat zou het tweede filter
    // stilletjes de resultaten van het eerste tonen.
    alsMock(getInstrumentAssets).mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 });

    const { result, rerender } = renderHook(({ status }: { status: string }) => useInstrumentAssets({ status }), {
      wrapper,
      initialProps: { status: 'available' },
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    rerender({ status: 'in_repair' });

    await waitFor(() => expect(getInstrumentAssets).toHaveBeenCalledTimes(2));
    expect(getInstrumentAssets).toHaveBeenLastCalledWith({ status: 'in_repair' });
  });

  it('meldt een fout als de instrumentenlijst niet opgehaald kan worden', async () => {
    alsMock(getInstrumentAssets).mockRejectedValue(serverfout('Database niet bereikbaar'));

    const { result } = renderHook(() => useInstrumentAssets(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });

  it('haalt de samenvatting op', async () => {
    alsMock(getInstrumentAssetsSummary).mockResolvedValue({ totalAssets: 12, totalValue: 45000 });

    const { result } = renderHook(() => useInstrumentAssetsSummary(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ totalAssets: 12, totalValue: 45000 });
  });

  it('geeft het aantal dagen door bij de onderhoudsmelding en herhaalt bij een andere termijn', async () => {
    alsMock(getMaintenanceDueAssets).mockResolvedValue([]);

    const { result, rerender } = renderHook(({ dagen }: { dagen: number }) => useMaintenanceDueAssets(dagen), {
      wrapper,
      initialProps: { dagen: 30 },
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getMaintenanceDueAssets).toHaveBeenCalledWith(30);

    rerender({ dagen: 90 });
    await waitFor(() => expect(getMaintenanceDueAssets).toHaveBeenCalledTimes(2));
    expect(getMaintenanceDueAssets).toHaveBeenLastCalledWith(90);
  });

  it('vraagt geen instrumentdetail op zolang er geen id is', () => {
    const { result } = renderHook(() => useInstrumentAsset(''), { wrapper });

    expect(getInstrumentAsset).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('haalt het instrumentdetail op zodra het id bekend is', async () => {
    alsMock(getInstrumentAsset).mockResolvedValue({ id: 'a1', name: 'Bugel' });

    const { result } = renderHook(() => useInstrumentAsset('a1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getInstrumentAsset).toHaveBeenCalledWith('a1');
  });
});

// ==================== INSTRUMENT AANMAKEN / WIJZIGEN / VERWIJDEREN ====================

describe('useInstrumentAssets - instrument aanmaken, wijzigen, verwijderen', () => {
  it('stuurt het nieuwe instrument door en vernieuwt alles onder instrumentAssets', async () => {
    alsMock(createInstrumentAsset).mockResolvedValue({ id: 'a9' });
    const nieuw = { name: 'Trompet', instrumentType: 'trompet', category: 'brass' };

    const { result } = renderHook(() => useCreateInstrumentAsset(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(nieuw);
    });

    expect(eersteArgument(createInstrumentAsset)).toEqual(nieuw);
    expect(isOngeldigGemaakt(['instrumentAssets'])).toBe(true);
    expect(showSuccess).toHaveBeenCalledWith('Instrument toegevoegd');
  });

  it('toont de foutmelding van de server als aanmaken mislukt', async () => {
    alsMock(createInstrumentAsset).mockRejectedValue(serverfout('Serienummer bestaat al'));

    const { result } = renderHook(() => useCreateInstrumentAsset(), { wrapper });
    await act(async () => {
      await expect(
        result.current.mutateAsync({ name: 'X', instrumentType: 'trompet', category: 'brass' }),
      ).rejects.toBeDefined();
    });

    expect(showError).toHaveBeenCalledWith('Serienummer bestaat al');
    expect(showSuccess).not.toHaveBeenCalled();
    // Een mislukte aanmaak mag de cache niet aanraken.
    expect(ongeldigGemaakt).toHaveLength(0);
  });

  it('stuurt bij wijzigen id en velden gescheiden door en vernieuwt lijst en detail', async () => {
    alsMock(updateInstrumentAsset).mockResolvedValue(undefined);

    const { result } = renderHook(() => useUpdateInstrumentAsset(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ id: 'a1', data: { name: 'Bugel' } });
    });

    expect(updateInstrumentAsset).toHaveBeenCalledWith('a1', { name: 'Bugel' });
    expect(isOngeldigGemaakt(['instrumentAssets'])).toBe(true);
    expect(isOngeldigGemaakt(['instrumentAssets', 'detail', 'a1'])).toBe(true);
    expect(showSuccess).toHaveBeenCalledWith('Instrument bijgewerkt');
  });

  it('haalt het openstaande instrumentdetail daadwerkelijk opnieuw op na een wijziging', async () => {
    // De kern: niet alleen dat invalidateQueries is aangeroepen, maar dat de
    // gebruiker zijn eigen wijziging ook echt op het scherm ziet.
    alsMock(getInstrumentAsset).mockResolvedValue({ id: 'a1', name: 'Oud' });
    alsMock(updateInstrumentAsset).mockResolvedValue(undefined);

    const { result } = renderHook(() => ({ detail: useInstrumentAsset('a1'), wijzig: useUpdateInstrumentAsset() }), {
      wrapper,
    });

    await waitFor(() => expect(result.current.detail.isSuccess).toBe(true));

    alsMock(getInstrumentAsset).mockResolvedValue({ id: 'a1', name: 'Nieuw' });
    await act(async () => {
      await result.current.wijzig.mutateAsync({ id: 'a1', data: { name: 'Nieuw' } });
    });

    await waitFor(() => expect(result.current.detail.data).toEqual({ id: 'a1', name: 'Nieuw' }));
  });

  it('verwijdert een instrument en vernieuwt de lijst', async () => {
    alsMock(deleteInstrumentAsset).mockResolvedValue(undefined);

    const { result } = renderHook(() => useDeleteInstrumentAsset(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync('a1');
    });

    expect(eersteArgument(deleteInstrumentAsset)).toBe('a1');
    expect(isOngeldigGemaakt(['instrumentAssets'])).toBe(true);
    expect(showSuccess).toHaveBeenCalledWith('Instrument verwijderd');
  });

  it('meldt geen succes als verwijderen mislukt', async () => {
    alsMock(deleteInstrumentAsset).mockRejectedValue(serverfout('Instrument is nog uitgeleend'));

    const { result } = renderHook(() => useDeleteInstrumentAsset(), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync('a1')).rejects.toBeDefined();
    });

    expect(showError).toHaveBeenCalledWith('Instrument is nog uitgeleend');
    expect(showSuccess).not.toHaveBeenCalled();
  });

  it('registreert onderhoud en vernieuwt lijst en detail', async () => {
    alsMock(recordAssetMaintenance).mockResolvedValue(undefined);
    const onderhoud = { date: '2024-05-01', notes: 'Ventielen gesmeerd' };

    const { result } = renderHook(() => useRecordAssetMaintenance(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ id: 'a1', data: onderhoud });
    });

    expect(recordAssetMaintenance).toHaveBeenCalledWith('a1', onderhoud);
    // De onderhoudsmelding-lijst hangt onder hetzelfde voorvoegsel en moet mee:
    // het instrument staat er na registratie niet meer op.
    expect(isOngeldigGemaakt(['instrumentAssets'])).toBe(true);
    expect(isOngeldigGemaakt(['instrumentAssets', 'detail', 'a1'])).toBe(true);
    expect(showSuccess).toHaveBeenCalledWith('Onderhoud geregistreerd');
  });
});

// ==================== WAARDERINGEN ====================

describe('useInstrumentAssets - waarderingen', () => {
  it('vraagt de waarderingen pas op als het instrument bekend is', async () => {
    const { result, rerender } = renderHook(({ id }: { id: string }) => useAssetValuations(id), {
      wrapper,
      initialProps: { id: '' },
    });

    expect(getAssetValuations).not.toHaveBeenCalled();

    alsMock(getAssetValuations).mockResolvedValue([]);
    rerender({ id: 'a1' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getAssetValuations).toHaveBeenCalledWith('a1');
  });

  it('voegt een waardering toe en vernieuwt de waarderingen en het detail', async () => {
    alsMock(createAssetValuation).mockResolvedValue({ id: 'w1' });
    const waardering = {
      valuationDate: '2024-06-01',
      valuationType: 'appraisal' as const,
      valuedAmount: 3200,
    };

    const { result } = renderHook(() => useCreateAssetValuation(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ assetId: 'a1', data: waardering });
    });

    expect(createAssetValuation).toHaveBeenCalledWith('a1', waardering);
    expect(isOngeldigGemaakt(['instrumentAssets', 'valuations', 'a1'])).toBe(true);
    expect(isOngeldigGemaakt(['instrumentAssets', 'detail', 'a1'])).toBe(true);
    expect(showSuccess).toHaveBeenCalledWith('Waardering toegevoegd');
  });

  it('vernieuwt na een waardering ook de lijst en de samenvatting', async () => {
    // De backend schrijft de nieuwe waarde weg in instrument_assets.current_value
    // (routes/instrument-assets.ts: UPDATE instrument_assets SET current_value).
    // De overzichtslijst en de samenvatting ("totale waarde van het park")
    // hangen onder ['instrumentAssets','list'] en ['instrumentAssets','summary'];
    // beide worden niet geraakt door de sleutels valuations/detail. Zonder deze
    // invalidatie blijft de verzekeringswaarde in het overzicht op het oude
    // bedrag staan tot de gebruiker de pagina ververst.
    alsMock(createAssetValuation).mockResolvedValue({ id: 'w1' });

    const { result } = renderHook(() => useCreateAssetValuation(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({
        assetId: 'a1',
        data: { valuationDate: '2024-06-01', valuationType: 'appraisal', valuedAmount: 3200 },
      });
    });

    expect(isOngeldigGemaakt(['instrumentAssets'])).toBe(true);
  });

  it('toont een foutmelding als een waardering niet opgeslagen kan worden', async () => {
    alsMock(createAssetValuation).mockRejectedValue(serverfout('Bedrag is verplicht'));

    const { result } = renderHook(() => useCreateAssetValuation(), { wrapper });
    await act(async () => {
      await expect(
        result.current.mutateAsync({
          assetId: 'a1',
          data: { valuationDate: '2024-06-01', valuationType: 'appraisal', valuedAmount: 0 },
        }),
      ).rejects.toBeDefined();
    });

    expect(showError).toHaveBeenCalledWith('Bedrag is verplicht');
    expect(ongeldigGemaakt).toHaveLength(0);
  });
});

// ==================== REPARATIES ====================

describe('useInstrumentAssets - reparaties', () => {
  it('vraagt de reparaties pas op als het instrument bekend is', () => {
    const { result } = renderHook(() => useAssetRepairs(''), { wrapper });

    expect(getAssetRepairs).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('meldt een reparatie aan en vernieuwt de reparaties en het detail', async () => {
    alsMock(createAssetRepair).mockResolvedValue({ id: 'r1' });
    const reparatie = { repairType: 'corrective' as const, issueDescription: 'Klep klemt' };

    const { result } = renderHook(() => useCreateAssetRepair(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ assetId: 'a1', data: reparatie });
    });

    expect(createAssetRepair).toHaveBeenCalledWith('a1', reparatie);
    expect(isOngeldigGemaakt(['instrumentAssets', 'repairs', 'a1'])).toBe(true);
    expect(isOngeldigGemaakt(['instrumentAssets', 'detail', 'a1'])).toBe(true);
    expect(showSuccess).toHaveBeenCalledWith('Reparatie aangemeld');
  });

  it('vernieuwt na het aanmelden van een reparatie ook de instrumentenlijst', async () => {
    // De backend zet bij een nieuwe reparatie de status van het instrument om
    // (routes/instrument-assets.ts: UPDATE instrument_assets SET status = ?).
    // De overzichtslijst staat onder ['instrumentAssets','list',filters] en
    // wordt niet geraakt door repairs/detail. Zonder deze invalidatie blijft
    // het instrument in het overzicht "beschikbaar" heten terwijl het bij de
    // reparateur ligt - iemand kan het dan meenemen naar een repetitie.
    // Vergelijk useCreateAssetLoan, die dit wel doet.
    alsMock(createAssetRepair).mockResolvedValue({ id: 'r1' });

    const { result } = renderHook(() => useCreateAssetRepair(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({
        assetId: 'a1',
        data: { repairType: 'corrective', issueDescription: 'Klep klemt' },
      });
    });

    expect(isOngeldigGemaakt(['instrumentAssets'])).toBe(true);
  });

  it('wijzigt een reparatie met instrument-, reparatie-id en velden', async () => {
    alsMock(updateAssetRepair).mockResolvedValue(undefined);

    const { result } = renderHook(() => useUpdateAssetRepair(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ assetId: 'a1', repairId: 'r1', data: { status: 'completed' } });
    });

    expect(updateAssetRepair).toHaveBeenCalledWith('a1', 'r1', { status: 'completed' });
    expect(isOngeldigGemaakt(['instrumentAssets', 'repairs', 'a1'])).toBe(true);
    expect(showSuccess).toHaveBeenCalledWith('Reparatie bijgewerkt');
  });

  it('vernieuwt na het afronden van een reparatie ook de instrumentenlijst', async () => {
    // Bij status 'completed' zet de backend het instrument terug op
    // 'available'. Zonder invalidatie van de lijst blijft het overzicht
    // melden dat het instrument in reparatie is.
    alsMock(updateAssetRepair).mockResolvedValue(undefined);

    const { result } = renderHook(() => useUpdateAssetRepair(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ assetId: 'a1', repairId: 'r1', data: { status: 'completed' } });
    });

    expect(isOngeldigGemaakt(['instrumentAssets'])).toBe(true);
  });
});

// ==================== UITLENEN ====================

describe('useInstrumentAssets - uitlenen', () => {
  it('vraagt de bruiklenen pas op als het instrument bekend is', () => {
    const { result } = renderHook(() => useAssetLoans(''), { wrapper });

    expect(getAssetLoans).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('leent een instrument uit en vernieuwt bruiklenen, detail en lijst', async () => {
    alsMock(createAssetLoan).mockResolvedValue({ id: 'u1' });
    const bruikleen = { borrowerUserId: 'u1', loanDate: '2024-09-01', conditionAtLoan: 'good' };

    const { result } = renderHook(() => useCreateAssetLoan(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ assetId: 'a1', data: bruikleen });
    });

    expect(createAssetLoan).toHaveBeenCalledWith('a1', bruikleen);
    expect(isOngeldigGemaakt(['instrumentAssets', 'loans', 'a1'])).toBe(true);
    expect(isOngeldigGemaakt(['instrumentAssets', 'detail', 'a1'])).toBe(true);
    // De lijst toont de leenstatus, dus die moet mee.
    expect(isOngeldigGemaakt(['instrumentAssets'])).toBe(true);
    expect(showSuccess).toHaveBeenCalledWith('Instrument uitgeleend');
  });

  it('neemt een instrument terug met instrument-, bruikleen-id en velden', async () => {
    alsMock(returnAssetLoan).mockResolvedValue(undefined);

    const { result } = renderHook(() => useReturnAssetLoan(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({
        assetId: 'a1',
        loanId: 'l1',
        data: { actualReturnDate: '2024-10-01', conditionAtReturn: 'good' },
      });
    });

    expect(returnAssetLoan).toHaveBeenCalledWith('a1', 'l1', {
      actualReturnDate: '2024-10-01',
      conditionAtReturn: 'good',
    });
    expect(isOngeldigGemaakt(['instrumentAssets', 'loans', 'a1'])).toBe(true);
    expect(isOngeldigGemaakt(['instrumentAssets'])).toBe(true);
    expect(showSuccess).toHaveBeenCalledWith('Instrument teruggebracht');
  });

  it('toont een foutmelding als uitlenen mislukt', async () => {
    alsMock(createAssetLoan).mockRejectedValue(serverfout('Instrument is al uitgeleend'));

    const { result } = renderHook(() => useCreateAssetLoan(), { wrapper });
    await act(async () => {
      await expect(
        result.current.mutateAsync({
          assetId: 'a1',
          data: { borrowerUserId: 'u1', loanDate: '2024-09-01', conditionAtLoan: 'good' },
        }),
      ).rejects.toBeDefined();
    });

    expect(showError).toHaveBeenCalledWith('Instrument is al uitgeleend');
    expect(ongeldigGemaakt).toHaveLength(0);
  });
});

// ==================== DOCUMENTEN ====================

describe('useInstrumentAssets - documenten', () => {
  it('vraagt de documenten pas op als het instrument bekend is', () => {
    const { result } = renderHook(() => useAssetDocuments(''), { wrapper });

    expect(getAssetDocuments).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('voegt een document toe en vernieuwt documenten en detail', async () => {
    alsMock(createAssetDocument).mockResolvedValue({ id: 'd1' });
    const document = {
      documentType: 'invoice' as const,
      title: 'Aankoopfactuur',
      fileUrl: 'https://example.org/factuur.pdf',
      fileName: 'factuur.pdf',
    };

    const { result } = renderHook(() => useCreateAssetDocument(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ assetId: 'a1', data: document });
    });

    expect(createAssetDocument).toHaveBeenCalledWith('a1', document);
    expect(isOngeldigGemaakt(['instrumentAssets', 'documents', 'a1'])).toBe(true);
    expect(isOngeldigGemaakt(['instrumentAssets', 'detail', 'a1'])).toBe(true);
    expect(showSuccess).toHaveBeenCalledWith('Document toegevoegd');
  });

  it('verwijdert een document met instrument- en document-id', async () => {
    alsMock(deleteAssetDocument).mockResolvedValue(undefined);

    const { result } = renderHook(() => useDeleteAssetDocument(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ assetId: 'a1', documentId: 'd1' });
    });

    expect(deleteAssetDocument).toHaveBeenCalledWith('a1', 'd1');
    expect(isOngeldigGemaakt(['instrumentAssets', 'documents', 'a1'])).toBe(true);
    expect(showSuccess).toHaveBeenCalledWith('Document verwijderd');
  });
});

// ==================== HISTORIE ====================

describe('useInstrumentAssets - historie', () => {
  it('geeft instrument en paginering door aan de api', async () => {
    alsMock(getAssetHistory).mockResolvedValue([]);

    const { result } = renderHook(() => useAssetHistory('a1', { page: 1, limit: 20 }), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getAssetHistory).toHaveBeenCalledWith('a1', { page: 1, limit: 20 });
  });

  it('haalt bij het doorbladeren de volgende pagina daadwerkelijk op', async () => {
    // De paginering hoort in de queryKey. Staat hij er niet in, dan ziet
    // react-query pagina 2 als dezelfde query als pagina 1 en dient hij het
    // antwoord van pagina 1 opnieuw op: de gebruiker klikt op "volgende" en
    // ziet exact dezelfde regels, zonder foutmelding.
    alsMock(getAssetHistory).mockResolvedValue([{ id: 'h1', eventType: 'created' }]);

    const { result, rerender } = renderHook(
      ({ page }: { page: number }) => useAssetHistory('a1', { page, limit: 20 }),
      {
        wrapper,
        initialProps: { page: 1 },
      },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getAssetHistory).toHaveBeenCalledTimes(1);

    alsMock(getAssetHistory).mockResolvedValue([{ id: 'h2', eventType: 'repaired' }]);
    rerender({ page: 2 });

    await waitFor(() => expect(getAssetHistory).toHaveBeenCalledTimes(2));
    expect(getAssetHistory).toHaveBeenLastCalledWith('a1', { page: 2, limit: 20 });
    await waitFor(() => expect(result.current.data).toEqual([{ id: 'h2', eventType: 'repaired' }]));
  });

  it('vraagt geen historie op zolang er geen instrument is', () => {
    const { result } = renderHook(() => useAssetHistory(''), { wrapper });

    expect(getAssetHistory).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
  });
});

// ==================== VERZEKERINGSPOLISSEN ====================

describe('useInstrumentAssets - verzekeringspolissen', () => {
  it('geeft de filters ongewijzigd door aan de polis-api', async () => {
    alsMock(getInsurancePolicies).mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 });
    const filters = { status: 'active', page: 2 };

    const { result } = renderHook(() => useInsurancePolicies(filters), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getInsurancePolicies).toHaveBeenCalledWith(filters);
  });

  it('haalt de polissamenvatting op', async () => {
    alsMock(getInsurancePoliciesSummary).mockResolvedValue({ totalPolicies: 3 });

    const { result } = renderHook(() => useInsurancePoliciesSummary(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getInsurancePoliciesSummary).toHaveBeenCalledTimes(1);
  });

  it('geeft de termijn door bij aflopende polissen', async () => {
    alsMock(getExpiringPolicies).mockResolvedValue([]);

    const { result } = renderHook(() => useExpiringPolicies(60), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getExpiringPolicies).toHaveBeenCalledWith(60);
  });

  it('vraagt geen polisdetail op zolang er geen id is', () => {
    const { result } = renderHook(() => useInsurancePolicy(''), { wrapper });

    expect(getInsurancePolicy).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('maakt een polis aan en vernieuwt alles onder insurance', async () => {
    alsMock(createInsurancePolicy).mockResolvedValue({ id: 'p9' });
    const polis = {
      policyNumber: 'POL-1',
      providerName: 'Verzekeraar',
      policyType: 'all_risk' as const,
      coverageType: 'collective' as const,
      coverageAmount: 50000,
      startDate: '2024-01-01',
    };

    const { result } = renderHook(() => useCreateInsurancePolicy(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(polis);
    });

    expect(eersteArgument(createInsurancePolicy)).toEqual(polis);
    // ['insurance'] is het gedeelde voorvoegsel van polissen, samenvatting,
    // aflopende polissen en claims.
    expect(isOngeldigGemaakt(['insurance'])).toBe(true);
    expect(showSuccess).toHaveBeenCalledWith('Verzekeringspolis aangemaakt');
  });

  it('wijzigt een polis en vernieuwt de polislijst en het polisdetail', async () => {
    alsMock(updateInsurancePolicy).mockResolvedValue(undefined);

    const { result } = renderHook(() => useUpdateInsurancePolicy(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ id: 'p1', data: { providerName: 'Andere verzekeraar' } });
    });

    expect(updateInsurancePolicy).toHaveBeenCalledWith('p1', { providerName: 'Andere verzekeraar' });
    expect(isOngeldigGemaakt(['insurance'])).toBe(true);
    expect(isOngeldigGemaakt(['insurance', 'policy', 'p1'])).toBe(true);
  });

  it('annuleert een polis en vernieuwt de polissen', async () => {
    alsMock(deleteInsurancePolicy).mockResolvedValue(undefined);

    const { result } = renderHook(() => useDeleteInsurancePolicy(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync('p1');
    });

    expect(eersteArgument(deleteInsurancePolicy)).toBe('p1');
    expect(isOngeldigGemaakt(['insurance'])).toBe(true);
    expect(showSuccess).toHaveBeenCalledWith('Verzekeringspolis geannuleerd');
  });

  it('voegt een instrument aan de dekking toe en vernieuwt polis en instrumenten', async () => {
    alsMock(addAssetToPolicyCoverage).mockResolvedValue({ id: 'c1' });

    const { result } = renderHook(() => useAddAssetToPolicyCoverage(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({
        policyId: 'p1',
        data: { assetId: 'a1', coveredAmount: 3000, coverageStart: '2024-01-01' },
      });
    });

    expect(addAssetToPolicyCoverage).toHaveBeenCalledWith('p1', {
      assetId: 'a1',
      coveredAmount: 3000,
      coverageStart: '2024-01-01',
    });
    expect(isOngeldigGemaakt(['insurance', 'policy', 'p1'])).toBe(true);
    // Het instrument toont zelf of het verzekerd is.
    expect(isOngeldigGemaakt(['instrumentAssets'])).toBe(true);
  });

  it('haalt een instrument uit de dekking met polis- en dekking-id', async () => {
    alsMock(removeAssetFromPolicyCoverage).mockResolvedValue(undefined);

    const { result } = renderHook(() => useRemoveAssetFromPolicyCoverage(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ policyId: 'p1', coverageId: 'c1' });
    });

    expect(removeAssetFromPolicyCoverage).toHaveBeenCalledWith('p1', 'c1');
    expect(isOngeldigGemaakt(['insurance', 'policy', 'p1'])).toBe(true);
    expect(isOngeldigGemaakt(['instrumentAssets'])).toBe(true);
    expect(showSuccess).toHaveBeenCalledWith('Instrument verwijderd van polis');
  });
});

// ==================== SCHADECLAIMS ====================

describe('useInstrumentAssets - schadeclaims', () => {
  it('geeft de filters ongewijzigd door aan de claim-api', async () => {
    alsMock(getInsuranceClaims).mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 });

    const { result } = renderHook(() => useInsuranceClaims({ status: 'open' }), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getInsuranceClaims).toHaveBeenCalledWith({ status: 'open' });
  });

  it('vraagt geen claimdetail op zolang er geen id is', () => {
    const { result } = renderHook(() => useInsuranceClaim(''), { wrapper });

    expect(getInsuranceClaim).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('dient een claim in en vernieuwt alles onder insurance', async () => {
    alsMock(createInsuranceClaim).mockResolvedValue({ id: 'cl1' });
    const claim = {
      policyId: 'p1',
      assetId: 'a1',
      claimDate: '2024-07-05',
      incidentDate: '2024-07-01',
      incidentType: 'damage' as const,
      incidentDescription: 'Deuk in de beker na transport',
    };

    const { result } = renderHook(() => useCreateInsuranceClaim(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(claim);
    });

    expect(eersteArgument(createInsuranceClaim)).toEqual(claim);
    expect(isOngeldigGemaakt(['insurance'])).toBe(true);
    expect(showSuccess).toHaveBeenCalledWith('Schadeclaim ingediend');
  });

  it('wijzigt een claim en vernieuwt de claimlijst en het claimdetail', async () => {
    alsMock(updateInsuranceClaim).mockResolvedValue(undefined);

    const { result } = renderHook(() => useUpdateInsuranceClaim(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ id: 'cl1', data: { status: 'approved' } });
    });

    expect(updateInsuranceClaim).toHaveBeenCalledWith('cl1', { status: 'approved' });
    expect(isOngeldigGemaakt(['insurance'])).toBe(true);
    expect(isOngeldigGemaakt(['insurance', 'claim', 'cl1'])).toBe(true);
    expect(showSuccess).toHaveBeenCalledWith('Claim bijgewerkt');
  });

  it('toont de foutmelding van de server als een claim niet ingediend kan worden', async () => {
    alsMock(createInsuranceClaim).mockRejectedValue(serverfout('Polis is niet actief'));

    const { result } = renderHook(() => useCreateInsuranceClaim(), { wrapper });
    await act(async () => {
      await expect(
        result.current.mutateAsync({
          policyId: 'p1',
          assetId: 'a1',
          claimDate: '2024-07-05',
          incidentDate: '2024-07-01',
          incidentType: 'damage',
          incidentDescription: 'Deuk in de beker',
        }),
      ).rejects.toBeDefined();
    });

    expect(showError).toHaveBeenCalledWith('Polis is niet actief');
    expect(ongeldigGemaakt).toHaveLength(0);
  });
});
