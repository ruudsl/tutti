/**
 * De scanner aan de deur, zonder netwerk.
 *
 * Dit is het afgesproken beleid, en deze tests leggen het vast zoals het is -
 * ze veranderen er niets aan:
 *
 *  1. De opgehaalde voorraad bevat geldige én al gebruikte kaarten. Een kaart
 *     die al gebruikt is hoort in de lijst te staan met het tijdstip erbij,
 *     want anders is aan de deur niet te zien of iemand al binnen was of dat
 *     zijn kaart niet bestaat.
 *  2. Bij een botsing wint de vroegste scan en wordt de tweede gemeld. Lokaal
 *     betekent dat: het tijdstip van de eerste scan blijft staan en de tweede
 *     poging krijgt dat tijdstip te horen. Aan de serverkant betekent het dat
 *     de botsingen die bij het nasturen terugkomen blijven staan tot iemand ze
 *     wegklikt.
 *  3. Een voorraad ouder dan 24 uur waarschuwt maar blijft werken. Dat deel
 *     ligt al vast in OfflineScanner.voorraad.test.tsx; hier staat de andere
 *     kant ervan: scannen gaat gewoon door.
 *
 * Alles hier is een *wacht*: dit gedrag zat er al en de tests blijven ook op de
 * oude code groen.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OfflineScanner } from '../OfflineScanner';
import * as scanApi from '../../api/ticket-scanning';
import { showSuccess, showError } from '../../utils/toast';

vi.mock('../../api/tickets');
vi.mock('../../api/ticket-scanning');

// De tijdstippen in de meldingen zijn hier de kern van de zaak - wélke scan
// blijft staan - dus wat er aan een tekst wordt meegegeven komt achter de
// sleutel te staan.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (sleutel: string, opties?: unknown) =>
      opties && typeof opties === 'object' ? `${sleutel} ${JSON.stringify(opties)}` : sleutel,
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('../Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

vi.mock('../../utils/toast', () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
  toast: vi.fn(),
}));

const origineleDB = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
const origineleKeyRange = Object.getOwnPropertyDescriptor(globalThis, 'IDBKeyRange');
const origineleOnline = Object.getOwnPropertyDescriptor(Navigator.prototype, 'onLine');

type Kaart = { qrCode: string; status: 'valid' | 'used'; usedAt?: string; concertId?: string };
type Scan = { id: string; qrCode: string; scannedAt: string; result: string; synced: boolean };

/**
 * Een IndexedDB die werkelijk onthoudt wat erin gezet wordt.
 *
 * Dat is nodig omdat het beleid over onthouden gaat: een kaart die zojuist
 * gescand is moet bij de volgende scan als gebruikt terugkomen, met het
 * tijdstip van die eerste scan erbij.
 */
