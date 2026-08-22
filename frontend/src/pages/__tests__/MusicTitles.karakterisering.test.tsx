/**
 * Vangnet voor het opknippen van de titelpagina.
 *
 * MusicTitles.tsx is 1317 regels: een reducer met ruim twintig acties, de
 * pagina zelf, een groot bewerkvenster met de MusicaInfo-opzoekfunctie erin,
 * en de tabelrij als losse component. Dat wordt opgeknipt, en bij het
 * verplaatsen van code is de vraag niet of het er daarna netter uitziet maar
 * of het scherm nog precies hetzelfde doet.
 *
 * Deze tests keuren niets goed. Ze leggen vast wat de pagina op dit moment
 * doet: wat er bij het openen in beeld komt, welke aanroepen er gebeuren, en
 * wat er verandert als je op iets klikt. Zo'n test heet een
 * karakteriseringstest; hij beschrijft het bestaande gedrag, ook waar dat
 * gedrag misschien niet ideaal is.
 *
 * Drie dingen zijn hier bewust vastgelegd omdat ze makkelijk sneuvelen bij een
 * verhuizing:
 *   - De ontdubbeling op het zoekveld. Zonder die vertraging gaat er per
 *     toetsaanslag een verzoek uit, en dat merk je aan het scherm niet.
 *   - Het venster van honderd rijen. De tabel toont niet alles in één keer;
 *     raakt dat zoek, dan tekent de pagina bij een grote verzameling ineens
 *     duizenden rijen.
 *   - Welke rijen uitklapbaar zijn. Een rij zonder extra gegevens hoort geen
 *     pijltje en geen klikgedrag te hebben.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import MusicTitles from '../MusicTitles';
import * as api from '../../api';
import type { MusicTitle } from '../../types';

vi.mock('../../api');

vi.mock('../../hooks/useDocumentTitle', () => ({ useDocumentTitle: () => {} }));
vi.mock('../../hooks/useConfirm', () => ({ useConfirm: () => vi.fn().mockResolvedValue(true) }));

// `initReactI18next` hoort erbij omdat de pagina via andere modules de echte
// i18n-opzet meetrekt, en die roept het aan tijdens het laden van de module.
// Zonder deze export klapt het bestand al bij de import, vóór er één test
// gedraaid heeft.
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

vi.mock('../../components/StreamingLinks', () => ({
  StreamingLinks: () => <div data-testid="streamingverwijzingen" />,
}));

vi.mock('../../components/StreamingLinkEditor', () => ({
  StreamingLinkEditor: () => <div data-testid="streamingbewerker" />,
}));

vi.mock('../../components/ImslpSearch', () => ({
  ImslpSearch: () => <div data-testid="imslp-zoeken" />,
}));

vi.mock('../../utils/toast', () => ({ showSuccess: vi.fn(), showError: vi.fn() }));

function maakTitel(overschrijving: Partial<MusicTitle> = {}): MusicTitle {
  return {
    id: 'titel-1',
    title: 'Also sprach Zarathustra',
    arranger: 'Strauss',
    pieceCount: 12,
    youtubeUrl: null,
    description: null,
    durationSeconds: 225,
    grade: '4',
    instruments: [],
    genres: [{ id: 'genre-1', name: 'Klassiek' }],
    lists: [],
    ...overschrijving,
  };
}

const TITELS: MusicTitle[] = [
  maakTitel({ description: 'Openingsnummer', youtubeUrl: 'https://youtu.be/abc' }),
  // Geen beschrijving, geen lijsten, geen mp3: deze rij is niet uitklapbaar.
  maakTitel({ id: 'titel-2', title: 'Radetzky Marsch', arranger: null, durationSeconds: 0, grade: null, genres: [] }),
];

const GENRES = [
  { id: 'genre-1', name: 'Klassiek' },
  { id: 'genre-2', name: 'Pop' },
];

function zetApiKlaar(): void {
  const leeg = vi.fn().mockResolvedValue([]);
  for (const naam of Object.keys(api)) {
    const functie = (api as Record<string, unknown>)[naam];
    if (typeof functie === 'function') {
      vi.mocked(functie as (...args: unknown[]) => unknown).mockImplementation(leeg);
    }
  }
  vi.mocked(api.getMusicTitles).mockResolvedValue(TITELS);
  vi.mocked(api.getGenres).mockResolvedValue(GENRES);
  vi.mocked(api.getMp3Url).mockImplementation((pad: string) => `/mp3/${pad}`);
}

function wikkel({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  zetApiKlaar();
});

describe('titelpagina - vastgelegd gedrag vóór het opknippen', () => {
  it('haalt bij het openen de titels en de genres op', async () => {
    render(<MusicTitles />, { wrapper: wikkel });

    await waitFor(() => {
      expect(api.getMusicTitles).toHaveBeenCalled();
      expect(api.getGenres).toHaveBeenCalled();
    });

    // Zonder ingevulde filters gaan beide filtervelden als `undefined` mee.
    // Dat is geen detail: een verhuizing die er lege strings van maakt stuurt
    // filters mee die de server als echte filters leest.
    expect(api.getMusicTitles).toHaveBeenCalledWith({ search: undefined, genreId: undefined });
  });

  it('toont de skeletweergave zolang de titels nog laden', async () => {
    let losmaken: (titels: MusicTitle[]) => void = () => {};
    vi.mocked(api.getMusicTitles).mockReturnValue(
      new Promise<MusicTitle[]>((resolve) => {
        losmaken = resolve;
      }),
    );

    render(<MusicTitles />, { wrapper: wikkel });

    expect(await screen.findByTestId('skelet-tabel')).toBeInTheDocument();

    losmaken(TITELS);
    await waitFor(() => expect(screen.queryByTestId('skelet-tabel')).not.toBeInTheDocument());
  });

  it('toont de titel met het aantal en de rijen in de tabel', async () => {
    render(<MusicTitles />, { wrapper: wikkel });

    expect(await screen.findByText('Also sprach Zarathustra')).toBeInTheDocument();
    expect(screen.getByText('Radetzky Marsch')).toBeInTheDocument();

    const kop = screen.getByRole('heading', { level: 1 });
    expect(kop).toHaveTextContent('titles.title');
    expect(kop).toHaveTextContent('2');

    // De duur komt als mm:ss in beeld, niet als aantal seconden.
    expect(screen.getByText('3:45')).toBeInTheDocument();
    // Een titel zonder duur, arrangeur of genre toont een streepje.
    expect(screen.getAllByText('-').length).toBeGreaterThan(0);
  });

  it('toont een lege staat als er geen titels zijn', async () => {
    vi.mocked(api.getMusicTitles).mockResolvedValue([]);

    render(<MusicTitles />, { wrapper: wikkel });

    expect(await screen.findByText('titles.noTitles')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('klapt een rij met extra gegevens open en weer dicht', async () => {
    const gebruiker = userEvent.setup();
    render(<MusicTitles />, { wrapper: wikkel });

    const rij = (await screen.findByText('Also sprach Zarathustra')).closest('tr')!;
    expect(screen.queryByText('Openingsnummer')).not.toBeInTheDocument();

    await gebruiker.click(rij);
    expect(await screen.findByText(/Openingsnummer/)).toBeInTheDocument();

    // De rij wordt na de klik opnieuw opgezocht: React vervangt het element bij
    // een hertekening, en dan wijst de oude verwijzing naar niets meer.
    await gebruiker.click(screen.getByText('Also sprach Zarathustra').closest('tr')!);
    await waitFor(() => expect(screen.queryByText(/Openingsnummer/)).not.toBeInTheDocument());
  });

  it('laat een rij zonder extra gegevens niet uitklappen', async () => {
    const gebruiker = userEvent.setup();
    render(<MusicTitles />, { wrapper: wikkel });

    const rij = (await screen.findByText('Radetzky Marsch')).closest('tr')!;
    expect(within(rij).queryByText('▶')).not.toBeInTheDocument();

    await gebruiker.click(rij);

    // Er komt geen tweede rij bij: de tabel houdt twee rijen in de body.
    const tabel = screen.getByRole('table');
    expect(within(tabel).getAllByRole('row')).toHaveLength(3); // kop + twee titels
  });

  it('opent het bewerkvenster met de bestaande gegevens erin', async () => {
    const gebruiker = userEvent.setup();
    render(<MusicTitles />, { wrapper: wikkel });

    const rij = (await screen.findByText('Also sprach Zarathustra')).closest('tr')!;
    await gebruiker.click(within(rij).getByRole('button'));

    const venster = await screen.findByRole('dialog');
    expect(venster).toHaveTextContent('titles.editMetadata');
    expect(within(venster).getByDisplayValue('Also sprach Zarathustra')).toBeInTheDocument();
    expect(within(venster).getByDisplayValue('Strauss')).toBeInTheDocument();
    // De duur staat in het formulier als mm:ss, niet als seconden.
    expect(within(venster).getByDisplayValue('3:45')).toBeInTheDocument();
    expect(within(venster).getByDisplayValue('https://youtu.be/abc')).toBeInTheDocument();
  });

  it('zoekt in het bewerkvenster op MusicaInfo met de titel als term', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(api.searchMusicaInfo).mockResolvedValue({
      query: 'Also sprach Zarathustra',
      resultCount: 0,
      results: [],
      searchUrl: 'https://musicainfo.example/zoek',
    });

    render(<MusicTitles />, { wrapper: wikkel });

    const rij = (await screen.findByText('Also sprach Zarathustra')).closest('tr')!;
    await gebruiker.click(within(rij).getByRole('button'));

    const venster = await screen.findByRole('dialog');
    await gebruiker.click(within(venster).getByRole('button', { name: 'titles.musicaInfoSearch' }));

    await waitFor(() => expect(api.searchMusicaInfo).toHaveBeenCalledWith('Also sprach Zarathustra'));
    expect(await screen.findByText('titles.musicaInfoNoResults')).toBeInTheDocument();
  });

  it('stuurt de zoekterm pas mee na de ontdubbeling', async () => {
    const gebruiker = userEvent.setup();
    render(<MusicTitles />, { wrapper: wikkel });

    const zoekveld = await screen.findByPlaceholderText('titles.searchPlaceholder');
    await gebruiker.type(zoekveld, 'mars');

    // Per toetsaanslag een verzoek zou vier extra aanroepen geven; er hoort er
    // één te komen, met het hele woord.
    await waitFor(() => expect(api.getMusicTitles).toHaveBeenCalledWith({ search: 'mars', genreId: undefined }), {
      timeout: 2000,
    });
    expect(vi.mocked(api.getMusicTitles).mock.calls).toHaveLength(2);
  });

  it('filtert op genre en toont dan pas de wisknop', async () => {
    const gebruiker = userEvent.setup();
    render(<MusicTitles />, { wrapper: wikkel });

    await screen.findByText('Also sprach Zarathustra');
    expect(screen.queryByRole('button', { name: 'titles.clearFilters' })).not.toBeInTheDocument();

    await gebruiker.selectOptions(screen.getByRole('combobox'), 'genre-2');

    await waitFor(() => expect(api.getMusicTitles).toHaveBeenCalledWith({ search: undefined, genreId: 'genre-2' }));
    expect(screen.getByRole('button', { name: 'titles.clearFilters' })).toBeInTheDocument();
  });

  it('toont niet meer dan honderd rijen tegelijk', async () => {
    const veel = Array.from({ length: 150 }, (_, i) =>
      maakTitel({ id: `titel-${i}`, title: `Titel ${i}`, arranger: `Arrangeur ${i}` }),
    );
    vi.mocked(api.getMusicTitles).mockResolvedValue(veel);

    render(<MusicTitles />, { wrapper: wikkel });

    await screen.findByText('Titel 0');

    const tabel = screen.getByRole('table');
    expect(within(tabel).getAllByRole('row')).toHaveLength(101); // kop + honderd titels
    expect(screen.queryByText('Titel 100')).not.toBeInTheDocument();

    // De knop eronder toont hoeveel er nog wachten.
    const meerKnop = screen.getByRole('button', { name: /common.more/ });
    expect(meerKnop).toHaveTextContent('50');

    const gebruiker = userEvent.setup();
    await gebruiker.click(meerKnop);
    expect(await screen.findByText('Titel 100')).toBeInTheDocument();
  });

  it('houdt de pagina gevuld als het ophalen mislukt', async () => {
    vi.mocked(api.getMusicTitles).mockRejectedValue(new Error('geen verbinding'));
    vi.mocked(api.getGenres).mockRejectedValue(new Error('geen verbinding'));

    render(<MusicTitles />, { wrapper: wikkel });

    await waitFor(() => expect(api.getMusicTitles).toHaveBeenCalled());

    // Een pagina die bij een mislukte aanroep helemaal niets toont is niet van
    // een kapotte pagina te onderscheiden. Dat de kop, het zoekveld en de lege
    // staat blijven staan is dus gedrag dat het opknippen moet overleven.
    expect(await screen.findByText('titles.noTitles')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('titles.title');
    expect(screen.getByPlaceholderText('titles.searchPlaceholder')).toBeInTheDocument();
  });
});
