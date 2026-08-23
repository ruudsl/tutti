/**
 * De synchronisatiemelder.
 *
 * Dit is het enige wat een lid vertelt of zijn wijzigingen de server al hebben
 * gehaald. Staat er "Gesynchroniseerd" terwijl er nog vijf wijzigingen wachten,
 * dan sluit iemand de app en is zijn werk weg. Alle standen worden hieronder
 * dus apart nagelopen: offline, bezig, fout, wachtend en klaar - en de volgorde
 * waarin die elkaar overstemmen.
 *
 * De offlinelaag is afgevangen; er wordt niets echt gesynchroniseerd.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { sync } = vi.hoisted(() => ({
  sync: {
    stand: {
      isOnline: true,
      isSyncing: false,
      lastSyncAt: null as string | null,
      pendingMutations: 0,
      syncProgress: 0,
      currentEntity: null as string | null,
      error: null as string | null,
    },
    syncAll: vi.fn(),
    clearOfflineData: vi.fn(),
  },
}));

vi.mock('../../hooks/useOfflineData', () => ({
  useOfflineData: () => ({ syncAll: sync.syncAll, clearOfflineData: sync.clearOfflineData }),
  useSyncStatus: () => sync.stand,
}));

vi.mock('react-i18next', async () => {
  const teksten = ((await import('../../locales/nl.json')) as { default: Record<string, unknown> }).default;
  const zoek = (sleutel: string): string | undefined =>
    sleutel.split('.').reduce<any>((deel, stuk) => (deel == null ? undefined : deel[stuk]), teksten);

  // i18next kiest bij een telling tussen _one en _other en vult {{count}} in.
  // Dat gedrag hebben we hier nodig, want de melder leunt erop.
  const vertaal = (sleutel: string, standaard?: string, opties?: { count?: number }): string => {
    const telling = opties?.count;
    const meervoud = telling === undefined ? undefined : zoek(`${sleutel}_${telling === 1 ? 'one' : 'other'}`);
    const tekst = String(meervoud ?? zoek(sleutel) ?? standaard ?? sleutel);
    return telling === undefined ? tekst : tekst.replace('{{count}}', String(telling));
  };

  return { useTranslation: () => ({ t: vertaal }) };
});

import { SyncStatusIndicator } from '../SyncStatusIndicator';

/** Zet de stand van de synchronisatie, bovenop de rusttoestand. */
function stand(nieuw: Partial<typeof sync.stand>) {
  sync.stand = {
    isOnline: true,
    isSyncing: false,
    lastSyncAt: null,
    pendingMutations: 0,
    syncProgress: 0,
    currentEntity: null,
    error: null,
    ...nieuw,
  };
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true, now: new Date('2026-08-23T12:00:00.000Z') });
  stand({});
  sync.syncAll.mockReset().mockResolvedValue(undefined);
  sync.clearOfflineData.mockReset().mockResolvedValue(undefined);
});

describe('wat de melder zegt', () => {
  it('meldt dat alles binnen is als er niets wacht', () => {
    stand({});

    render(<SyncStatusIndicator />);

    expect(screen.getByText('Gesynchroniseerd')).toBeInTheDocument();
  });

  it('meldt offline te zijn, ook als er een fout openstaat', () => {
    // Offline hoort voorop te gaan: een foutmelding is dan het gevolg, niet de
    // oorzaak, en "Synchronisatiefout" stuurt het lid de verkeerde kant op.
    stand({ isOnline: false, error: 'Verbinding verbroken' });

    render(<SyncStatusIndicator />);

    expect(screen.getByText('Offline')).toBeInTheDocument();
    expect(screen.queryByText('Synchronisatiefout')).not.toBeInTheDocument();
  });

  it('meldt bezig te zijn zolang het loopt', () => {
    stand({ isSyncing: true });

    render(<SyncStatusIndicator />);

    expect(screen.getByText('Synchroniseren...')).toBeInTheDocument();
  });

  it('meldt een fout als er niets meer loopt', () => {
    stand({ error: 'Server gaf 500 terug' });

    render(<SyncStatusIndicator />);

    expect(screen.getByText('Synchronisatiefout')).toBeInTheDocument();
    expect(screen.getByText('Server gaf 500 terug')).toBeInTheDocument();
  });

  it('telt wat er nog wacht', () => {
    stand({ pendingMutations: 5 });

    render(<SyncStatusIndicator />);

    expect(screen.getByText('5 wachtend')).toBeInTheDocument();
    expect(screen.getByText('5 wijzigingen wachten op synchronisatie')).toBeInTheDocument();
  });

  it('gebruikt enkelvoud bij één wachtende wijziging', () => {
    stand({ pendingMutations: 1 });

    render(<SyncStatusIndicator />);

    expect(screen.getByText('1 wijziging wacht op synchronisatie')).toBeInTheDocument();
  });

  it('waarschuwt niet als er niets wacht', () => {
    stand({ pendingMutations: 0 });

    render(<SyncStatusIndicator />);

    expect(screen.queryByText(/wacht/)).not.toBeInTheDocument();
  });
});

