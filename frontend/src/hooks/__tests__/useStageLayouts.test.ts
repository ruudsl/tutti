import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';

// Alleen de api-functies die useStageLayouts importeert hoeven te bestaan.
vi.mock('../../api', () => ({
  getStageLayouts: vi.fn(),
  getStageLayout: vi.fn(),
  createStageLayout: vi.fn(),
  updateStageLayout: vi.fn(),
  deleteStageLayout: vi.fn(),
  duplicateStageLayout: vi.fn(),
  getConcertStage: vi.fn(),
  saveConcertStage: vi.fn(),
  deleteConcertStage: vi.fn(),
  getPrintableSeatCards: vi.fn(),
}));

vi.mock('../../utils/toast', () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}));

import {
  stageLayoutKeys,
  useStageLayouts,
  useStageLayout,
  useCreateStageLayout,
  useUpdateStageLayout,
  useDeleteStageLayout,
  useDuplicateStageLayout,
  useConcertStage,
  useSaveConcertStage,
  useDeleteConcertStage,
  usePrintableSeatCards,
} from '../useStageLayouts';
import {
  getStageLayouts,
  getStageLayout,
  createStageLayout,
  updateStageLayout,
  deleteStageLayout,
  duplicateStageLayout,
  getConcertStage,
  saveConcertStage,
  deleteConcertStage,
  getPrintableSeatCards,
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

// ==================== SLEUTELS ====================

describe('useStageLayouts - sleutelopbouw', () => {
  it('hangt lijst en detail onder hetzelfde voorvoegsel', () => {
    // Alle mutaties op indelingen vernieuwen ['stageLayouts']; dat werkt
    // alleen zolang lijst en detail daar echt onder hangen.
    expect(stageLayoutKeys.all).toEqual(['stageLayouts']);
    expect(stageLayoutKeys.list(false)).toEqual(['stageLayouts', 'list', { includeTemplates: false }]);
    expect(stageLayoutKeys.detail('l1')).toEqual(['stageLayouts', 'detail', 'l1']);
  });

  it('geeft de lijst met en zonder templates een eigen sleutel', () => {
    // Anders zou het vinkje "templates tonen" het antwoord van de vorige
    // stand uit de cache halen en niets lijken te doen.
    expect(stageLayoutKeys.list(true)).not.toEqual(stageLayoutKeys.list(false));
  });

  it('hangt de printkaarten onder de podiumindeling van hetzelfde concert', () => {
    // Hierdoor vernieuwt één invalidatie van concertStage ook de
    // printkaarten. Zouden dit losse takken zijn, dan kon iemand kaarten
    // uitprinten die niet meer bij de opgeslagen indeling horen.
    expect(stageLayoutKeys.printCards('c1').slice(0, 2)).toEqual(stageLayoutKeys.concertStage('c1'));
  });
});

// ==================== INDELINGEN OPHALEN ====================

describe('useStageLayouts - indelingen ophalen', () => {
  it('vraagt standaard de indelingen zonder templates op', async () => {
    alsMock(getStageLayouts).mockResolvedValue([{ id: 'l1', name: 'Grote zaal' }]);

    const { result } = renderHook(() => useStageLayouts(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getStageLayouts).toHaveBeenCalledWith(false);
  });

  it('haalt opnieuw op als de gebruiker templates erbij wil zien', async () => {
    alsMock(getStageLayouts).mockResolvedValue([]);

    const { result, rerender } = renderHook(({ templates }: { templates: boolean }) => useStageLayouts(templates), {
      wrapper,
      initialProps: { templates: false },
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    rerender({ templates: true });

    await waitFor(() => expect(getStageLayouts).toHaveBeenCalledTimes(2));
    expect(getStageLayouts).toHaveBeenLastCalledWith(true);
  });

  it('vraagt geen indelingdetail op zolang er geen id is', () => {
    const { result } = renderHook(() => useStageLayout(''), { wrapper });

    expect(getStageLayout).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('haalt het indelingdetail op zodra het id bekend is', async () => {
    alsMock(getStageLayout).mockResolvedValue({ id: 'l1', layoutData: { positions: [] } });

    const { result } = renderHook(() => useStageLayout('l1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getStageLayout).toHaveBeenCalledWith('l1');
  });

  it('meldt een fout als de indelingen niet opgehaald kunnen worden', async () => {
    alsMock(getStageLayouts).mockRejectedValue(serverfout('Database niet bereikbaar'));

    const { result } = renderHook(() => useStageLayouts(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });
});

// ==================== INDELINGEN BEHEREN ====================

describe('useStageLayouts - indelingen beheren', () => {
  it('maakt een indeling aan en vernieuwt alles onder stageLayouts', async () => {
    alsMock(createStageLayout).mockResolvedValue({ id: 'l9' });
    const nieuw = { name: 'Kerkopstelling', stageWidth: 1200, stageDepth: 800 };

    const { result } = renderHook(() => useCreateStageLayout(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(nieuw);
    });

    expect(createStageLayout).toHaveBeenCalledWith(nieuw);
    expect(isOngeldigGemaakt(['stageLayouts'])).toBe(true);
    expect(showSuccess).toHaveBeenCalledWith('Podiumindeling aangemaakt');
  });

  it('toont de foutmelding van de server als aanmaken mislukt', async () => {
    alsMock(createStageLayout).mockRejectedValue(serverfout('Naam is verplicht'));

    const { result } = renderHook(() => useCreateStageLayout(), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync({ name: '' })).rejects.toBeDefined();
    });

    expect(showError).toHaveBeenCalledWith('Naam is verplicht');
    expect(showSuccess).not.toHaveBeenCalled();
    expect(ongeldigGemaakt).toHaveLength(0);
  });

  it('stuurt bij wijzigen id en indeling gescheiden door', async () => {
    alsMock(updateStageLayout).mockResolvedValue({ message: 'ok' });
    const indeling = { name: 'Grote zaal', stageWidth: 1400 };

    const { result } = renderHook(() => useUpdateStageLayout(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ id: 'l1', layout: indeling });
    });

    expect(updateStageLayout).toHaveBeenCalledWith('l1', indeling);
    expect(isOngeldigGemaakt(['stageLayouts'])).toBe(true);
    expect(isOngeldigGemaakt(['stageLayouts', 'detail', 'l1'])).toBe(true);
    expect(showSuccess).toHaveBeenCalledWith('Podiumindeling bijgewerkt');
  });

  it('vernieuwt na het wijzigen van een indeling ook de podia van de concerten', async () => {
    // GET /concerts/:id/stage doet een JOIN op stage_layouts en geeft
    // layout_data, naam en podiumafmetingen live mee - er wordt geen kopie
    // bewaard. Wie in de podiumontwerper stoelen verplaatst en daarna een
    // concert opent, ziet dus de oude stoelen; en de printkaarten, die onder
    // dezelfde sleutel hangen, drukken die oude indeling ook af.
    alsMock(updateStageLayout).mockResolvedValue({ message: 'ok' });

    const { result } = renderHook(() => useUpdateStageLayout(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ id: 'l1', layout: { stageWidth: 1400 } });
    });

    expect(isOngeldigGemaakt(['concertStage'])).toBe(true);
  });

  it('haalt het openstaande indelingdetail daadwerkelijk opnieuw op na een wijziging', async () => {
    alsMock(getStageLayout).mockResolvedValue({ id: 'l1', name: 'Oud' });
    alsMock(updateStageLayout).mockResolvedValue({ message: 'ok' });

    const { result } = renderHook(() => ({ detail: useStageLayout('l1'), wijzig: useUpdateStageLayout() }), {
      wrapper,
    });

    await waitFor(() => expect(result.current.detail.isSuccess).toBe(true));

    alsMock(getStageLayout).mockResolvedValue({ id: 'l1', name: 'Nieuw' });
    await act(async () => {
      await result.current.wijzig.mutateAsync({ id: 'l1', layout: { name: 'Nieuw' } });
    });

    await waitFor(() => expect(result.current.detail.data).toEqual({ id: 'l1', name: 'Nieuw' }));
  });

  it('verwijdert een indeling en vernieuwt de indelingenlijst', async () => {
    alsMock(deleteStageLayout).mockResolvedValue({ message: 'ok' });

    const { result } = renderHook(() => useDeleteStageLayout(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync('l1');
    });

    expect(deleteStageLayout).toHaveBeenCalledWith('l1');
    expect(isOngeldigGemaakt(['stageLayouts'])).toBe(true);
    expect(showSuccess).toHaveBeenCalledWith('Podiumindeling verwijderd');
  });

  it('toont de melding van de server als de indeling nog door concerten gebruikt wordt', async () => {
    alsMock(deleteStageLayout).mockRejectedValue(
      serverfout('Deze podiumindeling wordt gebruikt door 2 concert(en). Verwijder eerst de toewijzingen.'),
    );

    const { result } = renderHook(() => useDeleteStageLayout(), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync('l1')).rejects.toBeDefined();
    });

    expect(showError).toHaveBeenCalledWith(
      'Deze podiumindeling wordt gebruikt door 2 concert(en). Verwijder eerst de toewijzingen.',
    );
    expect(showSuccess).not.toHaveBeenCalled();
    expect(ongeldigGemaakt).toHaveLength(0);
  });

  it('dupliceert een indeling met een eigen naam', async () => {
    alsMock(duplicateStageLayout).mockResolvedValue({ id: 'l2' });

    const { result } = renderHook(() => useDuplicateStageLayout(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ id: 'l1', name: 'Grote zaal (kopie)' });
    });

    expect(duplicateStageLayout).toHaveBeenCalledWith('l1', 'Grote zaal (kopie)');
    expect(isOngeldigGemaakt(['stageLayouts'])).toBe(true);
    expect(showSuccess).toHaveBeenCalledWith('Podiumindeling gedupliceerd');
  });

  it('dupliceert zonder naam als de gebruiker er geen invult', async () => {
    alsMock(duplicateStageLayout).mockResolvedValue({ id: 'l2' });

    const { result } = renderHook(() => useDuplicateStageLayout(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ id: 'l1' });
    });

    expect(duplicateStageLayout).toHaveBeenCalledWith('l1', undefined);
  });
});

