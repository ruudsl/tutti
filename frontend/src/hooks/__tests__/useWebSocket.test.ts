/**
 * De laag rond de socketverbinding.
 *
 * De hook praat met een echte server via socket.io. Dat is hier niet te
 * gebruiken, dus `socket.io-client` is afgevangen door een nepsocket die
 * bijhoudt welke luisteraars erop gezet zijn en waarmee een test een
 * binnenkomend bericht kan naspelen. Er gaat dus geen enkel netwerkverzoek uit.
 *
 * Wat hier getest wordt is niet socket.io zelf, maar de laag eromheen: wanneer
 * er wel en niet verbonden wordt, wat de gebruiker van het wegvallen merkt,
 * wat er met een onbruikbaar bericht gebeurt, en of er bij het verdwijnen van
 * het scherm niets blijft hangen. Dat laatste is geen schoonheidsfoutje: een
 * socket die blijft staan levert berichten af aan een scherm dat er niet meer
 * is, en bij elke keer opnieuw openen komt er een verbinding bij.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

/** Een nepsocket: onthoudt luisteraars en laat een test ze afvuren. */
class NepSocket {
  connected = false;
  disconnectAangeroepen = 0;
  verstuurd: Array<{ event: string; data: unknown }> = [];
  private luisteraars = new Map<string, Array<(data: unknown) => void>>();

  on(event: string, cb: (data: unknown) => void) {
    const lijst = this.luisteraars.get(event) ?? [];
    lijst.push(cb);
    this.luisteraars.set(event, lijst);
    return this;
  }

  emit(event: string, data: unknown) {
    this.verstuurd.push({ event, data });
    return this;
  }

  disconnect() {
    this.disconnectAangeroepen += 1;
    this.connected = false;
    return this;
  }

  /** Speelt een bericht van de server na. */
  ontvang(event: string, data?: unknown) {
    for (const cb of this.luisteraars.get(event) ?? []) cb(data);
  }
}

const { sockets, io, aanmelding } = vi.hoisted(() => ({
  sockets: [] as any[],
  io: vi.fn(),
  aanmelding: { user: null as { id: string; role: string } | null },
}));

vi.mock('socket.io-client', () => ({
  io: (...args: unknown[]) => io(...args),
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: aanmelding.user }),
}));

/** De socket die als laatste door de hook is opgezet. */
function laatsteSocket(): NepSocket {
  return sockets[sockets.length - 1];
}

/** Zet de socket op verbonden en meldt dat aan de hook, zoals de server doet. */
function verbind(socket: NepSocket) {
  socket.connected = true;
  act(() => socket.ontvang('connect'));
}

beforeEach(() => {
  sockets.length = 0;
  io.mockReset();
  io.mockImplementation(() => {
    const socket = new NepSocket();
    sockets.push(socket);
    return socket;
  });
  aanmelding.user = { id: 'gebruiker-1', role: 'member' };
  localStorage.setItem('token', 'nep-token-alleen-voor-de-test');
});

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

async function laadHook() {
  const { useWebSocket } = await import('../useWebSocket');
  return renderHook(() => useWebSocket());
}

describe('verbinden', () => {
  it('verbindt zodra er een aangemelde gebruiker met een token is', async () => {
    await laadHook();

    expect(io).toHaveBeenCalledTimes(1);
    expect(io.mock.calls[0][1]).toMatchObject({
      auth: { token: 'nep-token-alleen-voor-de-test' },
      reconnection: true,
    });
  });

  it('verbindt niet zonder token, ook niet met een aangemelde gebruiker', async () => {
    localStorage.removeItem('token');

    await laadHook();

    expect(io).not.toHaveBeenCalled();
  });

  it('verbindt niet zolang niemand is aangemeld', async () => {
    aanmelding.user = null;

    await laadHook();

    expect(io).not.toHaveBeenCalled();
  });

  it('meldt pas verbonden te zijn als de server dat bevestigt', async () => {
    const { result } = await laadHook();

    expect(result.current.isConnected).toBe(false);

    verbind(laatsteSocket());

    await waitFor(() => expect(result.current.isConnected).toBe(true));
  });
});

