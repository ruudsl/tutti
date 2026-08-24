/**
 * De haken rond geluidsopnames.
 *
 * Anders dan de meeste haken in deze map roepen deze geen api-functie aan die
 * elders getoetst is: ze zetten hun verzoek hier ter plekke in elkaar. De
 * zoekreeks wordt met de hand aan elkaar geplakt en het opnamebestand gaat als
 * FormData de deur uit. Dat zijn precies de twee plekken waar een fout niets
 * kapotmaakt maar wel iets anders verstuurt dan bedoeld: een filter dat
 * wegvalt levert een lijst op die er compleet uitziet, en een veld dat als
 * "undefined" in de FormData belandt wordt aan de serverkant een tekst met vier
 * letters.
 *
 * Daarom kijken deze tests naar wat er precies verstuurd wordt - het pad, de
 * zoekreeks, elk veld in de FormData - en niet alleen of het verzoek slaagde.
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';

vi.mock('../../api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

import api from '../../api';
import {
  useAudioRecordings,
  useAudioRecording,
  useCreateRecording,
  useUpdateRecording,
  useDeleteRecording,
} from '../useAudioRecordings';

/** De api is gemockt; TypeScript kent alleen nog de echte signatuur. */
const alsMock = (fn: unknown) => fn as Mock;

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

const isOngeldigGemaakt = (key: unknown[]) => ongeldigGemaakt.some((k) => JSON.stringify(k) === JSON.stringify(key));

/** Het pad waarmee api.get als eerste is aangeroepen. */
const opgevraagdPad = () => alsMock(api.get).mock.calls[0][0] as string;

/** De zoekreeks van dat pad, als leesbaar paar-per-sleutel. */
const opgevraagdeFilters = () => Object.fromEntries(new URLSearchParams(opgevraagdPad().split('?')[1] ?? ''));

// ==================== OPHALEN ====================

