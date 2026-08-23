/**
 * De concertpagina van de kant van wie er iets mee dóét.
 *
 * Concerts.karakterisering.test.tsx legt vast wat er te zíén is: welke
 * tabbladen, welke queries, wat er bij het openen gebeurt. Wat er daarna
 * gebeurt als iemand op een knop drukt stond grotendeels nog nergens vast: het
 * hele detailvenster van een concert - programma, media, kaartsoorten,
 * bezetting - en alle bijbehorende mutaties waren onbedekt.
 *
 * Dat is wat hier bij komt: een concert aanmaken, bewerken en verwijderen; in
 * het detailvenster programmaonderdelen en media toevoegen en weggooien; leden
 * aan de bezetting toevoegen; kaartsoorten beheren en de publieke verkooplink
 * kopiëren; de opkomstvoorspelling opvragen; de uitvoeringsmodus starten; en
 * het programma en de Buma/Stemra-opgave exporteren.
 *
 * De opzet (mocks, wikkel, tabbladen zoeken) volgt bewust die van
 * Concerts.karakterisering.test.tsx en Concerts.herstel.test.tsx, zodat de
 * bestanden naast elkaar te lezen zijn.
 *
 * Onderweg kwam er één echte fout boven water; die staat verderop beschreven,
 * bij "een geweigerde opslag laat geen losse afwijzing achter".
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import Concerts from '../Concerts';
import * as api from '../../api';
import { showError, showSuccess } from '../../utils/toast';
import type { Concert, ConcertDetail, TicketType, User } from '../../types';

vi.mock('../../api');

vi.mock('../../hooks/useDocumentTitle', () => ({ useDocumentTitle: () => {} }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (sleutel: string) => sleutel }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('../../components/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

vi.mock('../../components/Skeleton', () => ({
  SkeletonTable: () => <div data-testid="skelet-tabel" />,
}));

vi.mock('../../components/SetlistBuilder', () => ({
  default: () => <div data-testid="setlijstbouwer" />,
}));

vi.mock('../../components/ConcertPosterGenerator', () => ({
  default: () => <div data-testid="postergenerator" />,
}));

// De uitvoeringsmodus is een schermvullend onderdeel op zichzelf. Hier telt
// alleen dát hij met de juiste stukken start en weer te verlaten is.
vi.mock('../../components/SetlistMode', () => ({
  SetlistMode: ({ title, pieces, onExit }: { title: string; pieces: { title: string }[]; onExit: () => void }) => (
    <div data-testid="uitvoeringsmodus">
      <span>{title}</span>
      <span>{pieces.map((p) => p.title).join(', ')}</span>
      <button onClick={onExit}>uitvoeringsmodus sluiten</button>
    </div>
  ),
}));

vi.mock('../../components/CustomFields', () => ({
  CustomFieldFormSection: () => <div data-testid="eigen-velden-formulier" />,
  CustomFieldRenderer: () => <div data-testid="eigen-velden-weergave" />,
}));

vi.mock('../../utils/toast', () => ({ showSuccess: vi.fn(), showError: vi.fn() }));

const CONCERT: Concert = {
  id: 'c1',
  name: 'Zomerconcert',
  date: '2026-07-01',
  endDate: null,
  location: 'Dorpskerk',
  venueType: null,
  concertType: 'gala',
  description: null,
  notes: null,
  programCount: 1,
  attendanceCount: 1,
  mediaCount: 1,
  createdBy: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const CONCERT_DETAIL: ConcertDetail = {
  ...CONCERT,
  program: [
    {
      id: 'pr1',
      musicTitleId: null,
      title: 'Bolero',
      composer: 'Ravel',
      arranger: 'Van Dijk',
      sortOrder: 1,
      notes: 'vanaf maat 40',
      partOfSet: null,
      youtubeUrl: null,
      durationSeconds: null,
    },
  ],
  media: [{ id: 'm1', mediaType: 'photo', url: 'https://example.org/foto', description: 'Groepsfoto' }],
  attendance: [{ id: 'a1', userId: 'u1', memberName: 'Anna Bakker', instrumentPlayed: 'Viool', notes: null }],
} as unknown as ConcertDetail;

const KAARTSOORT: TicketType = {
  id: 'k1',
  name: 'Voorverkoop',
  price: 12.5,
  quantity: 100,
  available: 40,
  description: 'tot een week vooraf',
  maxPerOrder: 10,
  onSale: true,
  saleStart: null,
  saleEnd: null,
  serviceFee: 0,
  showServiceFeeSeparate: false,
};

const LEDEN = [
  { id: 'u1', email: 'anna@example.org', firstName: 'Anna', lastName: 'Bakker', role: 'member' },
  { id: 'u2', email: 'bram@example.org', firstName: 'Bram', lastName: 'Cohen', role: 'member' },
] as unknown as User[];

function zetApiKlaar(): void {
  for (const naam of Object.keys(api)) {
    const functie = (api as Record<string, unknown>)[naam];
    if (typeof functie === 'function') {
      vi.mocked(functie as (...args: unknown[]) => unknown).mockResolvedValue(undefined);
    }
  }
  vi.mocked(api.getConcerts).mockResolvedValue({ data: [CONCERT], total: 1, page: 1, limit: 50 });
  vi.mocked(api.getConcertTypes).mockResolvedValue({
    concertTypes: [
      { value: 'gala', label: 'Galaconcert' },
      { value: 'kerst', label: 'Kerstconcert' },
    ],
    mediaTypes: [
      { value: 'photo', label: 'Foto' },
      { value: 'video', label: 'Video' },
    ],
  } as never);
  vi.mocked(api.getConcertYears).mockResolvedValue(['2026']);
  vi.mocked(api.getConcertStatistics).mockResolvedValue({
    totalConcerts: 1,
    concertsPerYear: [],
    concertsPerType: [],
    mostPlayedPieces: [],
  });
  vi.mocked(api.getConcert).mockResolvedValue(CONCERT_DETAIL);
  vi.mocked(api.getUsers).mockResolvedValue(LEDEN);
  vi.mocked(api.getMusicTitles).mockResolvedValue([{ id: 'mt1', title: 'Carmina Burana', arranger: 'Orff' }] as never);
  vi.mocked(api.getConcertTickets).mockResolvedValue({
    concert: {
      id: 'c1',
      name: 'Zomerconcert',
      date: '2026-07-01',
      endDate: null,
      location: 'Dorpskerk',
      description: null,
      concertType: null,
    },
    ticketTypes: [KAARTSOORT],
    paymentMethods: [],
  } as never);
  vi.mocked(api.createConcert).mockResolvedValue({ id: 'nieuw' });
  vi.mocked(api.exportConcertProgram).mockResolvedValue('1. Bolero');
  vi.mocked(api.exportBumaStemra).mockResolvedValue('titel;componist');
  vi.mocked(api.addConcertAttendanceBulk).mockResolvedValue({ ids: ['a2'], count: 1 });
  vi.mocked(api.createTicketType).mockResolvedValue(KAARTSOORT);
  vi.mocked(api.updateTicketType).mockResolvedValue({ success: true });
  vi.mocked(api.deleteTicketType).mockResolvedValue({ success: true });
}

function wikkel({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

function tabbladKnoppen(): HTMLElement[] {
  const statistiek = screen.queryAllByRole('button').find((knop) => knop.textContent?.trim() === 'concerts.statistics');
  const balk = statistiek?.parentElement;
  return balk ? Array.from(balk.querySelectorAll('button')) : [];
}

function tabblad(label: string): HTMLElement {
  const knop = tabbladKnoppen().find((k) => k.textContent?.trim() === label);
  if (!knop) throw new Error(`tabblad "${label}" niet gevonden`);
  return knop;
}

/** Tekent de pagina en wacht tot de lijst er staat. */
async function toon(): Promise<void> {
  render(<Concerts />, { wrapper: wikkel });
  await waitFor(() => expect(tabbladKnoppen()).toHaveLength(5));
}

