/**
 * Agendakoppeling: de persoonlijke ical-feed en de koppeling met Google.
 *
 * De feed-url is persoonlijk - wie hem heeft, ziet de agenda van dat lid. Deze
 * tests kijken naar wat de gebruiker doet: de url kopiëren, hem opnieuw laten
 * genereren als hij bij de verkeerde persoon terecht is gekomen, repetities of
 * concerten aan- en uitzetten, en Google koppelen, synchroniseren en weer
 * loskoppelen. Steeds ook de mislukte variant, want dat is precies waar dit
 * scherm eerder niets liet zien.
 *
 * De browservoorzieningen (klembord, navigatie, een nieuw venster) worden
 * afgevangen; geen enkele test hangt van de echte browserstaat af.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { CalendarSync, AddToCalendarButton } from '../CalendarSync';
import * as api from '../../api';
import type { CalendarSettings } from '../../api';
import { showSuccess, showError } from '../../utils/toast';

vi.mock('../../api', () => ({
  getCalendarSettings: vi.fn(),
  updateCalendarSettings: vi.fn(),
  regenerateCalendarFeed: vi.fn(),
  startGoogleAuth: vi.fn(),
  disconnectGoogle: vi.fn(),
  syncGoogleCalendar: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (sleutel: string) => sleutel, i18n: { language: 'nl' } }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('../Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

vi.mock('../../utils/toast', () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}));

const FEED = 'https://tutti.example/api/calendar/feed/geheim-token-123.ics';

function maakInstellingen(overschrijving: Partial<CalendarSettings> = {}): CalendarSettings {
  return {
    feedUrl: FEED,
    includeRehearsals: true,
    includeConcerts: true,
    googleConnected: false,
    googleCalendarId: null,
    lastSync: null,
    ...overschrijving,
  };
}

/** Toont de huidige querystring, zodat een test kan zien of hij is opgeruimd. */
function Adresbalk() {
  const locatie = useLocation();
  return <span data-testid="adresbalk">{locatie.search}</span>;
}

async function toon(pad = '/instellingen') {
  const gebruiker = userEvent.setup();
  // userEvent zet bij setup zijn eigen klembord op navigator; ons klembord
  // moet daar dus overheen, anders meten we dat van de testbibliotheek.
  zetKlembord();
  render(
    <MemoryRouter initialEntries={[pad]}>
      <Adresbalk />
      <CalendarSync />
    </MemoryRouter>,
  );
  await waitFor(() => expect(screen.queryByText('common.loading')).not.toBeInTheDocument());
  return gebruiker;
}

let schrijfNaarKlembord: ReturnType<typeof vi.fn>;
const oorspronkelijkKlembord = Object.getOwnPropertyDescriptor(navigator, 'clipboard');

function zetKlembord() {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: schrijfNaarKlembord },
    configurable: true,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getCalendarSettings).mockResolvedValue(maakInstellingen());
  vi.mocked(api.updateCalendarSettings).mockResolvedValue(undefined);
  schrijfNaarKlembord = vi.fn().mockResolvedValue(undefined);
  zetKlembord();
});

afterEach(() => {
  if (oorspronkelijkKlembord) Object.defineProperty(navigator, 'clipboard', oorspronkelijkKlembord);
  else delete (navigator as unknown as Record<string, unknown>).clipboard;
});

