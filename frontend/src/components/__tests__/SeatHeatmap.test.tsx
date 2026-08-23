/**
 * Warmtekaart van de zaal.
 *
 * SeatHeatmap haalt de verkoopcijfers op en tekent ze twee keer: als vakken
 * (de standaardweergave) en als losse stoelen. Wat een gebruiker hier doet is
 * beperkt - schakelen tussen beide weergaven en een stoel aanwijzen - maar wat
 * hij ziet is dat niet: de kop met de verkochte aantallen, de tabel per vak en
 * de toelichting bij een stoel.
 *
 * De tekening zelf wordt niet nagemeten. Wel wordt gecontroleerd dat er
 * evenveel stoelen op de kaart staan als de indeling zegt, en dat een lege
 * indeling geen onzin in het beeld zet.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitForElementToBeRemoved, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import SeatHeatmap from '../SeatHeatmap';
import * as api from '../../api';
import type { SeatHeatmapData, VenueLayout } from '../../types';

vi.mock('../../api');

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (sleutel: string, opties?: Record<string, unknown>) =>
      opties ? `${sleutel} ${Object.values(opties).join(' ')}` : sleutel,
    i18n: { language: 'nl' },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('../../utils/locale', () => ({ currentLocale: () => 'nl-NL' }));

const indeling: VenueLayout = {
  id: 'indeling-1',
  concertId: 'c1',
  name: 'Grote zaal',
  width: 600,
  height: 400,
  sections: [
    { id: 'vak-1', name: 'Parterre', rowNumber: 1, capacity: 3, sortOrder: 1 },
    { id: 'vak-2', name: 'Balkon', rowNumber: 2, capacity: 2, sortOrder: 1 },
  ],
  rows: [
    { id: 'rij-a', sectionId: 'vak-1', rowLabel: 'A', seatCount: 3, sortOrder: 1 },
    { id: 'rij-b', sectionId: 'vak-2', rowLabel: 'B', seatCount: 2, sortOrder: 1 },
  ],
  seats: [
    { id: 's1', rowId: 'rij-a', sectionId: 'vak-1', seatLabel: '1', x: 0, y: 0 },
    { id: 's2', rowId: 'rij-a', sectionId: 'vak-1', seatLabel: '2', x: 20, y: 0 },
    { id: 's3', rowId: 'rij-a', sectionId: 'vak-1', seatLabel: '3', x: 40, y: 0 },
    { id: 's4', rowId: 'rij-b', sectionId: 'vak-2', seatLabel: '1', x: 0, y: 60 },
    { id: 's5', rowId: 'rij-b', sectionId: 'vak-2', seatLabel: '2', x: 20, y: 60 },
  ],
};

const cijfers: SeatHeatmapData = {
  concertId: 'c1',
  concertName: 'Nieuwjaarsconcert',
  concertDate: '2026-01-04',
  totalCapacity: 5,
  totalSold: 3,
  salesPeriodStart: '2025-11-01',
  salesPeriodEnd: '2026-01-04',
  sections: [
    {
      sectionId: 'vak-1',
      sectionName: 'Parterre',
      capacity: 3,
      sold: 2,
      revenue: 50,
      averagePrice: 25,
      salesVelocity: 4.5,
      timeToSellOut: null,
      popularityScore: 80,
      pricePerformanceScore: 40,
    },
    {
      sectionId: 'vak-2',
      sectionName: 'Balkon',
      capacity: 2,
      sold: 1,
      revenue: 15,
      averagePrice: 15,
      salesVelocity: 1,
      timeToSellOut: null,
      popularityScore: 20,
      pricePerformanceScore: 90,
    },
  ],
  seats: [
    {
      seatId: 's1',
      sectionId: 'vak-1',
      rowLabel: 'A',
      seatLabel: '1',
      x: 0,
      y: 0,
      status: 'sold',
      soldAt: '2025-11-02T10:00:00Z',
      price: 25,
      ticketTypeId: 't1',
      ticketTypeName: 'Normaal',
      timeToSell: 7200,
      salesSpeedPercentile: 90,
    },
    {
      seatId: 's2',
      sectionId: 'vak-1',
      rowLabel: 'A',
      seatLabel: '2',
      x: 20,
      y: 0,
      status: 'sold',
      soldAt: '2025-12-02T10:00:00Z',
      price: 25,
      ticketTypeId: 't1',
      ticketTypeName: 'Normaal',
      timeToSell: 36000,
      salesSpeedPercentile: 40,
    },
    {
      seatId: 's3',
      sectionId: 'vak-1',
      rowLabel: 'A',
      seatLabel: '3',
      x: 40,
      y: 0,
      status: 'available',
      soldAt: null,
      price: null,
      ticketTypeId: null,
      ticketTypeName: null,
      timeToSell: null,
      salesSpeedPercentile: null,
    },
    {
      seatId: 's4',
      sectionId: 'vak-2',
      rowLabel: 'B',
      seatLabel: '1',
      x: 0,
      y: 60,
      status: 'sold',
      soldAt: '2025-11-20T10:00:00Z',
      price: 15,
      ticketTypeId: 't2',
      ticketTypeName: 'Balkon',
      timeToSell: 3600,
      salesSpeedPercentile: 60,
    },
    {
      seatId: 's5',
      sectionId: 'vak-2',
      rowLabel: 'B',
      seatLabel: '2',
      x: 20,
      y: 60,
      status: 'available',
      soldAt: null,
      price: null,
      ticketTypeId: null,
      ticketTypeName: null,
      timeToSell: null,
      salesSpeedPercentile: null,
    },
  ],
};

const legeIndeling: VenueLayout = {
  ...indeling,
  sections: [],
  rows: [],
  seats: [],
};

const legeCijfers: SeatHeatmapData = {
  ...cijfers,
  totalCapacity: 0,
  totalSold: 0,
  sections: [],
  seats: [],
};

function omhulsel({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function toon(props: Partial<React.ComponentProps<typeof SeatHeatmap>> = {}) {
  return render(<SeatHeatmap concertId="c1" layout={indeling} mode="popularity" {...props} />, {
    wrapper: omhulsel,
  });
}

/** De vierkantjes van losse stoelen; die zijn 16 breed. */
function stoelvakjes(): SVGRectElement[] {
  return Array.from(document.querySelectorAll<SVGRectElement>('rect[width="16"]'));
}

