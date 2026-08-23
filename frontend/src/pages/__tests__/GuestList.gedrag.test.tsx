/**
 * Wat een beheerder op de gastenlijst doet, en wat er dan gebeurt.
 *
 * Het bestaande GuestList.labels.test.tsx kijkt of labels aan hun veld hangen.
 * Dat raakt maar een kwart van de pagina: alle vijf de mutaties, de vier
 * bevestigingsvensters, de filters en de bladering bleven onaangeraakt.
 *
 * Deze tests lopen die handelingen af zoals een beheerder ze doet - gast
 * toevoegen, bewerken, verwijderen, tickets versturen, filteren, bladeren - en
 * kijken telkens naar het verzoek dat de pagina daarna verstuurt, niet alleen
 * of er iets op het scherm verschijnt. Een venster dat opengaat zonder dat het
 * juiste verzoek volgt is geen werkende knop.
 *
 * Aantallen worden nagerekend. `guestList.sendConfirmMessage` krijgt een
 * `count`, de bladerregel rekent `van`/`tot` zelf uit, en de knop "alle
 * versturen" toont het aantal openstaande tickets. Dat zijn getallen die
 * onopgemerkt verkeerd kunnen staan omdat er wél iets staat.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import GuestList from '../GuestList';
import type { GuestListEntry, GuestListResponse } from '../../types';
import { showSuccess, showError } from '../../utils/toast';

const getGuestList = vi.fn();
const getConcertTickets = vi.fn();
const addGuest = vi.fn();
const updateGuest = vi.fn();
const deleteGuest = vi.fn();
const sendGuestTickets = vi.fn();
const sendAllGuestTickets = vi.fn();

vi.mock('../../api', () => ({
  getGuestList: (...args: unknown[]) => getGuestList(...args),
  getConcertTickets: (...args: unknown[]) => getConcertTickets(...args),
  addGuest: (...args: unknown[]) => addGuest(...args),
  updateGuest: (...args: unknown[]) => updateGuest(...args),
  deleteGuest: (...args: unknown[]) => deleteGuest(...args),
  sendGuestTickets: (...args: unknown[]) => sendGuestTickets(...args),
  sendAllGuestTickets: (...args: unknown[]) => sendAllGuestTickets(...args),
}));

vi.mock('../../hooks/useDocumentTitle', () => ({ useDocumentTitle: () => {} }));

// De vertaalsleutel komt terug in plaats van de tekst, mét zijn variabelen
// erachter. Zo is in de test te zien wélk getal de pagina invult - `count: 3`
// tegen `count: 1` is het verschil tussen een kloppende en een misleidende
// bevestiging, en die zou je met alleen de sleutel niet zien.
function vertaal(sleutel: string, opties?: Record<string, unknown>): string {
  if (!opties) return sleutel;
  const paren = Object.entries(opties)
    .map(([naam, waarde]) => `${naam}=${String(waarde)}`)
    .join(',');
  return paren ? `${sleutel} {${paren}}` : sleutel;
}

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: vertaal, i18n: { language: 'nl' } }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('react-router-dom', () => ({
  useParams: () => ({ concertId: 'concert-1' }),
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));

vi.mock('../../components/Skeleton', () => ({
  SkeletonTable: () => <div data-testid="skelet-tabel" />,
}));

vi.mock('../../utils/toast', () => ({ showSuccess: vi.fn(), showError: vi.fn() }));

function gast(overschrijf: Partial<GuestListEntry> = {}): GuestListEntry {
  return {
    id: 'gast-1',
    concertId: 'concert-1',
    concertName: 'Nieuwjaarsconcert',
    orderNumber: null,
    organisation: null,
    name: 'Anna Bakker',
    email: 'anna@example.org',
    ticketCount: 2,
    ticketTypeId: null,
    notes: null,
    ticketsSent: false,
    sentAt: null,
    orderId: null,
    createdBy: { id: 'u-1', firstName: 'Piet', lastName: 'Jansen' },
    createdAt: '2026-03-01T10:00:00.000Z',
    updatedAt: '2026-03-01T10:00:00.000Z',
    ...overschrijf,
  };
}

function antwoord(overschrijf: Partial<GuestListResponse> = {}): GuestListResponse {
  return {
    entries: [gast()],
    pagination: { page: 1, limit: 25, total: 1, totalPages: 1 },
    summary: { totalGuests: 1, totalTickets: 2, ticketsSent: 0, ticketsPending: 2 },
    ...overschrijf,
  };
}

function wikkel({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** Tekent de pagina en wacht tot de eerste lading binnen is. */
async function toonPagina() {
  const gebruiker = userEvent.setup();
  render(<GuestList />, { wrapper: wikkel });
  await screen.findByLabelText('common.search');
  return gebruiker;
}

