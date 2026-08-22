/**
 * De formulierlabels van tien beheer- en kaartschermen horen bij hun veld.
 *
 * Overal hier stond het label lós naast het veld in dezelfde `.form-group`,
 * zonder `htmlFor` en zonder `id`. Een schermlezer kondigde dan "bewerkbaar
 * veld" aan zonder te zeggen wat erin moest, en klikken op het label zette de
 * aanwijzer nergens.
 *
 * `getByLabelText` is de kern van deze tests: die vindt een veld alleen als de
 * koppeling er echt is. Zoeken via de omhullende `.form-group` zou ook op de
 * kapotte code slagen en bewijst dus niets.
 *
 * Zeven gevallen zijn met de hand gekoppeld, omdat er méér in de `.form-group`
 * staat dan label plus veld en `FormField` maar één kind kloont: bij de
 * wachtwoorden van het herstelscherm en bij de ontvanger van een kaartoverdracht
 * staat er een foutmelding onder, bij de mollie-sleutel, de concertkeuze van de
 * scanner en de bewaartermijnen een uitleg, en onder het functieveld van de
 * entra-koppeling een rij suggestieknoppen. Waar er een hulptekst of
 * foutmelding is, hangt die via `aria-describedby` aan het veld - anders valt
 * hij buiten beeld voor een schermlezer.
 *
 * Eén geval labelt niets: de kop boven de ledenlijst in het aanwezigheidsvenster
 * van een concert staat boven aankruisvakjes die elk al hun eigen label dragen.
 * Dat is een groepskop geworden, en de test daarop kijkt dat er géén `<label>`
 * meer staat.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactElement } from 'react';

import Availability from '../Availability';
import Concerts from '../Concerts';
import DataExport from '../DataExport';
import EntraSync from '../EntraSync';
import GdprAdmin from '../GdprAdmin';
import PaymentSettings from '../PaymentSettings';
import ResetPassword from '../ResetPassword';
import TicketScanner from '../TicketScanner';
import TicketTransfer from '../TicketTransfer';
import { BumaStemraModal } from '../Concerts/BumaStemraModal';
import * as api from '../../api';

vi.mock('../../api');

vi.mock('../../hooks/useDocumentTitle', () => ({ useDocumentTitle: () => {} }));

// `initReactI18next` hoort erbij omdat verschillende pagina's via
// utils/locale.ts de echte i18n-opzet meetrekken; die roept het aan tijdens het
// laden van de module.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (sleutel: string, standaard?: unknown) => (typeof standaard === 'string' ? standaard : sleutel),
    i18n: { language: 'nl' },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('../../components/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

vi.mock('../../components/Skeleton', () => ({
  SkeletonTable: () => <div data-testid="skelet-tabel" />,
  SkeletonCard: () => <div data-testid="skelet-kaart" />,
}));

vi.mock('../../utils/toast', () => ({ showSuccess: vi.fn(), showError: vi.fn() }));

vi.mock('../../components/SetlistBuilder', () => ({ default: () => <div data-testid="setlijstbouwer" /> }));
vi.mock('../../components/ConcertPosterGenerator', () => ({ default: () => <div data-testid="postergenerator" /> }));
vi.mock('../../components/SetlistMode', () => ({ SetlistMode: () => <div data-testid="uitvoeringsmodus" /> }));
vi.mock('../../components/CustomFields', () => ({
  CustomFieldFormSection: () => <div data-testid="eigen-velden" />,
  CustomFieldRenderer: () => <div data-testid="eigen-velden-weergave" />,
}));

// De scannerpagina toont de offline scanner pas na een knopdruk, maar de
// component wordt wel meegeladen en opent bij het aankoppelen IndexedDB, die
// jsdom niet kent. Voor deze test telt alleen de concertkeuze erboven.
vi.mock('../../components/OfflineScanner', () => ({
  OfflineScanner: () => <div data-testid="offline-scanner" />,
}));

vi.mock('../../components/LanguageSwitcher', () => ({
  LanguageSwitcher: () => <div data-testid="taalkiezer" />,
}));

const { navigeer, zoekparameters } = vi.hoisted(() => ({
  navigeer: vi.fn(),
  zoekparameters: new URLSearchParams({ token: 'geldig-teken' }),
}));

vi.mock('react-router-dom', async (origineel) => ({
  ...((await origineel()) as object),
  useNavigate: () => navigeer,
  useSearchParams: () => [zoekparameters, () => {}],
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'geb-1', role: 'admin' } }),
}));

/**
 * Alles wat via de api-barrel loopt krijgt een lege uitkomst, zodat elke pagina
 * zijn "nog niets"-toestand toont. Dat is genoeg: het gaat hier om de labels,
 * niet om de inhoud van de rijen. Dezelfde aanpak als in
 * Concerts.karakterisering.test.tsx hiernaast.
 */