describe('wegvallen en opnieuw proberen', () => {
  it('meldt het wegvallen van de verbinding', async () => {
    const { result } = await laadHook();
    const socket = laatsteSocket();
    verbind(socket);
    await waitFor(() => expect(result.current.isConnected).toBe(true));

    socket.connected = false;
    act(() => socket.ontvang('disconnect'));

    await waitFor(() => expect(result.current.isConnected).toBe(false));
  });

  it('laat het opnieuw proberen aan socket.io over, met een bovengrens', async () => {
    // Zonder bovengrens blijft een afgemelde of geblokkeerde client eeuwig
    // tegen de server aan praten. De hook hoort die grens mee te geven.
    await laadHook();

    expect(io.mock.calls[0][1]).toMatchObject({
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelayMax: 5000,
    });
  });

  it('opent geen tweede verbinding als de eerste nog aan het verbinden is', async () => {
    // BEWIJS. Dit was fout: de bewaking keek naar `socketRef.current?.connected`,
    // en die staat tussen `io()` en het `connect`-antwoord van de server nog op
    // false. Wie in dat gat opnieuw verbindt, kreeg een tweede socket die de
    // eerste uit de ref duwde. De eerste werd daarna nooit meer afgesloten -
    // hij bleef berichten afleveren, zodat elk bericht dubbel binnenkwam, en
    // ook het opruimen bij het verdwijnen van het scherm kon hem niet meer
    // vinden. Op de oude code is deze test rood: io wordt twee keer geroepen.
    const { result } = await laadHook();
    expect(io).toHaveBeenCalledTimes(1);

    act(() => result.current.connect());

    expect(io).toHaveBeenCalledTimes(1);
    expect(sockets).toHaveLength(1);
  });

  it('verbindt wel opnieuw nadat de verbinding zelf is verbroken', async () => {
    const { result } = await laadHook();
    verbind(laatsteSocket());

    act(() => result.current.disconnect());
    act(() => result.current.connect());

    expect(io).toHaveBeenCalledTimes(2);
  });

  it('vergeet bij het verbreken wat er nog op het scherm stond', async () => {
    const { result } = await laadHook();
    const socket = laatsteSocket();
    verbind(socket);
    act(() => socket.ontvang('notification:new', { id: 'n1', title: 'Repetitie verzet' }));
    await waitFor(() => expect(result.current.lastMessage).not.toBeNull());

    act(() => result.current.disconnect());

    expect(result.current.lastMessage).toBeNull();
    expect(result.current.isConnected).toBe(false);
  });
});

describe('binnenkomende berichten', () => {
  it('geeft een chatbericht door aan wie zich erop heeft ingeschreven', async () => {
    const { result } = await laadHook();
    const socket = laatsteSocket();
    verbind(socket);
    const ontvangen: unknown[] = [];
    act(() => {
      result.current.onChatMessage((bericht) => ontvangen.push(bericht));
    });

    act(() => socket.ontvang('chat:message', { id: 'b1', content: 'Tot zondag' }));

    expect(ontvangen).toEqual([{ id: 'b1', content: 'Tot zondag' }]);
  });

  it('levert niets meer af nadat de inschrijving is opgezegd', async () => {
    const { result } = await laadHook();
    const socket = laatsteSocket();
    verbind(socket);
    const ontvangen: unknown[] = [];
    let zegOp: () => void = () => {};
    act(() => {
      zegOp = result.current.onChatMessage((bericht) => ontvangen.push(bericht));
    });

    act(() => zegOp());
    act(() => socket.ontvang('chat:message', { id: 'b2', content: 'Komt niet aan' }));

    expect(ontvangen).toEqual([]);
  });

  it('houdt de soorten berichten uit elkaar', async () => {
    const { result } = await laadHook();
    const socket = laatsteSocket();
    verbind(socket);
    const chat: unknown[] = [];
    const meldingen: unknown[] = [];
    act(() => {
      result.current.onChatMessage((b) => chat.push(b));
      result.current.onNotification((b) => meldingen.push(b));
    });

    act(() => socket.ontvang('notification:new', { id: 'n2', title: 'Nieuwe bladmuziek' }));

    expect(chat).toEqual([]);
    expect(meldingen).toHaveLength(1);
  });

  it('overleeft een bericht dat geen bruikbare inhoud heeft', async () => {
    // WACHT. De server hoort geldige JSON te sturen, maar een halve verbinding
    // of een oudere serverversie kan een kale tekst of niets afleveren. De hook
    // mag daar niet op omvallen: het scherm eromheen moet blijven staan.
    const { result } = await laadHook();
    const socket = laatsteSocket();
    verbind(socket);
    const ontvangen: unknown[] = [];
    act(() => {
      result.current.onChatMessage((bericht) => ontvangen.push(bericht));
    });

    expect(() => act(() => socket.ontvang('chat:message', '{dit is geen json'))).not.toThrow();
    expect(() => act(() => socket.ontvang('chat:message', undefined))).not.toThrow();

    expect(ontvangen).toEqual(['{dit is geen json', undefined]);
    expect(result.current.isConnected).toBe(true);
  });

  it('klaagt over een mislukte verbinding zonder het scherm mee te nemen', async () => {
    const fouten = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = await laadHook();
    const socket = laatsteSocket();

    act(() => socket.ontvang('connect_error', new Error('server niet bereikbaar')));

    expect(fouten).toHaveBeenCalledWith('WebSocket connection error:', 'server niet bereikbaar');
    expect(result.current.isConnected).toBe(false);
  });
});

