/**
 * Drie gerepareerde fouten op de concertpagina, elk met de vraag die de
 * gebruiker stelde toen hij ertegenaan liep.
 *
 *   1. "Waarom staat mijn verkoopstart twee uur verkeerd?" - het bewerkscherm
 *      van een kaartsoort vulde het tijdstip in UTC in.
 *   2. "Is deze pagina stuk?" - het statistiektabblad bleef bij een mislukte
 *      aanroep volkomen leeg.
 *   3. "Waarom doet hij zes verzoeken als ik één titel typ?" - de
 *      stukgeschiedenis vuurde per toetsaanslag.
 *
 * De opzet (mocks, wikkel, tabbladen zoeken) volgt bewust die van
 * Concerts.karakterisering.test.tsx, zodat de twee bestanden naast elkaar te
 * lezen zijn: daar staat wat de pagina deed, hier wat ze nu doet.
 */

process.env.TZ = 'Europe/Amsterdam';

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import Concerts from '../Concerts';
import * as api from '../../api';

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

vi.mock('../../components/SetlistMode', () => ({
  SetlistMode: () => <div data-testid="uitvoeringsmodus" />,
}));

vi.mock('../../utils/toast', () => ({ showSuccess: vi.fn(), showError: vi.fn() }));

const CONCERT = {
  id: 'c1',
  name: 'Zomerconcert',
  date: '2026-07-01',
  endDate: null,
  location: 'Dorpskerk',
  venueType: null,
  concertType: null,
  description: null,
  notes: null,
  programCount: 0,
  attendanceCount: 0,
  mediaCount: 0,
  createdBy: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const KAARTSOORT = {
  id: 'k1',
  name: 'Voorverkoop',
  price: 12.5,
  quantity: 100,
  available: 100,
  description: null,
  maxPerOrder: 10,
  onSale: true,
  // 18:00 UTC is in Nederland 20:00 's avonds.
  saleStart: '2026-07-01T18:00:00.000Z',
  saleEnd: '2026-07-31T20:30:00.000Z',
  serviceFee: 0,
  showServiceFeeSeparate: false,
};

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

describe('het statistiektabblad als het ophalen mislukt', () => {
  beforeEach(() => {
    vi.mocked(api.getConcertStatistics).mockRejectedValue(new Error('geen verbinding'));
  });

  it('meldt de fout in plaats van een leeg tabblad te tonen', async () => {
    const gebruiker = userEvent.setup();
    render(<Concerts />, { wrapper: wikkel });
    await wachtTotGeladen();

    await gebruiker.click(tabblad('concerts.statistics'));

    // Een leeg tabblad is niet van een kapotte pagina te onderscheiden; dit
    // zegt wát er misging.
    await waitFor(() => expect(screen.getByText('concerts.statisticsError')).toBeInTheDocument());
  });

  it('biedt een knop om het opnieuw te proberen, en probeert het dan ook echt', async () => {
    const gebruiker = userEvent.setup();
    render(<Concerts />, { wrapper: wikkel });
    await wachtTotGeladen();

    await gebruiker.click(tabblad('concerts.statistics'));
    await waitFor(() => expect(screen.getByText('concerts.statisticsError')).toBeInTheDocument());

    const aantalVoorAfloop = vi.mocked(api.getConcertStatistics).mock.calls.length;
    await gebruiker.click(screen.getByRole('button', { name: /common.retry/ }));

    await waitFor(() =>
      expect(vi.mocked(api.getConcertStatistics).mock.calls.length).toBeGreaterThan(aantalVoorAfloop),
    );
  });

  it('toont na een geslaagde nieuwe poging alsnog de statistieken', async () => {
    const gebruiker = userEvent.setup();
    render(<Concerts />, { wrapper: wikkel });
    await wachtTotGeladen();

    await gebruiker.click(tabblad('concerts.statistics'));
    await waitFor(() => expect(screen.getByText('concerts.statisticsError')).toBeInTheDocument());

    vi.mocked(api.getConcertStatistics).mockResolvedValue({
      totalConcerts: 7,
      concertsPerYear: [],
      concertsPerType: [],
      mostPlayedPieces: [],
    });
    await gebruiker.click(screen.getByRole('button', { name: /common.retry/ }));

    await waitFor(() => expect(screen.getByText('concerts.bumaStemraExport')).toBeInTheDocument());
    expect(screen.getByText('7')).toBeInTheDocument();
  });
});

describe('de stukgeschiedenis tijdens het typen', () => {
  it('doet één verzoek voor een ingetypte titel, niet één per toetsaanslag', async () => {
    const gebruiker = userEvent.setup();
    render(<Concerts />, { wrapper: wikkel });
    await wachtTotGeladen();

    await gebruiker.click(tabblad('concerts.pieceHistory'));
    await gebruiker.type(screen.getByPlaceholderText('concerts.searchPieceHistory'), 'Bolero');

    await waitFor(() => expect(api.getPieceHistory).toHaveBeenCalledWith('Bolero'));
    // Zonder ontdubbeling stonden hier zes aanroepen: B, Bo, Bol, Bole, Boler,
    // Bolero. De halve titels zeggen niemand iets en de antwoorden erop komen
    // in willekeurige volgorde terug.
    expect(api.getPieceHistory).toHaveBeenCalledTimes(1);
    expect(api.getPieceHistory).not.toHaveBeenCalledWith('B');
    expect(api.getPieceHistory).not.toHaveBeenCalledWith('Boler');
  });

  it('vraagt de nieuwe titel op zodra het typen stilvalt', async () => {
    const gebruiker = userEvent.setup();
    render(<Concerts />, { wrapper: wikkel });
    await wachtTotGeladen();

    await gebruiker.click(tabblad('concerts.pieceHistory'));
    const veld = screen.getByPlaceholderText('concerts.searchPieceHistory');

    await gebruiker.type(veld, 'Bolero');
    await waitFor(() => expect(api.getPieceHistory).toHaveBeenCalledWith('Bolero'));

    await gebruiker.clear(veld);
    await gebruiker.type(veld, 'Carmen');

    // Ontdubbelen mag het verzoek uitstellen, niet overslaan.
    await waitFor(() => expect(api.getPieceHistory).toHaveBeenCalledWith('Carmen'));
  });
});

describe('de verkoopdata van een kaartsoort', () => {
  beforeEach(() => {
    vi.mocked(api.getConcerts).mockResolvedValue({ data: [CONCERT], total: 1, page: 1, limit: 50 });
    vi.mocked(api.getConcert).mockResolvedValue({
      ...CONCERT,
      program: [],
      media: [],
      attendance: [],
    });
    vi.mocked(api.getConcertTickets).mockResolvedValue({
      concert: {
        id: CONCERT.id,
        name: CONCERT.name,
        date: CONCERT.date,
        endDate: null,
        location: CONCERT.location,
        description: null,
        concertType: null,
      },
      ticketTypes: [KAARTSOORT],
      paymentMethods: [],
    });
  });

  /** Opent het concertdetail en daarin het bewerkscherm van de kaartsoort. */
  async function openBewerkschermVanKaartsoort(gebruiker: ReturnType<typeof userEvent.setup>): Promise<void> {
    render(<Concerts />, { wrapper: wikkel });
    await wachtTotGeladen();

    await gebruiker.click(screen.getByTestId('icon-eye').closest('button') as HTMLElement);
    const rij = (await screen.findByText('Voorverkoop')).closest('tr') as HTMLElement;
    await gebruiker.click(within(rij).getByTestId('icon-pencil').closest('button') as HTMLElement);
    await screen.findByText('tickets.editTicketType');
  }

  /**
   * De labels in dit formulier wijzen hun veld niet aan (geen `htmlFor`), dus
   * `getByLabelText` vindt niets. Daarom via het label naar de omringende
   * `form-group` en het invoerveld daarbinnen.
   */
  function veldBij(label: string): HTMLInputElement {
    const groep = screen.getByText(label).closest('.form-group');
    const veld = groep?.querySelector('input');
    if (!veld) throw new Error(`geen invoerveld bij "${label}"`);
    return veld as HTMLInputElement;
  }

  it('zet het tijdstip in het veld zoals de gebruiker het kent, niet in UTC', async () => {
    const gebruiker = userEvent.setup();
    await openBewerkschermVanKaartsoort(gebruiker);

    // De verkoop begint om 18:00 UTC; in Nederland is dat 20:00 's avonds.
    expect(veldBij('tickets.saleStart').value).toBe('2026-07-01T20:00');
    expect(veldBij('tickets.saleEnd').value).toBe('2026-07-31T22:30');
  });

  it('slaat hetzelfde tijdstip weer op als er niets veranderd is', async () => {
    const gebruiker = userEvent.setup();
    await openBewerkschermVanKaartsoort(gebruiker);

    await gebruiker.click(screen.getByRole('button', { name: /common.save/ }));

    // Openen en meteen opslaan verzette de verkoopstart eerder twee uur, en
    // elke volgende keer opnieuw.
    await waitFor(() =>
      expect(api.updateTicketType).toHaveBeenCalledWith(
        KAARTSOORT.id,
        expect.objectContaining({
          saleStart: '2026-07-01T18:00:00.000Z',
          saleEnd: '2026-07-31T20:30:00.000Z',
        }),
      ),
    );
  });
});
