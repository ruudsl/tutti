/**
 * Wat er aan de deur gebeurt als er een kaart langskomt.
 *
 * De scannerpagina zelf doet drie dingen: een code opsturen, de uitkomst tonen
 * en de tellers bijhouden. De camera eromheen is in jsdom niet echt aanwezig,
 * dus `getUserMedia`, `BarcodeDetector` en het tekenvlak worden hier nagebootst.
 * Dat is geen doel op zich: het gaat om de laag eromheen - een geldige kaart,
 * een al gebruikte kaart, een onbekende code, en scannen zonder verbinding.
 *
 * De offline scanner is een eigen component met een eigen indexedDB-opzet en
 * eigen tests. Hier staat een dubbelganger, want wat deze pagina moet doen is
 * hem alléén tonen als er een concert gekozen is, en zijn uitkomsten in de
 * tellers verwerken.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, waitFor, fireEvent, configure } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import TicketScanner from '../TicketScanner';
import type { TicketValidationResult } from '../../types';

// Het wachten van testing-library staat standaard op één seconde. Dat is krap
// zodra de dekkingsmeting meedraait: elke render gaat dan door de instrumentatie
// heen, en op een bezette machine tikt een `waitFor` na een knopdruk daar
// overheen. Dat zou een trage machine als een fout laten lezen.
configure({ asyncUtilTimeout: 4000 });

// De tijdslimiet per test staat standaard op vijf seconden. Een test die een
// heel formulier invult en verstuurt haalt dat ruim, maar niet als de
// dekkingsmeting meedraait én de machine gedeeld wordt: dan wordt dezelfde test
// een veelvoud trager en valt hij om op de klok in plaats van op de code.
vi.setConfig({ testTimeout: 15000 });

vi.mock('../../hooks/useDocumentTitle', () => ({ useDocumentTitle: () => {} }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (sleutel: string, standaard?: unknown) => (typeof standaard === 'string' ? standaard : sleutel),
    i18n: { language: 'nl' },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

const { toonSucces, toonFout } = vi.hoisted(() => ({ toonSucces: vi.fn(), toonFout: vi.fn() }));
vi.mock('../../utils/toast', () => ({ showSuccess: toonSucces, showError: toonFout }));

const { haalConcerts, keurKaart } = vi.hoisted(() => ({ haalConcerts: vi.fn(), keurKaart: vi.fn() }));
vi.mock('../../api', () => ({ getConcerts: haalConcerts, validateTicket: keurKaart }));

// De echte offline scanner opent indexedDB bij het aankoppelen; deze
// dubbelganger geeft alleen een knop waarmee een scan gemeld kan worden, zodat
// zichtbaar wordt wat de pagina eromheen met zo'n uitkomst doet.
vi.mock('../../components/OfflineScanner', () => ({
  OfflineScanner: ({
    concertId,
    onScanComplete,
  }: {
    concertId: string;
    onScanComplete?: (r: { valid: boolean; status: string; message: string }) => void;
  }) => (
    <div>
      <span>offline scanner voor {concertId}</span>
      <button onClick={() => onScanComplete?.({ valid: true, status: 'offline_valid', message: 'ok' })}>
        offline geldig
      </button>
      <button onClick={() => onScanComplete?.({ valid: false, status: 'offline_already_used', message: 'al binnen' })}>
        offline afgewezen
      </button>
    </div>
  ),
}));

const MORGEN = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
const VORIG_JAAR = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();

function geldigeUitkomst(overschrijving: Partial<TicketValidationResult> = {}): TicketValidationResult {
  return {
    valid: true,
    status: 'valid',
    message: 'Welkom binnen',
    ticket: {
      id: 'k-1',
      code: 'HARMONIE-1234567',
      buyerName: 'Anna de Vries',
      ticketType: 'Volwassene',
      concertName: 'Nieuwjaarsconcert',
      concertDate: MORGEN,
      seatInfo: 'Rij 3, stoel 12',
    },
    ...overschrijving,
  };
}

function wikkel({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function toon() {
  // `delay: null` tikt de toetsaanslagen zonder tussenpauze in. Met de
  // standaardinstelling zet userEvent per teken een taak in de wachtrij, en dan
  // loopt een formulier van drie velden op een bezette machine tegen de
  // tijdslimiet van vitest aan.
  const gebruiker = userEvent.setup({ delay: null });
  const hulp = render(<TicketScanner />, { wrapper: wikkel });
  return { gebruiker, ...hulp };
}

/** Voert een code in bij de handmatige invoer en verstuurt hem. */
async function typCode(gebruiker: ReturnType<typeof userEvent.setup>, code: string) {
  await gebruiker.type(screen.getByPlaceholderText('tickets.enterCode'), code);
  await gebruiker.click(screen.getByRole('button', { name: 'tickets.validate' }));
}

