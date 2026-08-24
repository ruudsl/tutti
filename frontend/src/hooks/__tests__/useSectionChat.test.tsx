/**
 * De vraagkant van de stemgroepchat.
 *
 * Deze hooks bepalen welk adres de browser opvraagt en onder welke sleutel het
 * antwoord in de cache belandt. Dat klinkt als boekhouding, maar het is precies
 * de plek waar een chat van iemand anders in beeld kan komen: als twee kanalen
 * dezelfde cachesleutel delen, ziet de tweede het antwoord van de eerste, en
 * die twee kanalen kunnen bij verschillende verenigingen horen. Aan de
 * serverkant is eerder gevonden dat de sectiechat van een andere vereniging mee
 * te lezen was; de frontend mag daar in elk geval zelf geen tweede gat naast
 * maken.
 *
 * De api-laag is afgevangen, dus er gaat geen enkel netwerkverzoek uit.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const { api } = vi.hoisted(() => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../../api', () => ({ default: api }));

import {
  useChatChannels,
  useChatMessages,
  usePinnedMessages,
  useSendMessage,
  useEditMessage,
  useDeleteMessage,
  usePinMessage,
  useEnsureChatChannels,
} from '../useSectionChat';

let client: QueryClient;

function omhulsel({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** De adressen die de hooks tot nu toe hebben opgevraagd. */
function opgevraagdeAdressen(): string[] {
  return api.get.mock.calls.map((c) => c[0] as string);
}

beforeEach(() => {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  api.get.mockReset();
  api.post.mockReset();
  api.patch.mockReset();
  api.delete.mockReset();
});

describe('de kanalenlijst', () => {
  it('vraagt alleen de kanalen van de gevraagde vereniging op', async () => {
    api.get.mockResolvedValue({ data: [] });

    const { result } = renderHook(() => useChatChannels('vereniging-a'), { wrapper: omhulsel });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(opgevraagdeAdressen()).toEqual(['/section-chat/channels?orchestraId=vereniging-a']);
  });

  it('laat de vereniging weg als er geen gekozen is', async () => {
    api.get.mockResolvedValue({ data: [] });

    const { result } = renderHook(() => useChatChannels(), { wrapper: omhulsel });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(opgevraagdeAdressen()).toEqual(['/section-chat/channels']);
  });

  it('deelt de kanalen van twee verenigingen niet dezelfde plank', async () => {
    // Zouden ze dezelfde cachesleutel hebben, dan krijgt de tweede vereniging
    // de kanalenlijst van de eerste te zien zonder dat er ooit iets opgevraagd
    // wordt.
    api.get.mockImplementation((adres: string) =>
      Promise.resolve({
        data: adres.includes('vereniging-a')
          ? [{ id: 'kanaal-a', name: 'Klarinet A' }]
          : [{ id: 'kanaal-b', name: 'Hoorn B' }],
      }),
    );

    const a = renderHook(() => useChatChannels('vereniging-a'), { wrapper: omhulsel });
    await waitFor(() => expect(a.result.current.data).toBeDefined());
    const b = renderHook(() => useChatChannels('vereniging-b'), { wrapper: omhulsel });
    await waitFor(() => expect(b.result.current.data).toBeDefined());

    expect(a.result.current.data).toEqual([{ id: 'kanaal-a', name: 'Klarinet A' }]);
    expect(b.result.current.data).toEqual([{ id: 'kanaal-b', name: 'Hoorn B' }]);
    expect(api.get).toHaveBeenCalledTimes(2);
  });
});

describe('de berichten van een kanaal', () => {
  it('vraagt de berichten van het gekozen kanaal op', async () => {
    api.get.mockResolvedValue({ data: [] });

    const { result } = renderHook(() => useChatMessages('kanaal-a'), { wrapper: omhulsel });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(opgevraagdeAdressen()).toEqual(['/section-chat/channels/kanaal-a/messages?']);
  });

  it('vraagt niets op zolang er geen kanaal gekozen is', async () => {
    // SectionChat roept deze hook aan met een lege tekst zolang de lijst nog
    // laadt. Dat mag geen verzoek naar /channels//messages opleveren.
    const { result } = renderHook(() => useChatMessages(''), { wrapper: omhulsel });

    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'));
    expect(api.get).not.toHaveBeenCalled();
  });

  it('geeft de berichten van kanaal A nooit terug voor kanaal B', async () => {
    // De grens. Twee kanalen kunnen bij verschillende secties of zelfs
    // verschillende verenigingen horen; wie ze op dezelfde cachesleutel zet,
    // laat het ene gesprek in het andere lekken.
    api.get.mockImplementation((adres: string) =>
      Promise.resolve({
        data: adres.includes('kanaal-a')
          ? [{ id: 'b1', content: 'Alleen voor sectie A' }]
          : [{ id: 'b2', content: 'Alleen voor sectie B' }],
      }),
    );

    const a = renderHook(() => useChatMessages('kanaal-a'), { wrapper: omhulsel });
    await waitFor(() => expect(a.result.current.data).toBeDefined());
    const b = renderHook(() => useChatMessages('kanaal-b'), { wrapper: omhulsel });
    await waitFor(() => expect(b.result.current.data).toBeDefined());

    expect(JSON.stringify(b.result.current.data)).not.toContain('Alleen voor sectie A');
    expect(b.result.current.data).toEqual([{ id: 'b2', content: 'Alleen voor sectie B' }]);
  });

  it('geeft het aantal en het beginpunt mee bij het teruglezen', async () => {
    api.get.mockResolvedValue({ data: [] });

    const { result } = renderHook(() => useChatMessages('kanaal-a', { before: 'b9', limit: 25 }), {
      wrapper: omhulsel,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(opgevraagdeAdressen()[0]).toBe('/section-chat/channels/kanaal-a/messages?before=b9&limit=25');
  });

  it('houdt teruglezen en de gewone lijst uit elkaar', async () => {
    api.get.mockResolvedValue({ data: [] });

    renderHook(() => useChatMessages('kanaal-a'), { wrapper: omhulsel });
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));
    renderHook(() => useChatMessages('kanaal-a', { limit: 25 }), { wrapper: omhulsel });

    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
  });
});