/**
 * Zet het aantal tickets in één keer op een nieuwe waarde.
 *
 * Letter voor letter typen kan hier niet. Het veld is `type="number"` en
 * gestuurd met `parseInt(waarde) || 1`, dus wissen zet hem meteen terug op 1 en
 * de volgende toetsaanslag plakt daarachter: "3" wordt "13". Bovendien kent
 * jsdom geen selectie binnen een getalveld, dus overtypen gaat ook niet. Een
 * change-gebeurtenis met de eindwaarde is precies wat de browser stuurt als de
 * gebruiker het veld overtypt.
 */
function zetAantal(veld: HTMLElement, waarde: string): void {
  fireEvent.change(veld, { target: { value: waarde } });
}

/** De parameters van de laatste aanroep van getGuestList. */
function laatsteOphaal(): Record<string, unknown> {
  return getGuestList.mock.calls[getGuestList.mock.calls.length - 1][1] as Record<string, unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
  getGuestList.mockResolvedValue(antwoord());
  getConcertTickets.mockResolvedValue({ ticketTypes: [{ id: 'kaart-1', name: 'Vriendenkaart' }] });
  addGuest.mockResolvedValue({});
  updateGuest.mockResolvedValue({});
  deleteGuest.mockResolvedValue(undefined);
  sendGuestTickets.mockResolvedValue({ success: true, orderId: 'o-1', ticketCount: 2, tickets: [] });
  sendAllGuestTickets.mockResolvedValue({ success: true, sent: 2, failed: 0 });
});

describe('gastenlijst - overzicht en samenvatting', () => {
  it('toont de vier telkaarten met de getallen van de server', async () => {
    getGuestList.mockResolvedValue(
      antwoord({ summary: { totalGuests: 7, totalTickets: 19, ticketsSent: 12, ticketsPending: 7 } }),
    );

    await toonPagina();

    // Elke telkaart wordt bij zijn eigen kop opgezocht: los `getByText('7')`
    // zou net zo goed de gastenteller als de openstaande tickets kunnen
    // pakken, en dan zegt een geslaagde test niets.
    const kaart = (kop: string) => screen.getByText(kop).parentElement!;
    expect(within(kaart('guestList.totalGuests')).getByText('7')).toBeInTheDocument();
    expect(within(kaart('guestList.totalTickets')).getByText('19')).toBeInTheDocument();
    expect(within(kaart('guestList.ticketsSent')).getByText('12')).toBeInTheDocument();
    expect(within(kaart('guestList.ticketsPending')).getByText('7')).toBeInTheDocument();
  });

  it('zet de concertnaam onder de titel', async () => {
    await toonPagina();

    expect(screen.getByText('Nieuwjaarsconcert')).toBeInTheDocument();
  });

  it('toont een gastregel met ordernummer, organisatie, e-mail, notitie en aantal', async () => {
    getGuestList.mockResolvedValue(
      antwoord({
        entries: [
          gast({
            orderNumber: 'ORD-0042',
            organisation: 'Sponsor BV',
            notes: 'Rolstoelplaats',
            ticketCount: 4,
          }),
        ],
      }),
    );

    await toonPagina();

    const regel = screen.getByText('Anna Bakker').closest('tr')!;
    expect(within(regel).getByText('ORD-0042')).toBeInTheDocument();
    expect(within(regel).getByText('Sponsor BV')).toBeInTheDocument();
    expect(within(regel).getByText('anna@example.org')).toBeInTheDocument();
    expect(within(regel).getByText('Rolstoelplaats')).toBeInTheDocument();
    expect(within(regel).getByText('4')).toBeInTheDocument();
    expect(within(regel).getByText('Piet Jansen')).toBeInTheDocument();
    expect(within(regel).getByText('guestList.pending')).toBeInTheDocument();
  });

  it('meldt een lege lijst in plaats van een lege tabel', async () => {
    getGuestList.mockResolvedValue(
      antwoord({
        entries: [],
        pagination: { page: 1, limit: 25, total: 0, totalPages: 1 },
        summary: { totalGuests: 0, totalTickets: 0, ticketsSent: 0, ticketsPending: 0 },
      }),
    );

    await toonPagina();

    expect(screen.getByText('guestList.noGuests')).toBeInTheDocument();
  });

  it('verbergt bewerken, versturen en verwijderen zodra de tickets verstuurd zijn', async () => {
    getGuestList.mockResolvedValue(
      antwoord({
        entries: [gast({ ticketsSent: true, sentAt: '2026-03-02T12:00:00.000Z' })],
        summary: { totalGuests: 1, totalTickets: 2, ticketsSent: 2, ticketsPending: 0 },
      }),
    );

    await toonPagina();

    const regel = screen.getByText('Anna Bakker').closest('tr')!;
    expect(within(regel).getByText('guestList.sent')).toBeInTheDocument();
    expect(within(regel).queryByRole('button')).not.toBeInTheDocument();
    // Niets meer open, dus ook geen knop "alle versturen" boven de lijst.
    expect(screen.queryByRole('button', { name: /guestList.sendAll/ })).not.toBeInTheDocument();
  });
});