function zetApiKlaar(): void {
  for (const naam of Object.keys(api)) {
    const functie = (api as Record<string, unknown>)[naam];
    if (typeof functie === 'function') {
      vi.mocked(functie as (...args: unknown[]) => unknown).mockResolvedValue(undefined);
    }
  }
  vi.mocked(api.getConcerts).mockResolvedValue({ data: [], total: 0, page: 1, limit: 50 });
  vi.mocked(api.getConcertTypes).mockResolvedValue({ concertTypes: [], mediaTypes: [] });
  vi.mocked(api.getConcertYears).mockResolvedValue([]);
  vi.mocked(api.getUsers).mockResolvedValue([]);
  vi.mocked(api.getMusicTitles).mockResolvedValue([]);
  vi.mocked(api.getOrchestras).mockResolvedValue([{ id: 'ork-1', name: 'Harmonie' }] as never);
  vi.mocked(api.getMyAvailability).mockResolvedValue([] as never);
  vi.mocked(api.getTeamAvailability).mockResolvedValue({ members: [] } as never);
}

/** Toon een pagina met queryclient en router eromheen. */
function toon(element: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{element}</MemoryRouter>
    </QueryClientProvider>,
  );
  return userEvent.setup();
}

/** Het veld dat bij dit label hoort moet zijn hulptekst als beschrijving dragen. */
function verwachtBeschrijving(veld: HTMLElement, tekst: string) {
  const hulpId = veld.getAttribute('aria-describedby');
  expect(hulpId).toBeTruthy();
  expect(document.getElementById(hulpId!)).toHaveTextContent(tekst);
}

beforeEach(() => {
  vi.clearAllMocks();
  zetApiKlaar();
});

describe('beschikbaarheid - labels gekoppeld aan hun veld', () => {
  it('vindt datum en orkestfilter van het teamoverzicht op hun labeltekst', async () => {
    const gebruiker = toon(<Availability />);

    await gebruiker.click(await screen.findByRole('button', { name: 'availability.teamAvailability' }));

    expect(await screen.findByLabelText('availability.selectDate')).toHaveAttribute('type', 'date');
    expect(screen.getByLabelText('rehearsals.orchestra').tagName).toBe('SELECT');
  });
});

describe('buma/stemra-export - labels gekoppeld aan hun veld', () => {
  it('vindt begin- en einddatum op hun labeltekst en volgt een klik op het label', async () => {
    render(
      <BumaStemraModal
        bumaStemraStartDate="2026-01-01"
        setBumaStemraStartDate={() => {}}
        bumaStemraEndDate="2026-12-31"
        setBumaStemraEndDate={() => {}}
        onClose={() => {}}
        onSubmit={() => {}}
        isSubmitting={false}
      />,
    );
    const gebruiker = userEvent.setup();

    expect(screen.getByLabelText('concerts.startDate')).toHaveValue('2026-01-01');
    expect(screen.getByLabelText('concerts.endDateExport')).toHaveValue('2026-12-31');

    await gebruiker.click(screen.getByText('concerts.endDateExport'));
    expect(screen.getByLabelText('concerts.endDateExport')).toHaveFocus();
  });
});

describe('concertpagina - groepskop boven de ledenlijst', () => {
  it('zet boven de aankruisvakjes van de leden een groepskop en geen label', async () => {
    // Elk lid zit al in zijn eigen label; de kop erboven labelt niets.
    vi.mocked(api.getConcerts).mockResolvedValue({
      data: [{ id: 'con-1', name: 'Najaarsconcert', date: '2026-11-14' }],
      total: 1,
      page: 1,
      limit: 50,
    } as never);
    vi.mocked(api.getConcert).mockResolvedValue({
      id: 'con-1',
      name: 'Najaarsconcert',
      date: '2026-11-14',
      location: 'De Kerk',
      program: [],
      media: [],
      attendance: [],
    } as never);
    vi.mocked(api.getUsers).mockResolvedValue([{ id: 'geb-1', firstName: 'Anna', lastName: 'de Groot' }] as never);

    const gebruiker = toon(<Concerts />);

    const rij = (await screen.findByText('Najaarsconcert')).closest('tr')!;
    await gebruiker.click(within(rij).getAllByRole('button')[0]);
    await gebruiker.click(await screen.findByRole('button', { name: /concerts\.bulkAddAttendance/ }));

    const kop = await screen.findByText('users.title');
    expect(kop.tagName).toBe('SPAN');
    expect(kop.closest('.form-group')?.querySelector('label.form-label')).toBeNull();

    const groep = screen.getByRole('group', { name: 'users.title' });
    expect(within(groep).getByText(/de Groot/)).toBeInTheDocument();
  });
});