function zetOpslagKlaar(begin: { kaarten?: Kaart[]; scans?: Scan[] } = {}) {
  const winkels: Record<string, Map<string, Kaart | Scan>> = {
    tickets: new Map((begin.kaarten ?? []).map((k) => [k.qrCode, { ...k }])),
    scans: new Map((begin.scans ?? []).map((s) => [s.id, { ...s }])),
  };

  // De browser roept de afhandelaars pas ná deze beurt aan; een microtask doet
  // dat hier net zo, zodat de component zijn onsuccess nog kan ophangen.
  const verzoek = <T,>(uitkomst: () => T) => {
    const r: Record<string, unknown> = {};
    queueMicrotask(() => {
      r.result = uitkomst();
      (r.onsuccess as ((e: unknown) => void) | undefined)?.({ target: r });
    });
    return r;
  };

  const winkel = (naam: string) => ({
    index: () => ({
      getAll: (concertId: string) =>
        verzoek(() => Array.from(winkels.tickets.values()).filter((k) => (k as Kaart).concertId === concertId)),
      // Geen bestaande rijen om op te ruimen: het ophalen zet ze er zo weer in.
      openCursor: () => verzoek(() => null),
    }),
    getAll: () => verzoek(() => Array.from(winkels[naam].values())),
    get: (sleutel: string) => verzoek(() => winkels[naam].get(sleutel)),
    put: (waarde: Kaart | Scan) => {
      const sleutel = naam === 'tickets' ? (waarde as Kaart).qrCode : (waarde as Scan).id;
      winkels[naam].set(sleutel, { ...waarde });
      return verzoek(() => undefined);
    },
    add: (waarde: Kaart | Scan) => {
      const sleutel = naam === 'tickets' ? (waarde as Kaart).qrCode : (waarde as Scan).id;
      winkels[naam].set(sleutel, { ...waarde });
      return verzoek(() => undefined);
    },
  });

  const db = {
    close: () => {},
    objectStoreNames: { contains: () => true },
    transaction: (naam: string) => {
      const tx: Record<string, unknown> = { objectStore: () => winkel(naam) };
      queueMicrotask(() => (tx.oncomplete as (() => void) | undefined)?.());
      return tx;
    },
  };

  // jsdom kent IndexedDB niet, en dus ook IDBKeyRange niet.
  Object.defineProperty(globalThis, 'IDBKeyRange', {
    value: { only: (waarde: unknown) => waarde },
    configurable: true,
    writable: true,
  });

  Object.defineProperty(globalThis, 'indexedDB', {
    value: {
      open: () => {
        const r: Record<string, unknown> = { result: db };
        queueMicrotask(() => (r.onsuccess as (() => void) | undefined)?.());
        return r;
      },
    },
    configurable: true,
    writable: true,
  });

  return winkels;
}

function zetNetwerk(aan: boolean) {
  Object.defineProperty(navigator, 'onLine', { value: aan, configurable: true });
}

/** Voert een code in en drukt op controleren, zoals aan de deur gebeurt. */
async function scan(gebruiker: ReturnType<typeof userEvent.setup>, code: string) {
  await gebruiker.clear(screen.getByLabelText('offlineScanner.scanOrEnter'));
  await gebruiker.type(screen.getByLabelText('offlineScanner.scanOrEnter'), code);
  await gebruiker.click(screen.getByRole('button', { name: 'offlineScanner.validate' }));
}

/** De laatste melding die als fout over de toonbank ging. */
function laatsteFout() {
  const aanroepen = vi.mocked(showError).mock.calls;
  return String(aanroepen[aanroepen.length - 1]?.[0] ?? '');
}

const GELDIG: Kaart = { qrCode: 'ABC123', status: 'valid', concertId: 'con-1' };
const GEBRUIKT: Kaart = {
  qrCode: 'DEF456',
  status: 'used',
  usedAt: '2026-08-23T18:05:00.000Z',
  concertId: 'con-1',
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  zetNetwerk(false);
});

afterEach(() => {
  if (origineleDB) Object.defineProperty(globalThis, 'indexedDB', origineleDB);
  else delete (globalThis as Record<string, unknown>).indexedDB;
  if (origineleKeyRange) Object.defineProperty(globalThis, 'IDBKeyRange', origineleKeyRange);
  else delete (globalThis as Record<string, unknown>).IDBKeyRange;
  if (origineleOnline) Object.defineProperty(Navigator.prototype, 'onLine', origineleOnline);
});

