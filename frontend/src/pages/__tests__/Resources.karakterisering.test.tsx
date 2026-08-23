/**
 * Eerste tests voor de middelenpagina (zalen, vervoer, apparatuur).
 *
 * Resources.tsx is 850 regels en was tot nu toe nergens door een test
 * aangeraakt. In het bestand zitten vijf onderdelen: de pagina zelf, een
 * venster voor een nieuw middel, een venster om te boeken, een weekkalender en
 * een detailvenster met een verwijderknop.
 *
 * Deze tests beschrijven wat de gebruiker ziet en doet: welke middelen er
 * staan, wat de tellers zeggen, wat er gebeurt als er niets is of als de
 * server niet antwoordt, en of boeken, aanmaken en verwijderen bij het juiste
 * middel uitkomen.
 *
 * Drie dingen zijn hier bewust vastgelegd omdat ze zonder test onzichtbaar
 * zijn:
 *   - De `enabled` op de boekingen. Zolang de rasterweergave aanstaat hoort er
 *     geen weekoverzicht opgehaald te worden; raakt die voorwaarde zoek, dan
 *     doet de pagina bij elk bezoek een verzoek dat niemand ziet.
 *   - Dat een middel dat niet actief is geen boekknop krijgt en niet in de
 *     kalender staat. Dat is de enige rem op het boeken van een zaal die uit
 *     de roulatie is.
 *   - Welk id er met een boeking meegaat. Een verschuiving in het raster boekt
 *     stilzwijgend het verkeerde middel.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import Resources from '../Resources';
import * as middelenApi from '../../api/resources';
import { showError, showSuccess } from '../../utils/toast';
import type { Resource, ResourceBooking, ResourceCategory, ResourceDetail } from '../../api/resources';

vi.mock('../../api/resources');

vi.mock('../../hooks/useDocumentTitle', () => ({ useDocumentTitle: () => {} }));

// `initReactI18next` hoort erbij omdat de pagina via utils/locale.ts de echte
// i18n-opzet meetrekt, en die roept het aan tijdens het laden van de module.
// Zonder deze export klapt het bestand al bij de import, vóór er één test
// gedraaid heeft.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (sleutel: string) => sleutel }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('../../utils/toast', () => ({ showSuccess: vi.fn(), showError: vi.fn() }));

vi.mock('../../components/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

vi.mock('../../components/Skeleton', () => ({
  SkeletonCard: () => <div data-testid="skelet-kaart" />,
}));

// Deze twee hebben hun eigen queries en hun eigen tests; hier telt alleen dat
// ze op het juiste moment tevoorschijn komen.
vi.mock('../../components/ResourceAvailabilitySection', () => ({
  ResourceAvailabilitySection: ({ resourceId }: { resourceId: string }) => (
    <div data-testid="beschikbaarheid" data-middel={resourceId} />
  ),
}));

vi.mock('../../components/ResourceCategoriesManager', () => ({
  ResourceCategoriesManager: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="categoriebeheer">
      <button onClick={onClose}>sluiten</button>
    </div>
  ),
}));

const CATEGORIEEN: ResourceCategory[] = [
  { id: 'cat-zalen', name: 'Zalen', sortOrder: 1, resourceCount: 2 },
  { id: 'cat-vervoer', name: 'Vervoer', sortOrder: 2, resourceCount: 1 },
];

const BRONNEN: Resource[] = [
  {
    id: 'bron-zaal',
    name: 'Grote zaal',
    description: 'Met vleugel en podium',
    resourceType: 'room',
    location: 'Hoofdgebouw',
    capacity: 120,
    isActive: true,
    requiresApproval: true,
    costPerHour: 25,
  },
  {
    id: 'bron-bus',
    name: 'Instrumentenbus',
    resourceType: 'vehicle',
    location: 'Parkeerterrein',
    isActive: true,
    requiresApproval: false,
    costPerDay: 80,
  },
  {
    id: 'bron-kelder',
    name: 'Oefenruimte kelder',
    resourceType: 'room',
    location: 'Kelder',
    isActive: false,
    requiresApproval: false,
  },
];

const DETAIL: ResourceDetail = {
  ...BRONNEN[0],
  minBookingHours: 2,
  maxBookingHours: 8,
  notes: 'Sleutel bij de conciërge',
  createdAt: '2026-01-01',
  availability: [],
  upcomingBookings: [
    {
      id: 'boeking-1',
      title: 'Repetitie blazers',
      startDatetime: '2026-09-01T19:00:00',
      endDatetime: '2026-09-01T22:00:00',
      status: 'approved',
      bookedByName: 'Ruud',
    },
  ],
};

/** De maandag van de lopende week, zoals de pagina hem zelf uitrekent. */
function maandagVanDezeWeek(): Date {
  const nu = new Date();
  const dag = nu.getDay();
  const verschil = dag === 0 ? -6 : 1 - dag;
  const maandag = new Date(nu);
  maandag.setDate(nu.getDate() + verschil);
  maandag.setHours(0, 0, 0, 0);
  return maandag;
}

