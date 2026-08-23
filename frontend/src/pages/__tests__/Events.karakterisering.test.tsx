/**
 * Eerste tests voor de evenementenpagina.
 *
 * Events.tsx is 1180 regels en was nooit getest: het overzicht, het
 * detailscherm met vijf tabbladen en het formulier zitten in één bestand. Deze
 * tests lopen de hoofdweg af zoals een gebruiker die aflegt - lijst openen,
 * evenement kiezen, tabblad kiezen, iets aanmelden of toevoegen - en leggen
 * onderweg vast wat er op het scherm hoort te staan.
 *
 * Twee soorten tests staan hier door elkaar en zijn per beschrijving uit
 * elkaar te houden:
 *   - karakterisering: dit doet de pagina nu, en dat mag niet ongemerkt
 *     veranderen. Ook waar het huidige gedrag niet ideaal is.
 *   - regressie na een reparatie: onderaan, in een eigen `describe`, met per
 *     test het bewijs dat hij op de oude code rood was.
 *
 * Wat hier bewust vastligt omdat het makkelijk sneuvelt:
 *   - De `enabled` op de detailqueries. Zonder gekozen evenement hoort er geen
 *     programma, vervoer, paklijst of weerbericht opgehaald te worden.
 *   - Welke knoppen bij welke rol horen. De backend laat aanmaken en bewerken
 *     alleen toe voor bestuur en beheer en verwijderen alleen voor beheer; het
 *     scherm hoort daar niet ruimer in te zijn.
 *   - Dat de pagina de teksten hardcoded in het Nederlands zet in plaats van
 *     via `t(...)`. Dat is geen wenselijk gedrag maar wél het huidige; de
 *     tests hieronder zoeken daarom op de Nederlandse tekst.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import Events from '../Events';
import * as evenementenApi from '../../api/events';

vi.mock('../../api/events');

// `initReactI18next` hoort erbij omdat de pagina via utils/locale.ts de echte
// i18n-opzet meetrekt, en die roept het aan tijdens het laden van de module.
// Zonder deze export klapt het bestand al bij de import, vóór er één test
// gedraaid heeft.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (sleutel: string) => sleutel }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

// De rol bepaalt welke knoppen er staan; per test overschrijven we hem.
const huidigeGebruiker: { rol: string } = { rol: 'admin' };
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', role: huidigeGebruiker.rol } }),
}));

// Orkesten en instrumenten lopen via de api-barrel en horen niet bij deze
// pagina; ze leveren hier alleen de vinkjes in het formulier.
vi.mock('../../hooks/useOrchestras', () => ({
  useOrchestras: () => ({ data: [{ id: 'orkest-1', name: 'Harmonie' }] }),
}));
vi.mock('../../hooks/useInstruments', () => ({
  useInstruments: () => ({ data: [] }),
}));

vi.mock('../../components/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

const EVENEMENT = {
  id: 'evt-1',
  associationId: 'ver-1',
  name: 'Zomerconcert',
  eventType: 'performance',
  status: 'confirmed' as const,
  locationName: 'Muziekkoepel',
  city: 'Utrecht',
  indoorOutdoor: 'outdoor' as const,
  startDatetime: '2026-07-04T19:00:00',
  isPublic: true,
  requiresTickets: false,
  weatherSensitive: true,
  attendingCount: 12,
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
};

const TWEEDE_EVENEMENT = {
  ...EVENEMENT,
  id: 'evt-2',
  name: 'Ledenvergadering',
  eventType: 'meeting',
  status: 'planned' as const,
  locationName: undefined,
  city: undefined,
  weatherSensitive: false,
  attendingCount: undefined,
};

const DETAIL = {
  ...EVENEMENT,
  dressCode: 'Concert zwart',
  description: 'Openluchtconcert in het park',
  orchestras: [{ id: 'orkest-1', name: 'Harmonie', performanceOrder: 1 }],
  attendance: [
    {
      id: 'aanw-1',
      eventId: 'evt-1',
      userId: 'u1',
      userName: 'Ruud Slaats',
      status: 'attending' as const,
      transportNeeded: false,
      canDrive: false,
      availableSeats: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'aanw-2',
      eventId: 'evt-1',
      userId: 'u2',
      userName: 'Anna de Vries',
      status: 'maybe' as const,
      transportNeeded: false,
      canDrive: false,
      availableSeats: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ],
  myAttendance: null,
};

/**
 * Alles wat de pagina kan ophalen krijgt een lege uitkomst; per test zetten we
 * alleen om wat die test nodig heeft. Zo blijft zichtbaar welke gegevens een
 * test echt gebruikt.
 */