/** Het venster (modal) met deze titel. */
function venster(titel: string): HTMLElement {
  const kop = screen.getAllByText(titel).find((el) => el.classList.contains('modal-title'));
  if (!kop) throw new Error(`venster "${titel}" niet gevonden`);
  return kop.closest('.modal') as HTMLElement;
}

/** Opent het detailvenster van het enige concert in de lijst. */
async function openDetail(gebruiker: ReturnType<typeof userEvent.setup>): Promise<HTMLElement> {
  await gebruiker.click(screen.getByTestId('icon-eye').closest('button') as HTMLElement);
  await screen.findByText('Zomerconcert', { selector: '.modal-title' });
  return venster('Zomerconcert');
}

/**
 * Afwijzingen die nergens opgevangen werden.
 *
 * Node meldt zo'n belofte via `unhandledRejection`. Vitest luistert daar zelf
 * ook naar en maakt de hele bestandsuitvoer er rood van; deze lijst maakt er
 * bovendien een gewone verwachting van, in de test die erover gaat.
 */
let losseAfwijzingen: unknown[] = [];

function onthoudAfwijzing(reden: unknown): void {
  losseAfwijzingen.push(reden);
}

beforeEach(() => {
  vi.clearAllMocks();
  zetApiKlaar();
  losseAfwijzingen = [];
  process.on('unhandledRejection', onthoudAfwijzing);
});

afterEach(() => {
  process.off('unhandledRejection', onthoudAfwijzing);
});

/** Geeft Node de kans om een losse afwijzing te melden. */
async function laatAfwijzingenBinnenkomen(): Promise<void> {
  await new Promise((klaar) => setTimeout(klaar, 0));
}

