/**
 * Eerste tests voor de pagina "Mijn muziek".
 *
 * MyMusic.tsx is 741 regels en was tot nu toe nergens door een test
 * aangeraakt. De pagina heeft twee gezichten: zonder `listId` in de url een
 * overzicht van alle muzieklijsten, gegroepeerd per orkest, en met `listId`
 * één lijst met de partijen per titel uitklapbaar eronder.
 *
 * Deze tests beschrijven wat de gebruiker ziet en doet: welke lijsten er
 * staan en onder welk orkest, wat er gebeurt als er niets is, wat er gebeurt
 * als de server niet antwoordt, en of downloaden, offline zetten en bekijken
 * de juiste partij te pakken hebben.
 *
 * Drie dingen zijn hier bewust vastgelegd omdat ze zonder test onzichtbaar
 * zijn:
 *   - De scheiding tussen orkesten. De lijsten van het ene orkest horen niet
 *     onder de kop van het andere te staan; die groepering gebeurt in de
 *     pagina zelf en is met het blote oog niet van een toevallige volgorde te
 *     onderscheiden.
 *   - Welk id er met een download meegaat. Een verschuiving in de tabel geeft
 *     de gebruiker stilzwijgend de partij van een ander instrument.
 *   - Dat de kijker eerst in de offline-cache kijkt. Zonder test verdwijnt dat
 *     ongemerkt en haalt elke blik op een partij het bestand opnieuw op.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import MyMusic from '../MyMusic';
import * as api from '../../api';
import * as pdfCache from '../../lib/pdfCache';
import { showError, showSuccess } from '../../utils/toast';
import type { MusicList, MusicPiece } from '../../types';

vi.mock('../../api');
vi.mock('../../lib/pdfCache');

vi.mock('../../hooks/useDocumentTitle', () => ({ useDocumentTitle: () => {} }));

// `initReactI18next` hoort erbij omdat de pagina via andere modules de echte
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

// De veegcontainer luistert naar aanraakgebaren; voor deze tests telt alleen
// dat wat erin staat gewoon getekend wordt.
vi.mock('../../components/SwipeContainer', () => ({
  SwipeContainer: ({ children }: { children: ReactNode }) => <div data-testid="veegcontainer">{children}</div>,
}));

interface VeegItem {
  id: string;
  title: string;
  subtitle?: string;
  metadata?: string;
}

vi.mock('../../components/SwipeableMusicList', () => ({
  SwipeableMusicList: ({
    items,
    renderItem,
  }: {
    items: VeegItem[];
    renderItem: (item: VeegItem, index: number, isActive: boolean) => ReactNode;
  }) => (
    <div data-testid="veeglijst">
      {items.map((item, index) => (
        <div key={item.id}>{renderItem(item, index, index === 0)}</div>
      ))}
    </div>
  ),
  MusicCard: ({ item, onAction, actionLabel }: { item: VeegItem; onAction: () => void; actionLabel: string }) => (
    <div>
      <span>{item.title}</span>
      <button onClick={onAction}>{actionLabel}</button>
    </div>
  ),
}));

vi.mock('../../components/PdfViewer', () => ({
  PdfViewer: ({ url, musicPieceId }: { url: string; musicPieceId: string }) => (
    <div data-testid="pdf-kijker" data-url={url} data-partij={musicPieceId} />
  ),
}));

vi.mock('../../components/ReportIssueModal', () => ({
  ReportIssueModal: ({ pieceTitle, onClose }: { pieceTitle: string; onClose: () => void }) => (
    <div data-testid="meldvenster">
      <span>{pieceTitle}</span>
      <button onClick={onClose}>sluiten</button>
    </div>
  ),
}));

const LIJSTEN: MusicList[] = [
  {
    id: 'lijst-voorjaar',
    name: 'Voorjaarsconcert',
    orchestraId: 'orkest-harmonie',
    orchestraName: 'Harmonie Tutti',
    titleCount: 2,
  },
  {
    id: 'lijst-kerst',
    name: 'Kerstconcert',
    orchestraId: 'orkest-harmonie',
    orchestraName: 'Harmonie Tutti',
    titleCount: 1,
  },
  {
    id: 'lijst-jeugd',
    name: 'Jeugdrepertoire',
    orchestraId: 'orkest-jeugd',
    orchestraName: 'Jeugdorkest',
    titleCount: 1,
  },
];

function maakPartij(overschrijving: Partial<MusicPiece> = {}): MusicPiece {
  return {
    id: 'partij-trompet',
    title: 'Ouverture 1812',
    arranger: 'Tsjaikovski',
    tuning: 'Bes',
    groupNumber: '1',
    clef: 'G',
    youtubeUrl: null,
    originalFilename: 'ouverture-trompet.pdf',
    instrumentId: 'inst-trompet',
    instrumentName: 'Trompet',
    ...overschrijving,
  };
}

const PARTIJEN: MusicPiece[] = [
  maakPartij(),
  maakPartij({
    id: 'partij-hoorn',
    instrumentId: 'inst-hoorn',
    instrumentName: 'Hoorn',
    tuning: 'F',
    groupNumber: '2',
    youtubeUrl: 'https://youtube.example/1812',
  }),
  maakPartij({
    id: 'partij-slagwerk',
    title: 'Bolero',
    arranger: 'Ravel',
    instrumentId: 'inst-slagwerk',
    instrumentName: 'Slagwerk',
    tuning: null,
    groupNumber: null,
    clef: null,
  }),
];

const LIJST_DETAIL = { ...LIJSTEN[0], pieces: PARTIJEN };

/**
 * De pagina raakt een handvol api-functies aan, en twee daarvan worden
 * aangeroepen zonder dat er op gewacht wordt (`logActivity(...).catch(...)`).
 * Alles geeft daarom standaard een opgeloste belofte terug; anders klapt de
 * pagina op een `.catch` van `undefined`.
 */
