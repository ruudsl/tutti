/**
 * Het kaartverkoopoverzicht van één concert.
 *
 * Dit scherm hangt open op de avond zelf en tijdens de voorverkoop. Wie ernaar
 * kijkt wil drie dingen weten: hoeveel er verkocht is, hoeveel er nog kan, en
 * wie er binnen is. De eerste twee zijn sommen - verkocht plus gastenlijst
 * tegen de capaciteit - en de derde staat achter een knop die pas dan de
 * bezoekerslijst ophaalt.
 *
 * Dat ophalen-op-verzoek is geen detail: de bezoekerslijst met namen en
 * adressen hoort niet vanzelf over de lijn te komen bij iedereen die het
 * overzicht openslaat. Dezelfde regel geldt voor de zaalkaart en de
 * voorspelling.
 *
 * Alles hier is een *wacht*: dit gedrag zat er al en de tests blijven ook op de
 * oude code groen. Ze houden de sommen en de knoppen vast.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import TicketDashboard from '../TicketDashboard';
import { getTicketDashboard, getSeatHeatmapData, getScannedTickets } from '../../api';

vi.mock('../../hooks/useDocumentTitle', () => ({ useDocumentTitle: () => {} }));

// De teksten met een aantal erin (nog x kaarten, y van z gescand) zijn hier de
// kern van de zaak, dus de meegegeven waarden komen achter de sleutel te staan.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (sleutel: string, opties?: unknown) =>
      opties && typeof opties === 'object' ? `${sleutel} ${JSON.stringify(opties)}` : sleutel,
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('../../components/Skeleton', () => ({
  SkeletonTable: () => <div data-testid="skelet-tabel" />,
  Skeleton: () => <div data-testid="skelet" />,
}));

vi.mock('../../components/SeatHeatmap', () => ({
  default: ({ mode, layout }: { mode: string; layout: { seats: unknown[] } }) => (
    <div data-testid="zaalkaart" data-modus={mode} data-stoelen={layout.seats.length} />
  ),
}));

vi.mock('../../components/SalesPredictionChart', () => ({
  SalesPredictionChart: ({ currentSales }: { currentSales: number }) => (
    <div data-testid="voorspelling" data-verkocht={currentSales} />
  ),
}));

vi.mock('../../api', () => ({
  getTicketDashboard: vi.fn(),
  getSeatHeatmapData: vi.fn(),
  getScannedTickets: vi.fn(),
}));

const OVERZICHT = {
  concertId: 'con-1',
  concertName: 'Najaarsconcert',
  concertDate: '2026-09-12T20:00:00.000Z',
  concertLocation: 'De Harmonie',
  totalTicketsSold: 120,
  totalCapacity: 200,
  revenueToday: 250,
  revenueThisWeek: 900,
  revenueAllTime: 2400,
  guestListTickets: 10,
  ticketTypes: [
    { id: 'tt-1', name: 'Volwassene', price: 20, quantity: 150, sold: 100, available: 50, revenue: 2000 },
    { id: 'tt-2', name: 'Kind', price: 10, quantity: 50, sold: 20, available: 30, revenue: 200 },
  ],
  salesOverTime: [
    { date: '2026-08-01', ticketsSold: 40, revenue: 800 },
    { date: '2026-08-08', ticketsSold: 80, revenue: 1600 },
  ],
  recentOrders: [
    {
      id: 'best-1',
      buyerName: 'Anna de Groot',
      buyerEmail: 'anna@example.org',
      total: 40,
      ticketCount: 2,
      status: 'paid' as const,
      createdAt: '2026-08-20T18:30:00.000Z',
    },
    {
      id: 'best-2',
      buyerName: 'Bram Bakker',
      buyerEmail: 'bram@example.org',
      total: 20,
      ticketCount: 1,
      status: 'pending' as const,
      createdAt: '2026-08-21T09:00:00.000Z',
    },
  ],
};

const ZAALKAART = {
  concertId: 'con-1',
  concertName: 'Najaarsconcert',
  concertDate: '2026-09-12',
  totalCapacity: 200,
  totalSold: 120,
  sections: [{ sectionId: 'sec-1', sectionName: 'Parterre', capacity: 100, sold: 60, revenue: 1200 }],
  seats: [{ seatId: 'st-1', sectionId: 'sec-1', rowLabel: 'A', seatLabel: 'A1', x: 10, y: 20, status: 'sold' }],
  salesPeriodStart: '2026-06-01',
  salesPeriodEnd: '2026-09-12',
};

const GESCAND = {
  concert: { id: 'con-1', name: 'Najaarsconcert', date: '2026-09-12' },
  summary: { totalTickets: 130, scannedCount: 65, scanPercentage: 50 },
  scannedTickets: [
    {
      id: 'k-1',
      buyerName: 'Anna de Groot',
      buyerEmail: 'anna@example.org',
      scannedAt: '2026-09-12T19:12:00.000Z',
      seatInfo: 'A1',
      status: 'used',
      ticketTypeName: 'Volwassene',
      ticketPrice: 20,
      validatedBy: 'Kees',
    },
    {
      id: 'k-2',
      buyerName: 'Bram Bakker',
      buyerEmail: 'bram@example.org',
      scannedAt: '2026-09-12T19:15:00.000Z',
      seatInfo: null,
      status: 'used',
      ticketTypeName: 'Kind',
      ticketPrice: 10,
      validatedBy: null,
    },
  ],
};

function toon(pad = '/concerts/con-1/dashboard') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const wikkel = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(
    <MemoryRouter initialEntries={[pad]}>
      <Routes>
        <Route path="/concerts/:concertId/dashboard" element={<TicketDashboard />} />
        <Route path="/dashboard" element={<TicketDashboard />} />
      </Routes>
    </MemoryRouter>,
    { wrapper: wikkel },
  );
}

/** Wacht tot de cijfers er staan; "verkochte kaarten" staat twee keer op de pagina. */
async function wachtOpCijfers() {
  return screen.findByText('ticketDashboard.capacityOverview');
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getTicketDashboard).mockResolvedValue(OVERZICHT);
  vi.mocked(getSeatHeatmapData).mockResolvedValue(ZAALKAART);
  vi.mocked(getScannedTickets).mockResolvedValue(GESCAND);
});