describe('een concert aanmaken', () => {
  it('stuurt de ingevulde velden mee en laat de lege velden weg', async () => {
    const gebruiker = userEvent.setup();
    await toon();

    await gebruiker.click(screen.getByRole('button', { name: '+ concerts.newConcert' }));
    const formulier = venster('concerts.newConcert');
    await gebruiker.type(within(formulier).getByLabelText(/concerts.concertName/), 'Kerstconcert');
    await gebruiker.type(within(formulier).getByLabelText(/^concerts.date/), '2026-12-20');
    await gebruiker.type(within(formulier).getByLabelText('concerts.location'), 'De Grote Kerk');
    await gebruiker.selectOptions(within(formulier).getByLabelText('concerts.concertType'), 'kerst');
    await gebruiker.click(within(formulier).getByRole('button', { name: 'common.save' }));

    await waitFor(() =>
      // Tweede argument: react-query geeft zijn eigen context mee omdat
      // `createConcert` rechtstreeks als mutationFn dienstdoet.
      expect(api.createConcert).toHaveBeenCalledWith(
        {
          name: 'Kerstconcert',
          date: '2026-12-20',
          endDate: undefined,
          location: 'De Grote Kerk',
          concertType: 'kerst',
          description: undefined,
          notes: undefined,
        },
        expect.anything(),
      ),
    );
  });

  it('sluit het venster na het aanmaken en laat het leeg achter voor de volgende keer', async () => {
    const gebruiker = userEvent.setup();
    await toon();

    await gebruiker.click(screen.getByRole('button', { name: '+ concerts.newConcert' }));
    let formulier = venster('concerts.newConcert');
    await gebruiker.type(within(formulier).getByLabelText(/concerts.concertName/), 'Kerstconcert');
    await gebruiker.type(within(formulier).getByLabelText(/^concerts.date/), '2026-12-20');
    await gebruiker.click(within(formulier).getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(screen.queryByText('concerts.newConcert', { selector: '.modal-title' })).toBeNull());

    await gebruiker.click(screen.getByRole('button', { name: '+ concerts.newConcert' }));
    formulier = venster('concerts.newConcert');
    expect(within(formulier).getByLabelText<HTMLInputElement>(/concerts.concertName/).value).toBe('');
  });

  it('meldt het als het aanmaken mislukt', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(api.createConcert).mockRejectedValue(new Error('datum bezet'));
    await toon();

    await gebruiker.click(screen.getByRole('button', { name: '+ concerts.newConcert' }));
    const formulier = venster('concerts.newConcert');
    await gebruiker.type(within(formulier).getByLabelText(/concerts.concertName/), 'Kerstconcert');
    await gebruiker.type(within(formulier).getByLabelText(/^concerts.date/), '2026-12-20');
    await gebruiker.click(within(formulier).getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('datum bezet'));
  });

  it('kan ook vanaf de zwevende knop op mobiel geopend worden', async () => {
    const gebruiker = userEvent.setup();
    await toon();

    const zwevend = screen.getAllByRole('button', { name: 'concerts.newConcert' });
    await gebruiker.click(zwevend[zwevend.length - 1]);

    expect(screen.getByText('concerts.newConcert', { selector: '.modal-title' })).toBeInTheDocument();
  });
});

describe('een concert bewerken en verwijderen', () => {
  it('vult het bewerkvenster met de gegevens van het gekozen concert', async () => {
    const gebruiker = userEvent.setup();
    await toon();

    await gebruiker.click(screen.getByTestId('icon-pencil').closest('button') as HTMLElement);

    const formulier = venster('concerts.edit');
    expect(within(formulier).getByLabelText<HTMLInputElement>(/concerts.concertName/).value).toBe('Zomerconcert');
    expect(within(formulier).getByLabelText<HTMLInputElement>('concerts.location').value).toBe('Dorpskerk');
    // Bij een bestaand concert staan de eigen velden erbij, bij een nieuw niet.
    expect(within(formulier).getByTestId('eigen-velden-formulier')).toBeInTheDocument();
  });

  it('werkt bij het opslaan hetzelfde concert bij', async () => {
    const gebruiker = userEvent.setup();
    await toon();

    await gebruiker.click(screen.getByTestId('icon-pencil').closest('button') as HTMLElement);
    const formulier = venster('concerts.edit');
    await gebruiker.clear(within(formulier).getByLabelText('concerts.location'));
    await gebruiker.type(within(formulier).getByLabelText('concerts.location'), 'De Grote Kerk');
    await gebruiker.click(within(formulier).getByRole('button', { name: 'common.save' }));

    await waitFor(() =>
      expect(api.updateConcert).toHaveBeenCalledWith('c1', expect.objectContaining({ location: 'De Grote Kerk' })),
    );
    expect(api.createConcert).not.toHaveBeenCalled();
  });

  it('vraagt om bevestiging voor het verwijderen en verwijdert dan pas', async () => {
    const gebruiker = userEvent.setup();
    await toon();

    await gebruiker.click(screen.getByTestId('icon-trash').closest('button') as HTMLElement);
    const vraag = screen.getByRole('alertdialog');
    expect(vraag).toHaveTextContent('concerts.deleteConfirm');
    expect(api.deleteConcert).not.toHaveBeenCalled();

    await gebruiker.click(within(vraag).getAllByRole('button', { name: 'common.delete' })[0]);

    await waitFor(() => expect(api.deleteConcert).toHaveBeenCalledWith('c1', expect.anything()));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  });

  it('verwijdert niets als de vraag geannuleerd wordt', async () => {
    const gebruiker = userEvent.setup();
    await toon();

    await gebruiker.click(screen.getByTestId('icon-trash').closest('button') as HTMLElement);
    await gebruiker.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'common.cancel' }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(api.deleteConcert).not.toHaveBeenCalled();
  });
});

