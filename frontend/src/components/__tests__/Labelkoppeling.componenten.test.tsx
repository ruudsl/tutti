/**
 * De formulierlabels van acht losse componenten horen bij hun veld.
 *
 * Dit is de laatste ronde van de labelopruiming. In al deze componenten stond
 * het label lós naast het veld in dezelfde `.form-group`, zonder `htmlFor` en
 * zonder `id`. Een schermlezer kondigde dan "bewerkbaar veld" aan zonder te
 * zeggen wat erin moest, en klikken op het label zette de aanwijzer nergens.
 *
 * `getByLabelText` is daarom hier geen willekeurige zoekmethode maar de kern
 * van de test: die vindt een veld alleen als de koppeling er echt is. Zoeken
 * via de omhullende `.form-group` zou ook op de kapotte code slagen en bewijst
 * dus niets.
 *
 * Twee soorten gevallen staan hieronder door elkaar:
 *
 *  - Echte velden. Die lopen sinds de ombouw via `components/FormField`, die
 *    met `useId()` een id maakt, dat op het kindveld zet en het label eraan
 *    hangt. Waar er méér in de `.form-group` staat dan label plus veld - een
 *    hulptekst, een knop ernaast, een rij voorkeuzeknoppen - kloont FormField
 *    te weinig en is er met de hand gekoppeld. Juist díé gevallen staan
 *    hieronder, want handwerk raakt eerder zoek dan een component.
 *
 *  - Koppen die niets labelen. Boven een rij knoppen valt niets te koppelen:
 *    knoppen dragen hun naam al in zichzelf. Daar staat nu een `<span>` met een
 *    id, en de groep verwijst er met `role="group"` naar. De test daarop kijkt
 *    dat er géén `<label>` meer staat: een `htmlFor` die nergens naar wijst is
 *    slechter dan geen `htmlFor`, en een `<label>` zonder `htmlFor` is een lege
 *    belofte.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';

import TicketPurchase from '../TicketPurchase';
import { GoogleDriveSettings } from '../GoogleDriveSettings';
import { ImslpSearch } from '../ImslpSearch';
import { Metronome } from '../Metronome';
import { MfaSettings } from '../MfaSettings';
import { PitchPipe } from '../PitchPipe';
import { PracticeLogModal } from '../PracticeLogModal';
import { OfflineScanner } from '../OfflineScanner';
import * as api from '../../api';

vi.mock('../../api');

// `t` geeft de sleutel terug, dus de labels heten hier 'tickets.buyerName' en
// niet 'Naam koper'. Dat is dezelfde afspraak als in de tests hiernaast.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (sleutel: string, standaard?: unknown) => (typeof standaard === 'string' ? standaard : sleutel),
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('../Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

vi.mock('../../utils/toast', () => ({
  showSuccess: () => {},
  showError: () => {},
  toast: { info: () => {}, error: () => {}, success: () => {} },
}));

vi.mock('../CaptchaWidget', () => ({ default: () => <div data-testid="captcha" /> }));

const { gebruiker } = vi.hoisted(() => ({ gebruiker: { mfaEnabled: false } }));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: gebruiker, refreshProfile: async () => {} }),
}));

vi.mock('../../hooks/usePractice', () => ({
  useLogPractice: () => ({ mutateAsync: async () => {}, isPending: false }),
}));

/** Toon een component met een eigen queryclient eromheen. */
function toon(element: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}>{element}</QueryClientProvider>);
  return userEvent.setup();
}

/**
 * Zoek de `.form-group` (of het omhulsel met `role="group"`) waar deze tekst in
 * staat. Alleen om te kúnnen aantonen dat daar géén `<label>` meer in zit; om
 * een veld te vinden is `getByLabelText` het enige eerlijke gereedschap.
 */
function omhulselVan(tekst: string): HTMLElement {
  const kop = screen.getByText(tekst);
  const omhulsel = kop.closest('.form-group') ?? kop.parentElement;
  if (!omhulsel) throw new Error(`geen omhulsel gevonden rond "${tekst}"`);
  return omhulsel as HTMLElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  gebruiker.mfaEnabled = false;
});