describe('agendakoppeling - de persoonlijke feed', () => {
  it('kopieert de feed-url naar het klembord en bevestigt dat', async () => {
    const gebruiker = await toon();

    expect(screen.getByDisplayValue(FEED)).toBeInTheDocument();
    await gebruiker.click(screen.getByRole('button', { name: 'calendar.copy' }));

    await waitFor(() => expect(schrijfNaarKlembord).toHaveBeenCalledWith(FEED));
    expect(showSuccess).toHaveBeenCalledWith('calendar.feedCopied');
    expect(await screen.findByRole('button', { name: 'calendar.copied' })).toBeInTheDocument();
  });

  it('meldt het als het klembord niet meewerkt', async () => {
    schrijfNaarKlembord.mockRejectedValue(new Error('geen toestemming'));
    const gebruiker = await toon();

    await gebruiker.click(screen.getByRole('button', { name: 'calendar.copy' }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('calendar.copyFailed'));
    // De knop blijft "kopiëren": er is niets gekopieerd.
    expect(screen.getByRole('button', { name: 'calendar.copy' })).toBeInTheDocument();
  });

  it('vervangt de feed-url pas na bevestiging', async () => {
    const nieuweUrl = 'https://tutti.example/api/calendar/feed/nieuw-token-456.ics';
    vi.mocked(api.regenerateCalendarFeed).mockResolvedValue({ feedUrl: nieuweUrl, message: 'ok' });
    const gebruiker = await toon();

    await gebruiker.click(screen.getByRole('button', { name: 'calendar.regenerateFeed' }));
    const venster = await screen.findByRole('alertdialog');
    expect(within(venster).getByText('calendar.regenerateConfirm')).toBeInTheDocument();
    expect(api.regenerateCalendarFeed).not.toHaveBeenCalled();

    await gebruiker.click(within(venster).getByRole('button', { name: 'common.confirm' }));

    await waitFor(() => expect(screen.getByDisplayValue(nieuweUrl)).toBeInTheDocument());
    expect(screen.queryByDisplayValue(FEED)).not.toBeInTheDocument();
    expect(showSuccess).toHaveBeenCalledWith('calendar.feedRegenerated');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('houdt de oude feed-url als opnieuw genereren mislukt', async () => {
    vi.mocked(api.regenerateCalendarFeed).mockRejectedValue({ response: { data: { error: 'server plat' } } });
    const gebruiker = await toon();

    await gebruiker.click(screen.getByRole('button', { name: 'calendar.regenerateFeed' }));
    const venster = await screen.findByRole('alertdialog');
    await gebruiker.click(within(venster).getByRole('button', { name: 'common.confirm' }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('server plat'));
    expect(screen.getByDisplayValue(FEED)).toBeInTheDocument();
  });

  it('breekt het opnieuw genereren af bij annuleren', async () => {
    const gebruiker = await toon();

    await gebruiker.click(screen.getByRole('button', { name: 'calendar.regenerateFeed' }));
    const venster = await screen.findByRole('alertdialog');
    await gebruiker.click(within(venster).getByRole('button', { name: 'common.cancel' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(api.regenerateCalendarFeed).not.toHaveBeenCalled();
  });
});

describe('agendakoppeling - wat er in de feed staat', () => {
  it('zet repetities uit en bewaart dat', async () => {
    const gebruiker = await toon();

    await gebruiker.click(screen.getByRole('checkbox', { name: 'calendar.includeRehearsals' }));

    await waitFor(() => expect(api.updateCalendarSettings).toHaveBeenCalledWith({ includeRehearsals: false }));
    expect(screen.getByRole('checkbox', { name: 'calendar.includeRehearsals' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'calendar.includeConcerts' })).toBeChecked();
    expect(showSuccess).toHaveBeenCalledWith('calendar.settingsUpdated');
  });

  it('laat het vinkje staan als bewaren mislukt', async () => {
    vi.mocked(api.updateCalendarSettings).mockRejectedValue({ response: { data: { error: 'niet opgeslagen' } } });
    const gebruiker = await toon();

    await gebruiker.click(screen.getByRole('checkbox', { name: 'calendar.includeConcerts' }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('niet opgeslagen'));
    // Het scherm mag geen stand tonen die de server niet kent.
    expect(screen.getByRole('checkbox', { name: 'calendar.includeConcerts' })).toBeChecked();
  });

  it('klapt de uitleg voor Apple Agenda open en weer dicht', async () => {
    const gebruiker = await toon();

    expect(screen.queryByText('calendar.appleInstructions.macStep1')).not.toBeInTheDocument();
    await gebruiker.click(screen.getByRole('button', { name: 'calendar.showInstructions' }));
    expect(screen.getByText('calendar.appleInstructions.macStep1')).toBeInTheDocument();
    expect(screen.getByText('calendar.appleInstructions.iphoneStep4')).toBeInTheDocument();

    await gebruiker.click(screen.getByRole('button', { name: 'calendar.hideInstructions' }));
    expect(screen.queryByText('calendar.appleInstructions.macStep1')).not.toBeInTheDocument();
  });
});

describe('agendakoppeling - Google', () => {
  const gekoppeld = () =>
    maakInstellingen({
      googleConnected: true,
      googleCalendarId: 'agenda-1',
      lastSync: '2026-08-20T10:00:00.000Z',
    });

  it('stuurt de gebruiker naar Google om te koppelen', async () => {
    vi.mocked(api.startGoogleAuth).mockResolvedValue({ authUrl: 'https://accounts.google.com/o/oauth2/auth?x=1' });
    const oorspronkelijk = Object.getOwnPropertyDescriptor(window, 'location');
    Object.defineProperty(window, 'location', { value: { href: '' }, configurable: true, writable: true });
    const gebruiker = await toon();

    await gebruiker.click(screen.getByRole('button', { name: 'calendar.connectGoogle' }));

    await waitFor(() => expect(window.location.href).toBe('https://accounts.google.com/o/oauth2/auth?x=1'));
    if (oorspronkelijk) Object.defineProperty(window, 'location', oorspronkelijk);
  });

  it('meldt het als Google niet is ingesteld voor deze vereniging', async () => {
    vi.mocked(api.startGoogleAuth).mockRejectedValue({});
    const gebruiker = await toon();

    await gebruiker.click(screen.getByRole('button', { name: 'calendar.connectGoogle' }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('calendar.errors.notConfigured'));
  });

  it('synchroniseert en haalt daarna de nieuwe tijd van de laatste synchronisatie op', async () => {
    vi.mocked(api.getCalendarSettings).mockResolvedValue(gekoppeld());
    vi.mocked(api.syncGoogleCalendar).mockResolvedValue({
      message: '12 items gesynchroniseerd',
      synced: 12,
      failed: 0,
      total: 12,
    });
    const gebruiker = await toon();

    expect(screen.getByText('calendar.googleConnectedStatus')).toBeInTheDocument();
    await gebruiker.click(screen.getByRole('button', { name: 'calendar.syncNow' }));

    await waitFor(() => expect(showSuccess).toHaveBeenCalledWith('12 items gesynchroniseerd'));
    // De stand wordt opnieuw opgehaald, anders blijft "laatste synchronisatie" oud.
    await waitFor(() => expect(api.getCalendarSettings).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('button', { name: 'calendar.syncNow' })).toBeEnabled();
  });

  it('meldt een mislukte synchronisatie en laat opnieuw proberen toe', async () => {
    vi.mocked(api.getCalendarSettings).mockResolvedValue(gekoppeld());
    vi.mocked(api.syncGoogleCalendar).mockRejectedValue({ response: { data: { error: 'token verlopen' } } });
    const gebruiker = await toon();

    await gebruiker.click(screen.getByRole('button', { name: 'calendar.syncNow' }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('token verlopen'));
    expect(screen.getByRole('button', { name: 'calendar.syncNow' })).toBeEnabled();
    // De koppeling blijft staan; alleen synchroniseren ging mis.
    expect(screen.getByText('calendar.googleConnectedStatus')).toBeInTheDocument();
  });

  it('valt terug op een algemene melding als de server geen reden geeft', async () => {
    vi.mocked(api.getCalendarSettings).mockResolvedValue(gekoppeld());
    vi.mocked(api.syncGoogleCalendar).mockRejectedValue(new Error('netwerk weg'));
    const gebruiker = await toon();

    await gebruiker.click(screen.getByRole('button', { name: 'calendar.syncNow' }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('common.error'));
  });

  it('koppelt Google los na bevestiging', async () => {
    vi.mocked(api.getCalendarSettings).mockResolvedValue(gekoppeld());
    vi.mocked(api.disconnectGoogle).mockResolvedValue(undefined);
    const gebruiker = await toon();

    await gebruiker.click(screen.getByRole('button', { name: 'calendar.disconnect' }));
    const venster = await screen.findByRole('alertdialog');
    expect(within(venster).getByText('calendar.disconnectConfirm')).toBeInTheDocument();
    await gebruiker.click(within(venster).getByRole('button', { name: 'common.confirm' }));

    await waitFor(() => expect(api.disconnectGoogle).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole('button', { name: 'calendar.connectGoogle' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'calendar.syncNow' })).not.toBeInTheDocument();
    expect(showSuccess).toHaveBeenCalledWith('calendar.googleDisconnected');
  });

  it('houdt de koppeling als loskoppelen mislukt', async () => {
    vi.mocked(api.getCalendarSettings).mockResolvedValue(gekoppeld());
    vi.mocked(api.disconnectGoogle).mockRejectedValue({ response: { data: { error: 'lukt niet' } } });
    const gebruiker = await toon();

    await gebruiker.click(screen.getByRole('button', { name: 'calendar.disconnect' }));
    const venster = await screen.findByRole('alertdialog');
    await gebruiker.click(within(venster).getByRole('button', { name: 'common.confirm' }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('lukt niet'));
    expect(screen.getByRole('button', { name: 'calendar.syncNow' })).toBeInTheDocument();
  });
});

describe('agendakoppeling - terugkomst van Google', () => {
  it('bevestigt een geslaagde koppeling en ruimt de parameter op', async () => {
    await toon('/instellingen?calendar_connected=true');

    await waitFor(() => expect(showSuccess).toHaveBeenCalledWith('calendar.googleConnected'));
    await waitFor(() => expect(screen.getByTestId('adresbalk')).toHaveTextContent(''));
    expect(screen.getByTestId('adresbalk').textContent).not.toContain('calendar_connected');
  });

  it('vertaalt de reden van een geweigerde koppeling', async () => {
    await toon('/instellingen?calendar_error=denied');

    await waitFor(() => expect(showError).toHaveBeenCalledWith('calendar.errors.denied'));
    expect(screen.getByTestId('adresbalk').textContent).not.toContain('calendar_error');
  });

  it('valt terug op een onbekende reden bij een code die het niet kent', async () => {
    await toon('/instellingen?calendar_error=iets_nieuws');

    await waitFor(() => expect(showError).toHaveBeenCalledWith('calendar.errors.unknown'));
  });
});

describe('agendakoppeling - instellingen ophalen mislukt', () => {
  /**
   * BEWIJS bij de reparatie in CalendarSync.loadSettings.
   *
   * Mislukte het ophalen, dan bleef het bij een regel in de console. Op het
   * scherm zag de gebruiker een leeg feed-veld, twee vinkjes die standaard aan
   * staan en de knop "koppel Google" - precies het beeld van een lid dat nog
   * niets heeft ingesteld, terwijl zijn koppeling gewoon bestaat. Wie dan op
   * kopiëren drukt krijgt niets, ook geen melding.
   *
   * Zonder de reparatie is deze test rood: showError werd niet aangeroepen.
   */
  it('meldt de laadfout in plaats van een leeg scherm te tonen', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(api.getCalendarSettings).mockRejectedValue(new Error('netwerk weg'));

    await toon();

    await waitFor(() => expect(showError).toHaveBeenCalledWith('common.error'));
  });

  it('kopieert niets als er geen feed-url bekend is', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(api.getCalendarSettings).mockRejectedValue(new Error('netwerk weg'));
    const gebruiker = await toon();

    await gebruiker.click(screen.getByRole('button', { name: 'calendar.copy' }));

    expect(schrijfNaarKlembord).not.toHaveBeenCalled();
  });
});

describe('toevoegen aan agenda vanaf een repetitie', () => {
  it('downloadt een ics-bestand voor deze repetitie', async () => {
    const gebruiker = userEvent.setup();
    const klik = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      // De echte klik zou jsdom laten navigeren; de href en download blijven
      // wel te controleren.
      expect(this.getAttribute('href')).toBe('/api/calendar/export/rehearsal/rep-7');
      expect(this.download).toBe('rehearsal-rep-7.ics');
    });

    render(<AddToCalendarButton type="rehearsal" id="rep-7" />);
    await gebruiker.click(screen.getByRole('button', { name: 'calendar.addToCalendar' }));
    await gebruiker.click(screen.getByRole('button', { name: 'calendar.downloadIcs' }));

    expect(klik).toHaveBeenCalledTimes(1);
    // Het menu gaat daarna dicht.
    expect(screen.queryByRole('button', { name: 'calendar.downloadIcs' })).not.toBeInTheDocument();
    klik.mockRestore();
  });

  it('opent Google Agenda en levert het bestand er meteen bij', async () => {
    const gebruiker = userEvent.setup();
    const klik = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const openen = vi.spyOn(window, 'open').mockImplementation(() => null);

    render(<AddToCalendarButton type="concert" id="con-3" />);
    await gebruiker.click(screen.getByRole('button', { name: 'calendar.addToCalendar' }));
    await gebruiker.click(screen.getByRole('button', { name: 'calendar.addToGoogle' }));

    expect(openen).toHaveBeenCalledWith('https://calendar.google.com/calendar/r/settings/export', '_blank');
    expect(klik).toHaveBeenCalledTimes(1);
    klik.mockRestore();
    openen.mockRestore();
  });

  it('sluit het menu met een klik op het scherm ernaast', async () => {
    const gebruiker = userEvent.setup();
    render(<AddToCalendarButton type="rehearsal" id="rep-7" />);

    await gebruiker.click(screen.getByRole('button', { name: 'calendar.addToCalendar' }));
    const scherm = document.querySelector('div[style*="position: fixed"]') as HTMLElement;
    await gebruiker.click(scherm);

    expect(screen.queryByRole('button', { name: 'calendar.downloadIcs' })).not.toBeInTheDocument();
  });

  it('sluit het menu als er naast wordt geklikt', async () => {
    const gebruiker = userEvent.setup();
    render(<AddToCalendarButton type="concert" id="con-3" />);

    await gebruiker.click(screen.getByRole('button', { name: 'calendar.addToCalendar' }));
    expect(screen.getByRole('button', { name: 'calendar.downloadIcs' })).toBeInTheDocument();

    await gebruiker.click(screen.getByRole('button', { name: 'calendar.addToCalendar' }));
    expect(screen.queryByRole('button', { name: 'calendar.downloadIcs' })).not.toBeInTheDocument();
  });
});
