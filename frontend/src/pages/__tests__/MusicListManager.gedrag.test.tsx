/**
 * Wat een bibliothecaris in het lijstenbeheer doet, en wat er dan gebeurt.
 *
 * Het bestaande MusicListManager.labels.test.tsx dekt de twee formuliervensters
 * af. De rest van de pagina - lijsten aanmaken, hernoemen, aan- en uitzetten,
 * verplaatsen, verwijderen, titels toevoegen en eraf halen, het programmaboekje
 * exporteren - bleef ongetest, en dat is waar de knoppen zitten.
 *
 * Twee dingen worden hier nagerekend in plaats van alleen bekeken:
 *   - De volgorde die bij het verplaatsen naar de server gaat. Een pijltje dat
 *     wel iets op het scherm verschuift maar de verkeerde volgorde opstuurt,
 *     ziet er goed uit tot de volgende keer laden.
 *   - De speelduur onder een lijstnaam. `formatDuration` maakt van 3725
 *     seconden "1:02:05"; wie daar per ongeluk minuten voor seconden aanziet,
 *     ziet nog steeds een geloofwaardige tijd staan.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import MusicListManager from '../MusicListManager';
import * as api from '../../api';
import { showSuccess, showError } from '../../utils/toast';
import type { MusicList, MusicPiece, MusicTitle } from '../../types';

vi.mock('../../api');

vi.mock('../../hooks/useDocumentTitle', () => ({ useDocumentTitle: () => {} }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (sleutel: string) => sleutel, i18n: { language: 'nl' } }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('../../components/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

vi.mock('../../utils/toast', () => ({ showSuccess: vi.fn(), showError: vi.fn() }));

// Het metadatavenster haalt zelf woordenlijsten en musica-info op en heeft een
// eigen test. Hier gaat het er alleen om welk stuk de pagina eraan meegeeft en
// wat ze met het opgeslagen resultaat doet.
vi.mock('../../components/TitleMetadataModal', () => ({
  TitleMetadataModal: ({
    title,
    onSave,
    onClose,
  }: {
    title: { title: string };
    onSave: (data: unknown) => void;
    onClose: () => void;
  }) => (
    <div data-testid="metadatavenster">
      <span>{title.title}</span>
      <button
        onClick={() =>
          onSave({
            youtubeUrl: null,
            description: null,
            durationSeconds: 245,
            grade: null,
            genreIds: [],
            isShared: false,
            internalNotes: null,
          })
        }
      >
        bewaar-metadata
      </button>
      <button onClick={onClose}>sluit-metadata</button>
    </div>
  ),
}));

function stuk(titel: string, id: string): MusicPiece {
  return {
    id,
    title: titel,
    arranger: null,
    tuning: null,
    groupNumber: null,
    clef: null,
    youtubeUrl: null,
    originalFilename: `${id}.pdf`,
    instrumentId: null,
    instrumentName: null,
  };
}

function titel(overschrijf: Partial<MusicTitle> = {}): MusicTitle {
  return {
    title: 'Bolero',
    arranger: null,
    pieceCount: 2,
    youtubeUrl: null,
    description: null,
    durationSeconds: 0,
    instruments: ['Klarinet'],
    onList: false,
    ...overschrijf,
  };
}

function lijst(overschrijf: Partial<MusicList> = {}): MusicList {
  return {
    id: 'lijst-1',
    name: 'Voorjaarsconcert',
    orchestraId: 'orkest-1',
    listType: 'regular',
    isActive: true,
    titleCount: 0,
    totalDuration: 0,
    ...overschrijf,
  };
}

/** Toont het adres, zodat een test kan zien waar de pagina naartoe navigeert. */
function Adres() {
  const plek = useLocation();
  return <span data-testid="adres">{plek.pathname}</span>;
}

/**
 * Tekent de pagina op een echt adres.
 *
 * `useParams` levert `orchestraId` en `listId`, en die sturen drie van de vijf
 * queries aan. Zonder route eromheen zijn ze leeg en blijft de rechterkolom op
 * "kies een lijst" staan - dan is er niets te testen.
 */
function wikkelOp(pad: string) {
  return function wikkel({ children }: { children: ReactNode }) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    return (
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[pad]}>
          <Adres />
          <Routes>
            <Route path="/lists" element={children} />
            <Route path="/lists/:orchestraId/:listId" element={children} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
  };
}