describe('het detailvenster - het programma', () => {
  it('toont de programmaonderdelen met hun arrangeur', async () => {
    const gebruiker = userEvent.setup();
    await toon();
    const detail = await openDetail(gebruiker);

    expect(within(detail).getByText('Bolero')).toBeInTheDocument();
    expect(within(detail).getByText('Van Dijk')).toBeInTheDocument();
    // Ook de concertsoort komt uit de lijst met soorten, niet uit de kale waarde.
    expect(within(detail).getByText('Galaconcert')).toBeInTheDocument();
  });

  it('voegt een onderdeel toe met titel en arrangeur', async () => {
    const gebruiker = userEvent.setup();
    await toon();
    const detail = await openDetail(gebruiker);

    await gebruiker.click(within(detail).getByRole('button', { name: '+ concerts.addProgramItem' }));
    const formulier = venster('concerts.addProgramItem');
    await gebruiker.type(within(formulier).getByLabelText(/concerts.programTitle/), 'Finlandia');
    await gebruiker.type(within(formulier).getByLabelText('concerts.programArranger'), 'Sibelius');
    await gebruiker.click(within(formulier).getByRole('button', { name: 'common.save' }));

    await waitFor(() =>
      expect(api.addConcertProgramItem).toHaveBeenCalledWith('c1', {
        title: 'Finlandia',
        arranger: 'Sibelius',
        notes: undefined,
        partOfSet: undefined,
        musicTitleId: undefined,
      }),
    );
  });

  it('neemt titel en arrangeur over uit het repertoire zodra daar iets gekozen wordt', async () => {
    const gebruiker = userEvent.setup();
    await toon();
    const detail = await openDetail(gebruiker);

    await gebruiker.click(within(detail).getByRole('button', { name: '+ concerts.addProgramItem' }));
    const formulier = venster('concerts.addProgramItem');
    await gebruiker.selectOptions(within(formulier).getByLabelText('concerts.selectFromRepertoire'), '0');

    expect(within(formulier).getByLabelText<HTMLInputElement>(/concerts.programTitle/).value).toBe('Carmina Burana');
    expect(within(formulier).getByLabelText<HTMLInputElement>('concerts.programArranger').value).toBe('Orff');
  });

  it('laat de keuze uit het repertoire weer los', async () => {
    const gebruiker = userEvent.setup();
    await toon();
    const detail = await openDetail(gebruiker);

    await gebruiker.click(within(detail).getByRole('button', { name: '+ concerts.addProgramItem' }));
    const formulier = venster('concerts.addProgramItem');
    const keuze = within(formulier).getByLabelText<HTMLSelectElement>('concerts.selectFromRepertoire');
    await gebruiker.selectOptions(keuze, '0');
    await gebruiker.selectOptions(keuze, '');

    // De titel blijft staan, maar de koppeling met het repertoire is los.
    expect(within(formulier).getByLabelText<HTMLInputElement>(/concerts.programTitle/).value).toBe('Carmina Burana');
    expect(keuze.value).toBe('');
  });

  it('verwijdert een programmaonderdeel', async () => {
    const gebruiker = userEvent.setup();
    await toon();
    const detail = await openDetail(gebruiker);

    const rij = within(detail).getByText('Bolero').closest('tr') as HTMLElement;
    await gebruiker.click(within(rij).getByRole('button'));

    await waitFor(() => expect(api.deleteConcertProgramItem).toHaveBeenCalledWith('c1', 'pr1'));
  });

  it('exporteert het programma', async () => {
    const gebruiker = userEvent.setup();
    await toon();
    const detail = await openDetail(gebruiker);

    await gebruiker.click(within(detail).getByRole('button', { name: 'concerts.exportProgram' }));

    await waitFor(() => expect(api.exportConcertProgram).toHaveBeenCalledWith('c1', expect.anything()));
  });

  it('meldt het als er geen programma is', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(api.getConcert).mockResolvedValue({ ...CONCERT_DETAIL, program: [] });
    await toon();
    const detail = await openDetail(gebruiker);

    expect(within(detail).getByText('concerts.noProgramItems')).toBeInTheDocument();
    // Zonder programma is er ook niets uit te voeren.
    expect(within(detail).queryByText('concerts.performanceMode')).not.toBeInTheDocument();
  });
});