describe('kaartverkoop - labels gekoppeld aan hun veld', () => {
  beforeEach(() => {
    vi.mocked(api.getConcertTickets).mockResolvedValue({
      concert: { id: 'con-1', name: 'Najaarsconcert', date: '2026-11-14', location: 'De Kerk' },
      ticketTypes: [
        {
          id: 'tt-1',
          name: 'Volwassene',
          price: 12.5,
          available: 20,
          maxPerOrder: 4,
          onSale: true,
          serviceFee: 0,
          showServiceFeeSeparate: false,
        },
      ],
      paymentMethods: [],
    } as unknown as Awaited<ReturnType<typeof api.getConcertTickets>>);
  });

  /** Kies één kaart en ga door naar het bestelformulier. */
  async function naarBestelformulier() {
    const g = toon(<TicketPurchase concertId="con-1" />);
    await screen.findByText('Najaarsconcert');
    await g.click(screen.getByRole('button', { name: '+' }));
    await g.click(screen.getByRole('button', { name: 'tickets.proceedToCheckout' }));
    return g;
  }

  it('vindt de drie velden van het bestelformulier op hun labeltekst', async () => {
    await naarBestelformulier();

    expect(await screen.findByLabelText(/tickets\.buyerName/)).toHaveAttribute('type', 'text');
    expect(screen.getByLabelText(/tickets\.buyerEmail/)).toHaveAttribute('type', 'email');
    expect(screen.getByLabelText('tickets.buyerPhone')).toHaveAttribute('type', 'tel');
  });

  it('zet de aanwijzer in het naamveld als je op het label klikt', async () => {
    const g = await naarBestelformulier();

    await g.click(await screen.findByText(/tickets\.buyerName/));
    expect(screen.getByLabelText(/tickets\.buyerName/)).toHaveFocus();
  });

  it('hangt de hulptekst onder het e-mailveld aan dat veld', async () => {
    // Dit veld is met de hand gekoppeld omdat er naast label en veld ook een
    // hulptekst in de form-group staat. Zonder aria-describedby valt die tekst
    // buiten beeld voor een schermlezer.
    await naarBestelformulier();

    const veld = await screen.findByLabelText(/tickets\.buyerEmail/);
    const hulpId = veld.getAttribute('aria-describedby');
    expect(hulpId).toBeTruthy();
    expect(document.getElementById(hulpId!)).toHaveTextContent('tickets.emailDescription');
  });
});

describe('google drive-instellingen - labels gekoppeld aan hun veld', () => {
  it('vindt beide sleutelvelden op hun labeltekst', async () => {
    vi.mocked(api.getGoogleDriveSettings).mockResolvedValue({
      clientId: '',
      apiKey: '',
      enabled: false,
      configured: false,
    } as unknown as Awaited<ReturnType<typeof api.getGoogleDriveSettings>>);

    toon(<GoogleDriveSettings />);

    expect(await screen.findByLabelText('OAuth Client ID')).toHaveAttribute('type', 'text');
    expect(screen.getByLabelText('API Key')).toHaveAttribute('type', 'password');
  });
});

describe('imslp-zoekvenster - labels gekoppeld aan hun veld', () => {
  it('vindt titel en componist op hun labeltekst en volgt een klik op het label', async () => {
    const g = toon(<ImslpSearch onClose={() => {}} />);

    expect(screen.getByLabelText('imslp.workTitle')).toHaveAttribute('type', 'text');

    await g.click(screen.getByText('imslp.composer'));
    expect(screen.getByLabelText('imslp.composer')).toHaveFocus();
  });
});