describe('versturen', () => {
  it('stuurt een chatbericht mee met de vereniging waar het bij hoort', async () => {
    const { result } = await laadHook();
    const socket = laatsteSocket();
    verbind(socket);

    act(() => result.current.sendChatMessage('Tot zondag', 'vereniging-1'));

    expect(socket.verstuurd).toEqual([
      { event: 'chat:message', data: { content: 'Tot zondag', orchestraId: 'vereniging-1' } },
    ]);
  });

  it('stuurt niets zolang er geen verbinding staat', async () => {
    // Anders verdwijnt een bericht geruisloos in een socket die nog niet open
    // is, en denkt de gebruiker dat het verstuurd is.
    const { result } = await laadHook();
    const socket = laatsteSocket();

    act(() => result.current.sendChatMessage('Gaat de deur niet uit'));

    expect(socket.verstuurd).toEqual([]);
  });

  it('meldt het typen en het bekijken van een pagina door', async () => {
    const { result } = await laadHook();
    const socket = laatsteSocket();
    verbind(socket);

    act(() => {
      result.current.setTyping(true, 'vereniging-1');
      result.current.updatePresence('/repetities');
      result.current.updateSeating('concert-1', 'stoel-3', 'gebruiker-2');
    });

    expect(socket.verstuurd.map((v) => v.event)).toEqual(['chat:typing', 'presence:update', 'seating:update']);
  });
});

describe('opruimen', () => {
  it('sluit de verbinding als het scherm verdwijnt', async () => {
    const { unmount } = await laadHook();
    const socket = laatsteSocket();
    verbind(socket);

    unmount();

    expect(socket.disconnectAangeroepen).toBeGreaterThanOrEqual(1);
  });

  it('sluit de verbinding zodra de gebruiker zich afmeldt', async () => {
    const { useWebSocket } = await import('../useWebSocket');
    const { result, rerender } = renderHook(() => useWebSocket());
    const socket = laatsteSocket();
    verbind(socket);
    await waitFor(() => expect(result.current.isConnected).toBe(true));

    aanmelding.user = null;
    rerender();

    expect(socket.disconnectAangeroepen).toBeGreaterThanOrEqual(1);
    await waitFor(() => expect(result.current.isConnected).toBe(false));
  });

  it('laat na herhaald openen en sluiten geen enkele socket open staan', async () => {
    // Elke socket die blijft staan is een verbinding die de server open moet
    // houden en die berichten blijft afleveren aan een scherm dat er niet meer
    // is. Na drie keer openen en sluiten hoort er niets meer open te staan.
    for (let ronde = 0; ronde < 3; ronde += 1) {
      const { unmount } = await laadHook();
      verbind(laatsteSocket());
      unmount();
    }

    expect(sockets).toHaveLength(3);
    expect(sockets.filter((s: NepSocket) => s.disconnectAangeroepen === 0)).toEqual([]);
  });
});