describe('useAudioRecordings - de lijst ophalen', () => {
  it('haalt de opnames op en geeft ze door', async () => {
    alsMock(api.get).mockResolvedValue({ data: [{ id: 'op-1', title: 'Repetitie 12 sept' }] });

    const { result } = renderHook(() => useAudioRecordings(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: 'op-1', title: 'Repetitie 12 sept' }]);
    expect(opgevraagdPad().split('?')[0]).toBe('/audio-recordings');
  });

  it('vraagt zonder filters ook geen filters op', async () => {
    alsMock(api.get).mockResolvedValue({ data: [] });

    const { result } = renderHook(() => useAudioRecordings(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(opgevraagdeFilters()).toEqual({});
  });

  it('zet elk opgegeven filter in de zoekreeks', async () => {
    alsMock(api.get).mockResolvedValue({ data: [] });

    const { result } = renderHook(
      () =>
        useAudioRecordings({
          orchestraId: 'orkest-1',
          rehearsalId: 'rep-7',
          musicTitleId: 'stuk-3',
          onlyPublic: true,
        }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(opgevraagdeFilters()).toEqual({
      orchestraId: 'orkest-1',
      rehearsalId: 'rep-7',
      musicTitleId: 'stuk-3',
      onlyPublic: 'true',
    });
  });

  it('laat onlyPublic:false weg in plaats van "false" te versturen', async () => {
    alsMock(api.get).mockResolvedValue({ data: [] });

    const { result } = renderHook(() => useAudioRecordings({ onlyPublic: false, orchestraId: 'orkest-1' }), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // De tekst "false" is aan de serverkant waar, dus het verschil tussen
    // weglaten en meesturen is het verschil tussen alle opnames en geen enkele.
    expect(opgevraagdeFilters()).toEqual({ orchestraId: 'orkest-1' });
  });

  it('haalt opnieuw op als er een ander filter gekozen wordt', async () => {
    alsMock(api.get).mockResolvedValue({ data: [] });

    const { result, rerender } = renderHook(
      ({ orchestraId }: { orchestraId: string }) => useAudioRecordings({ orchestraId }),
      { wrapper, initialProps: { orchestraId: 'orkest-1' } },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    rerender({ orchestraId: 'orkest-2' });

    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
    expect(alsMock(api.get).mock.calls[1][0]).toContain('orchestraId=orkest-2');
  });

  it('meldt een fout in plaats van een lege lijst te doen alsof', async () => {
    alsMock(api.get).mockRejectedValue(new Error('netwerk weg'));

    const { result } = renderHook(() => useAudioRecordings(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });
});

describe('useAudioRecording - één opname', () => {
  it('vraagt niets op zolang er geen id is', () => {
    const { result } = renderHook(() => useAudioRecording(''), { wrapper });

    expect(api.get).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('haalt de opname op zodra het id bekend is', async () => {
    alsMock(api.get).mockResolvedValue({ data: { id: 'op-1', title: 'Repetitie' } });

    const { result } = renderHook(() => useAudioRecording('op-1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.get).toHaveBeenCalledWith('/audio-recordings/op-1');
    expect(result.current.data).toEqual({ id: 'op-1', title: 'Repetitie' });
  });
});

// ==================== OPNEMEN ====================

/** Leest de FormData van de eerste api.post terug als gewoon object. */
function verstuurdeVelden() {
  const body = alsMock(api.post).mock.calls[0][1] as FormData;
  const velden: Record<string, unknown> = {};
  body.forEach((waarde, sleutel) => {
    velden[sleutel] = waarde;
  });
  return velden;
}

describe('useCreateRecording', () => {
  const geluid = () => new Blob(['klanken'], { type: 'audio/webm' });

  it('verstuurt elk veld met de juiste naam en waarde', async () => {
    alsMock(api.post).mockResolvedValue({ data: { id: 'op-9' } });

    const { result } = renderHook(() => useCreateRecording(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({
        audio: geluid(),
        title: 'Repetitie 12 sept',
        description: 'Tweede helft',
        orchestraId: 'orkest-1',
        rehearsalId: 'rep-7',
        musicTitleId: 'stuk-3',
        sectionInstrumentId: 'sectie-2',
        durationSeconds: 187,
        isPublic: true,
      });
    });

    expect(alsMock(api.post).mock.calls[0][0]).toBe('/audio-recordings');
    const velden = verstuurdeVelden();
    expect(velden.title).toBe('Repetitie 12 sept');
    expect(velden.description).toBe('Tweede helft');
    expect(velden.orchestraId).toBe('orkest-1');
    expect(velden.rehearsalId).toBe('rep-7');
    expect(velden.musicTitleId).toBe('stuk-3');
    expect(velden.sectionInstrumentId).toBe('sectie-2');
    // FormData kent alleen tekst: het aantal seconden gaat als "187" mee, niet
    // als getal, en zeker niet als "[object Object]".
    expect(velden.durationSeconds).toBe('187');
    expect(velden.isPublic).toBe('true');
  });

  it('geeft het geluid een bestandsnaam mee', async () => {
    alsMock(api.post).mockResolvedValue({ data: { id: 'op-9' } });

    const { result } = renderHook(() => useCreateRecording(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ audio: geluid(), title: 'Zonder naam', durationSeconds: 12 });
    });

    // Zonder bestandsnaam noemt de browser het "blob", en dan heeft de server
    // geen extensie om het bestandstype aan af te lezen.
    const bestand = alsMock(api.post).mock.calls[0][1].get('audio') as File;
    expect(bestand.name).toBe('recording.webm');
  });

  it('laat lege keuzevelden helemaal weg', async () => {
    alsMock(api.post).mockResolvedValue({ data: { id: 'op-9' } });

    const { result } = renderHook(() => useCreateRecording(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ audio: geluid(), title: 'Kaal', durationSeconds: 5 });
    });

    const velden = verstuurdeVelden();
    // Een ontbrekend veld hoort er niet als de tekst "undefined" in te staan.
    expect(Object.keys(velden).sort()).toEqual(['audio', 'durationSeconds', 'title']);
  });

  it('stuurt isPublic:false wél mee, want dat is een keuze', async () => {
    alsMock(api.post).mockResolvedValue({ data: { id: 'op-9' } });

    const { result } = renderHook(() => useCreateRecording(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ audio: geluid(), title: 'Besloten', durationSeconds: 5, isPublic: false });
    });

    // Weglaten zou de server op zijn standaardwaarde laten terugvallen, en die
    // gaat over wie de opname mag horen.
    expect(verstuurdeVelden().isPublic).toBe('false');
  });

  it('meldt het bestandstype als multipart', async () => {
    alsMock(api.post).mockResolvedValue({ data: { id: 'op-9' } });

    const { result } = renderHook(() => useCreateRecording(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ audio: geluid(), title: 'Kaal', durationSeconds: 5 });
    });

    expect(alsMock(api.post).mock.calls[0][2]).toEqual({ headers: { 'Content-Type': 'multipart/form-data' } });
  });

  it('vernieuwt de lijst na het opslaan', async () => {
    alsMock(api.post).mockResolvedValue({ data: { id: 'op-9' } });

    const { result } = renderHook(() => useCreateRecording(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ audio: geluid(), title: 'Kaal', durationSeconds: 5 });
    });

    expect(isOngeldigGemaakt(['audio-recordings'])).toBe(true);
  });

  it('vernieuwt niets als het opslaan mislukt', async () => {
    alsMock(api.post).mockRejectedValue(new Error('bestand te groot'));

    const { result } = renderHook(() => useCreateRecording(), { wrapper });
    await act(async () => {
      await expect(
        result.current.mutateAsync({ audio: geluid(), title: 'Kaal', durationSeconds: 5 }),
      ).rejects.toBeDefined();
    });

    // Anders verdwijnt een opname die er nooit gekomen is even uit beeld en
    // komt hij daarna weer terug.
    expect(ongeldigGemaakt).toEqual([]);
  });
});

// ==================== WIJZIGEN EN VERWIJDEREN ====================

describe('useUpdateRecording', () => {
  it('stuurt het id in het pad en de rest in de body', async () => {
    alsMock(api.patch).mockResolvedValue({ data: { id: 'op-1' } });

    const { result } = renderHook(() => useUpdateRecording(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ id: 'op-1', title: 'Nieuwe titel', isPublic: false });
    });

    expect(alsMock(api.patch).mock.calls[0][0]).toBe('/audio-recordings/op-1');
    // Het id hoort niet nog eens in de body: dat is de sleutel, geen veld.
    expect(alsMock(api.patch).mock.calls[0][1]).toEqual({ title: 'Nieuwe titel', isPublic: false });
    expect(isOngeldigGemaakt(['audio-recordings'])).toBe(true);
  });
});

describe('useDeleteRecording', () => {
  it('verwijdert de opname en vernieuwt de lijst', async () => {
    alsMock(api.delete).mockResolvedValue({ data: {} });

    const { result } = renderHook(() => useDeleteRecording(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync('op-1');
    });

    expect(api.delete).toHaveBeenCalledWith('/audio-recordings/op-1');
    expect(isOngeldigGemaakt(['audio-recordings'])).toBe(true);
  });

  it('laat de lijst staan als het verwijderen mislukt', async () => {
    alsMock(api.delete).mockRejectedValue(new Error('geen rechten'));

    const { result } = renderHook(() => useDeleteRecording(), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync('op-1')).rejects.toBeDefined();
    });

    expect(ongeldigGemaakt).toEqual([]);
  });
});
