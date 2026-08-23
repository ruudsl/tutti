/**
 * De kaartvoorraad van de scanner: hoe oud is hij, en wat komt er terug als de
 * offline gemaakte scans worden nagestuurd.
 *
 * De twee routes waar dit scherm op bouwt bestonden aan de serverkant niet, dus
 * ophalen en nasturen mislukten allebei stilzwijgend in de notFoundHandler. Nu
 * ze er zijn, leggen deze tests vast waar het aan de deur op aankomt.
 *
 * Ten eerste: het moment waarop de voorraad is samengesteld komt van de server
 * en niet van deze telefoon. Aan de deur staat vaak een geleend toestel, en een
 * verkeerd ingestelde klok zou de waarschuwing over een verouderde lijst anders
 * altijd of nooit laten zien.
 *
 * Ten tweede: een verouderde lijst blokkeert niets. Er komt een melding bij,
 * meer niet - een oude lijst is aan de deur beter dan geen lijst.
 *
 * Ten derde: botsingen die de server terugmeldt blijven op het scherm staan.
 * Een melding die vanzelf wegschuift is precies wat je achteraf niet meer terug
 * kunt vinden.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OfflineScanner } from '../OfflineScanner';
import * as scanApi from '../../api/ticket-scanning';

vi.mock('../../api/tickets');
vi.mock('../../api/ticket-scanning');

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (sleutel: string) => sleutel }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('../Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

vi.mock('../../utils/toast', () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

const origineel = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
const origineleKeyRange = Object.getOwnPropertyDescriptor(globalThis, 'IDBKeyRange');

/**
 * Een opslag die net genoeg doet om de component zijn gang te laten gaan: elk
 * verzoek levert in een microtask zijn uitkomst af, zoals de browser dat ook
 * pas ná het ophangen van de afhandelaars doet.
 */
function zetOpslagKlaar(inhoud: { kaarten?: unknown[]; scans?: unknown[] } = {}) {
  const verzoek = (resultaat: unknown) => {
    const r: Record<string, unknown> = { result: resultaat };
    queueMicrotask(() => (r.onsuccess as ((e: unknown) => void) | undefined)?.({ target: r }));
    return r;
  };

  const winkel = (naam: string) => ({
    index: () => ({
      getAll: () => verzoek(inhoud.kaarten ?? []),
      openCursor: () => verzoek(null),
    }),
    getAll: () => verzoek(naam === 'scans' ? (inhoud.scans ?? []) : (inhoud.kaarten ?? [])),
    get: () => verzoek(undefined),
    put: () => verzoek(undefined),
    add: () => verzoek(undefined),
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

  // jsdom kent IndexedDB helemaal niet, dus ook IDBKeyRange niet. Zonder deze
  // stand-in loopt het ophalen van de voorraad stuk op een ReferenceError, en
  // dan lijkt de test over iets anders te gaan dan waar hij over gaat.
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
}

function urenGeleden(uren: number) {
  return new Date(Date.now() - uren * 60 * 60 * 1000).toISOString();
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  zetOpslagKlaar();
});

afterEach(() => {
  if (origineel) Object.defineProperty(globalThis, 'indexedDB', origineel);
  else delete (globalThis as Record<string, unknown>).indexedDB;
  if (origineleKeyRange) Object.defineProperty(globalThis, 'IDBKeyRange', origineleKeyRange);
  else delete (globalThis as Record<string, unknown>).IDBKeyRange;
});

describe('kaartscanner - hoe oud is de voorraad', () => {
  it('waarschuwt bij een lijst van ouder dan een dag, maar blijft scannen', async () => {
    localStorage.setItem('offline-scanner-last-sync-con-1', urenGeleden(30));

    render(<OfflineScanner concertId="con-1" />);

    await waitFor(() => expect(screen.getByText('offlineScanner.stockStale')).toBeInTheDocument());
    // Geen blokkade: het scanveld en de knop staan er gewoon nog.
    expect(screen.getByLabelText('offlineScanner.scanOrEnter')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'offlineScanner.validate' })).toBeEnabled();
  });

  it('zwijgt bij een lijst van een uur oud', async () => {
    localStorage.setItem('offline-scanner-last-sync-con-1', urenGeleden(1));

    render(<OfflineScanner concertId="con-1" />);

    await waitFor(() => expect(screen.getByLabelText('offlineScanner.scanOrEnter')).toBeInTheDocument());
    // Een waarschuwing die er altijd staat leert niemand iets.
    expect(screen.queryByText('offlineScanner.stockStale')).toBeNull();
  });

  it('bewaart het tijdstip van de server, niet dat van deze telefoon', async () => {
    const samengesteldOp = urenGeleden(26);
    vi.mocked(scanApi.getOfflineTickets).mockResolvedValue({
      concertId: 'con-1',
      generatedAt: samengesteldOp,
      ticketCount: 1,
      tickets: [{ qrCode: 'ABC123', status: 'valid' }],
    });

    const gebruiker = userEvent.setup();
    render(<OfflineScanner concertId="con-1" />);
    await gebruiker.click(screen.getByRole('button', { name: 'offlineScanner.downloadTickets' }));

    // De klok van een geleende telefoon mag niet bepalen of de waarschuwing
    // over een verouderde lijst verschijnt; daarom wordt het tijdstip van de
    // server bewaard en niet `new Date()`.
    await waitFor(() => expect(localStorage.getItem('offline-scanner-last-sync-con-1')).toBe(samengesteldOp));
    await waitFor(() => expect(screen.getByText('offlineScanner.stockStale')).toBeInTheDocument());
  });
});