describe('het detailvenster - de uitvoeringsmodus', () => {
  it('start met de stukken van dit concert en is weer te verlaten', async () => {
    const gebruiker = userEvent.setup();
    await toon();
    const detail = await openDetail(gebruiker);

    await gebruiker.click(within(detail).getByRole('button', { name: /concerts.performanceMode/ }));

    const modus = screen.getByTestId('uitvoeringsmodus');
    expect(modus).toHaveTextContent('Zomerconcert');
    expect(modus).toHaveTextContent('Bolero');

    await gebruiker.click(screen.getByRole('button', { name: 'uitvoeringsmodus sluiten' }));
    expect(screen.queryByTestId('uitvoeringsmodus')).not.toBeInTheDocument();
  });
});

describe('het detailvenster - de media', () => {
  it('toont de bestaande media met hun soortnaam', async () => {
    const gebruiker = userEvent.setup();
    await toon();
    const detail = await openDetail(gebruiker);

    expect(within(detail).getByText('Foto')).toBeInTheDocument();
    expect(within(detail).getByRole('link', { name: 'Groepsfoto' })).toHaveAttribute(
      'href',
      'https://example.org/foto',
    );
  });

  it('voegt media toe', async () => {
    const gebruiker = userEvent.setup();
    await toon();
    const detail = await openDetail(gebruiker);

    await gebruiker.click(within(detail).getByRole('button', { name: '+ concerts.addMedia' }));
    const formulier = venster('concerts.addMedia');
    await gebruiker.selectOptions(within(formulier).getByLabelText(/concerts.mediaType/), 'video');
    await gebruiker.type(within(formulier).getByLabelText('concerts.mediaUrl'), 'https://example.org/film');
    await gebruiker.type(within(formulier).getByLabelText('concerts.mediaDescription'), 'Opname zaal');
    await gebruiker.click(within(formulier).getByRole('button', { name: 'common.save' }));

    await waitFor(() =>
      expect(api.addConcertMedia).toHaveBeenCalledWith('c1', {
        mediaType: 'video',
        url: 'https://example.org/film',
        description: 'Opname zaal',
      }),
    );
  });

  it('verwijdert media', async () => {
    const gebruiker = userEvent.setup();
    await toon();
    const detail = await openDetail(gebruiker);

    const kaartje = within(detail).getByText('Foto').closest('.card') as HTMLElement;
    await gebruiker.click(within(kaartje).getByRole('button'));

    await waitFor(() => expect(api.deleteConcertMedia).toHaveBeenCalledWith('c1', 'm1'));
  });

  it('meldt het als er geen media zijn', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(api.getConcert).mockResolvedValue({ ...CONCERT_DETAIL, media: [] });
    await toon();
    const detail = await openDetail(gebruiker);

    expect(within(detail).getByText('concerts.noMedia')).toBeInTheDocument();
  });
});