describe('gegevensexport - label gekoppeld aan het redenveld', () => {
  it('vindt de reden van verwijdering op zijn labeltekst', async () => {
    // Deze pagina praat rechtstreeks met fetch, niet via de api-barrel.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ userId: 'geb-1', exportDate: '2026-08-22', categories: [], totalRecords: 0 }),
      })) as never,
    );

    const gebruiker = toon(<DataExport />);

    await gebruiker.click(await screen.findByRole('button', { name: 'dataExport.requestDeletion' }));

    expect(await screen.findByLabelText(/dataExport\.deleteReason/)).toHaveProperty('tagName', 'TEXTAREA');
  });
});

describe('entra-synchronisatie - labels gekoppeld aan hun veld', () => {
  /** Open het venster "koppeling toevoegen" op het tabblad koppelingen. */
  async function openKoppelvenster() {
    vi.mocked(api.getMicrosoftConfig).mockResolvedValue({ configured: true, enabled: true } as never);
    vi.mocked(api.getInstruments).mockResolvedValue([{ id: 'inst-1', name: 'Trompet', tuning: 'Bb' }] as never);
    vi.mocked(api.getJobTitleMappings).mockResolvedValue([] as never);

    const gebruiker = toon(<EntraSync />);
    await gebruiker.click(await screen.findByRole('button', { name: 'entraSync.tabMappings' }));
    await gebruiker.click(await screen.findByRole('button', { name: /entraSync\.addMapping/ }));
    return gebruiker;
  }

  it('vindt functie en instrument op hun labeltekst', async () => {
    await openKoppelvenster();

    // De functie is met de hand gekoppeld: onder het veld staat nog een rij
    // suggestieknoppen, en FormField kloont maar één kind.
    expect(await screen.findByLabelText(/entraSync\.jobTitleLabel/)).toHaveAttribute('type', 'text');
    expect(screen.getByLabelText(/entraSync\.instrumentLabel/).tagName).toBe('SELECT');
  });

  it('zet de aanwijzer in het functieveld als je op het label klikt', async () => {
    const gebruiker = await openKoppelvenster();

    await gebruiker.click(await screen.findByText(/entraSync\.jobTitleLabel/));
    expect(screen.getByLabelText(/entraSync\.jobTitleLabel/)).toHaveFocus();
  });
});

describe('avg-beheer - labels gekoppeld aan hun veld', () => {
  /** De pagina praat rechtstreeks met fetch, niet via de api-barrel. */
  function zetFetchKlaar() {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).includes('retention-settings')) {
          return {
            ok: true,
            json: async () => ({
              settings: [{ data_type: 'audit_logs', retention_days: 365, description: 'Wat er bewaard blijft' }],
            }),
          };
        }
        return {
          ok: true,
          json: async () => ({
            requests: [
              {
                id: 'ver-1',
                user_id: 'geb-1',
                email: 'anna@example.org',
                first_name: 'Anna',
                last_name: 'de Groot',
                reason: 'Ik stop',
                status: 'pending',
                created_at: '2026-08-01T10:00:00Z',
              },
            ],
          }),
        };
      }) as never,
    );
  }

  it('koppelt de bewaartermijn aan zijn label en hangt de uitleg eraan', async () => {
    // Met de hand gekoppeld: tussen label en veld staat de uitleg, en het veld
    // zit met de eenheid in een eigen omhulsel.
    zetFetchKlaar();
    const gebruiker = toon(<GdprAdmin />);

    await gebruiker.click(await screen.findByRole('button', { name: /Bewaartermijnen/ }));
    await gebruiker.click(await screen.findByRole('button', { name: /Bewerken/ }));

    const veld = await screen.findByLabelText('audit_logs');
    expect(veld).toHaveValue(365);
    verwachtBeschrijving(veld, 'Wat er bewaard blijft');
  });

  it('vindt het notitieveld van het verwerkingsvenster op zijn labeltekst', async () => {
    zetFetchKlaar();
    const gebruiker = toon(<GdprAdmin />);

    await gebruiker.click(await screen.findByRole('button', { name: 'Goedkeuren' }));

    // `t` geeft hier de meegegeven standaardtekst terug, dus het label heet
    // "Notities" en niet 'gdprAdmin.notes'.
    expect(await screen.findByLabelText(/Notities/)).toHaveProperty('tagName', 'TEXTAREA');
  });
});