describe('kaartscanner - de voorraad kent geldige en gebruikte kaarten', () => {
  it('telt beide soorten apart', async () => {
    zetOpslagKlaar({ kaarten: [GELDIG, GEBRUIKT, { ...GELDIG, qrCode: 'GHI789' }] });
    render(<OfflineScanner concertId="con-1" />);

    const kaart = async (label: string) => {
      const kop = await screen.findByText(label);
      return kop.parentElement?.querySelector('.stat-value')?.textContent;
    };

    await waitFor(async () => expect(await kaart('offlineScanner.downloaded')).toBe('3'));
    expect(await kaart('offlineScanner.valid')).toBe('2');
    expect(await kaart('offlineScanner.used')).toBe('1');
  });

  it('laat een geldige kaart binnen en schuift hem naar gebruikt', async () => {
    zetOpslagKlaar({ kaarten: [GELDIG, GEBRUIKT] });
    const gebruiker = userEvent.setup();
    render(<OfflineScanner concertId="con-1" />);
    await screen.findByText('2');

    await scan(gebruiker, 'ABC123');

    await waitFor(() => expect(showSuccess).toHaveBeenCalledWith('offlineScanner.validTicket'));
    // Eén geldige minder, één gebruikte meer: de teller vertelt aan de deur
    // hoeveel er nog buiten staan.
    const geldig = (await screen.findByText('offlineScanner.valid')).parentElement;
    const gebruikt = (await screen.findByText('offlineScanner.used')).parentElement;
    await waitFor(() => expect(geldig?.querySelector('.stat-value')?.textContent).toBe('0'));
    expect(gebruikt?.querySelector('.stat-value')?.textContent).toBe('2');
  });

  it('weigert een kaart die in de voorraad al als gebruikt staat, met het tijdstip erbij', async () => {
    zetOpslagKlaar({ kaarten: [GELDIG, GEBRUIKT] });
    const gebruiker = userEvent.setup();
    render(<OfflineScanner concertId="con-1" />);
    await screen.findByText('2');

    await scan(gebruiker, 'DEF456');

    await waitFor(() => expect(showError).toHaveBeenCalled());
    // Het tijdstip van de eerste scan gaat mee: aan de deur is dat het verschil
    // tussen "u bent al binnen geweest" en "deze kaart bestaat niet".
    expect(laatsteFout()).toContain('offlineScanner.alreadyUsed');
    expect(laatsteFout()).toContain('2026-08-23T18:05:00.000Z');
  });

  it('wijst een kaart af die niet in de voorraad staat', async () => {
    zetOpslagKlaar({ kaarten: [GELDIG] });
    const gebruiker = userEvent.setup();
    render(<OfflineScanner concertId="con-1" />);
    await screen.findByLabelText('offlineScanner.scanOrEnter');

    await scan(gebruiker, 'ONBEKEND');

    await waitFor(() => expect(laatsteFout()).toContain('offlineScanner.ticketNotFound'));
  });

  it('leest een code met kleine letters en spaties als dezelfde kaart', async () => {
    zetOpslagKlaar({ kaarten: [GELDIG] });
    const gebruiker = userEvent.setup();
    render(<OfflineScanner concertId="con-1" />);
    await screen.findByLabelText('offlineScanner.scanOrEnter');

    await scan(gebruiker, ' abc123 ');

    await waitFor(() => expect(showSuccess).toHaveBeenCalledWith('offlineScanner.validTicket'));
  });

  it('bewaart elke scan om na te sturen, ook een afgewezen kaart', async () => {
    zetOpslagKlaar({ kaarten: [GELDIG] });
    const gebruiker = userEvent.setup();
    render(<OfflineScanner concertId="con-1" />);
    await screen.findByLabelText('offlineScanner.scanOrEnter');

    await scan(gebruiker, 'ABC123');
    await scan(gebruiker, 'ONBEKEND');

    // Twee wachtende scans: ook de weigering hoort de server te bereiken, want
    // daar is achteraf aan te zien dat er iemand met een onbekende kaart stond.
    expect(await screen.findByText('offlineScanner.pendingScans {"count":2}')).toBeInTheDocument();
  });
});