describe('het detailvenster - de bezetting', () => {
  it('toont wie er speelden, met instrument', async () => {
    const gebruiker = userEvent.setup();
    await toon();
    const detail = await openDetail(gebruiker);

    expect(within(detail).getByText('Anna Bakker')).toBeInTheDocument();
    expect(within(detail).getByText('Viool')).toBeInTheDocument();
  });

  it('voegt aangekruiste leden in één keer toe', async () => {
    const gebruiker = userEvent.setup();
    await toon();
    const detail = await openDetail(gebruiker);

    await gebruiker.click(within(detail).getByRole('button', { name: '+ concerts.bulkAddAttendance' }));
    const formulier = venster('concerts.bulkAddAttendance');
    await gebruiker.click(within(formulier).getByLabelText('Bram Cohen'));
    expect(within(formulier).getByText('1 geselecteerd')).toBeInTheDocument();

    await gebruiker.click(within(formulier).getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(api.addConcertAttendanceBulk).toHaveBeenCalledWith('c1', ['u2']));
  });

  it('haalt een vinkje er ook weer af', async () => {
    const gebruiker = userEvent.setup();
    await toon();
    const detail = await openDetail(gebruiker);

    await gebruiker.click(within(detail).getByRole('button', { name: '+ concerts.bulkAddAttendance' }));
    const formulier = venster('concerts.bulkAddAttendance');
    await gebruiker.click(within(formulier).getByLabelText('Bram Cohen'));
    await gebruiker.click(within(formulier).getByLabelText('Bram Cohen'));

    expect(within(formulier).getByText('0 geselecteerd')).toBeInTheDocument();
    await gebruiker.click(within(formulier).getByRole('button', { name: 'common.save' }));

    // Zonder aangekruiste leden gaat er niets naar de server.
    expect(api.addConcertAttendanceBulk).not.toHaveBeenCalled();
  });

  it('verwijdert iemand uit de bezetting', async () => {
    const gebruiker = userEvent.setup();
    await toon();
    const detail = await openDetail(gebruiker);

    const rij = within(detail).getByText('Anna Bakker').closest('tr') as HTMLElement;
    await gebruiker.click(within(rij).getByRole('button'));

    await waitFor(() => expect(api.deleteConcertAttendance).toHaveBeenCalledWith('c1', 'a1'));
  });

  it('haalt de opkomstvoorspelling op en toont de verwachting', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(api.getAttendancePrediction).mockResolvedValue({
      concert: { id: 'c1', name: 'Zomerconcert', date: '2026-07-01', concertType: null, location: null },
      prediction: {
        expectedAttendance: 42,
        totalMembers: 50,
        confidenceBreakdown: { highConfidenceYes: 30, highConfidenceNo: 5, uncertain: 15 },
        byInstrument: [],
      },
      members: [],
    });
    await toon();
    const detail = await openDetail(gebruiker);

    await gebruiker.click(within(detail).getByRole('button', { name: /concerts.prediction.viewPrediction/ }));

    await waitFor(() => expect(api.getAttendancePrediction).toHaveBeenCalledWith('c1'));
    const voorspelling = venster('concerts.prediction.title');
    expect(within(voorspelling).getByText('42')).toBeInTheDocument();
  });

  it('sluit het voorspellingsvenster weer als het ophalen mislukt', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(api.getAttendancePrediction).mockRejectedValue({
      response: { data: { error: 'te weinig geschiedenis' } },
    });
    await toon();
    const detail = await openDetail(gebruiker);

    await gebruiker.click(within(detail).getByRole('button', { name: /concerts.prediction.viewPrediction/ }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('te weinig geschiedenis'));
    expect(screen.queryByText('concerts.prediction.title', { selector: '.modal-title' })).not.toBeInTheDocument();
  });
});