describe('kaartoverzicht - zonder bruikbaar concert', () => {
  it('vraagt om een concert in plaats van een leeg overzicht te tekenen', async () => {
    toon('/dashboard');

    expect(await screen.findByText('ticketDashboard.noConcertSelected')).toBeInTheDocument();
    expect(getTicketDashboard).not.toHaveBeenCalled();
  });

  it('biedt bij een mislukte oproep de weg terug naar de concerten', async () => {
    vi.mocked(getTicketDashboard).mockRejectedValue(new Error('kapot'));
    toon();

    expect(await screen.findByText('ticketDashboard.loadError')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'common.back' })).toHaveAttribute('href', '/concerts');
  });

  it('toont een skelet zolang de cijfers onderweg zijn', async () => {
    vi.mocked(getTicketDashboard).mockImplementation(() => new Promise(() => {}));
    toon();

    expect(await screen.findAllByTestId('skelet-tabel')).toHaveLength(2);
  });
});

describe('kaartoverzicht - de cijfers', () => {
  it('zet het concert met datum en zaal boven de pagina', async () => {
    toon();

    expect(await screen.findByRole('heading', { name: 'ticketDashboard.title' })).toBeInTheDocument();
    expect(screen.getByText(/Najaarsconcert/)).toHaveTextContent('De Harmonie');
  });

  it('toont het aantal verkochte kaarten en de omzet', async () => {
    toon();

    await wachtOpCijfers();
    const kaart = (label: string) =>
      Array.from(document.querySelectorAll('.stat-card-grid .card'))
        .find((k) => k.querySelector('.stat-label')?.textContent === label)
        ?.querySelector('.stat-number')?.textContent;

    expect(kaart('ticketDashboard.ticketsSold')).toContain('120');
    expect(kaart('ticketDashboard.revenueThisWeek')).toMatch(/900/);
    expect(kaart('ticketDashboard.revenueAllTime')).toMatch(/2\D?400/);
  });

  it('telt gastenlijst mee in de bezetting en meldt wat er over is', async () => {
    toon();

    // 120 verkocht + 10 gasten van 200 = 65 procent, en 70 kaarten over.
    expect(await screen.findByText('130 / 200 (65%)')).toBeInTheDocument();
    expect(screen.getByText('ticketDashboard.ticketsAvailable {"count":70}')).toBeInTheDocument();
    expect(screen.getByText(/ticketDashboard.available \(70\)/)).toBeInTheDocument();
  });

  it('zegt uitverkocht zodra er niets meer over is', async () => {
    vi.mocked(getTicketDashboard).mockResolvedValue({
      ...OVERZICHT,
      totalTicketsSold: 190,
      guestListTickets: 10,
    });
    toon();

    expect(await screen.findByText('ticketDashboard.soldOut')).toBeInTheDocument();
    expect(screen.queryByText(/ticketDashboard.ticketsAvailable/)).toBeNull();
  });

  it('zet per kaartsoort het verkochte aantal tegen de voorraad', async () => {
    toon();

    expect(await screen.findByText('Volwassene')).toBeInTheDocument();
    expect(screen.getByText(/100 \/ 150/)).toHaveTextContent(/2\D?000/);
    expect(screen.getByText(/20 \/ 50/)).toBeInTheDocument();
  });

  it('zegt het als er nog geen kaartsoorten zijn', async () => {
    vi.mocked(getTicketDashboard).mockResolvedValue({ ...OVERZICHT, ticketTypes: [] });
    toon();

    expect(await screen.findByText('ticketDashboard.noTicketTypes')).toBeInTheDocument();
  });

  it('tekent het verloop van de verkoop met een punt per dag', async () => {
    toon();

    await screen.findByText('ticketDashboard.salesOverTime');
    // Elk punt draagt zijn eigen dag, aantal en omzet als bijschrift; dat is
    // wat iemand met de muis erop te zien krijgt.
    const bijschriften = Array.from(document.querySelectorAll('svg circle title')).map((t) => t.textContent);
    expect(bijschriften).toHaveLength(2);
    expect(bijschriften[0]).toContain('40 tickets.tickets');
    expect(bijschriften[1]).toContain('80 tickets.tickets');
  });

  it('zegt het als er nog niets verkocht is', async () => {
    vi.mocked(getTicketDashboard).mockResolvedValue({ ...OVERZICHT, salesOverTime: [] });
    toon();

    expect(await screen.findByText('ticketDashboard.noSalesData')).toBeInTheDocument();
  });
});