describe('metronoom - veld gekoppeld, knoppenrij als groepskop', () => {
  it('vindt de temposchuif op zijn labeltekst', () => {
    toon(<Metronome />);

    expect(screen.getByLabelText('tools.metronome.tempoLabel')).toHaveAttribute('type', 'range');
  });

  it('zet boven de maatsoortknoppen een groepskop en geen label', () => {
    // Er staat geen veld onder deze kop maar een rij knoppen, en die dragen hun
    // naam al in zichzelf. Een <label> zou naar niets wijzen.
    toon(<Metronome />);

    const kop = screen.getByText('tools.metronome.timeSignature');
    expect(kop.tagName).toBe('SPAN');
    expect(omhulselVan('tools.metronome.timeSignature').querySelector('label')).toBeNull();

    const groep = screen.getByRole('group', { name: 'tools.metronome.timeSignature' });
    expect(within(groep).getByRole('button', { name: '4/4' })).toBeInTheDocument();
  });
});

describe('tweestapsverificatie - labels gekoppeld aan hun veld', () => {
  it('vindt het controlegetal in het instelvenster op zijn labeltekst', async () => {
    vi.mocked(api.setupMfa).mockResolvedValue({ qrCode: 'data:image/png;base64,x', secret: 'GEHEIM' } as never);

    const g = toon(<MfaSettings />);
    await g.click(screen.getByRole('button', { name: 'mfa.enable' }));

    expect(await screen.findByLabelText('mfa.verificationCode')).toHaveAttribute('inputmode', 'numeric');
  });

  it('vindt het wachtwoordveld in het uitschakelvenster op zijn labeltekst', async () => {
    gebruiker.mfaEnabled = true;

    const g = toon(<MfaSettings />);
    await g.click(screen.getByRole('button', { name: 'mfa.disable' }));

    expect(await screen.findByLabelText('mfa.password')).toHaveAttribute('type', 'password');
  });
});

describe('stemfluit - twee groepskoppen, geen veldlabels', () => {
  it('zet boven beide knoppenrijen een groepskop en geen label', () => {
    // Hier staat geen enkel invoerveld: allebei de koppen staan boven knoppen.
    toon(<PitchPipe />);

    expect(screen.getByText('Referentietoon').tagName).toBe('SPAN');
    expect(screen.getByText('Veelgebruikte tonen').tagName).toBe('SPAN');
    expect(document.querySelectorAll('label')).toHaveLength(0);

    expect(screen.getByRole('group', { name: 'Referentietoon' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Veelgebruikte tonen' })).toBeInTheDocument();
  });
});

describe('oefenlogboek - labels gekoppeld aan hun veld', () => {
  it('vindt duur en notities op hun labeltekst', () => {
    // De duur is met de hand gekoppeld: tussen label en veld staan ook nog de
    // voorkeuzeknoppen, en FormField kloont maar één kind.
    toon(<PracticeLogModal musicTitleId="tit-1" musicTitle="Bolero" onClose={() => {}} />);

    expect(screen.getByLabelText('practice.duration')).toHaveAttribute('type', 'number');
    expect(screen.getByLabelText(/practice\.notes/).tagName).toBe('TEXTAREA');
  });

  it('zet de aanwijzer in het duurveld als je op het label klikt', async () => {
    const g = toon(<PracticeLogModal musicTitleId="tit-1" musicTitle="Bolero" onClose={() => {}} />);

    await g.click(screen.getByText('practice.duration'));
    expect(screen.getByLabelText('practice.duration')).toHaveFocus();
  });
});

describe('offline scanner - label gekoppeld aan het scanveld', () => {
  // jsdom kent geen IndexedDB. De scanner opent die bij het aankoppelen; hij
  // heeft de inhoud niet nodig om het formulier te tonen, dus een verzoek dat
  // nooit antwoordt is genoeg om de component overeind te houden.
  beforeEach(() => {
    Object.defineProperty(globalThis, 'indexedDB', {
      configurable: true,
      value: { open: () => ({ onerror: null, onsuccess: null, onupgradeneeded: null }) },
    });
  });

  it('vindt het scanveld op zijn labeltekst', () => {
    // Het veld staat samen met de knop in een eigen omhulsel onder het label,
    // dus dit geval is met de hand gekoppeld.
    toon(<OfflineScanner concertId="con-1" />);

    expect(screen.getByLabelText('offlineScanner.scanOrEnter')).toHaveAttribute('type', 'text');
  });
});