describe('het detailvenster - de kaartsoorten', () => {
  it('toont de kaartsoort met prijs, voorraad en verkoopstatus', async () => {
    const gebruiker = userEvent.setup();
    await toon();
    const detail = await openDetail(gebruiker);

    const rij = (await within(detail).findByText('Voorverkoop')).closest('tr') as HTMLElement;
    expect(rij).toHaveTextContent('EUR 12.50');
    expect(rij).toHaveTextContent('40 / 100');
    expect(within(rij).getByText('tickets.onSale')).toBeInTheDocument();
  });

  it('noemt een uitverkochte kaartsoort uitverkocht', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(api.getConcertTickets).mockResolvedValue({
      concert: {
        id: 'c1',
        name: 'Zomerconcert',
        date: '2026-07-01',
        endDate: null,
        location: null,
        description: null,
        concertType: null,
      },
      ticketTypes: [{ ...KAARTSOORT, available: 0 }],
      paymentMethods: [],
    } as never);
    await toon();
    const detail = await openDetail(gebruiker);

    const rij = (await within(detail).findByText('Voorverkoop')).closest('tr') as HTMLElement;
    expect(within(rij).getByText('tickets.soldOut')).toBeInTheDocument();
  });

  it('maakt een kaartsoort aan met prijs en aantal als getal', async () => {
    const gebruiker = userEvent.setup();
    await toon();
    const detail = await openDetail(gebruiker);

    await gebruiker.click(within(detail).getByRole('button', { name: '+ tickets.addTicketType' }));
    const formulier = venster('tickets.addTicketType');
    await gebruiker.type(within(formulier).getByLabelText(/common.name/), 'Aan de kassa');
    await gebruiker.type(within(formulier).getByLabelText(/tickets.price/), '15');
    await gebruiker.type(within(formulier).getByLabelText(/tickets.quantity/), '50');
    await gebruiker.type(within(formulier).getByLabelText('tickets.ticketTypeServiceFee'), '1.25');
    await gebruiker.click(within(formulier).getByLabelText('tickets.showServiceFeeSeparate'));
    await gebruiker.click(within(formulier).getByRole('button', { name: 'common.save' }));

    await waitFor(() =>
      expect(api.createTicketType).toHaveBeenCalledWith('c1', {
        name: 'Aan de kassa',
        price: 15,
        quantity: 50,
        description: undefined,
        maxPerOrder: 10,
        saleStart: undefined,
        saleEnd: undefined,
        serviceFee: 1.25,
        showServiceFeeSeparate: true,
      }),
    );
    expect(showSuccess).toHaveBeenCalledWith('tickets.ticketTypeCreated');
  });

  it('meldt het als het aanmaken van een kaartsoort mislukt', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(api.createTicketType).mockRejectedValue(new Error('naam bestaat al'));
    await toon();
    const detail = await openDetail(gebruiker);

    await gebruiker.click(within(detail).getByRole('button', { name: '+ tickets.addTicketType' }));
    const formulier = venster('tickets.addTicketType');
    await gebruiker.type(within(formulier).getByLabelText(/common.name/), 'Aan de kassa');
    await gebruiker.type(within(formulier).getByLabelText(/tickets.price/), '15');
    await gebruiker.type(within(formulier).getByLabelText(/tickets.quantity/), '50');
    await gebruiker.click(within(formulier).getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('naam bestaat al'));
  });

  it('werkt een bestaande kaartsoort bij', async () => {
    const gebruiker = userEvent.setup();
    await toon();
    const detail = await openDetail(gebruiker);

    const rij = (await within(detail).findByText('Voorverkoop')).closest('tr') as HTMLElement;
    await gebruiker.click(within(rij).getByTestId('icon-pencil').closest('button') as HTMLElement);
    const formulier = venster('tickets.editTicketType');
    await gebruiker.clear(within(formulier).getByLabelText(/tickets.price/));
    await gebruiker.type(within(formulier).getByLabelText(/tickets.price/), '14');
    await gebruiker.click(within(formulier).getByRole('button', { name: 'common.save' }));

    await waitFor(() =>
      expect(api.updateTicketType).toHaveBeenCalledWith('k1', expect.objectContaining({ price: 14 })),
    );
    expect(showSuccess).toHaveBeenCalledWith('tickets.ticketTypeUpdated');
  });

  it('verwijdert een kaartsoort pas na bevestiging', async () => {
    const gebruiker = userEvent.setup();
    await toon();
    const detail = await openDetail(gebruiker);

    const rij = (await within(detail).findByText('Voorverkoop')).closest('tr') as HTMLElement;
    await gebruiker.click(within(rij).getByTestId('icon-trash').closest('button') as HTMLElement);
    const vraag = screen.getByRole('alertdialog');
    expect(api.deleteTicketType).not.toHaveBeenCalled();

    await gebruiker.click(within(vraag).getAllByRole('button', { name: 'common.delete' })[0]);

    await waitFor(() => expect(api.deleteTicketType).toHaveBeenCalledWith('k1'));
    expect(showSuccess).toHaveBeenCalledWith('tickets.ticketTypeDeleted');
  });

  it('kopieert de publieke verkooplink naar het klembord', async () => {
    const gebruiker = userEvent.setup();
    const schrijf = vi.fn().mockResolvedValue(undefined);
    // userEvent zet zelf een klembordstub neer; die wordt hier vervangen door
    // een eigen versie zodat te zien is wát er gekopieerd werd.
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: schrijf },
      configurable: true,
    });
    await toon();
    const detail = await openDetail(gebruiker);

    await gebruiker.click(await within(detail).findByRole('button', { name: 'tickets.copyUrl' }));

    expect(schrijf).toHaveBeenCalledWith(`${window.location.origin}/tickets/c1`);
    expect(showSuccess).toHaveBeenCalledWith('tickets.urlCopied');
  });

  it('biedt geen kopieerknop en geen link aan als er nog geen kaartsoorten zijn', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(api.getConcertTickets).mockResolvedValue({
      concert: {
        id: 'c1',
        name: 'Zomerconcert',
        date: '2026-07-01',
        endDate: null,
        location: null,
        description: null,
        concertType: null,
      },
      ticketTypes: [],
      paymentMethods: [],
    } as never);
    await toon();
    const detail = await openDetail(gebruiker);

    expect(within(detail).getByText('tickets.noTicketTypes')).toBeInTheDocument();
    expect(within(detail).queryByRole('button', { name: 'tickets.copyUrl' })).not.toBeInTheDocument();
  });
});

describe('de Buma/Stemra-opgave', () => {
  it('exporteert over de ingestelde periode en sluit daarna het venster', async () => {
    const gebruiker = userEvent.setup();
    await toon();

    await gebruiker.click(tabblad('concerts.statistics'));
    await gebruiker.click(await screen.findByRole('button', { name: 'concerts.bumaStemraExport' }));

    const formulier = venster('concerts.bumaStemraExport');
    await gebruiker.clear(within(formulier).getByLabelText('concerts.startDate'));
    await gebruiker.type(within(formulier).getByLabelText('concerts.startDate'), '2025-01-01');
    await gebruiker.clear(within(formulier).getByLabelText('concerts.endDateExport'));
    await gebruiker.type(within(formulier).getByLabelText('concerts.endDateExport'), '2025-12-31');
    await gebruiker.click(within(formulier).getByRole('button', { name: 'concerts.downloadExport' }));

    await waitFor(() =>
      expect(api.exportBumaStemra).toHaveBeenCalledWith(
        { startDate: '2025-01-01', endDate: '2025-12-31' },
        expect.anything(),
      ),
    );
    await waitFor(() =>
      expect(screen.queryByText('concerts.bumaStemraExport', { selector: '.modal-title' })).not.toBeInTheDocument(),
    );
  });
});

