/**
 * De kaartscanner als de offline-opslag van de browser niet meewerkt.
 *
 * Deze component wordt aan de deur van een concert gebruikt, vaak op een
 * geleende telefoon. Hij bewaart de opgehaalde kaarten in IndexedDB, zodat hij
 * ook zonder netwerk weet wie er binnen mag.
 *
 * Alleen: `indexedDB.open` stond kaal in een useEffect. In een browser waar de
 * opslag geblokkeerd is - privémodus, of sitegegevens uitgezet - bestaat
 * `indexedDB` helemaal niet, en dan klapte die regel. React laat zo'n fout uit
 * een effect door, dus de hele scanner verdween van het scherm. Precies op het
 * moment dat er een rij staat.
 *
 * En als het openen wél begon maar mislukte, bleef het bij een regel in de
 * console. Op het scherm leek er niets aan de hand, terwijl de scanner geen
 * enkele kaart kende en dus iedereen aan de deur afwees.
 *
 * Deze tests leggen beide gevallen vast: de scanner blijft staan, en hij zegt
 * eerlijk dat de opslag niet werkt.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { OfflineScanner } from '../OfflineScanner';

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

function zetIndexedDB(waarde: unknown) {
  Object.defineProperty(globalThis, 'indexedDB', { value: waarde, configurable: true, writable: true });
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  if (origineel) Object.defineProperty(globalThis, 'indexedDB', origineel);
  else delete (globalThis as Record<string, unknown>).indexedDB;
});

describe('kaartscanner - browser zonder offline-opslag', () => {
  it('blijft staan als indexedDB helemaal ontbreekt', () => {
    zetIndexedDB(undefined);

    render(<OfflineScanner concertId="con-1" />);

    // Het scanveld is er nog: de component is niet omgevallen.
    expect(screen.getByLabelText('offlineScanner.scanOrEnter')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('offlineScanner.storageUnavailable');
  });

  it('blijft staan als het openen van de opslag een fout gooit', () => {
    zetIndexedDB({
      open: () => {
        throw new Error('opslag geweigerd');
      },
    });

    render(<OfflineScanner concertId="con-1" />);

    expect(screen.getByLabelText('offlineScanner.scanOrEnter')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('offlineScanner.storageUnavailable');
  });

  it('meldt het ook als het openen netjes mislukt', async () => {
    // Dit was het stille geval: `onerror` schreef alleen naar de console.
    const verzoek: Record<string, unknown> = {};
    zetIndexedDB({
      open: () => {
        // De browser meldt de fout pas nadat de component zijn afhandelaars
        // heeft opgehangen, dus dat bootsen we hier na.
        queueMicrotask(() => (verzoek.onerror as () => void)?.());
        return verzoek;
      },
    });

    render(<OfflineScanner concertId="con-1" />);

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('offlineScanner.storageUnavailable'));
  });

  it('zegt niets zolang de opslag gewoon werkt', () => {
    const verzoek: Record<string, unknown> = { result: null };
    zetIndexedDB({ open: () => verzoek });

    render(<OfflineScanner concertId="con-1" />);

    // Geen melding: een waarschuwing die er altijd staat leert niemand iets.
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
