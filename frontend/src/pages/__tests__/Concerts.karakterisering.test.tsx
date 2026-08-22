/**
 * Vangnet voor het opknippen van de concertpagina.
 *
 * Concerts.tsx is 1655 regels: vijf tabbladen, zeven modals en een
 * uitvoeringsmodus in één component. Dat wordt opgeknipt, en bij het
 * verplaatsen van code is de vraag niet of het er mooier uitziet maar of het
 * scherm daarna nog precies hetzelfde doet.
 *
 * Deze tests keuren niets goed. Ze leggen vast wat de pagina op dit moment
 * doet - welke tabbladen er zijn, welke gegevens er bij het openen opgehaald
 * worden en welke juist niet, en wat er in beeld komt - zodat een verschuiving
 * tijdens het opknippen meteen opvalt in plaats van pas als iemand de pagina
 * opent. Zo'n test heet een karakteriseringstest: hij beschrijft het bestaande
 * gedrag, ook waar dat gedrag misschien niet ideaal is.
 *
 * Drie dingen zijn hier bewust vastgelegd omdat ze makkelijk sneuvelen bij een
 * verhuizing:
 *   - De `enabled`-voorwaarden van de queries. Het concertdetail, de
 *     kaartsoorten en de stukgeschiedenis hangen aan een gekozen concert of
 *     een ingetypte titel. Raakt die voorwaarde zoek, dan doet de pagina bij
 *     het openen tien verzoeken in plaats van zes, en dat merk je niet aan het
 *     scherm.
 *   - De volgorde van de tabbladen. Die staat als vijf losse knoppen in de
 *     JSX; een verhuizing die ze herschikt verandert wat de gebruiker ziet.
 *   - Dat het statistiektabblad niets toont zolang de statistieken er niet
 *     zijn (`activeTab === 'statistics' && statistics`). Dat is bestaand
 *     gedrag, geen wenselijk gedrag, maar het hoort de verhuizing te
 *     overleven.
 *
 * Dat laatste punt is inmiddels achterhaald: het lege statistiektabblad was
 * hier vastgelegd omdat het opviel, niet omdat het klopte, en is op 22-08-2026
 * gerepareerd. De bijbehorende test hieronder is toen omgeschreven van "toont
 * niets" naar "meldt wat er misging"; wat er nog wél overeind moet blijven -
 * dat de tabbladen staan en de statistiekinhoud ontbreekt - staat er nog
 * precies zo in. Zie Concerts.herstel.test.tsx voor de rest van die reparatie.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import Concerts from '../Concerts';
import * as api from '../../api';

vi.mock('../../api');

vi.mock('../../hooks/useDocumentTitle', () => ({ useDocumentTitle: () => {} }));

// `initReactI18next` hoort erbij omdat de pagina via utils/locale.ts de echte
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

// De setlijstbouwer en de postergenerator zijn zware onderdelen op zichzelf
// (sleepbediening, canvas). Voor dit vangnet telt alleen dát ze verschijnen
// zodra hun tabblad gekozen wordt, niet wat ze intern doen.
vi.mock('../../components/SetlistBuilder', () => ({
  default: () => <div data-testid="setlijstbouwer" />,
}));

vi.mock('../../components/ConcertPosterGenerator', () => ({
  default: () => <div data-testid="postergenerator" />,
}));

vi.mock('../../components/SetlistMode', () => ({
  SetlistMode: () => <div data-testid="uitvoeringsmodus" />,
}));

vi.mock('../../utils/toast', () => ({ showSuccess: vi.fn(), showError: vi.fn() }));

/**
 * De pagina en haar hooks lopen allemaal via de api-barrel. Alles krijgt hier
 * een lege uitkomst, zodat elk tabblad zijn "nog niets"-toestand toont. Dat is
 * voor een vangnet genoeg: het gaat om wélke aanroepen gebeuren en welke
 * onderdelen verschijnen, niet om de inhoud van de rijen.
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
  vi.mocked(api.getConcertStatistics).mockResolvedValue({
    totalConcerts: 0,
    concertsPerYear: [],
    concertsPerType: [],
    mostPlayedPieces: [],
  });
  vi.mocked(api.getUsers).mockResolvedValue([]);
  vi.mocked(api.getMusicTitles).mockResolvedValue([]);
  vi.mocked(api.getPieceHistory).mockResolvedValue({
    title: '',
    playCount: 0,
    lastPlayed: null,
    history: [],
  });
}

function wikkel({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

const TABBLADEN = [
  'concerts.title',
  'concerts.statistics',
  'concerts.pieceHistory',
  'concerts.setlistBuilder',
  'concerts.posterGenerator',
];

/**
 * De tabbladknoppen dragen geen eigen klasse - het zijn gewone `btn`-knoppen,
 * net als "nieuw concert" en de knoppen in de tabelrijen. Op tekst alleen
 * zoeken helpt evenmin: het eerste tabblad heet `concerts.title`, en dat staat
 * ook in de paginakop.
 *
 * Daarom wordt hier de balk zelf opgezocht, via de knop die alleen een tabblad
 * kan zijn, en worden de knoppen daarbinnen genomen. Dat legt meteen de
 * volgorde vast.
 *
 * En let op: houd na een klik geen knop van vóór die klik vast. React vervangt
 * het element bij een hertekening, waardoor de oude referentie de nieuwe
 * klasse nooit krijgt. Roep deze functie na elke klik opnieuw aan.
 */
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