/**
 * Een geweigerde opslag liet een losse afwijzing achter.
 *
 * Alle verzendfuncties van deze pagina deden `await ...mutateAsync(...)` zonder
 * `catch`. Slaagt de aanroep, dan gaat het venster daarna dicht; wordt hij
 * geweigerd - een dubbele datum, een verlopen sessie - dan kwam de afwijzing
 * nergens terecht. De gebruiker zag de melding nog wel (die hangt aan de
 * `onError` van de mutatie), maar de browser meldde er "Uncaught (in promise)"
 * bij, en een foutenrapportage die op `unhandledrejection` luistert telt dat
 * als een storing.
 *
 * De reparatie staat in Concerts/index.tsx: elke verzendfunctie vangt de
 * afwijzing op en houdt haar venster open.
 *
 * Aangetoond: met Concerts/index.tsx teruggezet op HEAD (`git checkout HEAD --
 * src/pages/Concerts/index.tsx`) vallen de vier tests van dit blok om, en gaat
 * de hele bestandsuitvoer rood op "Unhandled Rejection". Met de reparatie erin
 * zijn ze groen.
 */
describe('een geweigerde opslag laat geen losse afwijzing achter', () => {
  it('bij het aanmaken van een concert', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(api.createConcert).mockRejectedValue(new Error('datum bezet'));
    await toon();

    await gebruiker.click(screen.getByRole('button', { name: '+ concerts.newConcert' }));
    const formulier = venster('concerts.newConcert');
    await gebruiker.type(within(formulier).getByLabelText(/concerts.concertName/), 'Kerstconcert');
    await gebruiker.type(within(formulier).getByLabelText(/^concerts.date/), '2026-12-20');
    await gebruiker.click(within(formulier).getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('datum bezet'));
    await laatAfwijzingenBinnenkomen();

    expect(losseAfwijzingen).toEqual([]);
    // En het venster blijft staan, zodat de invoer niet weg is.
    expect(screen.getByText('concerts.newConcert', { selector: '.modal-title' })).toBeInTheDocument();
  });

  it('bij het bewerken van een concert', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(api.updateConcert).mockRejectedValue(new Error('niet meer van jou'));
    await toon();

    await gebruiker.click(screen.getByTestId('icon-pencil').closest('button') as HTMLElement);
    const formulier = venster('concerts.edit');
    await gebruiker.click(within(formulier).getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('niet meer van jou'));
    await laatAfwijzingenBinnenkomen();

    expect(losseAfwijzingen).toEqual([]);
    expect(screen.getByText('concerts.edit', { selector: '.modal-title' })).toBeInTheDocument();
  });

  it('bij het verwijderen van een concert', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(api.deleteConcert).mockRejectedValue(new Error('er hangen kaarten aan'));
    await toon();

    await gebruiker.click(screen.getByTestId('icon-trash').closest('button') as HTMLElement);
    await gebruiker.click(within(screen.getByRole('alertdialog')).getAllByRole('button', { name: 'common.delete' })[0]);

    await waitFor(() => expect(showError).toHaveBeenCalledWith('er hangen kaarten aan'));
    await laatAfwijzingenBinnenkomen();

    expect(losseAfwijzingen).toEqual([]);
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  it('bij het toevoegen van een programmaonderdeel', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(api.addConcertProgramItem).mockRejectedValue(new Error('titel te lang'));
    await toon();
    const detail = await openDetail(gebruiker);

    await gebruiker.click(within(detail).getByRole('button', { name: '+ concerts.addProgramItem' }));
    const formulier = venster('concerts.addProgramItem');
    await gebruiker.type(within(formulier).getByLabelText(/concerts.programTitle/), 'Finlandia');
    await gebruiker.click(within(formulier).getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('titel te lang'));
    await laatAfwijzingenBinnenkomen();

    expect(losseAfwijzingen).toEqual([]);
    expect(screen.getByText('concerts.addProgramItem', { selector: '.modal-title' })).toBeInTheDocument();
  });
});

describe('het detailvenster sluiten', () => {
  it('gaat dicht met de sluitknop', async () => {
    const gebruiker = userEvent.setup();
    await toon();
    const detail = await openDetail(gebruiker);

    await gebruiker.click(within(detail).getByRole('button', { name: 'accessibility.closeModal' }));

    expect(screen.queryByText('Zomerconcert', { selector: '.modal-title' })).not.toBeInTheDocument();
  });
});