function datumSleutel(datum: Date): string {
  return datum.toISOString().split('T')[0];
}

const BOEKINGEN: ResourceBooking[] = [
  {
    id: 'boeking-week-1',
    resourceId: 'bron-zaal',
    resourceName: 'Grote zaal',
    resourceType: 'room',
    userId: 'u1',
    bookedByName: 'Ruud',
    title: 'Generale repetitie',
    startDatetime: `${datumSleutel(maandagVanDezeWeek())}T19:00:00`,
    endDatetime: `${datumSleutel(maandagVanDezeWeek())}T22:00:00`,
    status: 'approved',
    createdAt: '2026-01-01',
  },
];

function zetApiKlaar(): void {
  for (const naam of Object.keys(middelenApi)) {
    const functie = (middelenApi as Record<string, unknown>)[naam];
    if (typeof functie === 'function') {
      vi.mocked(functie as (...args: unknown[]) => unknown).mockResolvedValue({ message: 'gelukt' });
    }
  }
  vi.mocked(middelenApi.getResources).mockResolvedValue(BRONNEN);
  vi.mocked(middelenApi.getResourceCategories).mockResolvedValue(CATEGORIEEN);
  vi.mocked(middelenApi.getResourceBookings).mockResolvedValue(BOEKINGEN);
  vi.mocked(middelenApi.getResource).mockResolvedValue(DETAIL);
  vi.mocked(middelenApi.createResourceBooking).mockResolvedValue({
    id: 'nieuwe-boeking',
    status: 'pending',
    message: 'Aanvraag verstuurd',
  });
  vi.mocked(middelenApi.createResource).mockResolvedValue({ id: 'nieuw-middel', message: 'Aangemaakt' });
}