describe('wanneer er voor het laatst gesynchroniseerd is', () => {
  it('zegt eerlijk dat het nog nooit gebeurd is', () => {
    stand({ lastSyncAt: null });

    render(<SyncStatusIndicator />);

    expect(screen.getByText(/Nog nooit/)).toBeInTheDocument();
  });

  it.each([
    ['2026-08-23T11:59:40.000Z', 'Zojuist'],
    ['2026-08-23T11:45:00.000Z', '15 minuten geleden'],
    ['2026-08-23T09:00:00.000Z', '3 uur geleden'],
    ['2026-08-20T12:00:00.000Z', '3 dagen geleden'],
  ])('rekent %s om naar "%s"', (tijdstip, verwacht) => {
    stand({ lastSyncAt: tijdstip });

    render(<SyncStatusIndicator />);

    expect(screen.getByText(new RegExp(verwacht))).toBeInTheDocument();
  });

  it('gebruikt enkelvoud bij één minuut', () => {
    stand({ lastSyncAt: '2026-08-23T11:58:30.000Z' });

    render(<SyncStatusIndicator />);

    expect(screen.getByText(/1 minuut geleden/)).toBeInTheDocument();
  });
});

describe('zelf synchroniseren', () => {
  it('biedt de knop aan als het kan', async () => {
    const gebruiker = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    stand({});
    render(<SyncStatusIndicator />);

    await gebruiker.click(screen.getByRole('button', { name: 'Nu synchroniseren' }));

    expect(sync.syncAll).toHaveBeenCalledTimes(1);
  });

  it('biedt de knop niet aan zonder verbinding', () => {
    // Drukken zou toch niets doen; de knop hoort dan weg te zijn.
    stand({ isOnline: false });

    render(<SyncStatusIndicator />);

    expect(screen.queryByRole('button', { name: 'Nu synchroniseren' })).not.toBeInTheDocument();
  });

  it('biedt de knop niet aan terwijl het al loopt', () => {
    stand({ isSyncing: true });

    render(<SyncStatusIndicator />);

    expect(screen.queryByRole('button', { name: 'Nu synchroniseren' })).not.toBeInTheDocument();
  });

  it('laat zien hoe ver het is en waar het mee bezig is', () => {
    stand({ isSyncing: true, syncProgress: 40, currentEntity: 'muziekstukken' });

    const { container } = render(<SyncStatusIndicator />);

    expect(screen.getByText('muziekstukken')).toBeInTheDocument();
    const balk = container.querySelector('div[style*="width: 40%"]');
    expect(balk).toBeInTheDocument();
  });
});

describe('offline gegevens wissen', () => {
  it('wist niets voordat het bevestigd is', async () => {
    const gebruiker = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<SyncStatusIndicator />);

    await gebruiker.click(screen.getByRole('button', { name: 'Offline gegevens wissen' }));

    expect(screen.getByText('Weet je zeker dat je alle offline gegevens wilt wissen?')).toBeInTheDocument();
    expect(sync.clearOfflineData).not.toHaveBeenCalled();
  });

  it('wist pas na bevestigen', async () => {
    const gebruiker = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<SyncStatusIndicator />);
    await gebruiker.click(screen.getByRole('button', { name: 'Offline gegevens wissen' }));

    await gebruiker.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Bevestigen' }));

    expect(sync.clearOfflineData).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('wist niets als de bevestiging wordt afgebroken', async () => {
    const gebruiker = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<SyncStatusIndicator />);
    await gebruiker.click(screen.getByRole('button', { name: 'Offline gegevens wissen' }));

    await gebruiker.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Annuleren' }));

    expect(sync.clearOfflineData).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('biedt het wissen niet aan in de balk bovenin', () => {
    // Daar staat de melder klein tussen de navigatie; een knop die alle offline
    // gegevens weggooit hoort niet op een plek waar je er per ongeluk op drukt.
    render(<SyncStatusIndicator inHeader />);

    expect(screen.queryByRole('button', { name: 'Offline gegevens wissen' })).not.toBeInTheDocument();
    expect(screen.getByText('Gesynchroniseerd')).toBeInTheDocument();
  });
});

describe('de kleine melder in de balk', () => {
  it('vat de stand samen in de zweeftekst', () => {
    stand({ isOnline: false });

    render(<SyncStatusIndicator compact />);

    expect(screen.getByRole('button')).toHaveAttribute('title', 'Offline');
  });

  it('zet het aantal wachtende wijzigingen als stipje op de knop', () => {
    stand({ pendingMutations: 3 });

    render(<SyncStatusIndicator compact />);

    expect(screen.getByRole('button')).toHaveTextContent('3');
  });

  it('kort een groot aantal af tot 9+', () => {
    stand({ pendingMutations: 42 });

    render(<SyncStatusIndicator compact />);

    expect(screen.getByRole('button')).toHaveTextContent('9+');
  });

  it('toont geen stipje als er niets wacht', () => {
    stand({ pendingMutations: 0 });

    render(<SyncStatusIndicator compact />);

    expect(screen.getByRole('button')).toHaveTextContent('');
  });

  it('laat de tekening meelopen met de stand', () => {
    const offline = render(<SyncStatusIndicator compact />).container.innerHTML;
    stand({ isSyncing: true });
    const bezig = render(<SyncStatusIndicator compact />).container.innerHTML;
    stand({ error: 'Mislukt' });
    const fout = render(<SyncStatusIndicator compact />).container.innerHTML;

    expect(new Set([offline, bezig, fout]).size).toBe(3);
  });
});