beforeEach(() => {
  vi.clearAllMocks();
  haalConcerts.mockResolvedValue({
    data: [
      { id: 'con-1', name: 'Nieuwjaarsconcert', date: MORGEN },
      { id: 'con-oud', name: 'Kerstconcert vorig jaar', date: VORIG_JAAR },
    ],
  });
  keurKaart.mockResolvedValue(geldigeUitkomst());
});

describe('kaartscanner - handmatig ingevoerde codes', () => {
  it('keurt een geldige kaart goed en toont wie er binnenkomt', async () => {
    const { gebruiker } = toon();
    await typCode(gebruiker, 'harmonie-1234567');

    // De code gaat in hoofdletters de deur uit, ook als hij in kleine letters
    // is ingetikt.
    await waitFor(() => expect(keurKaart).toHaveBeenCalledWith('HARMONIE-1234567', undefined));

    expect(await screen.findByText('Welkom binnen')).toBeInTheDocument();
    expect(screen.getByText('Anna de Vries')).toBeInTheDocument();
    expect(screen.getByText('Volwassene')).toBeInTheDocument();
    expect(screen.getByText('Rij 3, stoel 12')).toBeInTheDocument();
    expect(toonSucces).toHaveBeenCalledWith('tickets.ticketValidated');

    // Teller links telt geldig, teller rechts blijft op nul.
    expect(await tellerWaarde('tickets.validScans')).toBe('1');
    expect(await tellerWaarde('tickets.invalidScans')).toBe('0');

    // Het veld is leeg voor de volgende bezoeker.
    expect(screen.getByPlaceholderText('tickets.enterCode')).toHaveValue('');
  });

  it('wijst een al gebruikte kaart af en laat zien wanneer hij binnenkwam', async () => {
    const binnengekomen = new Date('2026-01-05T19:45:00Z').toISOString();
    keurKaart.mockResolvedValue(
      geldigeUitkomst({
        valid: false,
        status: 'used',
        message: 'Deze kaart is al gescand',
        ticket: {
          id: 'k-1',
          code: 'HARMONIE-1234567',
          buyerName: 'Anna de Vries',
          ticketType: 'Volwassene',
          concertName: 'Nieuwjaarsconcert',
          concertDate: MORGEN,
          usedAt: binnengekomen,
        },
      }),
    );

    const { gebruiker } = toon();
    await typCode(gebruiker, 'HARMONIE-1234567');

    expect(await screen.findByText('Deze kaart is al gescand')).toBeInTheDocument();
    expect(screen.getByText('tickets.usedAt')).toBeInTheDocument();
    expect(screen.getByText(new Date(binnengekomen).toLocaleString())).toBeInTheDocument();
    expect(toonFout).toHaveBeenCalledWith('Deze kaart is al gescand');
    expect(await tellerWaarde('tickets.invalidScans')).toBe('1');
    expect(await tellerWaarde('tickets.validScans')).toBe('0');
  });

  it('meldt een onbekende code zonder kaartgegevens te tonen', async () => {
    keurKaart.mockResolvedValue({
      valid: false,
      status: 'not_found',
      message: 'Onbekende code',
    } satisfies TicketValidationResult);

    const { gebruiker } = toon();
    await typCode(gebruiker, 'BESTAATNIET123');

    expect(await screen.findByText('Onbekende code')).toBeInTheDocument();
    expect(screen.queryByText('tickets.ticketCode')).not.toBeInTheDocument();
    expect(await tellerWaarde('tickets.invalidScans')).toBe('1');
  });

  it('verstuurt niets bij een lege of alleen uit spaties bestaande code', async () => {
    const { gebruiker } = toon();
    const knop = screen.getByRole('button', { name: 'tickets.validate' });
    expect(knop).toBeDisabled();

    await gebruiker.type(screen.getByPlaceholderText('tickets.enterCode'), '   ');
    expect(knop).toBeDisabled();
    expect(keurKaart).not.toHaveBeenCalled();
  });

  it('stuurt het gekozen concert mee en laat verlopen concerten uit de keuzelijst', async () => {
    const { gebruiker } = toon();
    const keuze = await concertKeuze();

    expect(within(keuze).getByRole('option', { name: /Nieuwjaarsconcert/ })).toBeInTheDocument();
    expect(within(keuze).queryByRole('option', { name: /Kerstconcert vorig jaar/ })).not.toBeInTheDocument();

    await gebruiker.selectOptions(keuze, 'con-1');
    await typCode(gebruiker, 'HARMONIE-1234567');

    await waitFor(() => expect(keurKaart).toHaveBeenCalledWith('HARMONIE-1234567', 'con-1'));
  });

  it('zet de tellers en de laatste uitkomst terug', async () => {
    const { gebruiker } = toon();
    await typCode(gebruiker, 'HARMONIE-1234567');
    expect(await screen.findByText('Welkom binnen')).toBeInTheDocument();

    await gebruiker.click(screen.getByRole('button', { name: 'tickets.resetCounter' }));

    expect(screen.queryByText('Welkom binnen')).not.toBeInTheDocument();
    expect(screen.getByText('tickets.noScansYet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'tickets.resetCounter' })).not.toBeInTheDocument();
  });

  /**
   * BEWIJS. Zonder de reparatie in TicketScanner.tsx (`setLastResult(null)` in
   * `onError`) blijft de vorige uitslag staan als de volgende scan de server
   * niet haalt: op het scherm prijkt dan nog het groene vinkje met de naam van
   * de vórige bezoeker, terwijl de foutmelding als toast voorbijschiet. Aan de
   * deur is dat precies verkeerd - de tweede bezoeker wordt binnengelaten op de
   * uitslag van de eerste.
   *
   * Rood zonder de reparatie op `expect(...'Anna de Vries').not.toBeInTheDocument()`.
   */
  it('laat de vorige uitslag niet staan als de volgende scan de server niet haalt', async () => {
    const { gebruiker } = toon();
    await typCode(gebruiker, 'HARMONIE-1234567');
    expect(await screen.findByText('Anna de Vries')).toBeInTheDocument();

    keurKaart.mockRejectedValueOnce(new Error('Netwerkfout'));
    await typCode(gebruiker, 'HARMONIE-7654321');

    await waitFor(() => expect(toonFout).toHaveBeenCalled());
    expect(screen.queryByText('Anna de Vries')).not.toBeInTheDocument();
    expect(screen.queryByText('Welkom binnen')).not.toBeInTheDocument();
    expect(screen.getByText('tickets.noScansYet')).toBeInTheDocument();
    // De mislukte scan telt niet mee als afgekeurde kaart: er is niets
    // afgekeurd, er is niets gevraagd.
    expect(await tellerWaarde('tickets.invalidScans')).toBe('0');
  });
});

describe('kaartscanner - zonder verbinding', () => {
  it('toont de offline scanner pas als er een concert gekozen is', async () => {
    const { gebruiker } = toon();
    await gebruiker.click(screen.getByRole('button', { name: 'Offline Modus' }));

    // Knop staat nu op "online" (terugschakelen), maar zonder concert is er
    // niets te scannen.
    expect(screen.getByRole('button', { name: 'Online Modus' })).toBeInTheDocument();
    expect(screen.queryByText(/offline scanner voor/)).not.toBeInTheDocument();

    await gebruiker.selectOptions(await concertKeuze(), 'con-1');
    expect(screen.getByText('offline scanner voor con-1')).toBeInTheDocument();
  });

  it('telt de offline scans mee in dezelfde tellers', async () => {
    const { gebruiker } = toon();
    await gebruiker.selectOptions(await concertKeuze(), 'con-1');
    await gebruiker.click(screen.getByRole('button', { name: 'Offline Modus' }));

    await gebruiker.click(screen.getByRole('button', { name: 'offline geldig' }));
    await gebruiker.click(screen.getByRole('button', { name: 'offline geldig' }));
    await gebruiker.click(screen.getByRole('button', { name: 'offline afgewezen' }));

    expect(await tellerWaarde('tickets.validScans')).toBe('2');
    expect(await tellerWaarde('tickets.invalidScans')).toBe('1');
    // De offline scanner meldt niet welke kaart het was; de laatste uitslag
    // blijft dus leeg.
    expect(screen.getByText('tickets.noScansYet')).toBeInTheDocument();
  });

  it('schakelt terug naar online en verbergt de offline scanner', async () => {
    const { gebruiker } = toon();
    await gebruiker.selectOptions(await concertKeuze(), 'con-1');
    await gebruiker.click(screen.getByRole('button', { name: 'Offline Modus' }));
    expect(screen.getByText('offline scanner voor con-1')).toBeInTheDocument();

    await gebruiker.click(screen.getByRole('button', { name: 'Online Modus' }));
    expect(screen.queryByText(/offline scanner voor/)).not.toBeInTheDocument();
  });
});

describe('kaartscanner - camera', () => {
  const sporen: { stop: ReturnType<typeof vi.fn> }[] = [];
  let haalCamera: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    sporen.length = 0;
    const spoor = { stop: vi.fn(), kind: 'video' };
    sporen.push(spoor);
    haalCamera = vi.fn().mockResolvedValue({ getTracks: () => sporen });
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: haalCamera },
    });
    HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
    // Zonder tekenvlak in jsdom: een leeg penseel is genoeg, er wordt alleen op
    // getekend.
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ drawImage: vi.fn() })) as never;
    // Eén ronde door de scanlus is genoeg; de aanvraag voor een volgend beeld
    // loopt dood zodat de test niet blijft draaien.
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn(() => 1),
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({}) as ImageBitmap),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(navigator, 'mediaDevices');
  });

  /** Zet een nagebootste streepjescodelezer klaar die één code teruggeeft. */
  function zetLezerKlaar(code: string) {
    vi.stubGlobal(
      'BarcodeDetector',
      class {
        async detect() {
          return [{ rawValue: code }];
        }
      },
    );
  }

  /** Doet alsof het beeld binnen is: dat start de scanlus. */
  function beeldBinnen(container: HTMLElement) {
    const video = container.querySelector('video') as HTMLVideoElement;
    Object.defineProperty(video, 'readyState', { configurable: true, value: 4 });
    Object.defineProperty(video, 'videoWidth', { configurable: true, value: 1280 });
    Object.defineProperty(video, 'videoHeight', { configurable: true, value: 720 });
    fireEvent.loadedMetadata(video);
    return video;
  }

  it('zegt dat scannen hier niet kan als de browser geen streepjescodelezer heeft', async () => {
    // Geen BarcodeDetector in beeld: de knop blijft uit en de uitleg wijst naar
    // de handmatige invoer.
    toon();

    expect(screen.getByRole('button', { name: 'tickets.startCamera' })).toBeDisabled();
    expect(screen.getByText('tickets.noBarcodeDetector')).toBeInTheDocument();
    expect(screen.getByText('tickets.useChromeOrManual')).toBeInTheDocument();
    // Handmatig invoeren kan wél.
    expect(screen.getByPlaceholderText('tickets.enterCode')).toBeEnabled();
  });

  it('keurt een kaart die voor de camera wordt gehouden', async () => {
    zetLezerKlaar('HARMONIE-1234567');
    const { gebruiker, container } = toon();

    await gebruiker.click(screen.getByRole('button', { name: 'tickets.startCamera' }));
    await waitFor(() => expect(haalCamera).toHaveBeenCalled());
    expect(haalCamera.mock.calls[0][0].video.facingMode).toBe('environment');

    beeldBinnen(container);

    // Camera loopt: er staat nu een stopknop en de melding "camera uit" is weg.
    expect(await screen.findByRole('button', { name: 'tickets.stopCamera' })).toBeInTheDocument();
    expect(screen.queryByText('tickets.cameraInactive')).not.toBeInTheDocument();

    await waitFor(() => expect(keurKaart).toHaveBeenCalledWith('HARMONIE-1234567', undefined));
    expect(await screen.findByText('Welkom binnen')).toBeInTheDocument();
    expect(await tellerWaarde('tickets.validScans')).toBe('1');
  });

  it('negeert een streepjescode die te kort is voor een kaartcode', async () => {
    zetLezerKlaar('KORT');
    const { gebruiker, container } = toon();

    await gebruiker.click(screen.getByRole('button', { name: 'tickets.startCamera' }));
    await waitFor(() => expect(haalCamera).toHaveBeenCalled());
    beeldBinnen(container);

    expect(await screen.findByRole('button', { name: 'tickets.stopCamera' })).toBeInTheDocument();
    expect(keurKaart).not.toHaveBeenCalled();
  });

  it('zet de camera uit en laat de sporen los', async () => {
    zetLezerKlaar('HARMONIE-1234567');
    const { gebruiker, container } = toon();

    await gebruiker.click(screen.getByRole('button', { name: 'tickets.startCamera' }));
    await waitFor(() => expect(haalCamera).toHaveBeenCalled());
    beeldBinnen(container);
    await screen.findByRole('button', { name: 'tickets.stopCamera' });

    await gebruiker.click(screen.getByRole('button', { name: 'tickets.stopCamera' }));

    expect(sporen[0].stop).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'tickets.startCamera' })).toBeInTheDocument();
    expect(screen.getByText('tickets.cameraInactive')).toBeInTheDocument();
  });

  it('meldt het als de camera geweigerd wordt', async () => {
    zetLezerKlaar('HARMONIE-1234567');
    haalCamera.mockRejectedValue(new Error('Permission denied'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { gebruiker } = toon();

    await gebruiker.click(screen.getByRole('button', { name: 'tickets.startCamera' }));

    await waitFor(() => expect(toonFout).toHaveBeenCalledWith('tickets.cameraError'));
    // De pagina blijft bruikbaar: de startknop staat er nog en handmatig kan.
    expect(screen.getByRole('button', { name: 'tickets.startCamera' })).toBeInTheDocument();
  });
});

/** Wacht tot de concertkeuze de opgehaalde concerten bevat. */
async function concertKeuze(): Promise<HTMLSelectElement> {
  const keuze = (await screen.findByLabelText('tickets.selectConcert')) as HTMLSelectElement;
  await waitFor(() => expect(within(keuze).getAllByRole('option').length).toBeGreaterThan(1));
  return keuze;
}

/** Leest het getal boven het opschrift van een teller. */
async function tellerWaarde(opschrift: string): Promise<string> {
  const label = await screen.findByText(opschrift);
  const kaart = label.parentElement as HTMLElement;
  return (kaart.firstElementChild as HTMLElement).textContent ?? '';
}