function wikkel({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** De kaart in het raster waar dit middel op staat. */
function middelkaart(naam: string): HTMLElement {
  const kop = screen.getByRole('heading', { level: 3, name: naam });
  const kaart = kop.closest('.card');
  if (!kaart) throw new Error(`geen kaart gevonden rond ${naam}`);
  return kaart as HTMLElement;
}

/**
 * De formuliervelden hangen niet met `htmlFor` aan hun label, dus opzoeken op
 * label werkt niet. Zoeken gaat via de tekst en dan het veld in dezelfde
 * `.form-control`.
 */
function veld(binnen: HTMLElement, labeltekst: RegExp): HTMLElement {
  const label = within(binnen).getByText(labeltekst);
  const groep = label.closest('.form-control');
  const invoer = groep?.querySelector('input, textarea, select');
  if (!invoer) throw new Error(`geen invoerveld gevonden bij ${labeltekst}`);
  return invoer as HTMLElement;
}

/** De teller onder een kopje in de statistiekbalk. */
function teller(kopje: string): string {
  const label = screen.getByText(kopje);
  return label.parentElement?.querySelector('.text-2xl')?.textContent ?? '';
}

beforeEach(() => {
  vi.clearAllMocks();
  zetApiKlaar();
});

describe('middelen - het overzicht', () => {
  it('toont elk middel dat de server stuurt, met type en plek', async () => {
    render(<Resources />, { wrapper: wikkel });

    expect(await screen.findByRole('heading', { level: 3, name: 'Grote zaal' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Instrumentenbus' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Oefenruimte kelder' })).toBeInTheDocument();

    const zaal = within(middelkaart('Grote zaal'));
    expect(zaal.getByText('Hoofdgebouw')).toBeInTheDocument();
    expect(zaal.getByText('Met vleugel en podium')).toBeInTheDocument();
    expect(zaal.getByText('resources.types.room')).toBeInTheDocument();
    expect(zaal.getByText(/120/)).toBeInTheDocument();
  });

  it('telt de middelen, de beschikbare middelen, de categorieën en de zalen', async () => {
    render(<Resources />, { wrapper: wikkel });

    await screen.findByRole('heading', { level: 3, name: 'Grote zaal' });

    expect(teller('resources.total')).toBe('3');
    // Alleen actieve middelen tellen als beschikbaar; de kelder valt af.
    expect(teller('resources.available')).toBe('2');
    expect(teller('resources.categories.label')).toBe('2');
    expect(teller('resources.rooms')).toBe('2');
  });

  it('toont de lege staat als er geen middelen zijn', async () => {
    vi.mocked(middelenApi.getResources).mockResolvedValue([]);

    render(<Resources />, { wrapper: wikkel });

    expect(await screen.findByText('resources.noResources')).toBeInTheDocument();
  });

  it('toont skeletkaarten zolang de middelen nog onderweg zijn', async () => {
    let losmaken: (bronnen: Resource[]) => void = () => {};
    vi.mocked(middelenApi.getResources).mockReturnValue(
      new Promise<Resource[]>((resolve) => {
        losmaken = resolve;
      }),
    );

    render(<Resources />, { wrapper: wikkel });

    expect((await screen.findAllByTestId('skelet-kaart')).length).toBeGreaterThan(0);

    losmaken(BRONNEN);
    await waitFor(() => expect(screen.queryByTestId('skelet-kaart')).not.toBeInTheDocument());
  });

  it('stuurt het gekozen type mee naar de server', async () => {
    const gebruiker = userEvent.setup();
    render(<Resources />, { wrapper: wikkel });

    await screen.findByRole('heading', { level: 3, name: 'Grote zaal' });
    // Zonder filter gaat er niets mee; anders leest de server een lege string
    // als een echt filter.
    expect(middelenApi.getResources).toHaveBeenCalledWith(undefined);

    await gebruiker.selectOptions(screen.getByRole('combobox'), 'vehicle');

    await waitFor(() => expect(middelenApi.getResources).toHaveBeenCalledWith({ type: 'vehicle' }));
  });

  it('geeft een middel dat niet actief is geen boekknop', async () => {
    render(<Resources />, { wrapper: wikkel });

    await screen.findByRole('heading', { level: 3, name: 'Oefenruimte kelder' });

    const kelder = within(middelkaart('Oefenruimte kelder'));
    expect(kelder.getByText('resources.inactive')).toBeInTheDocument();
    expect(kelder.queryByRole('button', { name: 'resources.book' })).not.toBeInTheDocument();
    // De details blijven wel te bekijken.
    expect(kelder.getByRole('button', { name: 'common.details' })).toBeInTheDocument();
  });

  it('haalt het weekoverzicht niet op zolang het raster in beeld staat', async () => {
    render(<Resources />, { wrapper: wikkel });

    await screen.findByRole('heading', { level: 3, name: 'Grote zaal' });

    expect(middelenApi.getResourceBookings).not.toHaveBeenCalled();
  });

  it('opent het categoriebeheer', async () => {
    const gebruiker = userEvent.setup();
    render(<Resources />, { wrapper: wikkel });

    await gebruiker.click(await screen.findByRole('button', { name: /resources.manageCategories/ }));

    expect(await screen.findByTestId('categoriebeheer')).toBeInTheDocument();
  });
});

describe('middelen - een nieuw middel aanmaken', () => {
  it('houdt de opslaanknop dicht zolang er geen naam staat', async () => {
    const gebruiker = userEvent.setup();
    render(<Resources />, { wrapper: wikkel });

    await gebruiker.click(await screen.findByRole('button', { name: /resources.new/ }));

    const venster = await screen.findByRole('dialog');
    expect(within(venster).getByRole('button', { name: 'common.create' })).toBeDisabled();

    await gebruiker.type(veld(venster, /common.name/), 'Repetitiezaal noord');

    expect(within(venster).getByRole('button', { name: 'common.create' })).toBeEnabled();
  });

  it('stuurt naam, type en plek naar de server en meldt dat het gelukt is', async () => {
    const gebruiker = userEvent.setup();
    render(<Resources />, { wrapper: wikkel });

    await gebruiker.click(await screen.findByRole('button', { name: /resources.new/ }));

    const venster = await screen.findByRole('dialog');
    await gebruiker.type(veld(venster, /common.name/), 'Repetitiezaal noord');
    await gebruiker.selectOptions(veld(venster, /^resources\.type$/), 'equipment');
    await gebruiker.type(veld(venster, /^resources\.location$/), 'Bijgebouw');
    await gebruiker.click(within(venster).getByRole('button', { name: 'common.create' }));

    await waitFor(() => expect(middelenApi.createResource).toHaveBeenCalled());
    // Alleen het eerste argument is van ons; react-query hangt er zelf nog een
    // context achter.
    expect(vi.mocked(middelenApi.createResource).mock.calls[0][0]).toEqual({
      name: 'Repetitiezaal noord',
      description: '',
      resourceType: 'equipment',
      location: 'Bijgebouw',
    });
    expect(showSuccess).toHaveBeenCalledWith('resources.created');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('meldt het als het aanmaken mislukt en laat het venster openstaan', async () => {
    vi.mocked(middelenApi.createResource).mockRejectedValue(new Error('server plat'));
    const gebruiker = userEvent.setup();
    render(<Resources />, { wrapper: wikkel });

    await gebruiker.click(await screen.findByRole('button', { name: /resources.new/ }));

    const venster = await screen.findByRole('dialog');
    await gebruiker.type(veld(venster, /common.name/), 'Repetitiezaal noord');
    await gebruiker.click(within(venster).getByRole('button', { name: 'common.create' }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('resources.errorCreate'));
    // Het ingevulde formulier blijft staan; anders is alles kwijt.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

describe('middelen - boeken', () => {
  async function openBoekvenster(): Promise<HTMLElement> {
    const gebruiker = userEvent.setup();
    await screen.findByRole('heading', { level: 3, name: 'Grote zaal' });
    await gebruiker.click(within(middelkaart('Grote zaal')).getByRole('button', { name: 'resources.book' }));
    return screen.findByRole('dialog');
  }

  it('boekt het middel waar de knop bij staat', async () => {
    const gebruiker = userEvent.setup();
    render(<Resources />, { wrapper: wikkel });

    const venster = await openBoekvenster();
    await gebruiker.type(veld(venster, /resources.bookingTitle/), 'Generale repetitie');
    fireEvent.change(veld(venster, /resources.startTime/), { target: { value: '2026-09-01T19:00' } });
    fireEvent.change(veld(venster, /resources.endTime/), { target: { value: '2026-09-01T22:00' } });

    await gebruiker.click(within(venster).getByRole('button', { name: 'resources.book' }));

    await waitFor(() =>
      expect(middelenApi.createResourceBooking).toHaveBeenCalledWith({
        resourceId: 'bron-zaal',
        title: 'Generale repetitie',
        startDatetime: '2026-09-01T19:00',
        endDatetime: '2026-09-01T22:00',
        description: '',
      }),
    );
    // De melding komt van de server, niet uit een vertaalsleutel.
    expect(showSuccess).toHaveBeenCalledWith('Aanvraag verstuurd');
  });

  it('houdt de boekknop dicht tot titel, begin en eind ingevuld zijn', async () => {
    const gebruiker = userEvent.setup();
    render(<Resources />, { wrapper: wikkel });

    const venster = await openBoekvenster();
    const boekknop = within(venster).getByRole('button', { name: 'resources.book' });
    expect(boekknop).toBeDisabled();

    await gebruiker.type(veld(venster, /resources.bookingTitle/), 'Generale repetitie');
    expect(boekknop).toBeDisabled();

    fireEvent.change(veld(venster, /resources.startTime/), { target: { value: '2026-09-01T19:00' } });
    expect(boekknop).toBeDisabled();

    fireEvent.change(veld(venster, /resources.endTime/), { target: { value: '2026-09-01T22:00' } });
    expect(boekknop).toBeEnabled();
  });

  it('waarschuwt dat een boeking goedgekeurd moet worden', async () => {
    render(<Resources />, { wrapper: wikkel });

    const venster = await openBoekvenster();
    expect(within(venster).getByText('resources.requiresApproval')).toBeInTheDocument();
  });

  it('laat die waarschuwing weg bij een middel dat geen goedkeuring vraagt', async () => {
    const gebruiker = userEvent.setup();
    render(<Resources />, { wrapper: wikkel });

    await screen.findByRole('heading', { level: 3, name: 'Instrumentenbus' });
    await gebruiker.click(within(middelkaart('Instrumentenbus')).getByRole('button', { name: 'resources.book' }));

    const venster = await screen.findByRole('dialog');
    expect(within(venster).queryByText('resources.requiresApproval')).not.toBeInTheDocument();
  });

  it('meldt het als de boeking mislukt', async () => {
    vi.mocked(middelenApi.createResourceBooking).mockRejectedValue(new Error('bezet'));
    const gebruiker = userEvent.setup();
    render(<Resources />, { wrapper: wikkel });

    const venster = await openBoekvenster();
    await gebruiker.type(veld(venster, /resources.bookingTitle/), 'Generale repetitie');
    fireEvent.change(veld(venster, /resources.startTime/), { target: { value: '2026-09-01T19:00' } });
    fireEvent.change(veld(venster, /resources.endTime/), { target: { value: '2026-09-01T22:00' } });
    await gebruiker.click(within(venster).getByRole('button', { name: 'resources.book' }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('resources.errorBook'));
  });
});

describe('middelen - het detailvenster', () => {
  async function openDetail(): Promise<HTMLElement> {
    const gebruiker = userEvent.setup();
    await screen.findByRole('heading', { level: 3, name: 'Grote zaal' });
    await gebruiker.click(within(middelkaart('Grote zaal')).getByRole('button', { name: 'common.details' }));
    return screen.findByRole('dialog');
  }

  it('haalt geen detail op zolang er geen middel gekozen is', async () => {
    render(<Resources />, { wrapper: wikkel });

    await screen.findByRole('heading', { level: 3, name: 'Grote zaal' });

    expect(middelenApi.getResource).not.toHaveBeenCalled();
  });

  it('toont de gegevens van het gekozen middel', async () => {
    render(<Resources />, { wrapper: wikkel });

    const venster = await openDetail();
    await waitFor(() => expect(middelenApi.getResource).toHaveBeenCalledWith('bron-zaal'));

    expect(within(venster).getByText('Sleutel bij de conciërge')).toBeInTheDocument();
    expect(within(venster).getByText('Repetitie blazers')).toBeInTheDocument();
    expect(within(venster).getByTestId('beschikbaarheid')).toHaveAttribute('data-middel', 'bron-zaal');
  });

  it('verwijdert het middel pas na bevestigen', async () => {
    const gebruiker = userEvent.setup();
    render(<Resources />, { wrapper: wikkel });

    const venster = await openDetail();
    await waitFor(() => expect(middelenApi.getResource).toHaveBeenCalled());

    await gebruiker.click(within(venster).getByRole('button', { name: /common.delete/ }));

    const bevestiging = await screen.findByRole('alertdialog');
    // Tot hier is er nog niets verwijderd; dat is het hele punt van de vraag.
    expect(middelenApi.deleteResource).not.toHaveBeenCalled();

    await gebruiker.click(within(bevestiging).getByRole('button', { name: 'common.delete' }));

    await waitFor(() => expect(middelenApi.deleteResource).toHaveBeenCalledWith('bron-zaal'));
    expect(showSuccess).toHaveBeenCalledWith('resources.deleted');
  });

  it('gaat vanuit het detail door naar het boekvenster', async () => {
    const gebruiker = userEvent.setup();
    render(<Resources />, { wrapper: wikkel });

    const venster = await openDetail();
    await waitFor(() => expect(middelenApi.getResource).toHaveBeenCalled());

    await gebruiker.click(within(venster).getByRole('button', { name: 'resources.book' }));

    const boekvenster = await screen.findByRole('dialog');
    expect(within(boekvenster).getByText(/resources.bookingTitle/)).toBeInTheDocument();
  });
});

describe('middelen - de weekkalender', () => {
  async function naarKalender(wachtOp = 'Grote zaal'): Promise<void> {
    const gebruiker = userEvent.setup();
    // Eerst wachten tot het raster gevuld is, anders zou de kalender met een
    // lege verzameling beoordeeld worden en zegt de test niets.
    await screen.findByRole('heading', { level: 3, name: wachtOp });
    const knoppen = screen.getAllByRole('button');
    const kalenderknop = knoppen.find((knop) => within(knop).queryByTestId('icon-calendar'));
    if (!kalenderknop) throw new Error('geen knop voor de kalenderweergave gevonden');
    await gebruiker.click(kalenderknop);
  }

  it('haalt de boekingen van de getoonde week op en zet ze in de kalender', async () => {
    render(<Resources />, { wrapper: wikkel });
    await naarKalender();

    await waitFor(() => expect(middelenApi.getResourceBookings).toHaveBeenCalled());
    const filters = vi.mocked(middelenApi.getResourceBookings).mock.calls[0][0];
    expect(filters?.startDate).toBeTruthy();
    expect(filters?.endDate).toBeTruthy();

    expect(await screen.findByText('Generale repetitie')).toBeInTheDocument();
  });

  it('laat een middel dat niet actief is buiten de kalender', async () => {
    render(<Resources />, { wrapper: wikkel });
    await naarKalender();

    expect(await screen.findByText('Grote zaal')).toBeInTheDocument();
    expect(screen.getByText('Instrumentenbus')).toBeInTheDocument();
    expect(screen.queryByText('Oefenruimte kelder')).not.toBeInTheDocument();
  });

  it('haalt bij een week vooruit een andere periode op', async () => {
    const gebruiker = userEvent.setup();
    render(<Resources />, { wrapper: wikkel });
    await naarKalender();

    await waitFor(() => expect(middelenApi.getResourceBookings).toHaveBeenCalled());
    const eerste = vi.mocked(middelenApi.getResourceBookings).mock.calls[0][0];

    const vooruit = screen
      .getAllByRole('button')
      .find((knop) => within(knop).queryByTestId('icon-chevronRight')) as HTMLElement;
    await gebruiker.click(vooruit);

    await waitFor(() => expect(vi.mocked(middelenApi.getResourceBookings).mock.calls.length).toBeGreaterThan(1));
    const aanroepen = vi.mocked(middelenApi.getResourceBookings).mock.calls;
    const tweede = aanroepen[aanroepen.length - 1]?.[0];
    expect(tweede?.startDate).not.toBe(eerste?.startDate);
  });

  it('boekt het middel van de rij waar je in de kalender op klikt', async () => {
    const gebruiker = userEvent.setup();
    render(<Resources />, { wrapper: wikkel });
    await naarKalender();

    const busrij = (await screen.findByText('Instrumentenbus')).closest('tr') as HTMLElement;
    const cellen = within(busrij).getAllByRole('cell');
    await gebruiker.click(cellen[1]);

    const venster = await screen.findByRole('dialog');
    await gebruiker.type(veld(venster, /resources.bookingTitle/), 'Ophalen instrumenten');
    fireEvent.change(veld(venster, /resources.startTime/), { target: { value: '2026-09-01T09:00' } });
    fireEvent.change(veld(venster, /resources.endTime/), { target: { value: '2026-09-01T12:00' } });
    await gebruiker.click(within(venster).getByRole('button', { name: 'resources.book' }));

    await waitFor(() =>
      expect(middelenApi.createResourceBooking).toHaveBeenCalledWith(
        expect.objectContaining({ resourceId: 'bron-bus' }),
      ),
    );
  });

  it('meldt in de kalender dat er niets te boeken valt als geen middel actief is', async () => {
    vi.mocked(middelenApi.getResources).mockResolvedValue([BRONNEN[2]]);
    render(<Resources />, { wrapper: wikkel });
    await naarKalender('Oefenruimte kelder');

    expect(await screen.findByText('resources.noResources')).toBeInTheDocument();
  });
});

/**
 * Hieronder staat geen karakteriseringstest maar een regressietest: hij legt
 * vast hoe het hoort te zijn, na het herstellen van een fout.
 *
 * BEWIJS. Met de oude Resources.tsx teruggezet (`git checkout HEAD -- ...`, de
 * eigen kopie eerst opzij) faalt deze test:
 *   TestingLibraryElementError: Unable to find role="alert"
 * en in de afdruk staat dan `resources.noResources`.
 *
 * De fout: `useQuery` gaf alleen `data` en `isLoading` door, met `= []` als
 * terugval. Bij een mislukte aanroep is `isLoading` weer `false` en is de
 * lijst leeg, en dus toonde de pagina "er zijn nog geen middelen". Dat is niet
 * hetzelfde als "we konden het niet ophalen": wie twintig zalen heeft en dit
 * ziet, denkt dat ze weg zijn en maakt ze opnieuw aan.
 */
describe('middelen - herstelde fout', () => {
  it('zegt dat het ophalen mislukte in plaats van dat er niets is', async () => {
    vi.mocked(middelenApi.getResources).mockRejectedValue(new Error('server plat'));

    render(<Resources />, { wrapper: wikkel });

    expect(await screen.findByRole('alert')).toHaveTextContent('errors.generic');
    expect(screen.queryByText('resources.noResources')).not.toBeInTheDocument();
    // De rest van de pagina blijft staan; een lege pagina is niet van een
    // kapotte pagina te onderscheiden.
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('resources.title');
  });

  it('probeert het opnieuw na een klik op de knop', async () => {
    vi.mocked(middelenApi.getResources).mockRejectedValueOnce(new Error('server plat')).mockResolvedValue(BRONNEN);
    const gebruiker = userEvent.setup();

    render(<Resources />, { wrapper: wikkel });

    await screen.findByRole('alert');
    await gebruiker.click(screen.getByRole('button', { name: 'common.retry' }));

    expect(await screen.findByRole('heading', { level: 3, name: 'Grote zaal' })).toBeInTheDocument();
  });
});