const opgehaald = vi.mocked(api.getSeatHeatmapData);

describe('SeatHeatmap - ophalen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('toont dat de cijfers nog onderweg zijn', () => {
    opgehaald.mockReturnValue(new Promise(() => {}));
    toon();

    expect(screen.getByText('common.loading')).toBeInTheDocument();
  });

  it('meldt het als de cijfers niet op te halen zijn', async () => {
    opgehaald.mockRejectedValue(new Error('kapot'));
    toon();

    expect(await screen.findByText('heatmap.loadError')).toBeInTheDocument();
  });
});

describe('SeatHeatmap - wat er in beeld komt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    opgehaald.mockResolvedValue(cijfers);
  });

  it('toont de naam van het concert en hoeveel er verkocht is', async () => {
    toon();

    expect(await screen.findByText('Nieuwjaarsconcert')).toBeInTheDocument();
    expect(screen.getByText(/heatmap\.soldCount 3 5/)).toBeInTheDocument();
    expect(screen.getByText(/60% heatmap\.sold/)).toBeInTheDocument();
  });

  it('geeft elk vak een regel in de tabel met verkocht, opbrengst en gemiddelde prijs', async () => {
    toon();

    await screen.findByText('heatmap.sectionStats');
    const regels = document.querySelectorAll('tbody tr');
    expect(regels).toHaveLength(cijfers.sections.length);

    // De naam staat ook op de tekening, dus zoeken binnen de tabel.
    const parterre = within(document.querySelector('tbody')!).getByText('Parterre').closest('tr')!;
    expect(parterre).toHaveTextContent('2/3');
    expect(parterre).toHaveTextContent('67%');
  });

  it('tekent in de vakkenweergave nog geen losse stoelen', async () => {
    toon();

    await screen.findByText('Nieuwjaarsconcert');
    expect(stoelvakjes()).toHaveLength(0);
    // De vakken zelf staan er wel, met hun naam en bezetting.
    expect(screen.getAllByText('Parterre').length).toBeGreaterThan(0);
    expect(screen.getByText(/2\/3 heatmap\.seats/)).toBeInTheDocument();
  });

  it('tekent na het omschakelen evenveel stoelen als de indeling telt', async () => {
    const gebruiker = userEvent.setup();
    toon();

    await screen.findByText('Nieuwjaarsconcert');
    await gebruiker.click(screen.getByRole('button', { name: 'heatmap.viewSeats' }));

    expect(stoelvakjes()).toHaveLength(indeling.seats.length);

    // En terug.
    await gebruiker.click(screen.getByRole('button', { name: 'heatmap.viewSections' }));
    expect(stoelvakjes()).toHaveLength(0);
  });

  it('toont bij het aanwijzen van een verkochte stoel het vak, de rij en de prijs', async () => {
    const gebruiker = userEvent.setup();
    toon();

    await screen.findByText('Nieuwjaarsconcert');
    await gebruiker.click(screen.getByRole('button', { name: 'heatmap.viewSeats' }));
    await gebruiker.hover(stoelvakjes()[0]);

    const toelichting = document.querySelector('.seat-tooltip')!;
    expect(toelichting).toHaveTextContent('Parterre');
    expect(toelichting).toHaveTextContent('heatmap.row A');
    expect(toelichting).toHaveTextContent('heatmap.seat 1');
    expect(toelichting).toHaveTextContent('heatmap.sold');

    await gebruiker.unhover(stoelvakjes()[0]);
    expect(document.querySelector('.seat-tooltip')).toBeNull();
  });

  it('meldt bij een onverkochte stoel dat hij nog vrij is', async () => {
    const gebruiker = userEvent.setup();
    toon();

    await screen.findByText('Nieuwjaarsconcert');
    await gebruiker.click(screen.getByRole('button', { name: 'heatmap.viewSeats' }));
    // De derde stoel van Parterre is niet verkocht.
    await gebruiker.hover(stoelvakjes()[2]);

    expect(document.querySelector('.seat-tooltip')).toHaveTextContent('heatmap.available');
  });
});