function zetApiKlaar(): void {
  for (const naam of Object.keys(api)) {
    const functie = (api as Record<string, unknown>)[naam];
    if (typeof functie === 'function') {
      vi.mocked(functie as (...args: unknown[]) => unknown).mockResolvedValue(undefined);
    }
  }
  vi.mocked(api.getMyMusicLists).mockResolvedValue(LIJSTEN);
  vi.mocked(api.getMusicList).mockResolvedValue(LIJST_DETAIL);
  vi.mocked(api.getMusicPieceBlob).mockResolvedValue(new Blob(['pdf']));

  vi.mocked(pdfCache.isPdfCached).mockResolvedValue(false);
  vi.mocked(pdfCache.getCachedPdf).mockResolvedValue(undefined);
  vi.mocked(pdfCache.cacheListPdfs).mockResolvedValue(undefined as never);
}

function toon(pad = '/mijn-muziek') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[pad]}>
        <MyMusic />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** De kaart waar de kop van dit orkest boven staat. */
function orkestkaart(naam: string): HTMLElement {
  const kop = screen.getByRole('heading', { level: 2, name: naam });
  const kaart = kop.closest('.card');
  if (!kaart) throw new Error(`geen kaart gevonden rond de kop ${naam}`);
  return kaart as HTMLElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  zetApiKlaar();
  // jsdom kent `createObjectURL` niet; de pdf-kijker maakt er een aan.
  URL.createObjectURL = vi.fn(() => 'blob:pdf-1');
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('mijn muziek - het overzicht van lijsten', () => {
  it('toont elke lijst die de server stuurt, met het aantal titels erbij', async () => {
    toon();

    expect(await screen.findByText('Voorjaarsconcert')).toBeInTheDocument();
    expect(screen.getByText('Kerstconcert')).toBeInTheDocument();
    expect(screen.getByText('Jeugdrepertoire')).toBeInTheDocument();
    expect(screen.getByText('2 myMusic.titlesForYou')).toBeInTheDocument();
  });

  it('zet de lijsten van een ander orkest niet onder de kop van dit orkest', async () => {
    toon();

    await screen.findByText('Voorjaarsconcert');

    // De groepering per orkest gebeurt in de pagina zelf. Zonder deze test is
    // een verschuiving alleen te zien door de pagina met twee orkesten naast
    // elkaar te leggen.
    const harmonie = within(orkestkaart('Harmonie Tutti'));
    expect(harmonie.getByText('Voorjaarsconcert')).toBeInTheDocument();
    expect(harmonie.getByText('Kerstconcert')).toBeInTheDocument();
    expect(harmonie.queryByText('Jeugdrepertoire')).not.toBeInTheDocument();

    const jeugd = within(orkestkaart('Jeugdorkest'));
    expect(jeugd.getByText('Jeugdrepertoire')).toBeInTheDocument();
    expect(jeugd.queryByText('Voorjaarsconcert')).not.toBeInTheDocument();
  });

  it('toont de lege staat als er geen enkele lijst is', async () => {
    vi.mocked(api.getMyMusicLists).mockResolvedValue([]);

    toon();

    expect(await screen.findByText('myMusic.noLists')).toBeInTheDocument();
    expect(screen.getByText('myMusic.noListsDescription')).toBeInTheDocument();
  });

  it('toont een draaier zolang de lijsten nog onderweg zijn', async () => {
    let losmaken: (lijsten: MusicList[]) => void = () => {};
    vi.mocked(api.getMyMusicLists).mockReturnValue(
      new Promise<MusicList[]>((resolve) => {
        losmaken = resolve;
      }),
    );

    toon();

    expect(await screen.findByRole('status')).toBeInTheDocument();

    losmaken(LIJSTEN);
    expect(await screen.findByText('Voorjaarsconcert')).toBeInTheDocument();
  });

  it('opent de gekozen lijst en haalt precies die lijst op', async () => {
    const gebruiker = userEvent.setup();
    toon();

    await screen.findByText('Jeugdrepertoire');
    // Elke lijst heeft een knop met dezelfde tekst; daarom eerst de kaart van
    // het orkest opzoeken en de knop dáárbinnen aanklikken.
    await gebruiker.click(within(orkestkaart('Jeugdorkest')).getByRole('button', { name: 'myMusic.viewMusic' }));

    await waitFor(() => expect(api.getMusicList).toHaveBeenCalledWith('lijst-jeugd'));
    expect(await screen.findByRole('button', { name: /myMusic.backToOverview/ })).toBeInTheDocument();
  });

  it('toont in de veegweergave dezelfde lijsten', async () => {
    const gebruiker = userEvent.setup();
    toon();

    await screen.findByText('Voorjaarsconcert');
    await gebruiker.click(screen.getByRole('button', { name: /myMusic.swipeView/ }));

    const veeglijst = within(await screen.findByTestId('veeglijst'));
    expect(veeglijst.getByText('Voorjaarsconcert')).toBeInTheDocument();
    expect(veeglijst.getByText('Jeugdrepertoire')).toBeInTheDocument();
  });
});

describe('mijn muziek - één lijst met partijen', () => {
  const pad = '/mijn-muziek?listId=lijst-voorjaar';

  it('bundelt de partijen per titel en telt ze', async () => {
    toon(pad);

    // Twee partijen bij "Ouverture 1812" (trompet en hoorn), één bij "Bolero".
    const ouverture = await screen.findByRole('button', { name: /Ouverture 1812/ });
    expect(ouverture).toHaveTextContent('2 myMusic.pieces');
    expect(ouverture).toHaveTextContent('Tsjaikovski');

    const bolero = screen.getByRole('button', { name: /Bolero/ });
    expect(bolero).toHaveTextContent('1 myMusic.pieces');
  });

  it('toont de partijen pas na uitklappen', async () => {
    const gebruiker = userEvent.setup();
    toon(pad);

    const ouverture = await screen.findByRole('button', { name: /Ouverture 1812/ });
    expect(ouverture).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Trompet')).not.toBeInTheDocument();

    await gebruiker.click(ouverture);

    expect(await screen.findByText('Trompet')).toBeInTheDocument();
    expect(screen.getByText('Hoorn')).toBeInTheDocument();
    // Slagwerk hoort bij een andere titel en blijft dus dicht.
    expect(screen.queryByText('Slagwerk')).not.toBeInTheDocument();
  });

  it('downloadt de partij waar de knop bij staat', async () => {
    const gebruiker = userEvent.setup();
    toon(pad);

    await gebruiker.click(await screen.findByRole('button', { name: /Ouverture 1812/ }));

    const hoornrij = (await screen.findByText('Hoorn')).closest('tr');
    expect(hoornrij).not.toBeNull();
    await gebruiker.click(within(hoornrij as HTMLElement).getByRole('button', { name: /Download/ }));

    await waitFor(() => expect(api.downloadMusicPiece).toHaveBeenCalledWith('partij-hoorn'));
    expect(api.downloadMusicPiece).toHaveBeenCalledTimes(1);
    expect(api.logActivity).toHaveBeenCalledWith('download', 'music_piece', 'partij-hoorn');
  });

  it('meldt het als een download mislukt', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(api.downloadMusicPiece).mockRejectedValue(new Error('geen verbinding'));
    const gebruiker = userEvent.setup();
    toon(pad);

    await gebruiker.click(await screen.findByRole('button', { name: /Bolero/ }));
    await gebruiker.click((await screen.findAllByRole('button', { name: /Download/ }))[0]);

    await waitFor(() => expect(showError).toHaveBeenCalledWith('errors.generic'));
    // De knop hoort daarna weer bruikbaar te zijn; blijft hij op "bezig"
    // staan, dan kan de gebruiker het niet opnieuw proberen.
    await waitFor(() => expect(screen.getAllByRole('button', { name: /Download/ })[0]).toBeEnabled());
  });

  it('downloadt de hele lijst als zip', async () => {
    const gebruiker = userEvent.setup();
    toon(pad);

    await gebruiker.click(await screen.findByRole('button', { name: /myMusic.downloadAll/ }));

    await waitFor(() => expect(api.downloadMusicListZip).toHaveBeenCalledWith('lijst-voorjaar'));
  });

  it('zet de hele lijst offline en meldt dat het gelukt is', async () => {
    const gebruiker = userEvent.setup();
    toon(pad);

    await gebruiker.click(await screen.findByRole('button', { name: /myMusic.makeOffline/ }));

    await waitFor(() => expect(pdfCache.cacheListPdfs).toHaveBeenCalled());
    expect(vi.mocked(pdfCache.cacheListPdfs).mock.calls[0][0]).toEqual(PARTIJEN);
    await waitFor(() => expect(showSuccess).toHaveBeenCalledWith('myMusic.offlineReady'));
  });

  it('meldt het als het offline zetten mislukt', async () => {
    vi.mocked(pdfCache.cacheListPdfs).mockRejectedValue(new Error('geen ruimte'));
    const gebruiker = userEvent.setup();
    toon(pad);

    await gebruiker.click(await screen.findByRole('button', { name: /myMusic.makeOffline/ }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('errors.generic'));
  });

  it('toont de lege staat als de lijst geen partijen heeft', async () => {
    vi.mocked(api.getMusicList).mockResolvedValue({ ...LIJSTEN[0], pieces: [] });

    toon(pad);

    expect(await screen.findByText('myMusic.noPieces')).toBeInTheDocument();
  });

  it('keert met de terugknop terug naar het overzicht', async () => {
    const gebruiker = userEvent.setup();
    toon(pad);

    await gebruiker.click(await screen.findByRole('button', { name: /myMusic.backToOverview/ }));

    expect(await screen.findByText('Voorjaarsconcert')).toBeInTheDocument();
    expect(screen.getByText('Jeugdrepertoire')).toBeInTheDocument();
  });

  it('verbergt in de compacte weergave de extra kolommen en onthoudt de keuze', async () => {
    const gebruiker = userEvent.setup();
    toon(pad);

    await gebruiker.click(await screen.findByRole('button', { name: /Ouverture 1812/ }));
    expect(await screen.findByRole('columnheader', { name: 'myMusic.table.tuning' })).toBeInTheDocument();

    await gebruiker.click(screen.getByRole('button', { name: 'myMusic.compactView' }));

    await waitFor(() =>
      expect(screen.queryByRole('columnheader', { name: 'myMusic.table.tuning' })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('columnheader', { name: 'myMusic.table.instrument' })).toBeInTheDocument();
    expect(localStorage.getItem('myMusic-compactView')).toBe('true');
  });

  it('opent het meldvenster voor de gekozen partij', async () => {
    const gebruiker = userEvent.setup();
    toon(pad);

    await gebruiker.click(await screen.findByRole('button', { name: /Bolero/ }));
    await gebruiker.click(await screen.findByRole('button', { name: /myMusic.reportIssue.title/ }));

    const venster = within(await screen.findByTestId('meldvenster'));
    expect(venster.getByText('Bolero - Slagwerk')).toBeInTheDocument();
  });
});

describe('mijn muziek - de pdf-kijker', () => {
  const pad = '/mijn-muziek?listId=lijst-voorjaar';

  it('haalt het bestand op en toont het in de kijker', async () => {
    const gebruiker = userEvent.setup();
    toon(pad);

    await gebruiker.click(await screen.findByRole('button', { name: /Bolero/ }));
    await gebruiker.click(await screen.findByRole('button', { name: /myMusic.view/ }));

    await waitFor(() => expect(api.getMusicPieceBlob).toHaveBeenCalledWith('partij-slagwerk'));
    const kijker = await screen.findByTestId('pdf-kijker');
    expect(kijker).toHaveAttribute('data-partij', 'partij-slagwerk');
    expect(kijker).toHaveAttribute('data-url', 'blob:pdf-1');
  });

  it('gebruikt de offline bewaarde versie als die er is', async () => {
    vi.mocked(pdfCache.getCachedPdf).mockResolvedValue({
      blob: async () => new Blob(['offline pdf']),
    } as Response);
    const gebruiker = userEvent.setup();
    toon(pad);

    await gebruiker.click(await screen.findByRole('button', { name: /Bolero/ }));
    await gebruiker.click(await screen.findByRole('button', { name: /myMusic.view/ }));

    expect(await screen.findByTestId('pdf-kijker')).toBeInTheDocument();
    // Dit is het hele punt van offline zetten: wie het bestand al heeft, hoort
    // het niet nog een keer over de lijn te halen.
    expect(api.getMusicPieceBlob).not.toHaveBeenCalled();
  });

  it('meldt het als het bestand niet op te halen is en sluit de kijker', async () => {
    vi.mocked(api.getMusicPieceBlob).mockRejectedValue(new Error('weg'));
    const gebruiker = userEvent.setup();
    toon(pad);

    await gebruiker.click(await screen.findByRole('button', { name: /Bolero/ }));
    await gebruiker.click(await screen.findByRole('button', { name: /myMusic.view/ }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('errors.generic'));
    // Een openstaand venster met een eeuwige draaier erin is erger dan geen
    // venster: de gebruiker weet niet of hij moet wachten.
    await waitFor(() => expect(screen.queryByTestId('pdf-kijker')).not.toBeInTheDocument());
  });

  it('zet een vinkje bij de partijen die al offline staan', async () => {
    vi.mocked(pdfCache.isPdfCached).mockImplementation(async (id: string) => id === 'partij-hoorn');
    const gebruiker = userEvent.setup();
    toon(pad);

    await gebruiker.click(await screen.findByRole('button', { name: /Ouverture 1812/ }));

    const hoornrij = (await screen.findByText('Hoorn')).closest('tr') as HTMLElement;
    const trompetrij = screen.getByText('Trompet').closest('tr') as HTMLElement;
    await waitFor(() => expect(within(hoornrij).getByLabelText('myMusic.offlineReady')).toBeInTheDocument());
    expect(within(trompetrij).queryByLabelText('myMusic.offlineReady')).not.toBeInTheDocument();
  });
});

/**
 * Hieronder staat geen karakteriseringstest maar een regressietest: hij legt
 * vast hoe het hoort te zijn, na het herstellen van een fout.
 *
 * BEWIJS. Met de oude MyMusic.tsx teruggezet (`git checkout HEAD -- ...`, de
 * eigen kopie eerst opzij) falen beide tests hieronder:
 *   TestingLibraryElementError: Unable to find role="alert"
 * en in de afdruk van de pagina staat dan nog steeds
 *   <div class="loading" role="status"> ... common.loading
 * oftewel een draaier die nooit meer weggaat. Met de reparatie erin zijn ze
 * groen.
 *
 * De fout: de lijstweergave koos tussen draaier en inhoud op
 * `isLoading || !selectedList`. Bij een mislukte aanroep is `isLoading` weer
 * `false` maar blijft `selectedList` leeg, en dan is die voorwaarde nog steeds
 * waar. De pagina bleef dus eindeloos "aan het laden" tonen voor iets dat
 * nooit meer komt.
 */
describe('mijn muziek - herstelde fout', () => {
  it('toont een melding in plaats van een eeuwige draaier als de lijst niet opgehaald kan worden', async () => {
    vi.mocked(api.getMusicList).mockRejectedValue(new Error('server plat'));

    toon('/mijn-muziek?listId=lijst-voorjaar');

    expect(await screen.findByRole('alert')).toHaveTextContent('errors.generic');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    // De weg terug moet open blijven, anders zit de gebruiker vast.
    expect(screen.getByRole('button', { name: /myMusic.backToOverview/ })).toBeInTheDocument();
  });

  it('probeert het opnieuw na een klik op de knop', async () => {
    vi.mocked(api.getMusicList).mockRejectedValueOnce(new Error('server plat')).mockResolvedValue(LIJST_DETAIL);
    const gebruiker = userEvent.setup();

    toon('/mijn-muziek?listId=lijst-voorjaar');

    await screen.findByRole('alert');
    await gebruiker.click(screen.getByRole('button', { name: 'common.retry' }));

    expect(await screen.findByRole('button', { name: /Ouverture 1812/ })).toBeInTheDocument();
  });
});