describe('kaartscanner - bij een botsing wint de vroegste scan', () => {
  it('houdt bij een tweede scan het tijdstip van de eerste vast', async () => {
    zetOpslagKlaar({ kaarten: [GELDIG] });
    const gebruiker = userEvent.setup();
    render(<OfflineScanner concertId="con-1" />);
    await screen.findByLabelText('offlineScanner.scanOrEnter');

    const voor = Date.now();
    await scan(gebruiker, 'ABC123');
    await waitFor(() => expect(showSuccess).toHaveBeenCalledWith('offlineScanner.validTicket'));
    const na = Date.now();

    await scan(gebruiker, 'ABC123');
    await waitFor(() => expect(laatsteFout()).toContain('offlineScanner.alreadyUsed'));

    const eerste = new Date(JSON.parse(laatsteFout().slice(laatsteFout().indexOf('{'))).time).getTime();
    expect(eerste).toBeGreaterThanOrEqual(voor - 1000);
    expect(eerste).toBeLessThanOrEqual(na + 1000);

    // En een derde poging hoort nog steeds naar diezelfde eerste scan te
    // verwijzen: de laatste poging overschrijft het tijdstip niet.
    await scan(gebruiker, 'ABC123');
    await waitFor(() => expect(vi.mocked(showError).mock.calls.length).toBe(2));
    const derde = new Date(JSON.parse(laatsteFout().slice(laatsteFout().indexOf('{'))).time).getTime();
    expect(derde).toBe(eerste);
  });

  it('meldt de botsingen die de server terugstuurt, elk in eigen woorden', async () => {
    const wachtend = (id: string, code: string) => ({
      id,
      qrCode: code,
      scannedAt: '2026-08-23T19:00:00.000Z',
      result: 'offline_valid',
      synced: false,
    });
    zetOpslagKlaar({ scans: [wachtend('scan-1', 'ABC123'), wachtend('scan-2', 'DEF456')] });
    zetNetwerk(true);
    vi.mocked(scanApi.syncOfflineScans).mockResolvedValue({
      processed: 2,
      skipped: 0,
      results: [],
      warnings: [
        {
          id: 'scan-1',
          code: 'ABC123',
          reason: 'offline_scan_kept',
          keptScanAt: '2026-08-23T19:00:00.000Z',
          message: 'De offline scan was eerder',
        },
        { id: 'scan-2', code: 'DEF456', reason: 'refused_offline', message: 'Geweigerd' },
        { id: 'scan-3', code: 'GHI789', reason: 'iets_anders', message: 'Onbekende reden' },
      ],
    });

    const gebruiker = userEvent.setup();
    render(<OfflineScanner concertId="con-1" />);

    await gebruiker.click(await screen.findByRole('button', { name: 'offlineScanner.syncNow' }));

    expect(await screen.findByText(/offlineScanner.conflictOfflineKept/)).toHaveTextContent('ABC123');
    expect(screen.getByText(/offlineScanner.conflictRefusedOffline/)).toHaveTextContent('DEF456');
    // Een reden die dit scherm niet kent wordt niet verzwegen maar met de
    // tekst van de server erbij getoond.
    expect(screen.getByText(/offlineScanner.conflictNotProcessed/)).toHaveTextContent('Onbekende reden');
  });

  it('laat de botsingen pas verdwijnen als iemand ze wegklikt', async () => {
    zetOpslagKlaar({
      scans: [{ id: 'scan-1', qrCode: 'ABC123', scannedAt: '2026-08-23T19:00:00.000Z', result: 'x', synced: false }],
    });
    zetNetwerk(true);
    vi.mocked(scanApi.syncOfflineScans).mockResolvedValue({
      processed: 1,
      skipped: 0,
      results: [],
      warnings: [{ id: 'scan-1', code: 'ABC123', reason: 'refused_offline', message: 'Geweigerd' }],
    });

    const gebruiker = userEvent.setup();
    render(<OfflineScanner concertId="con-1" />);
    await gebruiker.click(await screen.findByRole('button', { name: 'offlineScanner.syncNow' }));
    await screen.findByText(/offlineScanner.conflictRefusedOffline/);

    await gebruiker.click(screen.getByRole('button', { name: 'common.close' }));

    expect(screen.queryByText(/offlineScanner.conflictRefusedOffline/)).toBeNull();
  });

  it('meldt het als het nasturen zelf mislukt, en houdt de scans vast', async () => {
    zetOpslagKlaar({
      scans: [{ id: 'scan-1', qrCode: 'ABC123', scannedAt: '2026-08-23T19:00:00.000Z', result: 'x', synced: false }],
    });
    zetNetwerk(true);
    vi.mocked(scanApi.syncOfflineScans).mockRejectedValue(new Error('netwerk weg'));

    const gebruiker = userEvent.setup();
    render(<OfflineScanner concertId="con-1" />);
    await gebruiker.click(await screen.findByRole('button', { name: 'offlineScanner.syncNow' }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('offlineScanner.syncFailed'));
    // De wachtende scan blijft staan; weggooien wat de server niet heeft
    // gekregen is het ergste wat hier kan gebeuren.
    expect(screen.getByRole('button', { name: 'offlineScanner.syncNow' })).toBeInTheDocument();
  });
});

describe('kaartscanner - zonder netwerk', () => {
  it('zegt dat hij offline is en laat de voorraad niet ophalen', async () => {
    zetOpslagKlaar({ kaarten: [GELDIG] });
    render(<OfflineScanner concertId="con-1" />);

    expect(await screen.findByText('offlineScanner.offline')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'offlineScanner.downloadTickets' })).toBeDisabled();
  });

  it('merkt het als het netwerk terugkomt', async () => {
    zetOpslagKlaar({ kaarten: [GELDIG] });
    render(<OfflineScanner concertId="con-1" />);
    await screen.findByText('offlineScanner.offline');

    zetNetwerk(true);
    window.dispatchEvent(new Event('online'));

    expect(await screen.findByText('offlineScanner.online')).toBeInTheDocument();
    expect(showSuccess).toHaveBeenCalledWith('offlineScanner.backOnline');
    expect(screen.getByRole('button', { name: 'offlineScanner.downloadTickets' })).toBeEnabled();
  });

  it('blijft scannen op een voorraad van gisteren', async () => {
    // Ouder dan een dag: er komt een waarschuwing bij, maar de deur blijft
    // open. Een oude lijst is aan de deur beter dan geen lijst.
    localStorage.setItem('offline-scanner-last-sync-con-1', new Date(Date.now() - 30 * 3600 * 1000).toISOString());
    zetOpslagKlaar({ kaarten: [GELDIG] });
    const gebruiker = userEvent.setup();
    render(<OfflineScanner concertId="con-1" />);

    await screen.findByText(/offlineScanner.stockStale/);
    await scan(gebruiker, 'ABC123');

    await waitFor(() => expect(showSuccess).toHaveBeenCalledWith('offlineScanner.validTicket'));
  });

  it('meldt het als de voorraad niet op te halen is', async () => {
    zetOpslagKlaar({ kaarten: [] });
    zetNetwerk(true);
    vi.mocked(scanApi.getOfflineTickets).mockRejectedValue(new Error('server weg'));

    const gebruiker = userEvent.setup();
    render(<OfflineScanner concertId="con-1" />);
    await gebruiker.click(await screen.findByRole('button', { name: 'offlineScanner.downloadTickets' }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('offlineScanner.downloadFailed'));
  });

  it('zet de opgehaalde voorraad meteen op het scherm', async () => {
    zetOpslagKlaar({ kaarten: [] });
    zetNetwerk(true);
    vi.mocked(scanApi.getOfflineTickets).mockResolvedValue({
      concertId: 'con-1',
      generatedAt: new Date().toISOString(),
      ticketCount: 2,
      tickets: [
        { qrCode: 'ABC123', status: 'valid' },
        { qrCode: 'DEF456', status: 'used', usedAt: '2026-08-23T18:05:00.000Z' },
      ],
    });

    const gebruiker = userEvent.setup();
    render(<OfflineScanner concertId="con-1" />);
    await gebruiker.click(await screen.findByRole('button', { name: 'offlineScanner.downloadTickets' }));

    await waitFor(() => expect(showSuccess).toHaveBeenCalledWith('offlineScanner.downloadComplete {"count":2}'));
    const geldig = (await screen.findByText('offlineScanner.valid')).parentElement;
    expect(geldig?.querySelector('.stat-value')?.textContent).toBe('1');
  });
});