function zetApiKlaar(): void {
  for (const naam of Object.keys(api)) {
    const functie = (api as Record<string, unknown>)[naam];
    if (typeof functie === 'function') {
      vi.mocked(functie as (...args: unknown[]) => unknown).mockResolvedValue(undefined);
    }
  }
  vi.mocked(api.getOrchestras).mockResolvedValue([
    { id: 'orkest-1', name: 'Harmonie' },
    { id: 'orkest-2', name: 'Fanfare' },
  ] as never);
  vi.mocked(api.getGenres).mockResolvedValue([{ id: 'genre-1', name: 'Filmmuziek' }]);
  vi.mocked(api.getMusicLists).mockResolvedValue([lijst()] as never);
  vi.mocked(api.getMusicList).mockResolvedValue({ ...lijst(), pieces: [] } as never);
  vi.mocked(api.getMusicTitles).mockResolvedValue([]);
  vi.mocked(api.addTitleToList).mockResolvedValue({ added: 0, total: 0 });
  vi.mocked(api.toggleMusicListActive).mockResolvedValue({ isActive: false });
}

let meldingen: string[];

beforeEach(() => {
  vi.clearAllMocks();
  zetApiKlaar();
  meldingen = [];
  vi.stubGlobal('alert', (tekst: string) => {
    meldingen.push(tekst);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('lijstenbeheer - orkesten en lijsten kiezen', () => {
  it('kiest bij binnenkomst zonder orkest in het adres het eerste orkest', async () => {
    render(<MusicListManager />, { wrapper: wikkelOp('/lists') });

    await waitFor(() => expect(api.getMusicLists).toHaveBeenCalledWith('orkest-1'));
  });

  it('haalt de lijsten van het orkest op waar je op klikt, en keert terug naar het overzicht', async () => {
    const gebruiker = userEvent.setup();
    render(<MusicListManager />, { wrapper: wikkelOp('/lists/orkest-1/lijst-1') });

    await gebruiker.click(await screen.findByText('Fanfare'));

    await waitFor(() => expect(api.getMusicLists).toHaveBeenCalledWith('orkest-2'));
    expect(screen.getByTestId('adres')).toHaveTextContent('/lists');
  });

  it('opent een lijst op zijn eigen adres', async () => {
    const gebruiker = userEvent.setup();
    render(<MusicListManager />, { wrapper: wikkelOp('/lists') });

    await gebruiker.click(await screen.findByText('Voorjaarsconcert'));

    expect(screen.getByTestId('adres')).toHaveTextContent('/lists/orkest-1/lijst-1');
  });

  it('meldt het als het orkest nog geen lijsten heeft', async () => {
    vi.mocked(api.getMusicLists).mockResolvedValue([]);
    render(<MusicListManager />, { wrapper: wikkelOp('/lists') });

    expect(await screen.findByText('lists.noLists')).toBeInTheDocument();
  });

  it('rekent de speelduur onder de lijstnaam uit in uren, minuten en seconden', async () => {
    vi.mocked(api.getMusicLists).mockResolvedValue([
      lijst({ titleCount: 4, totalDuration: 3725, concertDate: '2026-05-17' }),
    ] as never);

    render(<MusicListManager />, { wrapper: wikkelOp('/lists') });

    // 3725 seconden is 1:02:05, niet 62:05 en niet 3725.
    const regel = await screen.findByText(/lists.titles/);
    expect(regel).toHaveTextContent('4 lists.titles • 1:02:05');
  });

  it('zet een streepje neer waar een lijst nog geen speelduur heeft', async () => {
    render(<MusicListManager />, { wrapper: wikkelOp('/lists') });

    expect(await screen.findByText(/0 lists.titles • -/)).toBeInTheDocument();
  });

  it('merkt een concertlijst en een uitgezette lijst met een label', async () => {
    vi.mocked(api.getMusicLists).mockResolvedValue([
      lijst({ id: 'lijst-2', name: 'Kerstconcert', listType: 'concert', isActive: false }),
    ] as never);

    render(<MusicListManager />, { wrapper: wikkelOp('/lists') });

    expect(await screen.findByText('lists.typeConcert')).toBeInTheDocument();
    expect(screen.getByText('lists.inactive')).toBeInTheDocument();
  });
});

describe('lijstenbeheer - lijst aanmaken, hernoemen en verwijderen', () => {
  it('maakt een gewone lijst aan zonder concertgegevens', async () => {
    const gebruiker = userEvent.setup();
    render(<MusicListManager />, { wrapper: wikkelOp('/lists') });

    await gebruiker.click(await screen.findByRole('button', { name: '+' }));
    await gebruiker.type(screen.getByLabelText('common.name'), 'Zomerserenade');
    await gebruiker.click(screen.getByRole('button', { name: 'common.add' }));

    await waitFor(() =>
      expect(api.createMusicList).toHaveBeenCalledWith('Zomerserenade', 'orkest-1', {
        listType: 'regular',
        concertDate: null,
        concertLocation: null,
      }),
    );
    await waitFor(() => expect(screen.queryByLabelText('common.name')).not.toBeInTheDocument());
  });

  it('stuurt datum en locatie mee bij een concertlijst', async () => {
    const gebruiker = userEvent.setup();
    render(<MusicListManager />, { wrapper: wikkelOp('/lists') });

    await gebruiker.click(await screen.findByRole('button', { name: '+' }));
    await gebruiker.type(screen.getByLabelText('common.name'), 'Kerstconcert');
    await gebruiker.selectOptions(screen.getByLabelText('lists.listType'), 'concert');
    await gebruiker.type(screen.getByLabelText('lists.concertDate'), '2026-12-20');
    await gebruiker.type(screen.getByLabelText('lists.concertLocation'), 'Grote Kerk');
    await gebruiker.click(screen.getByRole('button', { name: 'common.add' }));

    await waitFor(() =>
      expect(api.createMusicList).toHaveBeenCalledWith('Kerstconcert', 'orkest-1', {
        listType: 'concert',
        concertDate: '2026-12-20',
        concertLocation: 'Grote Kerk',
      }),
    );
  });

  it('meldt de fout van de server en houdt het venster open', async () => {
    vi.mocked(api.createMusicList).mockRejectedValue({ response: { data: { error: 'naam bestaat al' } } });
    const gebruiker = userEvent.setup();
    render(<MusicListManager />, { wrapper: wikkelOp('/lists') });

    await gebruiker.click(await screen.findByRole('button', { name: '+' }));
    await gebruiker.type(screen.getByLabelText('common.name'), 'Voorjaarsconcert');
    await gebruiker.click(screen.getByRole('button', { name: 'common.add' }));

    await waitFor(() => expect(meldingen).toContain('naam bestaat al'));
    expect(screen.getByLabelText('common.name')).toBeInTheDocument();
  });

  it('hernoemt een lijst met de nieuwe naam en het nieuwe soort', async () => {
    const gebruiker = userEvent.setup();
    render(<MusicListManager />, { wrapper: wikkelOp('/lists') });

    await gebruiker.click(await screen.findByTitle('lists.rename'));
    await gebruiker.clear(screen.getByLabelText('common.name'));
    await gebruiker.type(screen.getByLabelText('common.name'), 'Lentefeest');
    await gebruiker.selectOptions(screen.getByLabelText('lists.listType'), 'concert');
    await gebruiker.type(screen.getByLabelText('lists.concertLocation'), 'Dorpshuis');
    await gebruiker.click(screen.getByRole('button', { name: 'common.save' }));

    await waitFor(() =>
      expect(api.updateMusicList).toHaveBeenCalledWith('lijst-1', {
        name: 'Lentefeest',
        listType: 'concert',
        concertDate: null,
        concertLocation: 'Dorpshuis',
      }),
    );
  });

  it('vraagt om bevestiging voor het verwijderen en verwijdert pas daarna', async () => {
    const gebruiker = userEvent.setup();
    render(<MusicListManager />, { wrapper: wikkelOp('/lists') });

    await gebruiker.click(await screen.findByTitle('common.delete'));

    expect(await screen.findByText('lists.deleteListTitle')).toBeInTheDocument();
    expect(api.deleteMusicList).not.toHaveBeenCalled();

    const venster = screen.getByRole('alertdialog');
    await gebruiker.click(within(venster).getByRole('button', { name: 'common.delete' }));

    await waitFor(() => expect(api.deleteMusicList).toHaveBeenCalledWith('lijst-1'));
    expect(showSuccess).toHaveBeenCalledWith('lists.deleted');
  });

  it('meldt het als verwijderen mislukt en houdt de lijst staan', async () => {
    vi.mocked(api.deleteMusicList).mockRejectedValue({ response: { data: { error: 'lijst is in gebruik' } } });
    const gebruiker = userEvent.setup();
    render(<MusicListManager />, { wrapper: wikkelOp('/lists') });

    await gebruiker.click(await screen.findByTitle('common.delete'));
    const venster = await screen.findByRole('alertdialog');
    await gebruiker.click(within(venster).getByRole('button', { name: 'common.delete' }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('lijst is in gebruik'));
    expect(screen.getByText('Voorjaarsconcert')).toBeInTheDocument();
  });
});

describe('lijstenbeheer - volgorde en zichtbaarheid', () => {
  it('stuurt de omgewisselde volgorde op als je een lijst omlaag zet', async () => {
    vi.mocked(api.getMusicLists).mockResolvedValue([
      lijst({ id: 'lijst-1', name: 'Eerste' }),
      lijst({ id: 'lijst-2', name: 'Tweede' }),
    ] as never);
    const gebruiker = userEvent.setup();
    render(<MusicListManager />, { wrapper: wikkelOp('/lists') });

    const omlaag = await screen.findAllByTitle('lists.moveDown');
    await gebruiker.click(omlaag[0]);

    // Niet alleen "er is iets opgestuurd": de volgorde zelf moet omgedraaid zijn.
    await waitFor(() => expect(api.reorderMusicLists).toHaveBeenCalledWith('orkest-1', ['lijst-2', 'lijst-1']));
  });

  it('zet de pijltjes uit aan de uiteinden van de lijst', async () => {
    vi.mocked(api.getMusicLists).mockResolvedValue([
      lijst({ id: 'lijst-1', name: 'Eerste' }),
      lijst({ id: 'lijst-2', name: 'Tweede' }),
    ] as never);
    render(<MusicListManager />, { wrapper: wikkelOp('/lists') });

    const omhoog = await screen.findAllByTitle('lists.moveUp');
    const omlaag = screen.getAllByTitle('lists.moveDown');
    expect(omhoog[0]).toBeDisabled();
    expect(omlaag[1]).toBeDisabled();
  });

  it('meldt het als de server de nieuwe volgorde weigert', async () => {
    vi.mocked(api.getMusicLists).mockResolvedValue([
      lijst({ id: 'lijst-1', name: 'Eerste' }),
      lijst({ id: 'lijst-2', name: 'Tweede' }),
    ] as never);
    vi.mocked(api.reorderMusicLists).mockRejectedValue({ response: { data: { error: 'volgorde geweigerd' } } });
    const gebruiker = userEvent.setup();
    render(<MusicListManager />, { wrapper: wikkelOp('/lists') });

    const omlaag = await screen.findAllByTitle('lists.moveDown');
    await gebruiker.click(omlaag[0]);

    await waitFor(() => expect(meldingen).toContain('volgorde geweigerd'));
  });

  it('zet een lijst aan of uit via de vinkknop', async () => {
    const gebruiker = userEvent.setup();
    render(<MusicListManager />, { wrapper: wikkelOp('/lists') });

    await gebruiker.click(await screen.findByTitle('lists.activeToggle'));

    await waitFor(() => expect(api.toggleMusicListActive).toHaveBeenCalledWith('lijst-1'));
  });

  it('meldt het als aan- of uitzetten mislukt', async () => {
    vi.mocked(api.toggleMusicListActive).mockRejectedValue({ response: { data: { error: 'niet toegestaan' } } });
    const gebruiker = userEvent.setup();
    render(<MusicListManager />, { wrapper: wikkelOp('/lists') });

    await gebruiker.click(await screen.findByTitle('lists.activeToggle'));

    await waitFor(() => expect(meldingen).toContain('niet toegestaan'));
  });
});

describe('lijstenbeheer - programmaboekje', () => {
  it('biedt de pdf-knop alleen bij een concertlijst aan', async () => {
    render(<MusicListManager />, { wrapper: wikkelOp('/lists') });

    await screen.findByText('Voorjaarsconcert');
    expect(screen.queryByTitle('lists.exportPdf')).not.toBeInTheDocument();
  });

  it('haalt de pdf op en biedt hem aan onder de naam van de lijst', async () => {
    vi.mocked(api.getMusicLists).mockResolvedValue([
      lijst({ name: 'Kerst: concert 2026!', listType: 'concert' }),
    ] as never);
    vi.mocked(api.downloadProgramPdf).mockResolvedValue(new Blob(['pdf']));
    const maak = vi.fn(() => 'blob:pdf');
    const ruim = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL: maak, revokeObjectURL: ruim });

    const gebruiker = userEvent.setup();
    render(<MusicListManager />, { wrapper: wikkelOp('/lists') });

    await gebruiker.click(await screen.findByTitle('lists.exportPdf'));

    await waitFor(() => expect(api.downloadProgramPdf).toHaveBeenCalledWith('lijst-1'));
    expect(maak).toHaveBeenCalled();
    // De dubbele punt en het uitroepteken kunnen niet in een bestandsnaam.
    expect(ruim).toHaveBeenCalledWith('blob:pdf');
  });

  it('meldt het als de pdf niet gemaakt kan worden', async () => {
    vi.mocked(api.getMusicLists).mockResolvedValue([lijst({ listType: 'concert' })] as never);
    vi.mocked(api.downloadProgramPdf).mockRejectedValue({ response: { data: { error: 'geen stukken' } } });
    const gebruiker = userEvent.setup();
    render(<MusicListManager />, { wrapper: wikkelOp('/lists') });

    await gebruiker.click(await screen.findByTitle('lists.exportPdf'));

    await waitFor(() => expect(meldingen).toContain('geen stukken'));
  });
});

describe('lijstenbeheer - titels op een geopende lijst', () => {
  beforeEach(() => {
    vi.mocked(api.getMusicList).mockResolvedValue({
      ...lijst(),
      pieces: [stuk('Bolero', 'p-1'), stuk('Bolero', 'p-2'), stuk('Carmen', 'p-3')],
    } as never);
    vi.mocked(api.getMusicTitles).mockResolvedValue([
      titel({ title: 'Bolero', onList: true, pieceCount: 2, durationSeconds: 905 }),
      titel({ title: 'Carmen', onList: true, pieceCount: 1 }),
      titel({
        title: 'Also sprach Zarathustra',
        arranger: 'Strauss',
        onList: false,
        pieceCount: 3,
        durationSeconds: 125,
        instruments: ['Hoorn', 'Tuba'],
        genres: [{ id: 'genre-1', name: 'Filmmuziek' }],
      }),
    ]);
  });

  it('telt de titels op de lijst, niet de losse partijen', async () => {
    render(<MusicListManager />, { wrapper: wikkelOp('/lists/orkest-1/lijst-1') });

    // Drie partijen, twee titels.
    expect(await screen.findByText('lists.onThisList (2 lists.titles)')).toBeInTheDocument();
  });

  it('zet bij een titel op de lijst het aantal partijen en de speelduur', async () => {
    render(<MusicListManager />, { wrapper: wikkelOp('/lists/orkest-1/lijst-1') });

    const bolero = (await screen.findByText('Bolero')).parentElement!;
    // 905 seconden is 15:05.
    expect(bolero).toHaveTextContent('(2 lists.parts) • 15:05');
  });

  it('toont bij een beschikbare titel de arrangeur, de bezetting en het genre', async () => {
    render(<MusicListManager />, { wrapper: wikkelOp('/lists/orkest-1/lijst-1') });

    const rij = (await screen.findByText('Also sprach Zarathustra')).closest('div')!.parentElement!;
    expect(rij).toHaveTextContent('- Strauss');
    expect(rij).toHaveTextContent('2:05');
    expect(rij).toHaveTextContent('3 lists.parts • Hoorn, Tuba');
    expect(within(rij).getByText('Filmmuziek')).toBeInTheDocument();
  });

  it('laat titels die al op de lijst staan weg uit de beschikbare stukken', async () => {
    render(<MusicListManager />, { wrapper: wikkelOp('/lists/orkest-1/lijst-1') });

    await screen.findByText('lists.availablePieces');
    // Bolero staat boven bij "op deze lijst", niet nog eens onder "beschikbaar".
    expect(screen.getAllByText('Bolero')).toHaveLength(1);
  });

  it('voegt een titel toe en meldt hoeveel partijen erbij kwamen', async () => {
    vi.mocked(api.addTitleToList).mockResolvedValue({ added: 3, total: 5 });
    const gebruiker = userEvent.setup();
    render(<MusicListManager />, { wrapper: wikkelOp('/lists/orkest-1/lijst-1') });

    await gebruiker.click(await screen.findByRole('button', { name: 'common.add' }));

    await waitFor(() => expect(api.addTitleToList).toHaveBeenCalledWith('lijst-1', 'Also sprach Zarathustra'));
    // Het getal in de melding is niet "een paar": 3 van de 5 partijen kwamen erbij.
    expect(meldingen).toContain('3 van 5 partijen toegevoegd.');
  });

  it('meldt de fout als toevoegen mislukt', async () => {
    vi.mocked(api.addTitleToList).mockRejectedValue({ response: { data: { error: 'titel bestaat niet' } } });
    const gebruiker = userEvent.setup();
    render(<MusicListManager />, { wrapper: wikkelOp('/lists/orkest-1/lijst-1') });

    await gebruiker.click(await screen.findByRole('button', { name: 'common.add' }));

    await waitFor(() => expect(meldingen).toContain('titel bestaat niet'));
  });

  it('vraagt om bevestiging voor het eraf halen en haalt het er pas daarna af', async () => {
    const gebruiker = userEvent.setup();
    render(<MusicListManager />, { wrapper: wikkelOp('/lists/orkest-1/lijst-1') });

    const knoppen = await screen.findAllByRole('button', { name: 'lists.remove' });
    await gebruiker.click(knoppen[0]);

    const venster = await screen.findByRole('alertdialog');
    expect(api.removeTitleFromList).not.toHaveBeenCalled();

    await gebruiker.click(within(venster).getByRole('button', { name: 'lists.remove' }));

    await waitFor(() => expect(api.removeTitleFromList).toHaveBeenCalledWith('lijst-1', 'Bolero'));
    expect(showSuccess).toHaveBeenCalledWith('lists.titleRemoved');
  });

  it('meldt het als eraf halen mislukt', async () => {
    vi.mocked(api.removeTitleFromList).mockRejectedValue({ response: { data: { error: 'staat vast' } } });
    const gebruiker = userEvent.setup();
    render(<MusicListManager />, { wrapper: wikkelOp('/lists/orkest-1/lijst-1') });

    const knoppen = await screen.findAllByRole('button', { name: 'lists.remove' });
    await gebruiker.click(knoppen[0]);
    const venster = await screen.findByRole('alertdialog');
    await gebruiker.click(within(venster).getByRole('button', { name: 'lists.remove' }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('staat vast'));
  });

  it('bewaart de metadata van de aangeklikte titel met titel en arrangeur erbij', async () => {
    const gebruiker = userEvent.setup();
    render(<MusicListManager />, { wrapper: wikkelOp('/lists/orkest-1/lijst-1') });

    await screen.findByText('Also sprach Zarathustra');
    // De potloden staan zowel boven (op de lijst) als onder (beschikbaar); de
    // laatste hoort bij Also sprach Zarathustra.
    const potloden = screen.getAllByTitle('Bewerk metadata');
    await gebruiker.click(potloden[potloden.length - 1]);

    const venster = await screen.findByTestId('metadatavenster');
    expect(within(venster).getByText('Also sprach Zarathustra')).toBeInTheDocument();

    await gebruiker.click(within(venster).getByRole('button', { name: 'bewaar-metadata' }));

    await waitFor(() =>
      expect(api.updateTitleMeta).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Also sprach Zarathustra', arranger: 'Strauss', durationSeconds: 245 }),
      ),
    );
    await waitFor(() => expect(screen.queryByTestId('metadatavenster')).not.toBeInTheDocument());
  });

  it('geeft de zoekterm en het genre door aan de server', async () => {
    const gebruiker = userEvent.setup();
    render(<MusicListManager />, { wrapper: wikkelOp('/lists/orkest-1/lijst-1') });

    await gebruiker.type(await screen.findByPlaceholderText('lists.searchPieces'), 'bol');
    await waitFor(() =>
      expect(api.getMusicTitles).toHaveBeenCalledWith({ search: 'bol', listId: 'lijst-1', genreId: undefined }),
    );

    await gebruiker.selectOptions(screen.getByRole('combobox'), 'genre-1');
    await waitFor(() =>
      expect(api.getMusicTitles).toHaveBeenCalledWith({ search: 'bol', listId: 'lijst-1', genreId: 'genre-1' }),
    );
  });

  /**
   * BEWIJS. Vóór de reparatie in MusicListManager.tsx faalt deze test.
   *
   * De regels onder "op deze lijst" komen uit `selectedList.pieces`, maar de
   * knoppen erachter hangen aan `titles.find(...)` - en `titles` is de
   * gefilterde uitkomst van het zoekveld ernaast. Zoekt de bibliothecaris op
   * iets anders, dan vindt die `find` niets meer, en dan doet de knop "eraf
   * halen" niets: geen venster, geen verzoek, geen foutmelding. De knop staat
   * er nog wel.
   *
   * Dat is precies het soort stilte waar niemand achter komt: de gebruiker
   * klikt, er gebeurt niets, en hij klikt nog eens.
   *
   * De reparatie laat de knop met de titel uit de lijst zelf werken, want meer
   * dan die titel heeft `removeTitleFromList` nooit nodig gehad.
   */
  it('haalt een titel er ook af terwijl er een zoekterm in het veld staat', async () => {
    const gebruiker = userEvent.setup();
    render(<MusicListManager />, { wrapper: wikkelOp('/lists/orkest-1/lijst-1') });

    await screen.findByText('lists.onThisList (2 lists.titles)');

    // De server vindt niets bij deze zoekterm - Bolero valt buiten de uitkomst.
    vi.mocked(api.getMusicTitles).mockResolvedValue([]);
    await gebruiker.type(screen.getByPlaceholderText('lists.searchPieces'), 'zzz');
    await waitFor(() => expect(screen.getByText('lists.noResults')).toBeInTheDocument());

    // Bolero staat er nog steeds, want die komt uit de lijst zelf.
    const knoppen = screen.getAllByRole('button', { name: 'lists.remove' });
    await gebruiker.click(knoppen[0]);

    const venster = await screen.findByRole('alertdialog');
    await gebruiker.click(within(venster).getByRole('button', { name: 'lists.remove' }));

    await waitFor(() => expect(api.removeTitleFromList).toHaveBeenCalledWith('lijst-1', 'Bolero'));
  });

  /**
   * BEWIJS. Vóór de reparatie in MusicListManager.tsx faalt deze test.
   *
   * De lege plek onder "beschikbare stukken" keek alleen naar het zoekveld. Wie
   * op genre filterde en niets overhield, kreeg "alle titels staan al op de
   * lijst" te lezen - een mededeling die niet klopt en die de bibliothecaris
   * naar de verkeerde plek stuurt: hij gaat titels zoeken die er wel zijn maar
   * buiten zijn filter vallen.
   */
  it('zegt "niets gevonden" en niet "alles staat er al" als het genrefilter niets oplevert', async () => {
    const gebruiker = userEvent.setup();
    render(<MusicListManager />, { wrapper: wikkelOp('/lists/orkest-1/lijst-1') });

    await screen.findByText('lists.availablePieces');

    vi.mocked(api.getMusicTitles).mockResolvedValue([]);
    await gebruiker.selectOptions(screen.getByRole('combobox'), 'genre-1');

    expect(await screen.findByText('lists.noResults')).toBeInTheDocument();
    expect(screen.queryByText('lists.allOnList')).not.toBeInTheDocument();
  });

  it('zegt wél "alles staat er al" als er niet gefilterd is', async () => {
    vi.mocked(api.getMusicTitles).mockResolvedValue([titel({ title: 'Bolero', onList: true })]);
    render(<MusicListManager />, { wrapper: wikkelOp('/lists/orkest-1/lijst-1') });

    expect(await screen.findByText('lists.allOnList')).toBeInTheDocument();
  });
});

describe('lijstenbeheer - toestanden zonder inhoud', () => {
  it('toont skeletten zolang de orkesten nog niet binnen zijn', () => {
    vi.mocked(api.getOrchestras).mockReturnValue(new Promise(() => {}) as never);
    render(<MusicListManager />, { wrapper: wikkelOp('/lists') });

    expect(screen.getByText('lists.manageTitle')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '+' })).not.toBeInTheDocument();
  });

  it('vraagt om een lijst te kiezen zolang er geen open staat', async () => {
    render(<MusicListManager />, { wrapper: wikkelOp('/lists') });

    expect(await screen.findByText('lists.selectListToAdd')).toBeInTheDocument();
  });
});