async function wachtTotGeladen(): Promise<void> {
  await waitFor(() => expect(tabbladKnoppen()).toHaveLength(5));
}

beforeEach(() => {
  vi.clearAllMocks();
  zetApiKlaar();
});

describe('concertpagina - vastgelegd gedrag vóór het opknippen', () => {
  it('toont vijf tabbladen, in deze volgorde', async () => {
    render(<Concerts />, { wrapper: wikkel });
    await wachtTotGeladen();

    expect(tabbladKnoppen().map((knop) => knop.textContent?.trim())).toEqual(TABBLADEN);
  });

  it('begint op het tabblad met de concertlijst', async () => {
    render(<Concerts />, { wrapper: wikkel });
    await wachtTotGeladen();

    expect(tabblad('concerts.title').className).toContain('btn-primary');
    expect(tabblad('concerts.statistics').className).toContain('btn-outline');
    expect(screen.getByText('concerts.noConcerts')).toBeInTheDocument();
  });

  it('toont een skelet zolang de concerten nog niet binnen zijn', () => {
    render(<Concerts />, { wrapper: wikkel });

    expect(screen.getByTestId('skelet-tabel')).toBeInTheDocument();
    expect(tabbladKnoppen()).toHaveLength(0);
  });

  // De pagina haalt bij het openen meer op dan de lijst zelf: de filters
  // (jaren, soorten), de statistieken voor het tweede tabblad, de leden voor de
  // aanwezigheidsmodal en de repertoiretitels voor de setlijstbouwer. Dat is
  // bestaand gedrag; het gaat erom dat het niet stilletjes verandert.
  it('haalt bij het openen zes onderdelen op', async () => {
    render(<Concerts />, { wrapper: wikkel });
    await wachtTotGeladen();

    await waitFor(() => {
      expect(api.getConcerts).toHaveBeenCalled();
      expect(api.getConcertTypes).toHaveBeenCalled();
      expect(api.getConcertYears).toHaveBeenCalled();
      expect(api.getConcertStatistics).toHaveBeenCalled();
      expect(api.getUsers).toHaveBeenCalled();
      expect(api.getMusicTitles).toHaveBeenCalled();
    });
  });

  // Deze drie hangen aan een gekozen concert of een ingetypte titel. Gaat die
  // voorwaarde verloren bij het verplaatsen, dan vraagt de pagina bij het
  // openen een concertdetail op zonder concert.
  it('haalt bij het openen geen detailgegevens op', async () => {
    render(<Concerts />, { wrapper: wikkel });
    await wachtTotGeladen();

    expect(api.getConcert).not.toHaveBeenCalled();
    expect(api.getConcertTickets).not.toHaveBeenCalled();
    expect(api.getPieceHistory).not.toHaveBeenCalled();
    expect(api.getAttendancePrediction).not.toHaveBeenCalled();
  });

  it.each([
    ['concerts.statistics', 'concerts.bumaStemraExport'],
    ['concerts.pieceHistory', 'concerts.whenLastPlayed'],
  ])('schakelt naar %s', async (label, herkenpunt) => {
    const gebruiker = userEvent.setup();
    render(<Concerts />, { wrapper: wikkel });
    await wachtTotGeladen();

    await gebruiker.click(tabblad(label));

    await waitFor(() => expect(tabblad(label).className).toContain('btn-primary'));
    expect(screen.getByText(herkenpunt)).toBeInTheDocument();
    expect(tabblad('concerts.title').className).toContain('btn-outline');
  });

  it.each([
    ['concerts.setlistBuilder', 'setlijstbouwer'],
    ['concerts.posterGenerator', 'postergenerator'],
  ])('schakelt naar %s', async (label, testid) => {
    const gebruiker = userEvent.setup();
    render(<Concerts />, { wrapper: wikkel });
    await wachtTotGeladen();

    await gebruiker.click(tabblad(label));

    await waitFor(() => expect(tabblad(label).className).toContain('btn-primary'));
    expect(screen.getByTestId(testid)).toBeInTheDocument();
  });

  it('haalt de stukgeschiedenis pas op als er een titel ingetypt is', async () => {
    const gebruiker = userEvent.setup();
    render(<Concerts />, { wrapper: wikkel });
    await wachtTotGeladen();

    await gebruiker.click(tabblad('concerts.pieceHistory'));
    expect(api.getPieceHistory).not.toHaveBeenCalled();

    await gebruiker.type(screen.getByPlaceholderText('concerts.searchPieceHistory'), 'Bolero');

    // Het verzoek komt sinds 22-08-2026 ontdubbeld, dus pas nadat het typen
    // stilvalt; `waitFor` wacht dat af. Dát er ook maar één verzoek uitgaat,
    // staat in Concerts.herstel.test.tsx.
    await waitFor(() => expect(api.getPieceHistory).toHaveBeenCalledWith('Bolero'));
  });

  // Bijgewerkt op 22-08-2026. Deze test legde vast dat het tabblad bij een
  // mislukte aanroep helemaal leeg bleef - geen melding, geen laadindicator.
  // Dat was de fout, niet het gedrag dat bewaard moest blijven, en hij is
  // gerepareerd: het tabblad meldt nu wat er misging en biedt een nieuwe
  // poging, net als de modulepagina. De naam en de eerste verwachting zijn
  // daarop aangepast; de twee verwachtingen die zeggen dat de statistiekinhoud
  // ontbreekt staan er nog, want die hoorden altijd al bij dit geval.
  it('meldt het als de statistieken niet binnenkomen, in plaats van een leeg tabblad', async () => {
    vi.mocked(api.getConcertStatistics).mockRejectedValue(new Error('geen verbinding'));
    const gebruiker = userEvent.setup();
    render(<Concerts />, { wrapper: wikkel });
    await wachtTotGeladen();

    await gebruiker.click(tabblad('concerts.statistics'));

    await waitFor(() => expect(tabblad('concerts.statistics').className).toContain('btn-primary'));
    await waitFor(() => expect(screen.getByText('concerts.statisticsError')).toBeInTheDocument());
    expect(screen.queryByText('concerts.bumaStemraExport')).not.toBeInTheDocument();
    expect(screen.queryByText('concerts.mostPlayedPieces')).not.toBeInTheDocument();
  });

  // Een pagina die bij een mislukte aanroep helemaal niets toont is niet van
  // een kapotte pagina te onderscheiden. Dat de tabbladen blijven staan is dus
  // gedrag dat het opknippen moet overleven.
  it('houdt de tabbladen staan als het ophalen mislukt', async () => {
    vi.mocked(api.getConcerts).mockRejectedValue(new Error('geen verbinding'));
    vi.mocked(api.getConcertTypes).mockRejectedValue(new Error('geen verbinding'));

    render(<Concerts />, { wrapper: wikkel });
    await wachtTotGeladen();

    expect(tabbladKnoppen().map((knop) => knop.textContent?.trim())).toEqual(TABBLADEN);
    expect(screen.getByText('concerts.noConcerts')).toBeInTheDocument();
  });
});
