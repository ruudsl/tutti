/**
 * De haken rond invalverzoeken.
 *
 * Het zwaartepunt van deze haken zit niet in het ophalen maar in wat er ná een
 * geslaagde mutatie ongeldig wordt gemaakt. Een invalverzoek staat op twee
 * plekken tegelijk op het scherm: in de lijst (met de tellers "ingevuld" en
 * "bevestigd") en in het detailvenster met de uitnodigingen. Wie na het
 * uitnodigen van een muzikant alleen het detail vernieuwt, laat de lijst
 * eronder een verouderde teller tonen - en dat ziet er precies zo uit als een
 * kloppende teller.
 *
 * Daarom controleert elke mutatietest welke queryKeys er ongeldig zijn gemaakt,
 * en niet alleen dat de api is aangeroepen. De sleutels komen uit
 * `replacementRequestKeys`, zodat de test meebeweegt met een hernoeming maar
 * niet met een gemiste vernieuwing.
 *
 * Verder ligt hier vast dat een detail of een suggestie niets opvraagt zolang
 * er geen id is: zonder die rem gaat er een verzoek naar `/…/undefined`.
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';

vi.mock('../../api/replacement-requests', () => ({
  getReplacementRequests: vi.fn(),
  getReplacementRequest: vi.fn(),
  createReplacementRequest: vi.fn(),
  updateReplacementRequest: vi.fn(),
  cancelReplacementRequest: vi.fn(),
  inviteMusician: vi.fn(),
  updateAssignment: vi.fn(),
  getReplacementSuggestions: vi.fn(),
}));

vi.mock('../../utils/toast', () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}));

import {
  replacementRequestKeys,
  useReplacementRequests,
  useReplacementRequest,
  useReplacementSuggestions,
  useCreateReplacementRequest,
  useUpdateReplacementRequest,
  useCancelReplacementRequest,
  useInviteMusician,
  useUpdateAssignment,
} from '../useReplacementRequests';
import {
  getReplacementRequests,
  getReplacementRequest,
  createReplacementRequest,
  updateReplacementRequest,
  cancelReplacementRequest,
  inviteMusician,
  updateAssignment,
  getReplacementSuggestions,
} from '../../api/replacement-requests';
import { showSuccess, showError } from '../../utils/toast';

/** De api is gemockt; TypeScript kent alleen nog de echte signatuur. */
const alsMock = (fn: unknown) => fn as Mock;

/** Een axios-achtige fout zoals de backend hem teruggeeft. */
const serverfout = (melding: string) => ({
  isAxiosError: true,
  response: { data: { error: melding } },
});

let queryClient: QueryClient;
/** Alle queryKeys die de haken ongeldig hebben gemaakt, in volgorde. */
let ongeldigGemaakt: unknown[];