describe('kaartoverzicht - de laatste bestellingen', () => {
  it('toont koper, aantal, bedrag en stand', async () => {
    toon();

    const rij = (await screen.findByText('Anna de Groot')).closest('tr') as HTMLElement;
    expect(within(rij).getByText('anna@example.org')).toBeInTheDocument();
    expect(within(rij).getByText('2')).toBeInTheDocument();
    expect(within(rij).getByText(/40/)).toBeInTheDocument();
    expect(within(rij).getByText('tickets.status.paid')).toBeInTheDocument();

    const tweede = screen.getByText('Bram Bakker').closest('tr') as HTMLElement;
    expect(within(tweede).getByText('tickets.status.pending')).toBeInTheDocument();
  });

  it('zegt het als er nog geen bestellingen zijn', async () => {
    vi.mocked(getTicketDashboard).mockResolvedValue({ ...OVERZICHT, recentOrders: [] });
    toon();

    expect(await screen.findByText('ticketDashboard.noOrders')).toBeInTheDocument();
  });

  it('verwijst naar de volledige verkooplijst van dit concert', async () => {
    toon();

    const koppelingen = await screen.findAllByRole('link', { name: /tickets.sales|ticketDashboard.viewAll/ });
    for (const koppeling of koppelingen) {
      expect(koppeling).toHaveAttribute('href', '/ticket-sales?concertId=con-1');
    }
    expect(screen.getAllByRole('link', { name: /guestList.title|ticketDashboard.manageGuestList/ })[0]).toHaveAttribute(
      'href',
      '/concerts/con-1/guest-list',
    );
  });
});