describe('kaartscanner - botsingen bij het nasturen', () => {
  const wachtendeScan = {
    id: 'scan-1',
    qrCode: 'ABC123',
    scannedAt: urenGeleden(2),
    result: 'offline_valid',
    synced: false,
  };

  it('toont wat de server terugmeldde en laat het staan', async () => {
    zetOpslagKlaar({ scans: [wachtendeScan] });
    vi.mocked(scanApi.syncOfflineScans).mockResolvedValue({
      processed: 1,
      skipped: 0,
      results: [{ id: 'scan-1', code: 'ABC123', status: 'already_used' }],
      warnings: [
        {
          id: 'scan-1',
          code: 'ABC123',
          reason: 'earlier_scan_kept',
          keptScanAt: urenGeleden(3),
          rejectedScanAt: urenGeleden(2),
          message: 'This ticket was already scanned earlier; that scan is kept',
        },
      ],
    });

    const gebruiker = userEvent.setup();
    render(<OfflineScanner concertId="con-1" />);

    const knop = await screen.findByRole('button', { name: 'offlineScanner.syncNow' });
    await gebruiker.click(knop);

    await waitFor(() => expect(screen.getByText('offlineScanner.conflictsTitle')).toBeInTheDocument());
    // De botsing blijft staan: een melding die vanzelf wegschuift is precies
    // wat je achteraf niet meer terugvindt.
    expect(screen.getByText('offlineScanner.conflictKeptEarlier')).toBeInTheDocument();
  });

  it('meldt niets als er geen botsingen waren', async () => {
    zetOpslagKlaar({ scans: [wachtendeScan] });
    vi.mocked(scanApi.syncOfflineScans).mockResolvedValue({
      processed: 1,
      skipped: 0,
      results: [{ id: 'scan-1', code: 'ABC123', status: 'used' }],
      warnings: [],
    });

    const gebruiker = userEvent.setup();
    render(<OfflineScanner concertId="con-1" />);

    const knop = await screen.findByRole('button', { name: 'offlineScanner.syncNow' });
    await gebruiker.click(knop);

    await waitFor(() => expect(screen.queryByRole('button', { name: 'offlineScanner.syncNow' })).toBeNull());
    expect(screen.queryByText('offlineScanner.conflictsTitle')).toBeNull();
  });
});