beforeEach(() => {
  vi.clearAllMocks();
  queryClient = new QueryClient({
    defaultOptions: {
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
const isOngeldigGemaakt = (key: readonly unknown[]) =>
  ongeldigGemaakt.some((k) => JSON.stringify(k) === JSON.stringify(key));

// ==================== SLEUTELS ====================

describe('replacementRequestKeys', () => {
  it('nestelt elke sleutel onder dezelfde stam', () => {
    // Alles hangt onder ['replacementRequests']. Dat is geen opsmuk: de mutaties
    // maken die stam als geheel ongeldig, en dat werkt alleen als lijst, detail
    // en suggesties er echt onder hangen.
    expect(replacementRequestKeys.all).toEqual(['replacementRequests']);
    expect(replacementRequestKeys.lists()).toEqual(['replacementRequests', 'list']);
    expect(replacementRequestKeys.list({ status: 'open' })).toEqual([
      'replacementRequests',
      'list',
      { status: 'open' },
    ]);
    expect(replacementRequestKeys.detail('v-1')).toEqual(['replacementRequests', 'detail', 'v-1']);
    expect(replacementRequestKeys.suggestions('c-1', 'concert')).toEqual([
      'replacementRequests',
      'suggestions',
      'c-1',
      'concert',
    ]);
  });

  it('geeft twee verschillende aanvragen twee verschillende sleutels', () => {
    // Zonder het id in de sleutel deelt elk detail dezelfde cache, en toont het
    // tweede venster de gegevens van het eerste.
    expect(replacementRequestKeys.detail('v-1')).not.toEqual(replacementRequestKeys.detail('v-2'));
  });
});

// ==================== OPHALEN ====================

describe('useReplacementRequests - de lijst', () => {
  it('haalt de aanvragen op', async () => {
    alsMock(getReplacementRequests).mockResolvedValue([{ id: 'v-1', status: 'open' }]);

    const { result } = renderHook(() => useReplacementRequests(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: 'v-1', status: 'open' }]);
  });

  it('geeft de filters ongewijzigd door', async () => {
    alsMock(getReplacementRequests).mockResolvedValue([]);
    const filters = { status: 'open', urgency: 'critical', eventType: 'concert', instrumentId: 'inst-1' };

    const { result } = renderHook(() => useReplacementRequests(filters), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getReplacementRequests).toHaveBeenCalledWith(filters);
  });

  it('haalt opnieuw op als er een ander filter gekozen wordt', async () => {
    alsMock(getReplacementRequests).mockResolvedValue([]);

    const { result, rerender } = renderHook(({ status }: { status: string }) => useReplacementRequests({ status }), {
      wrapper,
      initialProps: { status: 'open' },
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    rerender({ status: 'filled' });

    await waitFor(() => expect(getReplacementRequests).toHaveBeenCalledTimes(2));
    expect(getReplacementRequests).toHaveBeenLastCalledWith({ status: 'filled' });
  });

  it('meldt een fout in plaats van een lege lijst', async () => {
    alsMock(getReplacementRequests).mockRejectedValue(serverfout('Database niet bereikbaar'));

    const { result } = renderHook(() => useReplacementRequests(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });
});

describe('useReplacementRequest - het detail', () => {
  it('vraagt niets op zolang er geen aanvraag gekozen is', () => {
    const { result } = renderHook(() => useReplacementRequest(null), { wrapper });

    // Zonder deze rem gaat er een verzoek naar /replacement-requests/undefined.
    expect(getReplacementRequest).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('haalt het detail op zodra er een aanvraag gekozen is', async () => {
    alsMock(getReplacementRequest).mockResolvedValue({ id: 'v-1', assignments: [] });

    const { result } = renderHook(() => useReplacementRequest('v-1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getReplacementRequest).toHaveBeenCalledWith('v-1');
  });
});

describe('useReplacementSuggestions', () => {
  it('vraagt niets op zonder gebeurtenis', () => {
    const { result } = renderHook(() => useReplacementSuggestions(null, 'concert'), { wrapper });

    expect(getReplacementSuggestions).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('geeft gebeurtenis en soort allebei door', async () => {
    alsMock(getReplacementSuggestions).mockResolvedValue([]);

    const { result } = renderHook(() => useReplacementSuggestions('c-1', 'concert'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getReplacementSuggestions).toHaveBeenCalledWith('c-1', 'concert');
  });

  it('haalt opnieuw op als alleen de soort gebeurtenis verandert', async () => {
    alsMock(getReplacementSuggestions).mockResolvedValue([]);

    const { result, rerender } = renderHook(({ soort }: { soort: string }) => useReplacementSuggestions('c-1', soort), {
      wrapper,
      initialProps: { soort: 'concert' },
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    rerender({ soort: 'rehearsal' });

    // De soort staat in de sleutel; stond hij er niet in, dan bleven de
    // suggesties voor een concert bij een repetitie in beeld.
    await waitFor(() => expect(getReplacementSuggestions).toHaveBeenCalledTimes(2));
    expect(getReplacementSuggestions).toHaveBeenLastCalledWith('c-1', 'rehearsal');
  });
});

// ==================== MUTATIES ====================

const AANVRAAG = {
  eventType: 'concert' as const,
  eventId: 'c-1',
  eventDate: '2026-09-12',
  instrumentId: 'inst-1',
  positionsNeeded: 2,
  urgency: 'high' as const,
  notes: null,
  deadline: null,
};

describe('useCreateReplacementRequest', () => {
  it('stuurt de aanvraag door en vernieuwt alles eronder', async () => {
    alsMock(createReplacementRequest).mockResolvedValue({ id: 'v-9' });

    const { result } = renderHook(() => useCreateReplacementRequest(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(AANVRAAG);
    });

    expect(createReplacementRequest).toHaveBeenCalledWith(AANVRAAG);
    expect(isOngeldigGemaakt(replacementRequestKeys.all)).toBe(true);
    expect(showSuccess).toHaveBeenCalledWith('Verzoek aangemaakt');
  });

  it('toont de foutmelding van de server en meldt geen succes', async () => {
    alsMock(createReplacementRequest).mockRejectedValue(serverfout('Datum ligt in het verleden'));

    const { result } = renderHook(() => useCreateReplacementRequest(), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync(AANVRAAG)).rejects.toBeDefined();
    });

    expect(showError).toHaveBeenCalledWith('Datum ligt in het verleden');
    expect(showSuccess).not.toHaveBeenCalled();
    expect(ongeldigGemaakt).toEqual([]);
  });
});

describe('useUpdateReplacementRequest', () => {
  it('vernieuwt zowel de stam als het detail van deze aanvraag', async () => {
    alsMock(updateReplacementRequest).mockResolvedValue({ message: 'ok' });

    const { result } = renderHook(() => useUpdateReplacementRequest(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ id: 'v-1', data: { urgency: 'critical' } });
    });

    expect(updateReplacementRequest).toHaveBeenCalledWith('v-1', { urgency: 'critical' });
    expect(isOngeldigGemaakt(replacementRequestKeys.all)).toBe(true);
    expect(isOngeldigGemaakt(replacementRequestKeys.detail('v-1'))).toBe(true);
    expect(showSuccess).toHaveBeenCalledWith('Verzoek bijgewerkt');
  });

  it('raakt het detail van een andere aanvraag niet aan', async () => {
    alsMock(updateReplacementRequest).mockResolvedValue({ message: 'ok' });

    const { result } = renderHook(() => useUpdateReplacementRequest(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ id: 'v-1', data: { urgency: 'low' } });
    });

    expect(isOngeldigGemaakt(replacementRequestKeys.detail('v-2'))).toBe(false);
  });
});

describe('useCancelReplacementRequest', () => {
  it('annuleert en vernieuwt de stam', async () => {
    alsMock(cancelReplacementRequest).mockResolvedValue({ message: 'ok' });

    const { result } = renderHook(() => useCancelReplacementRequest(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync('v-1');
    });

    expect(cancelReplacementRequest).toHaveBeenCalledWith('v-1');
    expect(isOngeldigGemaakt(replacementRequestKeys.all)).toBe(true);
    expect(showSuccess).toHaveBeenCalledWith('Verzoek geannuleerd');
  });

  it('meldt de fout als annuleren niet mag', async () => {
    alsMock(cancelReplacementRequest).mockRejectedValue(serverfout('Aanvraag is al ingevuld'));

    const { result } = renderHook(() => useCancelReplacementRequest(), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync('v-1')).rejects.toBeDefined();
    });

    expect(showError).toHaveBeenCalledWith('Aanvraag is al ingevuld');
    expect(ongeldigGemaakt).toEqual([]);
  });
});

describe('useInviteMusician', () => {
  const UITNODIGING = { externalMusicianId: 'm-1', notes: null, feeAmount: 125 };

  it('vernieuwt het detail én de lijsten', async () => {
    alsMock(inviteMusician).mockResolvedValue({ id: 'toew-1' });

    const { result } = renderHook(() => useInviteMusician(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ requestId: 'v-1', data: UITNODIGING });
    });

    expect(inviteMusician).toHaveBeenCalledWith('v-1', UITNODIGING);
    // Het detail toont de uitnodiging, de lijst de teller erboven. Vergeet je
    // de lijst, dan blijft daar "0/2" staan terwijl er iemand uitgenodigd is.
    expect(isOngeldigGemaakt(replacementRequestKeys.detail('v-1'))).toBe(true);
    expect(isOngeldigGemaakt(replacementRequestKeys.lists())).toBe(true);
    expect(showSuccess).toHaveBeenCalledWith('Muzikant uitgenodigd');
  });

  it('meldt de fout van de server', async () => {
    alsMock(inviteMusician).mockRejectedValue(serverfout('Muzikant is al uitgenodigd'));

    const { result } = renderHook(() => useInviteMusician(), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync({ requestId: 'v-1', data: UITNODIGING })).rejects.toBeDefined();
    });

    expect(showError).toHaveBeenCalledWith('Muzikant is al uitgenodigd');
  });
});

describe('useUpdateAssignment', () => {
  it('geeft aanvraag, toewijzing en gegevens in die volgorde door', async () => {
    alsMock(updateAssignment).mockResolvedValue({ message: 'ok' });

    const { result } = renderHook(() => useUpdateAssignment(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({
        requestId: 'v-1',
        assignmentId: 'toew-1',
        data: { status: 'confirmed' },
      });
    });

    // Twee ids achter elkaar in dezelfde aanroep: verwisseld werkt het pad nog
    // steeds, maar wijzigt de verkeerde toewijzing.
    expect(updateAssignment).toHaveBeenCalledWith('v-1', 'toew-1', { status: 'confirmed' });
    expect(isOngeldigGemaakt(replacementRequestKeys.detail('v-1'))).toBe(true);
    expect(isOngeldigGemaakt(replacementRequestKeys.lists())).toBe(true);
    expect(showSuccess).toHaveBeenCalledWith('Status bijgewerkt');
  });

  it('meldt de fout en vernieuwt niets', async () => {
    alsMock(updateAssignment).mockRejectedValue(serverfout('Onbekende status'));

    const { result } = renderHook(() => useUpdateAssignment(), { wrapper });
    await act(async () => {
      await expect(
        result.current.mutateAsync({ requestId: 'v-1', assignmentId: 'toew-1', data: { status: 'confirmed' } }),
      ).rejects.toBeDefined();
    });

    expect(showError).toHaveBeenCalledWith('Onbekende status');
    expect(ongeldigGemaakt).toEqual([]);
  });
});