// ==================== PODIUM VAN EEN CONCERT ====================

describe('useStageLayouts - podium van een concert', () => {
  it('vraagt het concertpodium pas op als het concert bekend is', () => {
    const { result } = renderHook(() => useConcertStage(''), { wrapper });

    expect(getConcertStage).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('haalt het concertpodium op zodra het concert bekend is', async () => {
    alsMock(getConcertStage).mockResolvedValue({ concert: { id: 'c1' }, assignment: null });

    const { result } = renderHook(() => useConcertStage('c1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getConcertStage).toHaveBeenCalledWith('c1');
    // Een concert zonder indeling is geen fout: het scherm laat dan de
    // keuzelijst met indelingen zien.
    expect(result.current.data?.assignment).toBeNull();
  });

  it('slaat het podium op met concert, indeling en bezetting als losse argumenten', async () => {
    alsMock(saveConcertStage).mockResolvedValue({ message: 'ok' });
    const bezetting = { p1: { userId: 'u1', instrument: 'Trompet' } };

    const { result } = renderHook(() => useSaveConcertStage(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ concertId: 'c1', layoutId: 'l1', assignments: bezetting });
    });

    expect(saveConcertStage).toHaveBeenCalledWith('c1', 'l1', bezetting);
    expect(isOngeldigGemaakt(['concertStage', 'c1'])).toBe(true);
    expect(showSuccess).toHaveBeenCalledWith('Podiumindeling voor concert opgeslagen');
  });

  it('vernieuwt bij het opslaan alleen het podium van dit concert', async () => {
    // De indelingenlijst verandert niet door een concertbezetting, en het
    // podium van een ander concert al helemaal niet.
    alsMock(saveConcertStage).mockResolvedValue({ message: 'ok' });

    const { result } = renderHook(() => useSaveConcertStage(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ concertId: 'c1', layoutId: 'l1', assignments: {} });
    });

    expect(ongeldigGemaakt).toEqual([['concertStage', 'c1']]);
  });

  it('vernieuwt bij het opslaan ook de printkaarten van dat concert', async () => {
    // De printkaarten hangen onder ['concertStage', concertId, 'print'], dus
    // de invalidatie van ['concertStage', concertId] raakt ze mee. Deze test
    // bewijst dat, want er wordt echt opnieuw opgehaald.
    alsMock(getPrintableSeatCards).mockResolvedValue({ cards: [] });
    alsMock(saveConcertStage).mockResolvedValue({ message: 'ok' });

    const { result } = renderHook(() => ({ kaarten: usePrintableSeatCards('c1'), opslaan: useSaveConcertStage() }), {
      wrapper,
    });

    await waitFor(() => expect(result.current.kaarten.isSuccess).toBe(true));
    expect(getPrintableSeatCards).toHaveBeenCalledTimes(1);

    alsMock(getPrintableSeatCards).mockResolvedValue({ cards: [{ positionId: 'p1', musicianName: 'Jan Jansen' }] });
    await act(async () => {
      await result.current.opslaan.mutateAsync({ concertId: 'c1', layoutId: 'l1', assignments: {} });
    });

    await waitFor(() =>
      expect(result.current.kaarten.data).toEqual({ cards: [{ positionId: 'p1', musicianName: 'Jan Jansen' }] }),
    );
  });

  it('verwijdert het podium van een concert en vernieuwt dat concert', async () => {
    alsMock(deleteConcertStage).mockResolvedValue({ message: 'ok' });

    const { result } = renderHook(() => useDeleteConcertStage(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync('c1');
    });

    expect(isOngeldigGemaakt(['concertStage', 'c1'])).toBe(true);
    expect(showSuccess).toHaveBeenCalledWith('Podiumindeling van concert verwijderd');
  });

  it('toont een foutmelding als het podium niet opgeslagen kan worden', async () => {
    alsMock(saveConcertStage).mockRejectedValue(serverfout('Podiumindeling niet gevonden.'));

    const { result } = renderHook(() => useSaveConcertStage(), { wrapper });
    await act(async () => {
      await expect(
        result.current.mutateAsync({ concertId: 'c1', layoutId: 'l1', assignments: {} }),
      ).rejects.toBeDefined();
    });

    expect(showError).toHaveBeenCalledWith('Podiumindeling niet gevonden.');
    expect(ongeldigGemaakt).toHaveLength(0);
  });

  it('vraagt geen printkaarten op zolang er geen concert is', () => {
    const { result } = renderHook(() => usePrintableSeatCards(''), { wrapper });

    expect(getPrintableSeatCards).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
  });
});