describe('vastgepinde berichten', () => {
  it('vraagt de pins van het gekozen kanaal op', async () => {
    api.get.mockResolvedValue({ data: [] });

    const { result } = renderHook(() => usePinnedMessages('kanaal-a'), { wrapper: omhulsel });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(opgevraagdeAdressen()).toEqual(['/section-chat/channels/kanaal-a/pinned']);
  });

  it('vraagt niets op zonder kanaal', async () => {
    const { result } = renderHook(() => usePinnedMessages(''), { wrapper: omhulsel });

    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'));
    expect(api.get).not.toHaveBeenCalled();
  });
});

describe('een bericht versturen', () => {
  it('stuurt het naar het kanaal waar het thuishoort', async () => {
    api.post.mockResolvedValue({ data: { id: 'b3' } });

    const { result } = renderHook(() => useSendMessage(), { wrapper: omhulsel });
    await result.current.mutateAsync({ channelId: 'kanaal-a', content: 'Tot zondag' });

    expect(api.post).toHaveBeenCalledWith('/section-chat/channels/kanaal-a/messages', {
      content: 'Tot zondag',
      replyToId: undefined,
    });
  });

  it('ververst daarna alleen de berichten van dat kanaal', async () => {
    // Anders wordt het gesprek van een ander kanaal onnodig opnieuw opgehaald,
    // en bij een cache die per vereniging gescheiden hoort te zijn is zo'n
    // brede verversing precies waar het misgaat.
    api.post.mockResolvedValue({ data: { id: 'b4' } });
    const verversen = vi.spyOn(client, 'invalidateQueries');

    const { result } = renderHook(() => useSendMessage(), { wrapper: omhulsel });
    await result.current.mutateAsync({ channelId: 'kanaal-a', content: 'Hoi', replyToId: 'b1' });

    expect(verversen).toHaveBeenCalledWith({ queryKey: ['chat-messages', 'kanaal-a'] });
    expect(verversen).not.toHaveBeenCalledWith({ queryKey: ['chat-messages', 'kanaal-b'] });
  });

  it('geeft een mislukking door aan de aanroeper', async () => {
    api.post.mockRejectedValue(new Error('server weigert'));

    const { result } = renderHook(() => useSendMessage(), { wrapper: omhulsel });

    await expect(result.current.mutateAsync({ channelId: 'kanaal-a', content: 'Hoi' })).rejects.toThrow(
      'server weigert',
    );
  });
});

describe('bewerken, verwijderen en vastpinnen', () => {
  it('bewerkt een bericht op zijn eigen adres', async () => {
    api.patch.mockResolvedValue({ data: {} });

    const { result } = renderHook(() => useEditMessage(), { wrapper: omhulsel });
    await result.current.mutateAsync({ messageId: 'b1', content: 'Toch anders' });

    expect(api.patch).toHaveBeenCalledWith('/section-chat/messages/b1', { content: 'Toch anders' });
  });

  it('verwijdert een bericht op zijn eigen adres', async () => {
    api.delete.mockResolvedValue({ data: {} });

    const { result } = renderHook(() => useDeleteMessage(), { wrapper: omhulsel });
    await result.current.mutateAsync('b1');

    expect(api.delete).toHaveBeenCalledWith('/section-chat/messages/b1');
  });

  it('pint een bericht vast en ververst de pinlijst', async () => {
    api.post.mockResolvedValue({ data: { pinned: true } });
    const verversen = vi.spyOn(client, 'invalidateQueries');

    const { result } = renderHook(() => usePinMessage(), { wrapper: omhulsel });
    const antwoord = await result.current.mutateAsync('b1');

    expect(api.post).toHaveBeenCalledWith('/section-chat/messages/b1/pin');
    expect(antwoord).toEqual({ pinned: true });
    expect(verversen).toHaveBeenCalledWith({ queryKey: ['pinned-messages'] });
  });

  it('laat de server de ontbrekende kanalen aanmaken en haalt de lijst opnieuw op', async () => {
    api.post.mockResolvedValue({ data: { created: 2 } });
    const verversen = vi.spyOn(client, 'invalidateQueries');

    const { result } = renderHook(() => useEnsureChatChannels(), { wrapper: omhulsel });
    await result.current.mutateAsync();

    expect(api.post).toHaveBeenCalledWith('/section-chat/channels/ensure');
    expect(verversen).toHaveBeenCalledWith({ queryKey: ['chat-channels'] });
  });
});