function zetApiKlaar(): void {
  for (const naam of Object.keys(evenementenApi)) {
    const functie = (evenementenApi as Record<string, unknown>)[naam];
    if (typeof functie === 'function') {
      vi.mocked(functie as (...args: unknown[]) => unknown).mockResolvedValue(undefined);
    }
  }
  vi.mocked(evenementenApi.getEvents).mockResolvedValue({
    data: [EVENEMENT, TWEEDE_EVENEMENT],
    total: 2,
    page: 1,
    limit: 25,
  });
  vi.mocked(evenementenApi.getEvent).mockResolvedValue(DETAIL);
  vi.mocked(evenementenApi.getEventLocations).mockResolvedValue({ data: [], total: 0, page: 1, limit: 25 });
  vi.mocked(evenementenApi.getEventSchedule).mockResolvedValue([]);
  vi.mocked(evenementenApi.getEventTransport).mockResolvedValue([]);
  vi.mocked(evenementenApi.getEventMeetingPoints).mockResolvedValue([]);
  vi.mocked(evenementenApi.getEventPackingLists).mockResolvedValue([]);
  vi.mocked(evenementenApi.getPackingTemplates).mockResolvedValue([]);
  vi.mocked(evenementenApi.getAttendanceSummary).mockResolvedValue({
    byStatus: { attending: 12, not_attending: 2, maybe: 1 },
    transport: { needsTransport: 3, availableSeats: 5 },
    byInstrument: [],
  });
  vi.mocked(evenementenApi.getEventWeather).mockResolvedValue({ location: {}, forecasts: [] });
}

function maakWikkel(beginUrl = '/events') {
  return function wikkel({ children }: { children: ReactNode }) {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    return (
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[beginUrl]}>{children}</MemoryRouter>
      </QueryClientProvider>
    );
  };
}

/** Opent het detailscherm van het eerste evenement en wacht tot het er staat. */
async function openDetail(gebruiker: ReturnType<typeof userEvent.setup>) {
  await gebruiker.click(await screen.findByText('Zomerconcert'));
  await screen.findByRole('button', { name: /Terug naar overzicht/ });
}

beforeEach(() => {
  vi.clearAllMocks();
  huidigeGebruiker.rol = 'admin';
  zetApiKlaar();
});

describe('evenementenpagina - het overzicht', () => {
  it('toont de evenementen die de server stuurt', async () => {
    render(<Events />, { wrapper: maakWikkel() });

    expect(await screen.findByText('Zomerconcert')).toBeInTheDocument();
    expect(screen.getByText('Ledenvergadering')).toBeInTheDocument();

    // De statuslabels horen bij het evenement zelf. Ze worden hier binnen de
    // kaart opgezocht, want dezelfde woorden staan ook in het statusfilter
    // erboven; een zoekopdracht over de hele pagina zou dus ook slagen als de
    // badge van de kaart verdwijnt.
    const kaart = screen.getByText('Zomerconcert').closest('div.bg-white') as HTMLElement;
    expect(within(kaart).getByText('Bevestigd')).toBeInTheDocument();
    const tweedeKaart = screen.getByText('Ledenvergadering').closest('div.bg-white') as HTMLElement;
    expect(within(tweedeKaart).getByText('Gepland')).toBeInTheDocument();

    // Locatie en stad staan samen in één regel; het tweede evenement heeft er
    // geen en hoort dus geen losse komma te tonen.
    expect(screen.getByText(/Muziekkoepel/)).toHaveTextContent('Muziekkoepel, Utrecht');
    expect(screen.getByText(/12 aanwezig/)).toBeInTheDocument();
  });

  it('vraagt bij het openen alleen de aankomende evenementen op', async () => {
    render(<Events />, { wrapper: maakWikkel() });

    await waitFor(() => expect(evenementenApi.getEvents).toHaveBeenCalled());

    // Zonder gekozen status staat de lijst op "aankomend". Een verhuizing die
    // hier lege strings van maakt stuurt filters mee die de server als echte
    // filters leest.
    expect(evenementenApi.getEvents).toHaveBeenCalledWith({
      search: undefined,
      status: undefined,
      upcoming: true,
    });
  });

  it('toont de laadtoestand zolang de evenementen nog onderweg zijn', async () => {
    let losmaken: (waarde: unknown) => void = () => {};
    vi.mocked(evenementenApi.getEvents).mockReturnValue(
      new Promise((resolve) => {
        losmaken = resolve;
      }),
    );

    render(<Events />, { wrapper: maakWikkel() });

    expect(await screen.findByRole('status')).toHaveTextContent('common.loading');

    losmaken({ data: [], total: 0, page: 1, limit: 25 });
    await screen.findByText('events.noEvents');
  });

  it('toont de lege staat als er geen evenementen zijn', async () => {
    vi.mocked(evenementenApi.getEvents).mockResolvedValue({ data: [], total: 0, page: 1, limit: 25 });

    render(<Events />, { wrapper: maakWikkel() });

    expect(await screen.findByText('events.noEvents')).toBeInTheDocument();
    expect(screen.queryByText('Zomerconcert')).not.toBeInTheDocument();
  });

  it('stuurt de zoekterm mee naar de server', async () => {
    const gebruiker = userEvent.setup();
    render(<Events />, { wrapper: maakWikkel() });

    await screen.findByText('Zomerconcert');
    await gebruiker.type(screen.getByPlaceholderText('Zoeken...'), 'zomer');

    await waitFor(() =>
      expect(evenementenApi.getEvents).toHaveBeenCalledWith({
        search: 'zomer',
        status: undefined,
        upcoming: true,
      }),
    );

    // Vastgelegd, niet goedgekeurd: er zit geen ontdubbeling op het zoekveld,
    // dus elke toetsaanslag is een eigen verzoek (vijf letters -> vijf extra
    // aanroepen bovenop de eerste). De contactenpagina wacht wel even; deze
    // niet. Wie dat repareert hoort dit getal hier aan te passen.
    expect(vi.mocked(evenementenApi.getEvents).mock.calls).toHaveLength(6);
  });

  it('filtert op status en laat "aankomend" dan los', async () => {
    const gebruiker = userEvent.setup();
    render(<Events />, { wrapper: maakWikkel() });

    await screen.findByText('Zomerconcert');
    await gebruiker.selectOptions(screen.getByRole('combobox'), 'cancelled');

    // Zodra er een status gekozen is hoort `upcoming` uit te gaan, anders zou
    // je afgelaste evenementen uit het verleden nooit terugzien.
    await waitFor(() =>
      expect(evenementenApi.getEvents).toHaveBeenCalledWith({
        search: undefined,
        status: 'cancelled',
        upcoming: false,
      }),
    );
  });

  it('haalt niets van een evenement op zolang er geen gekozen is', async () => {
    render(<Events />, { wrapper: maakWikkel() });

    await screen.findByText('Zomerconcert');

    expect(evenementenApi.getEvent).not.toHaveBeenCalled();
    expect(evenementenApi.getEventSchedule).not.toHaveBeenCalled();
    expect(evenementenApi.getEventTransport).not.toHaveBeenCalled();
    expect(evenementenApi.getEventPackingLists).not.toHaveBeenCalled();
    expect(evenementenApi.getEventWeather).not.toHaveBeenCalled();
  });
});