describe('betaalinstellingen - label gekoppeld aan de sleutel', () => {
  it('vindt de api-sleutel op zijn labeltekst en hangt de uitleg eraan', async () => {
    // Met de hand gekoppeld: onder het veld staat een hulptekst.
    vi.mocked(api.getPaymentSettings).mockResolvedValue({ provider: 'mollie' } as never);
    vi.mocked(api.getMollieStatus).mockResolvedValue({ connected: false } as never);

    const gebruiker = toon(<PaymentSettings />);

    await gebruiker.click(await screen.findByRole('button', { name: /Test sleutel toevoegen/ }));

    const veld = await screen.findByLabelText('paymentSettings.apiKey');
    expect(veld).toHaveAttribute('type', 'password');
    verwachtBeschrijving(veld, 'test_');
  });
});

describe('wachtwoord herstellen - labels gekoppeld aan hun veld', () => {
  it('vindt beide wachtwoordvelden op hun labeltekst', async () => {
    vi.mocked(api.validateResetToken).mockResolvedValue(undefined as never);

    toon(<ResetPassword />);

    expect(await screen.findByLabelText(/resetPassword\.newPassword/)).toHaveAttribute('type', 'password');
    expect(screen.getByLabelText(/resetPassword\.confirmPassword/)).toHaveAttribute('type', 'password');
  });

  it('hangt de foutmelding onder een veld aan dat veld', async () => {
    // Met de hand gekoppeld: naast label en veld staat er een foutmelding.
    // Zonder aria-describedby hoort een schermlezer die melding nooit.
    vi.mocked(api.validateResetToken).mockResolvedValue(undefined as never);

    const gebruiker = toon(<ResetPassword />);
    const veld = await screen.findByLabelText(/resetPassword\.newPassword/);
    expect(veld).not.toHaveAttribute('aria-describedby');

    await gebruiker.click(screen.getByRole('button', { name: 'resetPassword.resetButton' }));

    verwachtBeschrijving(await screen.findByLabelText(/resetPassword\.newPassword/), 'errors.required');
  });
});

describe('kaartscanner - label gekoppeld aan de concertkeuze', () => {
  it('vindt de concertkeuze op zijn labeltekst en hangt de uitleg eraan', async () => {
    // Met de hand gekoppeld: onder de keuzelijst staat een hulptekst.
    const gebruiker = toon(<TicketScanner />);

    const veld = await screen.findByLabelText('tickets.selectConcert');
    expect(veld.tagName).toBe('SELECT');
    verwachtBeschrijving(veld, 'tickets.selectConcertDescription');

    await gebruiker.click(screen.getByText('tickets.selectConcert'));
    expect(veld).toHaveFocus();
  });
});

describe('kaartoverdracht - labels gekoppeld aan hun veld', () => {
  /** Open het overdrachtsvenster voor de enige overdraagbare kaart. */
  async function openOverdrachtsvenster() {
    vi.mocked(api.getTransferableTickets).mockResolvedValue([
      {
        id: 'kaart-1',
        code: 'ABC123',
        ticketType: 'Volwassene',
        buyerName: 'Anna de Groot',
        hasPendingTransfer: false,
        concert: { id: 'con-1', name: 'Najaarsconcert', date: '2026-11-14', location: 'De Kerk' },
      },
    ] as never);
    vi.mocked(api.getPendingTransfers).mockResolvedValue([] as never);
    vi.mocked(api.getTransferHistory).mockResolvedValue([] as never);

    const gebruiker = toon(<TicketTransfer />);
    await gebruiker.click(await screen.findByRole('button', { name: 'ticketTransfer.transfer' }));
    return gebruiker;
  }

  it('vindt e-mail en naam van de ontvanger op hun labeltekst', async () => {
    await openOverdrachtsvenster();

    expect(await screen.findByLabelText(/ticketTransfer\.recipientEmail/)).toHaveAttribute('type', 'email');
    expect(screen.getByLabelText(/ticketTransfer\.recipientName/)).toHaveAttribute('type', 'text');
  });

  it('hangt de foutmelding onder het e-mailveld aan dat veld', async () => {
    // Met de hand gekoppeld: naast label en veld staat er een foutmelding.
    const gebruiker = await openOverdrachtsvenster();

    await gebruiker.click(await screen.findByRole('button', { name: 'ticketTransfer.continue' }));

    verwachtBeschrijving(await screen.findByLabelText(/ticketTransfer\.recipientEmail/), 'ticketTransfer');
  });
});