describe('SeatHeatmap - de drie maatstaven', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    opgehaald.mockResolvedValue(cijfers);
  });

  it('toont bij verkoopsnelheid het aantal per dag', async () => {
    toon({ mode: 'sales_speed' });

    await screen.findByText('heatmap.sectionStats');
    expect(screen.getByText('4.5/day')).toBeInTheDocument();
    expect(screen.getByText('1.0/day')).toBeInTheDocument();
  });

  it('toont bij populariteit de score van het vak', async () => {
    toon({ mode: 'popularity' });

    await screen.findByText('heatmap.sectionStats');
    expect(screen.getByText('80%')).toBeInTheDocument();
    expect(screen.getByText('20%')).toBeInTheDocument();
  });

  it('toont bij prijsprestatie die score, en niet de populariteit', async () => {
    toon({ mode: 'price_performance' });

    await screen.findByText('heatmap.sectionStats');
    expect(screen.getByText('40%')).toBeInTheDocument();
    expect(screen.getByText('90%')).toBeInTheDocument();
    expect(screen.queryByText('80%')).not.toBeInTheDocument();
  });
});

describe('SeatHeatmap - een lege indeling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    opgehaald.mockResolvedValue(legeCijfers);
  });

  /**
   * BEWIJS. Een zaal waarvan de indeling nog niet gemaakt is, gaf een tekening
   * met een breedte van min oneindig: `Math.max(...[])` levert `-Infinity`, en
   * dat kwam ongefilterd in het viewBox-kenmerk en in de breedte van de
   * achtergrond terecht. Het podiumbalkje kwam op x = -Infinity te staan.
   * Zonder de reparatie in SeatHeatmap.tsx faalt deze test op het viewBox.
   */
  it('houdt de afmetingen van de tekening eindig', async () => {
    render(<SeatHeatmap concertId="c1" layout={legeIndeling} mode="popularity" />, { wrapper: omhulsel });

    await waitForElementToBeRemoved(() => screen.queryByText('common.loading'));

    const tekening = document.querySelector('svg')!;
    const viewBox = tekening.getAttribute('viewBox')!;
    expect(viewBox).not.toMatch(/Infinity|NaN/);
    for (const getal of viewBox.split(' ')) {
      expect(Number.isFinite(Number(getal))).toBe(true);
    }
  });

  /**
   * BEWIJS. Bij een capaciteit van nul deelde de kop door nul en zette
   * 'NaN% verkocht' in beeld. Zonder de reparatie faalt deze test.
   */
  it('zet geen NaN in de kop als er nog geen stoelen zijn', async () => {
    render(<SeatHeatmap concertId="c1" layout={legeIndeling} mode="popularity" />, { wrapper: omhulsel });

    await waitForElementToBeRemoved(() => screen.queryByText('common.loading'));

    expect(document.body.textContent).not.toMatch(/NaN/);
    expect(screen.getByText(/0% heatmap\.sold/)).toBeInTheDocument();
  });

  it('laat de tabel met vakken weg zolang er geen vakken zijn', async () => {
    render(<SeatHeatmap concertId="c1" layout={legeIndeling} mode="popularity" />, { wrapper: omhulsel });

    await waitForElementToBeRemoved(() => screen.queryByText('common.loading'));

    expect(screen.queryByText('heatmap.sectionStats')).not.toBeInTheDocument();
    expect(stoelvakjes()).toHaveLength(0);
  });
});