describe('evenementenpagina - een evenement aanmaken, bewerken en verwijderen', () => {
  it('maakt een evenement aan met de ingevulde gegevens', async () => {
    const gebruiker = userEvent.setup();
    render(<Events />, { wrapper: maakWikkel() });

    await gebruiker.click(await screen.findByRole('button', { name: /Nieuw Evenement/ }));

    const venster = await screen.findByRole('dialog');
    await gebruiker.type(within(venster).getByLabelText(/Naam/), 'Kerstconcert');

    // Naam en start zijn `required`; zonder een geldige startdatum weigert de
    // browser het formulier te versturen en gebeurt er niets. Een
    // datetime-local vullen gaat niet met toetsaanslagen, vandaar `change`.
    fireEvent.change(within(venster).getByLabelText(/Start/), { target: { value: '2026-12-24T20:00' } });
    await gebruiker.click(within(venster).getByLabelText('Harmonie'));
    await gebruiker.click(within(venster).getByLabelText(/Weergevoelig/));
    await gebruiker.click(screen.getByRole('button', { name: 'Aanmaken' }));

    await waitFor(() => expect(evenementenApi.createEvent).toHaveBeenCalled());
    expect(vi.mocked(evenementenApi.createEvent).mock.calls[0][0]).toMatchObject({
      name: 'Kerstconcert',
      eventType: 'performance',
      status: 'planned',
      startDatetime: '2026-12-24T20:00',
      weatherSensitive: true,
      orchestraIds: ['orkest-1'],
    });

    // Na het aanmaken hoort het formulier dicht te gaan.
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('stuurt elk ingevuld veld van het formulier mee', async () => {
    const gebruiker = userEvent.setup();
    render(<Events />, { wrapper: maakWikkel() });

    await gebruiker.click(await screen.findByRole('button', { name: /Nieuw Evenement/ }));
    const venster = await screen.findByRole('dialog');

    await gebruiker.type(within(venster).getByLabelText(/Naam/), 'Nieuwjaarsborrel');
    await gebruiker.selectOptions(within(venster).getByLabelText('Type'), 'social');
    await gebruiker.selectOptions(within(venster).getByLabelText('Status'), 'confirmed');
    fireEvent.change(within(venster).getByLabelText(/Start/), { target: { value: '2027-01-05T20:00' } });
    fireEvent.change(within(venster).getByLabelText('Einde'), { target: { value: '2027-01-05T23:00' } });
    await gebruiker.type(within(venster).getByLabelText('Locatienaam'), 'Dorpshuis');
    await gebruiker.type(within(venster).getByLabelText('Stad'), 'Zeist');
    await gebruiker.type(within(venster).getByLabelText('Dresscode'), 'Vrij');
    await gebruiker.type(within(venster).getByLabelText('Beschrijving'), 'Met livemuziek');

    // Aan- en weer uitvinken hoort het orkest ook echt weer uit de lijst te
    // halen; anders reist een orkest mee dat de gebruiker net weggeklikt heeft.
    await gebruiker.click(within(venster).getByLabelText('Harmonie'));
    await gebruiker.click(within(venster).getByLabelText('Harmonie'));

    await gebruiker.click(screen.getByRole('button', { name: 'Aanmaken' }));

    await waitFor(() => expect(evenementenApi.createEvent).toHaveBeenCalled());
    expect(vi.mocked(evenementenApi.createEvent).mock.calls[0][0]).toMatchObject({
      name: 'Nieuwjaarsborrel',
      eventType: 'social',
      status: 'confirmed',
      startDatetime: '2027-01-05T20:00',
      endDatetime: '2027-01-05T23:00',
      locationName: 'Dorpshuis',
      city: 'Zeist',
      dressCode: 'Vrij',
      description: 'Met livemuziek',
      orchestraIds: [],
    });
  });

  it('neemt bij een locatie uit de lijst het adres en de stad over', async () => {
    vi.mocked(evenementenApi.getEventLocations).mockResolvedValue({
      data: [
        {
          id: 'loc-1',
          associationId: 'ver-1',
          name: 'Muziekkoepel',
          address: 'Parklaan 2',
          city: 'Utrecht',
          indoorOutdoor: 'outdoor',
          hasElectricity: true,
          hasChangingRooms: false,
          hasStorage: false,
          hasCatering: false,
          hasParking: true,
          isFavorite: false,
          createdAt: '2026-01-01',
          updatedAt: '2026-01-01',
        },
      ],
      total: 1,
      page: 1,
      limit: 25,
    });
    const gebruiker = userEvent.setup();
    render(<Events />, { wrapper: maakWikkel() });

    await gebruiker.click(await screen.findByRole('button', { name: /Nieuw Evenement/ }));
    const venster = await screen.findByRole('dialog');

    // Zolang er geen locatie gekozen is staan er losse velden om er zelf een
    // in te typen.
    expect(within(venster).getByLabelText('Locatienaam')).toBeInTheDocument();

    await gebruiker.type(within(venster).getByLabelText(/Naam/), 'Zomerconcert');
    fireEvent.change(within(venster).getByLabelText(/Start/), { target: { value: '2027-07-04T19:00' } });
    await gebruiker.selectOptions(within(venster).getByLabelText('Locatie'), 'loc-1');

    // Na de keuze verdwijnen die velden: de gegevens komen nu van de locatie.
    expect(within(venster).queryByLabelText('Locatienaam')).not.toBeInTheDocument();

    await gebruiker.click(screen.getByRole('button', { name: 'Aanmaken' }));

    await waitFor(() => expect(evenementenApi.createEvent).toHaveBeenCalled());
    expect(vi.mocked(evenementenApi.createEvent).mock.calls[0][0]).toMatchObject({
      locationId: 'loc-1',
      locationName: 'Muziekkoepel',
      address: 'Parklaan 2',
      city: 'Utrecht',
    });
  });

  it('opent het bewerkformulier met de bestaande gegevens erin', async () => {
    const gebruiker = userEvent.setup();
    render(<Events />, { wrapper: maakWikkel() });

    await gebruiker.click(await screen.findByRole('button', { name: 'Bewerk Zomerconcert' }));

    const venster = await screen.findByRole('dialog');
    expect(venster).toHaveTextContent('Evenement Bewerken');
    expect(within(venster).getByLabelText(/Naam/)).toHaveValue('Zomerconcert');

    await gebruiker.click(screen.getByRole('button', { name: 'Opslaan' }));

    await waitFor(() => expect(evenementenApi.updateEvent).toHaveBeenCalled());
    expect(vi.mocked(evenementenApi.updateEvent).mock.calls[0][0]).toBe('evt-1');
  });

  it('vraagt om bevestiging voor het verwijderen en verwijdert daarna pas', async () => {
    const gebruiker = userEvent.setup();
    render(<Events />, { wrapper: maakWikkel() });

    await gebruiker.click(await screen.findByRole('button', { name: 'Verwijder Zomerconcert' }));

    const dialoog = await screen.findByRole('alertdialog');
    expect(dialoog).toHaveTextContent('Zomerconcert');
    expect(evenementenApi.deleteEvent).not.toHaveBeenCalled();

    await gebruiker.click(within(dialoog).getByRole('button', { name: 'Verwijderen' }));

    await waitFor(() => expect(evenementenApi.deleteEvent).toHaveBeenCalledWith('evt-1'));
  });

  it('verwijdert niets als de bevestiging wordt afgebroken', async () => {
    const gebruiker = userEvent.setup();
    render(<Events />, { wrapper: maakWikkel() });

    await gebruiker.click(await screen.findByRole('button', { name: 'Verwijder Zomerconcert' }));
    const dialoog = await screen.findByRole('alertdialog');
    await gebruiker.click(within(dialoog).getByRole('button', { name: 'common.cancel' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(evenementenApi.deleteEvent).not.toHaveBeenCalled();
  });
});

describe('evenementenpagina - het detailscherm', () => {
  it('opent het detailscherm na een klik op een evenement', async () => {
    const gebruiker = userEvent.setup();
    render(<Events />, { wrapper: maakWikkel() });

    await openDetail(gebruiker);

    await waitFor(() => expect(evenementenApi.getEvent).toHaveBeenCalledWith('evt-1'));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Zomerconcert');
    expect(screen.getByText('Concert zwart')).toBeInTheDocument();
    expect(screen.getByText('Openluchtconcert in het park')).toBeInTheDocument();
  });

  it('opent het detailscherm meteen als de url een evenement noemt', async () => {
    render(<Events />, { wrapper: maakWikkel('/events?id=evt-1') });

    // Zonder deze weg is een gedeelde link naar een evenement waardeloos: hij
    // levert dan het overzicht op in plaats van het evenement zelf.
    expect(await screen.findByRole('button', { name: /Terug naar overzicht/ })).toBeInTheDocument();
    await waitFor(() => expect(evenementenApi.getEvent).toHaveBeenCalledWith('evt-1'));
  });

  it('toont de aanwezigheidstelling en de leden op het tabblad Details', async () => {
    const gebruiker = userEvent.setup();
    render(<Events />, { wrapper: maakWikkel() });

    await openDetail(gebruiker);

    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText(/Zoekt vervoer: 3/)).toBeInTheDocument();
    expect(screen.getByText(/Beschikbare plekken: 5/)).toBeInTheDocument();
    expect(screen.getByText('Ruud Slaats')).toBeInTheDocument();
    expect(screen.getByText('Anna de Vries')).toBeInTheDocument();
    expect(screen.getByText('Harmonie')).toBeInTheDocument();
  });

  it('meldt de gebruiker aan of af bij het evenement', async () => {
    const gebruiker = userEvent.setup();
    render(<Events />, { wrapper: maakWikkel() });

    await openDetail(gebruiker);
    await gebruiker.click(screen.getByRole('button', { name: 'Aanwezig' }));

    await waitFor(() =>
      expect(evenementenApi.updateMyAttendance).toHaveBeenCalledWith('evt-1', { status: 'attending' }),
    );

    await gebruiker.click(screen.getByRole('button', { name: 'Misschien' }));
    await waitFor(() => expect(evenementenApi.updateMyAttendance).toHaveBeenCalledWith('evt-1', { status: 'maybe' }));
  });

  it('laat de aanwezigheidsknoppen ook aan een gewoon lid zien', async () => {
    // De backend hangt geen rol aan het doorgeven van aanwezigheid, en dat is
    // maar goed ook: het is de enige knop op deze pagina die ieder lid nodig
    // heeft.
    huidigeGebruiker.rol = 'member';
    const gebruiker = userEvent.setup();
    render(<Events />, { wrapper: maakWikkel() });

    await openDetail(gebruiker);

    expect(screen.getByRole('button', { name: 'Aanwezig' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Afwezig' })).toBeInTheDocument();
  });

  it('keert met de terugknop terug naar het overzicht', async () => {
    const gebruiker = userEvent.setup();
    render(<Events />, { wrapper: maakWikkel() });

    await openDetail(gebruiker);
    await gebruiker.click(screen.getByRole('button', { name: /Terug naar overzicht/ }));

    expect(await screen.findByRole('heading', { name: /Evenementen & Optredens/ })).toBeInTheDocument();
  });
});

describe('evenementenpagina - de tabbladen van het detailscherm', () => {
  it('toont het programma en voegt er een onderdeel aan toe', async () => {
    vi.mocked(evenementenApi.getEventSchedule).mockResolvedValue([
      {
        id: 'prog-1',
        eventId: 'evt-1',
        title: 'Soundcheck',
        description: 'Op het podium',
        startTime: '2026-07-04T17:00:00',
        itemType: 'soundcheck',
        isPublic: true,
        sortOrder: 1,
        status: 'planned',
        createdAt: '2026-01-01',
      },
    ]);
    const gebruiker = userEvent.setup();
    render(<Events />, { wrapper: maakWikkel() });

    await openDetail(gebruiker);
    await gebruiker.click(screen.getByRole('button', { name: 'Programma' }));

    expect(await screen.findByText('Soundcheck')).toBeInTheDocument();
    expect(screen.getByText('Op het podium')).toBeInTheDocument();

    await gebruiker.click(screen.getByRole('button', { name: '+ Toevoegen' }));
    await gebruiker.click(screen.getByRole('button', { name: 'Annuleren' }));
    expect(screen.queryByPlaceholderText('Titel')).not.toBeInTheDocument();

    await gebruiker.click(screen.getByRole('button', { name: '+ Toevoegen' }));
    await gebruiker.type(screen.getByPlaceholderText('Titel'), 'Opbouw');
    fireEvent.change(screen.getByDisplayValue(''), { target: { value: '2026-07-04T15:00' } });
    await gebruiker.selectOptions(screen.getByRole('combobox'), 'setup');
    await gebruiker.click(screen.getByRole('button', { name: 'Opslaan' }));

    await waitFor(() =>
      expect(evenementenApi.createScheduleItem).toHaveBeenCalledWith('evt-1', {
        title: 'Opbouw',
        startTime: '2026-07-04T15:00',
        itemType: 'setup',
      }),
    );
  });

  it('meldt een leeg programma in plaats van een leeg tabblad', async () => {
    const gebruiker = userEvent.setup();
    render(<Events />, { wrapper: maakWikkel() });

    await openDetail(gebruiker);
    await gebruiker.click(screen.getByRole('button', { name: 'Programma' }));

    expect(await screen.findByText('events.schedule.noItems')).toBeInTheDocument();
  });

  it('verwijdert een programmaonderdeel', async () => {
    vi.mocked(evenementenApi.getEventSchedule).mockResolvedValue([
      {
        id: 'prog-1',
        eventId: 'evt-1',
        title: 'Soundcheck',
        startTime: '2026-07-04T17:00:00',
        itemType: 'soundcheck',
        isPublic: true,
        sortOrder: 1,
        status: 'planned',
        createdAt: '2026-01-01',
      },
    ]);
    const gebruiker = userEvent.setup();
    render(<Events />, { wrapper: maakWikkel() });

    await openDetail(gebruiker);
    await gebruiker.click(screen.getByRole('button', { name: 'Programma' }));
    await gebruiker.click(await screen.findByRole('button', { name: 'Verwijder Soundcheck' }));

    await waitFor(() => expect(evenementenApi.deleteScheduleItem).toHaveBeenCalledWith('evt-1', 'prog-1'));
  });

  it('toont het geregelde vervoer met chauffeur, capaciteit en passagiers', async () => {
    vi.mocked(evenementenApi.getEventTransport).mockResolvedValue([
      {
        id: 'rit-1',
        eventId: 'evt-1',
        transportType: 'car',
        vehicleDescription: 'Grijze Volvo',
        capacity: 4,
        driverName: 'Ruud Slaats',
        driverPhone: '0612345678',
        departureTime: '2026-07-04T17:30:00',
        departureLocation: 'Repetitielokaal',
        status: 'planned',
        passengers: [
          { id: 'pas-1', userId: 'u2', passengerName: 'Anna de Vries', confirmed: true },
          { id: 'pas-2', passengerName: 'Kees Bakker', confirmed: false },
        ],
        createdAt: '2026-01-01',
      },
    ]);
    const gebruiker = userEvent.setup();
    render(<Events />, { wrapper: maakWikkel() });

    await openDetail(gebruiker);
    await gebruiker.click(screen.getByRole('button', { name: 'Vervoer' }));

    expect(await screen.findByText('Grijze Volvo')).toBeInTheDocument();
    expect(screen.getByText(/Chauffeur: Ruud Slaats/)).toHaveTextContent('(0612345678)');
    expect(screen.getByText(/Vertrek:/)).toHaveTextContent('Repetitielokaal');

    // Twee van de vier plekken zijn bezet; die teller telt de passagiers, niet
    // de aanmeldingen op het evenement.
    expect(screen.getByText('Capaciteit: 2/4')).toBeInTheDocument();

    // Een meerijder uit de ledenlijst (met userId) en een losse naam staan er
    // allebei met hun naam - de server vult `passengerName` in beide gevallen.
    expect(screen.getByText('Anna de Vries')).toBeInTheDocument();
    expect(screen.getByText('Kees Bakker')).toBeInTheDocument();
  });

  it('meldt dat er nog geen vervoer en geen verzamelpunten zijn', async () => {
    const gebruiker = userEvent.setup();
    render(<Events />, { wrapper: maakWikkel() });

    await openDetail(gebruiker);
    await gebruiker.click(screen.getByRole('button', { name: 'Vervoer' }));

    expect(await screen.findByText('events.transport.noTransport')).toBeInTheDocument();
    expect(screen.getByText('events.meetingPoints.noPoints')).toBeInTheDocument();
  });

  it('verwijdert een rit en een verzamelpunt', async () => {
    vi.mocked(evenementenApi.getEventTransport).mockResolvedValue([
      {
        id: 'rit-1',
        eventId: 'evt-1',
        transportType: 'bus',
        vehicleDescription: 'Touringcar',
        status: 'planned',
        createdAt: '2026-01-01',
      },
    ]);
    vi.mocked(evenementenApi.getEventMeetingPoints).mockResolvedValue([
      {
        id: 'punt-1',
        eventId: 'evt-1',
        name: 'Parkeerplaats school',
        address: 'Schoolstraat 1',
        meetingTime: '2026-07-04T17:00:00',
        isPrimary: true,
        createdAt: '2026-01-01',
      },
    ]);
    const gebruiker = userEvent.setup();
    render(<Events />, { wrapper: maakWikkel() });

    await openDetail(gebruiker);
    await gebruiker.click(screen.getByRole('button', { name: 'Vervoer' }));

    await gebruiker.click(await screen.findByRole('button', { name: 'Verwijder Touringcar' }));
    await waitFor(() => expect(evenementenApi.deleteTransport).toHaveBeenCalledWith('evt-1', 'rit-1'));

    await gebruiker.click(screen.getByRole('button', { name: 'Verwijder Parkeerplaats school' }));
    await waitFor(() => expect(evenementenApi.deleteMeetingPoint).toHaveBeenCalledWith('evt-1', 'punt-1'));
  });

  it('maakt een paklijst aan en pas nadat er een naam staat', async () => {
    vi.mocked(evenementenApi.getPackingTemplates).mockResolvedValue([
      { id: 'sjab-1', name: 'Standaard buitenoptreden', isDefault: false, itemCount: 0, createdAt: '2026-01-01' },
    ]);
    const gebruiker = userEvent.setup();
    render(<Events />, { wrapper: maakWikkel() });

    await openDetail(gebruiker);
    await gebruiker.click(screen.getByRole('button', { name: 'Paklijst' }));

    expect(await screen.findByText('events.packing.noLists')).toBeInTheDocument();

    await gebruiker.click(screen.getByRole('button', { name: '+ Paklijst' }));
    await gebruiker.click(screen.getByRole('button', { name: 'Annuleren' }));
    expect(screen.queryByPlaceholderText('Naam paklijst')).not.toBeInTheDocument();

    await gebruiker.click(screen.getByRole('button', { name: '+ Paklijst' }));

    // Zonder naam blijft de knop uit; anders zou er een naamloze lijst
    // ontstaan die niemand terugvindt.
    const aanmaken = screen.getByRole('button', { name: 'Aanmaken' });
    expect(aanmaken).toBeDisabled();

    await gebruiker.type(screen.getByPlaceholderText('Naam paklijst'), 'Podium');
    await gebruiker.selectOptions(screen.getByRole('combobox'), 'sjab-1');
    await gebruiker.click(aanmaken);

    await waitFor(() =>
      expect(evenementenApi.createPackingList).toHaveBeenCalledWith('evt-1', {
        name: 'Podium',
        templateId: 'sjab-1',
      }),
    );
  });

  it('toont de voortgang van een bestaande paklijst', async () => {
    vi.mocked(evenementenApi.getEventPackingLists).mockResolvedValue([
      {
        id: 'lijst-1',
        eventId: 'evt-1',
        name: 'Podium',
        totalItems: 10,
        packedItems: 4,
        progress: 40,
        createdAt: '2026-01-01',
      },
    ]);
    const gebruiker = userEvent.setup();
    render(<Events />, { wrapper: maakWikkel() });

    await openDetail(gebruiker);
    await gebruiker.click(screen.getByRole('button', { name: 'Paklijst' }));

    expect(await screen.findByText('Podium')).toBeInTheDocument();
    expect(screen.getByText('4 / 10 ingepakt')).toBeInTheDocument();
    expect(screen.getByText('40%')).toBeInTheDocument();
  });

  it('legt bij het weer uit waarom er niets te zien is', async () => {
    const gebruiker = userEvent.setup();
    render(<Events />, { wrapper: maakWikkel() });

    await openDetail(gebruiker);
    await gebruiker.click(screen.getByRole('button', { name: 'Weer' }));

    // Het evenement is wél weergevoelig, dus dit is de "nog geen voorspelling"
    // tak en niet de "niet weergevoelig" tak.
    expect(await screen.findByText('events.weather.noForecast')).toBeInTheDocument();
    expect(screen.getByText('events.weather.coordinatesHint')).toBeInTheDocument();
  });

  it('meldt bij een niet-weergevoelig evenement dat het weer niet meetelt', async () => {
    vi.mocked(evenementenApi.getEvent).mockResolvedValue({ ...DETAIL, weatherSensitive: false });
    const gebruiker = userEvent.setup();
    render(<Events />, { wrapper: maakWikkel() });

    await openDetail(gebruiker);
    await gebruiker.click(screen.getByRole('button', { name: 'Weer' }));

    expect(await screen.findByText('Dit evenement is niet als weergevoelig gemarkeerd.')).toBeInTheDocument();
  });

  it('toont de weersvoorspelling met waarschuwing', async () => {
    vi.mocked(evenementenApi.getEventWeather).mockResolvedValue({
      location: {},
      forecasts: [
        {
          id: 'weer-1',
          eventId: 'evt-1',
          fetchedAt: '2026-07-01T08:00:00',
          forecastDate: '2026-07-04T12:00:00',
          temperatureC: 24,
          windSpeedKmh: 15,
          precipitationProbability: 60,
          weatherDescription: 'Buien',
          alertMessage: 'Kans op onweer rond het aanvangstijdstip',
        },
      ],
    });
    const gebruiker = userEvent.setup();
    render(<Events />, { wrapper: maakWikkel() });

    await openDetail(gebruiker);
    await gebruiker.click(screen.getByRole('button', { name: 'Weer' }));

    expect(await screen.findByText('24°')).toBeInTheDocument();
    expect(screen.getByText('Buien')).toBeInTheDocument();
    expect(screen.getByText('Wind: 15 km/u')).toBeInTheDocument();
    expect(screen.getByText('Neerslag: 60%')).toBeInTheDocument();
    expect(screen.getByText('Kans op onweer rond het aanvangstijdstip')).toBeInTheDocument();
  });
});

/**
 * Hieronder staan regressietests: ze leggen gedrag vast zoals het hoort te
 * zijn, na twee reparaties in Events.tsx. Per test staat erbij hoe vastgesteld
 * is dat hij op de oude code rood was.
 */
describe('evenementenpagina - herstelde fouten', () => {
  /**
   * BEWIJS: met `git checkout HEAD -- src/pages/Events.tsx` (alleen dit
   * bestand) faalde deze test met "Unable to find an element with the text:
   * De evenementen konden niet worden opgehaald." - de oude code toonde
   * `events.noEvents`, precies hetzelfde scherm als bij een lege agenda.
   */
  it('meldt een mislukte aanvraag in plaats van te doen alsof er niets gepland staat', async () => {
    vi.mocked(evenementenApi.getEvents).mockRejectedValue(new Error('geen verbinding'));

    render(<Events />, { wrapper: maakWikkel() });

    const melding = await screen.findByRole('alert');
    expect(melding).toHaveTextContent('De evenementen konden niet worden opgehaald.');

    // De lege staat hoort juist wég te zijn: die zegt dat er niets gepland
    // staat, en dat weet de pagina op dit moment helemaal niet.
    expect(screen.queryByText('events.noEvents')).not.toBeInTheDocument();

    // En de pagina zelf blijft staan; een foutmelding op een witte pagina is
    // niet van een kapotte pagina te onderscheiden.
    expect(screen.getByRole('heading', { name: /Evenementen & Optredens/ })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Zoeken...')).toBeInTheDocument();
  });

  /**
   * BEWIJS: op de oude code slaagde de eerste helft (de knoppen stonden er),
   * maar faalden de `not.toBeInTheDocument`-regels: een gewoon lid zag
   * "Nieuw Evenement", het potlood en de prullenbak gewoon staan. De backend
   * weigert die aanroepen met een 403 (requireRole('board','admin') op POST en
   * PUT /events, requireRole('admin') op DELETE), dus dat werd een formulier
   * invullen voor niets.
   */
  it('geeft een gewoon lid geen knoppen om evenementen te beheren', async () => {
    huidigeGebruiker.rol = 'member';
    render(<Events />, { wrapper: maakWikkel() });

    await screen.findByText('Zomerconcert');

    expect(screen.queryByRole('button', { name: /Nieuw Evenement/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Bewerk Zomerconcert' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Verwijder Zomerconcert' })).not.toBeInTheDocument();
  });

  /**
   * BEWIJS: op de oude code faalde de laatste regel - het bestuur zag de
   * prullenbak staan terwijl DELETE /events/:id alleen voor een beheerder is.
   */
  it('laat het bestuur wel bewerken maar niet verwijderen', async () => {
    huidigeGebruiker.rol = 'board';
    render(<Events />, { wrapper: maakWikkel() });

    await screen.findByText('Zomerconcert');

    expect(screen.getByRole('button', { name: /Nieuw Evenement/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bewerk Zomerconcert' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Verwijder Zomerconcert' })).not.toBeInTheDocument();
  });

  /**
   * BEWIJS: op de oude code faalde dit op de knoppen in het detailscherm en op
   * de tabbladen: een gewoon lid kon daar het evenement bewerken, een
   * programmaonderdeel toevoegen of verwijderen en een paklijst aanmaken.
   */
  it('geeft een gewoon lid ook in het detailscherm geen beheerknoppen', async () => {
    huidigeGebruiker.rol = 'member';
    const gebruiker = userEvent.setup();
    render(<Events />, { wrapper: maakWikkel() });

    await openDetail(gebruiker);
    expect(screen.queryByRole('button', { name: 'Bewerken' })).not.toBeInTheDocument();

    await gebruiker.click(screen.getByRole('button', { name: 'Programma' }));
    expect(screen.queryByRole('button', { name: '+ Toevoegen' })).not.toBeInTheDocument();

    await gebruiker.click(screen.getByRole('button', { name: 'Paklijst' }));
    expect(screen.queryByRole('button', { name: '+ Paklijst' })).not.toBeInTheDocument();
  });
});

/**
 * Geen bewijs maar een wacht: deze test blijft ook op de oude code groen. Hij
 * staat er om vast te leggen dat de pagina het aanmelden van een passagier
 * helemaal niet aanroept, zodat het opvalt wanneer die weg er wél komt.
 */
describe('evenementenpagina - vervoer aanmelden bestaat nog niet (wacht)', () => {
  it('roept geen enkele vervoer- of passagiersfunctie aan, hoe je ook klikt', async () => {
    vi.mocked(evenementenApi.getEventTransport).mockResolvedValue([
      {
        id: 'rit-1',
        eventId: 'evt-1',
        transportType: 'car',
        vehicleDescription: 'Grijze Volvo',
        capacity: 4,
        status: 'planned',
        passengers: [],
        createdAt: '2026-01-01',
      },
    ]);
    const gebruiker = userEvent.setup();
    render(<Events />, { wrapper: maakWikkel() });

    await openDetail(gebruiker);
    await gebruiker.click(screen.getByRole('button', { name: 'Vervoer' }));

    // De knop staat er wel, maar hij is uitgeschakeld: er zit geen formulier
    // achter. Zolang dat zo is kan een lid zich niet als meerijder opgeven,
    // ook al kan de server dat sinds kort netjes verwerken (POST
    // /events/:id/transport/:ritId/passengers vult `passenger_name` nu ook bij
    // een keuze uit de ledenlijst).
    expect(await screen.findByRole('button', { name: '+ Vervoer toevoegen' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '+ Verzamelpunt' })).toBeDisabled();

    expect(evenementenApi.createTransport).not.toHaveBeenCalled();
    expect(evenementenApi.addPassenger).not.toHaveBeenCalled();
    expect(evenementenApi.createMeetingPoint).not.toHaveBeenCalled();
  });
});