describe('kaartoverzicht - wat pas op verzoek wordt opgehaald', () => {
  it('haalt de zaalkaart pas op als erom gevraagd wordt', async () => {
    const gebruiker = userEvent.setup();
    toon();

    await wachtOpCijfers();
    expect(getSeatHeatmapData).not.toHaveBeenCalled();

    await gebruiker.click(screen.getByRole('button', { name: 'heatmap.title' }));

    expect(await screen.findByTestId('zaalkaart')).toHaveAttribute('data-modus', 'sales_speed');
    expect(getSeatHeatmapData).toHaveBeenCalledWith('con-1');
    expect(screen.getByTestId('zaalkaart')).toHaveAttribute('data-stoelen', '1');
  });

  it('wisselt de zaalkaart van invalshoek', async () => {
    const gebruiker = userEvent.setup();
    toon();

    await wachtOpCijfers();
    await gebruiker.click(screen.getByRole('button', { name: 'heatmap.title' }));
    await screen.findByTestId('zaalkaart');

    await gebruiker.click(screen.getByRole('button', { name: 'heatmap.popularity' }));
    expect(screen.getByTestId('zaalkaart')).toHaveAttribute('data-modus', 'popularity');

    await gebruiker.click(screen.getByRole('button', { name: 'heatmap.pricePerformanceMode' }));
    expect(screen.getByTestId('zaalkaart')).toHaveAttribute('data-modus', 'price_performance');
  });

  it('zegt het als er van deze zaal geen kaart is', async () => {
    vi.mocked(getSeatHeatmapData).mockRejectedValue(new Error('geen indeling'));
    const gebruiker = userEvent.setup();
    toon();

    await wachtOpCijfers();
    await gebruiker.click(screen.getByRole('button', { name: 'heatmap.title' }));

    expect(await screen.findByText('heatmap.noData')).toBeInTheDocument();
  });

  it('haalt de bezoekerslijst pas op als iemand hem opvraagt', async () => {
    const gebruiker = userEvent.setup();
    toon();

    await wachtOpCijfers();
    // Namen en adressen van bezoekers horen niet mee te komen bij iedereen die
    // dit overzicht openslaat.
    expect(getScannedTickets).not.toHaveBeenCalled();

    await gebruiker.click(screen.getByRole('button', { name: 'ticketDashboard.showAttendees' }));

    // Namen en kaartsoorten staan ook in de bestellingen en de staafjes
    // hierboven, dus alles wordt binnen de bezoekerstabel gezocht.
    const tabel = (await screen.findByText('ticketDashboard.validatedBy')).closest('table') as HTMLElement;
    const rijen = within(tabel).getAllByRole('row');
    expect(within(rijen[1]).getByText('Anna de Groot')).toBeInTheDocument();
    expect(within(rijen[1]).getByText('Volwassene')).toBeInTheDocument();
    expect(within(rijen[1]).getByText('Kees')).toBeInTheDocument();
    // Wie de kaart afstempelde is niet altijd bekend; dan een streepje.
    expect(within(rijen[2]).getByText('-')).toBeInTheDocument();
  });

  it('toont hoeveel er van de kaarten al gescand is', async () => {
    const gebruiker = userEvent.setup();
    toon();

    await wachtOpCijfers();
    await gebruiker.click(screen.getByRole('button', { name: 'ticketDashboard.showAttendees' }));

    expect(
      await screen.findByText('ticketDashboard.scannedSummary {"scanned":65,"total":130,"percentage":50}'),
    ).toBeInTheDocument();
  });

  it('klapt de bezoekerslijst weer dicht', async () => {
    const gebruiker = userEvent.setup();
    toon();

    await wachtOpCijfers();
    await gebruiker.click(screen.getByRole('button', { name: 'ticketDashboard.showAttendees' }));
    await screen.findByText('Kees');

    await gebruiker.click(screen.getByRole('button', { name: 'common.hide' }));
    expect(screen.queryByText('Kees')).toBeNull();
    expect(screen.queryByText('ticketDashboard.validatedBy')).toBeNull();
  });

  it('zegt het als er nog niemand gescand is', async () => {
    vi.mocked(getScannedTickets).mockResolvedValue({
      ...GESCAND,
      summary: { totalTickets: 130, scannedCount: 0, scanPercentage: 0 },
      scannedTickets: [],
    });
    const gebruiker = userEvent.setup();
    toon();

    await wachtOpCijfers();
    await gebruiker.click(screen.getByRole('button', { name: 'ticketDashboard.showAttendees' }));

    expect(await screen.findByText('ticketDashboard.noScannedTickets')).toBeInTheDocument();
  });

  it('toont de voorspelling pas na een klik', async () => {
    const gebruiker = userEvent.setup();
    toon();

    await wachtOpCijfers();
    expect(screen.queryByTestId('voorspelling')).toBeNull();

    await gebruiker.click(screen.getByRole('button', { name: 'predictions.title' }));
    expect(screen.getByTestId('voorspelling')).toHaveAttribute('data-verkocht', '120');
  });
});