describe('gastenlijst - gast toevoegen', () => {
  it('stuurt lege velden als null mee en meldt succes', async () => {
    const gebruiker = await toonPagina();

    await gebruiker.click(screen.getByRole('button', { name: 'guestList.addGuest' }));
    const venster = await screen.findByRole('dialog');

    await gebruiker.type(within(venster).getByLabelText(/guestList.name/), 'Klaas de Vries');
    await gebruiker.type(within(venster).getByLabelText(/guestList.email/), 'klaas@example.org');
    zetAantal(within(venster).getByLabelText(/guestList.ticketCount/), '3');

    await gebruiker.click(within(venster).getByRole('button', { name: 'common.add' }));

    await waitFor(() =>
      expect(addGuest).toHaveBeenCalledWith('concert-1', {
        organisation: null,
        name: 'Klaas de Vries',
        email: 'klaas@example.org',
        ticketCount: 3,
        ticketTypeId: null,
        notes: null,
      }),
    );
    expect(showSuccess).toHaveBeenCalledWith('guestList.addSuccess');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('stuurt het gekozen kaartsoort en de notitie mee', async () => {
    const gebruiker = await toonPagina();

    await gebruiker.click(screen.getByRole('button', { name: 'guestList.addGuest' }));
    const venster = await screen.findByRole('dialog');

    await gebruiker.type(within(venster).getByLabelText(/guestList.name/), 'Gast');
    await gebruiker.type(within(venster).getByLabelText(/guestList.email/), 'gast@example.org');
    await gebruiker.type(within(venster).getByLabelText('guestList.organisation'), 'Pers');
    await gebruiker.selectOptions(within(venster).getByLabelText('guestList.ticketType'), 'kaart-1');
    await gebruiker.type(within(venster).getByLabelText('guestList.notes'), 'Komt later');

    await gebruiker.click(within(venster).getByRole('button', { name: 'common.add' }));

    await waitFor(() =>
      expect(addGuest).toHaveBeenCalledWith(
        'concert-1',
        expect.objectContaining({ organisation: 'Pers', ticketTypeId: 'kaart-1', notes: 'Komt later' }),
      ),
    );
  });

  it('houdt het venster open en meldt de fout als toevoegen mislukt', async () => {
    addGuest.mockRejectedValue(new Error('e-mailadres al in gebruik'));
    const gebruiker = await toonPagina();

    await gebruiker.click(screen.getByRole('button', { name: 'guestList.addGuest' }));
    const venster = await screen.findByRole('dialog');

    await gebruiker.type(within(venster).getByLabelText(/guestList.name/), 'Gast');
    await gebruiker.type(within(venster).getByLabelText(/guestList.email/), 'gast@example.org');
    await gebruiker.click(within(venster).getByRole('button', { name: 'common.add' }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('e-mailadres al in gebruik'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('laat het toevoegvenster geen kaartsoort tonen als het concert er geen heeft', async () => {
    getConcertTickets.mockResolvedValue({ ticketTypes: [] });
    const gebruiker = await toonPagina();

    await gebruiker.click(screen.getByRole('button', { name: 'guestList.addGuest' }));
    const venster = await screen.findByRole('dialog');

    expect(within(venster).queryByLabelText('guestList.ticketType')).not.toBeInTheDocument();
  });

  it('wist het formulier bij annuleren, zodat de volgende gast leeg begint', async () => {
    const gebruiker = await toonPagina();

    await gebruiker.click(screen.getByRole('button', { name: 'guestList.addGuest' }));
    let venster = await screen.findByRole('dialog');
    await gebruiker.type(within(venster).getByLabelText(/guestList.name/), 'Per ongeluk');
    await gebruiker.click(within(venster).getByRole('button', { name: 'common.cancel' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await gebruiker.click(screen.getByRole('button', { name: 'guestList.addGuest' }));
    venster = await screen.findByRole('dialog');
    expect(within(venster).getByLabelText(/guestList.name/)).toHaveValue('');
  });
});

describe('gastenlijst - gast bewerken', () => {
  it('vult het venster met de gegevens van de aangeklikte gast', async () => {
    getGuestList.mockResolvedValue(
      antwoord({
        entries: [gast({ organisation: 'Sponsor BV', notes: 'VIP', ticketCount: 5, ticketTypeId: 'kaart-1' })],
      }),
    );
    const gebruiker = await toonPagina();

    await gebruiker.click(screen.getByTitle('common.edit'));
    const venster = await screen.findByRole('dialog');

    expect(within(venster).getByLabelText(/guestList.name/)).toHaveValue('Anna Bakker');
    expect(within(venster).getByLabelText(/guestList.email/)).toHaveValue('anna@example.org');
    expect(within(venster).getByLabelText(/guestList.ticketCount/)).toHaveValue(5);
    expect(within(venster).getByLabelText('guestList.organisation')).toHaveValue('Sponsor BV');
    expect(within(venster).getByLabelText('guestList.notes')).toHaveValue('VIP');
    expect(within(venster).getByLabelText('guestList.ticketType')).toHaveValue('kaart-1');
  });

  it('stuurt het gewijzigde aantal mee met het id van de gast', async () => {
    const gebruiker = await toonPagina();

    await gebruiker.click(screen.getByTitle('common.edit'));
    const venster = await screen.findByRole('dialog');

    zetAantal(within(venster).getByLabelText(/guestList.ticketCount/), '6');
    await gebruiker.click(within(venster).getByRole('button', { name: 'common.save' }));

    await waitFor(() =>
      expect(updateGuest).toHaveBeenCalledWith('gast-1', expect.objectContaining({ ticketCount: 6 })),
    );
    expect(showSuccess).toHaveBeenCalledWith('guestList.updateSuccess');
  });

  it('meldt de fout als bijwerken mislukt', async () => {
    updateGuest.mockRejectedValue(new Error('gast bestaat niet meer'));
    const gebruiker = await toonPagina();

    await gebruiker.click(screen.getByTitle('common.edit'));
    const venster = await screen.findByRole('dialog');
    await gebruiker.click(within(venster).getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('gast bestaat niet meer'));
  });
});

describe('gastenlijst - verwijderen', () => {
  it('vraagt eerst om bevestiging, met de naam van de gast erin', async () => {
    const gebruiker = await toonPagina();

    await gebruiker.click(screen.getByTitle('common.delete'));

    expect(await screen.findByText('guestList.deleteConfirmMessage {name=Anna Bakker}')).toBeInTheDocument();
    expect(deleteGuest).not.toHaveBeenCalled();
  });

  it('verwijdert pas na bevestiging', async () => {
    const gebruiker = await toonPagina();

    await gebruiker.click(screen.getByTitle('common.delete'));
    const venster = await screen.findByRole('dialog');
    await gebruiker.click(within(venster).getByRole('button', { name: 'common.delete' }));

    await waitFor(() => expect(deleteGuest).toHaveBeenCalledWith('gast-1'));
    expect(showSuccess).toHaveBeenCalledWith('guestList.deleteSuccess');
  });

  it('doet niets als de bevestiging geannuleerd wordt', async () => {
    const gebruiker = await toonPagina();

    await gebruiker.click(screen.getByTitle('common.delete'));
    const venster = await screen.findByRole('dialog');
    await gebruiker.click(within(venster).getByRole('button', { name: 'common.cancel' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(deleteGuest).not.toHaveBeenCalled();
  });
});

describe('gastenlijst - tickets versturen', () => {
  it('noemt in de bevestiging het aantal tickets en het e-mailadres van déze gast', async () => {
    getGuestList.mockResolvedValue(antwoord({ entries: [gast({ ticketCount: 3 })] }));
    const gebruiker = await toonPagina();

    await gebruiker.click(screen.getByTitle('guestList.sendTickets'));

    // Het aantal in de bevestiging moet dat van de gast zijn, niet het totaal
    // van het concert: wie hier het verkeerde getal invult, laat de beheerder
    // iets anders goedkeuren dan wat er gebeurt.
    expect(await screen.findByText('guestList.sendConfirmMessage {name=Anna Bakker,count=3}')).toBeInTheDocument();
    expect(screen.getByText('guestList.sendConfirmEmail {email=anna@example.org}')).toBeInTheDocument();
  });

  it('verstuurt na bevestiging en meldt hoeveel tickets de server verstuurd heeft', async () => {
    sendGuestTickets.mockResolvedValue({ success: true, orderId: 'o-1', ticketCount: 3, tickets: [] });
    const gebruiker = await toonPagina();

    await gebruiker.click(screen.getByTitle('guestList.sendTickets'));
    const venster = await screen.findByRole('dialog');
    await gebruiker.click(within(venster).getByRole('button', { name: 'guestList.sendTickets' }));

    await waitFor(() => expect(sendGuestTickets).toHaveBeenCalledWith('gast-1'));
    expect(showSuccess).toHaveBeenCalledWith('guestList.sendSuccess {count=3}');
  });

  it('toont de knop "alle versturen" met het aantal openstaande tickets', async () => {
    getGuestList.mockResolvedValue(
      antwoord({ summary: { totalGuests: 4, totalTickets: 11, ticketsSent: 3, ticketsPending: 8 } }),
    );
    await toonPagina();

    expect(screen.getByRole('button', { name: 'guestList.sendAll (8)' })).toBeInTheDocument();
  });

  it('verstuurt alles na bevestiging en meldt het aantal', async () => {
    sendAllGuestTickets.mockResolvedValue({ success: true, sent: 5, failed: 0 });
    const gebruiker = await toonPagina();

    await gebruiker.click(screen.getByRole('button', { name: /guestList.sendAll/ }));
    const venster = await screen.findByRole('dialog');
    await gebruiker.click(within(venster).getByRole('button', { name: /guestList.sendAll/ }));

    await waitFor(() => expect(sendAllGuestTickets).toHaveBeenCalledWith('concert-1'));
    expect(showSuccess).toHaveBeenCalledWith('guestList.sendAllSuccess {count=5}');
  });

  it('meldt een gedeeltelijke verzending als fout, niet als succes', async () => {
    sendAllGuestTickets.mockResolvedValue({ success: true, sent: 3, failed: 2 });
    const gebruiker = await toonPagina();

    await gebruiker.click(screen.getByRole('button', { name: /guestList.sendAll/ }));
    const venster = await screen.findByRole('dialog');
    await gebruiker.click(within(venster).getByRole('button', { name: /guestList.sendAll/ }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('guestList.sendAllPartial {sent=3,failed=2}'));
    expect(showSuccess).not.toHaveBeenCalled();
  });
});

describe('gastenlijst - filteren en bladeren', () => {
  it('geeft de zoekterm door aan de server', async () => {
    const gebruiker = await toonPagina();

    await gebruiker.type(screen.getByLabelText('common.search'), 'anna');

    await waitFor(() => expect(laatsteOphaal()).toMatchObject({ search: 'anna', page: 1 }));
  });

  /**
   * BEWIJS. Vóór de reparatie in GuestList.tsx faalt deze test.
   *
   * De vraag naar de gastenlijst hangt aan `search`, dus elke aanslag maakt een
   * nieuwe sleutel. Bij een nieuwe sleutel staat react-query op `isLoading`, en
   * de pagina ruilt bij `isLoading` het hele scherm in voor een skelet. Het
   * zoekveld verdwijnt daarmee uit de dom, en de aanwijzer verdwijnt mee: na
   * één letter typt de gebruiker in het niets. Zoeken op een naam van vier
   * letters vraagt dan vier keer klikken.
   *
   * Dat het na de lading terugkomt maakt het niet minder kapot - het veld is
   * dan leeggeraakt van focus, en de tweede letter is nooit aangekomen.
   *
   * De reparatie laat de vorige uitkomst staan tijdens het opnieuw ophalen
   * (`placeholderData: keepPreviousData`), zodat het skelet alleen nog bij de
   * allereerste lading verschijnt.
   */
  it('houdt het zoekveld en de aanwijzer staan tijdens het zoeken', async () => {
    const gebruiker = await toonPagina();

    const zoekveld = screen.getByLabelText('common.search');
    await gebruiker.click(zoekveld);
    await gebruiker.keyboard('an');

    expect(screen.getByLabelText('common.search')).toHaveFocus();
    expect(screen.getByLabelText('common.search')).toHaveValue('an');
    expect(screen.queryByTestId('skelet-tabel')).not.toBeInTheDocument();
  });

  it('vertaalt het statusfilter naar true, false of niets', async () => {
    const gebruiker = await toonPagina();
    const filter = screen.getByLabelText('common.status');

    await gebruiker.selectOptions(filter, 'true');
    await waitFor(() => expect(laatsteOphaal()).toMatchObject({ ticketsSent: true }));

    await gebruiker.selectOptions(filter, 'false');
    await waitFor(() => expect(laatsteOphaal()).toMatchObject({ ticketsSent: false }));

    await gebruiker.selectOptions(filter, '');
    await waitFor(() => expect(laatsteOphaal().ticketsSent).toBeUndefined());
  });

  it('laat de bladerregel weg als alles op één bladzijde past', async () => {
    await toonPagina();

    expect(screen.queryByRole('button', { name: '«' })).not.toBeInTheDocument();
  });

  it('rekent de bladerregel uit over de tweede bladzijde', async () => {
    getGuestList.mockResolvedValue(antwoord({ pagination: { page: 1, limit: 25, total: 60, totalPages: 3 } }));
    const gebruiker = await toonPagina();

    // Bladzijde 1 van 3: 1 tot en met 25 van 60.
    expect(screen.getByText('common.showingOf {from=1,to=25,total=60}')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '«' })).toBeDisabled();

    await gebruiker.click(screen.getByRole('button', { name: '»' }));

    // Bladzijde 2: 26 tot en met 50, en terugbladeren mag weer.
    expect(await screen.findByText('common.showingOf {from=26,to=50,total=60}')).toBeInTheDocument();
    await waitFor(() => expect(laatsteOphaal()).toMatchObject({ page: 2 }));
    expect(screen.getByRole('button', { name: '«' })).toBeEnabled();
  });

  it('kapt de laatste bladzijde af op het werkelijke aantal', async () => {
    getGuestList.mockResolvedValue(antwoord({ pagination: { page: 1, limit: 25, total: 60, totalPages: 3 } }));
    const gebruiker = await toonPagina();

    await gebruiker.click(screen.getByRole('button', { name: '»' }));
    await screen.findByText('common.showingOf {from=26,to=50,total=60}');
    await gebruiker.click(screen.getByRole('button', { name: '»' }));

    // Niet 51 tot 75, maar 51 tot 60: de laatste bladzijde is niet vol.
    expect(await screen.findByText('common.showingOf {from=51,to=60,total=60}')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '»' })).toBeDisabled();
  });

  it('springt terug naar bladzijde 1 zodra er gezocht wordt', async () => {
    getGuestList.mockResolvedValue(antwoord({ pagination: { page: 1, limit: 25, total: 60, totalPages: 3 } }));
    const gebruiker = await toonPagina();

    await gebruiker.click(screen.getByRole('button', { name: '»' }));
    await waitFor(() => expect(laatsteOphaal()).toMatchObject({ page: 2 }));

    await gebruiker.type(screen.getByLabelText('common.search'), 'a');

    await waitFor(() => expect(laatsteOphaal()).toMatchObject({ page: 1, search: 'a' }));
  });

  it('wijst door naar de betaalde kaarten van hetzelfde concert', async () => {
    await toonPagina();

    expect(screen.getByRole('link', { name: 'guestList.viewPaidTickets' })).toHaveAttribute(
      'href',
      '/tickets/sales?concertId=concert-1',
    );
  });
});
