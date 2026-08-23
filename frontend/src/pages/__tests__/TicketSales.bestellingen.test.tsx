/**
 * De kaartverkoopadministratie: bestellingen nalopen, inzien en terugbetalen.
 *
 * Wat hier gebeurt raakt geld, dus er zitten twee grendels in. Terugbetalen kan
 * alleen bij een bestelling die betaald ís - bij de rest staat de knop er niet
 * eens - en het gaat pas door na een venster dat het bedrag en de naam van de
 * koper herhaalt. De betaalgegevens komen daarnaast pas bij het openen van een
 * bestelling van de server, en niet vast voor de hele lijst.
 *
 * De labels van de filters liggen al vast in TicketSales.labels.test.tsx; deze
 * tests gaan over de lijst zelf, de twee vensters, het bladeren en de uitvoer
 * naar een bestand.
 *
 * Alles hier is een *wacht*: het gedrag zat er al en deze tests blijven ook op
 * de oude code groen.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import TicketSales from '../TicketSales';
import { getTicketSales, getPaymentDetails, exportTicketSalesCsv, refundOrder } from '../../api';
import { showSuccess, showError } from '../../utils/toast';

vi.mock('../../hooks/useDocumentTitle', () => ({ useDocumentTitle: () => {} }));

// De bedragen en aantallen in de meldingen zijn hier de kern van de zaak, dus
// wat er aan een tekst wordt meegegeven komt achter de sleutel te staan.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (sleutel: string, opties?: unknown) =>
      opties && typeof opties === 'object' ? `${sleutel} ${JSON.stringify(opties)}` : sleutel,
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('../../components/Skeleton', () => ({ SkeletonTable: () => <div data-testid="skelet-tabel" /> }));

vi.mock('../../utils/toast', () => ({ showSuccess: vi.fn(), showError: vi.fn() }));

vi.mock('../../hooks/useConcerts', () => ({
  useConcerts: () => ({ data: { data: [{ id: 'con-1', name: 'Najaarsconcert' }] } }),
}));

vi.mock('../../api', () => ({
  getTicketSales: vi.fn(),
  getPaymentDetails: vi.fn(),
  exportTicketSalesCsv: vi.fn(),
  refundOrder: vi.fn(),
}));

const BETAALD = {
  id: 'best-1',
  concertId: 'con-1',
  concertName: 'Najaarsconcert',
  concertDate: '2026-09-12T20:00:00.000Z',
  concertLocation: 'De Harmonie',
  total: 40,
  status: 'paid' as const,
  paymentId: 'tr_123',
  paymentMethod: 'ideal',
  buyerName: 'Anna de Groot',
  buyerEmail: 'anna@example.org',
  buyerPhone: '06-12345678',
  expiresAt: null,
  paidAt: '2026-08-20T18:35:00.000Z',
  createdAt: '2026-08-20T18:30:00.000Z',
  updatedAt: '2026-08-20T18:35:00.000Z',
  ticketCount: 2,
  items: [{ ticketTypeId: 'tt-1', name: 'Volwassene', quantity: 2, unitPrice: 20 }],
};

const OPENSTAAND = {
  ...BETAALD,
  id: 'best-2',
  status: 'pending' as const,
  paymentId: null,
  paymentMethod: null,
  buyerName: 'Bram Bakker',
  buyerEmail: 'bram@example.org',
  buyerPhone: null,
  paidAt: null,
  total: 20,
  ticketCount: 1,
  items: [{ ticketTypeId: 'tt-2', name: 'Kind', quantity: 1, unitPrice: 20 }],
};

const LIJST = {
  orders: [BETAALD, OPENSTAAND],
  pagination: { page: 1, limit: 25, total: 2, totalPages: 1 },
  summary: { totalOrders: 2, paidOrders: 1, totalRevenue: 60, pendingOrders: 1, refundedOrders: 0 },
};

function wikkel({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function toon() {
  const gebruiker = userEvent.setup();
  render(<TicketSales />, { wrapper: wikkel });
  return gebruiker;
}

/** De rij van een bestelling, gezocht op de naam van de koper. */
async function rijVan(koper: string) {
  return (await screen.findByText(koper)).closest('tr') as HTMLElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getTicketSales).mockResolvedValue(LIJST);
  vi.mocked(getPaymentDetails).mockResolvedValue({
    orderId: 'best-1',
    paymentId: 'tr_123',
    provider: 'mollie',
    details: { id: 'tr_123', status: 'paid', amount: 40, method: 'ideal', paidAt: '2026-08-20T18:35:00.000Z' },
  });
  vi.mocked(exportTicketSalesCsv).mockResolvedValue(undefined);
  vi.mocked(refundOrder).mockResolvedValue(undefined);
});

describe('kaartverkoop - de lijst', () => {
  it('telt bestellingen, betaalde bestellingen, omzet en openstaande', async () => {
    toon();

    await rijVan('Anna de Groot');
    const kaart = (label: string) =>
      Array.from(document.querySelectorAll('.card'))
        .find((k) => k.textContent?.startsWith(label))
        ?.textContent?.slice(label.length);

    expect(kaart('tickets.totalOrders')).toBe('2');
    expect(kaart('tickets.paidOrders')).toBe('1');
    expect(kaart('tickets.totalRevenue')).toMatch(/60/);
    expect(kaart('tickets.pendingOrders')).toBe('1');
  });

  it('zet per bestelling de koper, het aantal, het bedrag en de stand', async () => {
    toon();

    const rij = await rijVan('Anna de Groot');
    expect(within(rij).getByText('anna@example.org')).toBeInTheDocument();
    expect(within(rij).getByText('2')).toBeInTheDocument();
    expect(within(rij).getByText(/40/)).toBeInTheDocument();
    expect(within(rij).getByText('tickets.status.paid')).toBeInTheDocument();
    expect(within(rij).getByText('ideal')).toBeInTheDocument();
  });

  it('zet een streepje waar geen betaalwijze bekend is', async () => {
    toon();

    const rij = await rijVan('Bram Bakker');
    expect(within(rij).getByText('-')).toBeInTheDocument();
    expect(within(rij).getByText('tickets.status.pending')).toBeInTheDocument();
  });

  it('biedt terugbetalen alleen aan bij een betaalde bestelling', async () => {
    toon();

    const betaald = await rijVan('Anna de Groot');
    expect(within(betaald).getByTitle('tickets.refund')).toBeInTheDocument();

    const openstaand = await rijVan('Bram Bakker');
    // Er valt niets terug te betalen wat nooit binnenkwam.
    expect(within(openstaand).queryByTitle('tickets.refund')).toBeNull();
    expect(within(openstaand).getByTitle('tickets.viewDetails')).toBeInTheDocument();
  });

  it('zegt het als er niets gevonden is', async () => {
    vi.mocked(getTicketSales).mockResolvedValue({
      ...LIJST,
      orders: [],
      pagination: { page: 1, limit: 25, total: 0, totalPages: 1 },
    });
    toon();

    expect(await screen.findByText('tickets.noSalesFound')).toBeInTheDocument();
  });
});

describe('kaartverkoop - een bestelling inzien', () => {
  it('haalt de betaalgegevens pas op bij het openen', async () => {
    const gebruiker = toon();

    const rij = await rijVan('Anna de Groot');
    expect(getPaymentDetails).not.toHaveBeenCalled();

    await gebruiker.click(within(rij).getByTitle('tickets.viewDetails'));

    await waitFor(() => expect(getPaymentDetails).toHaveBeenCalledWith('best-1'));
  });

  it('toont de bestelling, de koper en de regels met hun subtotaal', async () => {
    const gebruiker = toon();

    const rij = await rijVan('Anna de Groot');
    await gebruiker.click(within(rij).getByTitle('tickets.viewDetails'));

    const venster = await screen.findByRole('dialog');
    expect(within(venster).getByText('best-1')).toBeInTheDocument();
    expect(within(venster).getByText('06-12345678')).toBeInTheDocument();
    expect(within(venster).getByText('Volwassene')).toBeInTheDocument();
    // Twee stuks van 20: het subtotaal wordt hier uitgerekend en niet
    // meegestuurd.
    const regel = within(venster).getByText('Volwassene').closest('tr') as HTMLElement;
    expect(within(regel).getAllByText(/40/)).not.toHaveLength(0);
    expect(within(venster).getByText('mollie')).toBeInTheDocument();
    expect(within(venster).getByText('tr_123')).toBeInTheDocument();
  });

  it('zet een streepje waar geen telefoonnummer bekend is', async () => {
    const gebruiker = toon();

    const rij = await rijVan('Bram Bakker');
    await gebruiker.click(within(rij).getByTitle('tickets.viewDetails'));

    const venster = await screen.findByRole('dialog');
    expect(within(venster).getByText('tickets.buyerInfo')).toBeInTheDocument();
    expect(within(venster).getAllByText('-').length).toBeGreaterThan(0);
  });

  it('houdt de betaalregels leeg bij een bestelling die nooit betaald is', async () => {
    vi.mocked(getPaymentDetails).mockResolvedValue({
      orderId: 'best-2',
      paymentId: null,
      provider: null,
      details: null,
    });
    const gebruiker = toon();

    const rij = await rijVan('Bram Bakker');
    await gebruiker.click(within(rij).getByTitle('tickets.viewDetails'));

    const venster = await screen.findByRole('dialog');
    await waitFor(() => expect(getPaymentDetails).toHaveBeenCalledWith('best-2'));
    // Er is wel een antwoord, alleen zonder betaling erin: dan blijven de
    // regels op een streepje staan en komt er geen verzonnen betaalwijze.
    expect(within(venster).getByText('tickets.paymentProvider:')).toBeInTheDocument();
    expect(within(venster).queryByText('tickets.paymentStatus:')).toBeNull();
  });

  it('meldt het als de betaalgegevens niet op te halen zijn', async () => {
    vi.mocked(getPaymentDetails).mockRejectedValue(new Error('betaaldienst onbereikbaar'));
    const gebruiker = toon();

    const rij = await rijVan('Anna de Groot');
    await gebruiker.click(within(rij).getByTitle('tickets.viewDetails'));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('betaaldienst onbereikbaar'));
    // Het venster blijft staan: de bestelgegevens zelf zijn er wel.
    expect(await screen.findByText('tickets.noPaymentInfo')).toBeInTheDocument();
  });
});

describe('kaartverkoop - terugbetalen', () => {
  it('noemt bedrag en koper voordat er iets gebeurt', async () => {
    const gebruiker = toon();

    const rij = await rijVan('Anna de Groot');
    await gebruiker.click(within(rij).getByTitle('tickets.refund'));

    const venster = await screen.findByRole('dialog');
    expect(within(venster).getByText(/tickets.refundWarning/)).toHaveTextContent('Anna de Groot');
    expect(refundOrder).not.toHaveBeenCalled();
  });

  it('stuurt de reden mee en haalt de lijst daarna opnieuw op', async () => {
    const gebruiker = toon();

    const rij = await rijVan('Anna de Groot');
    await gebruiker.click(within(rij).getByTitle('tickets.refund'));
    await gebruiker.type(await screen.findByLabelText('tickets.refundReason'), 'Concert afgelast');
    await gebruiker.click(screen.getByRole('button', { name: 'tickets.refund' }));

    await waitFor(() => expect(refundOrder).toHaveBeenCalledWith('best-1', 'Concert afgelast'));
    expect(showSuccess).toHaveBeenCalledWith('tickets.refundSuccess');
    // De lijst wordt opnieuw opgehaald, anders staat de bestelling nog als
    // betaald op het scherm.
    await waitFor(() => expect(vi.mocked(getTicketSales).mock.calls.length).toBeGreaterThan(1));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('meldt het als terugbetalen mislukt en laat het venster staan', async () => {
    vi.mocked(refundOrder).mockRejectedValue(new Error('betaling al verwerkt'));
    const gebruiker = toon();

    const rij = await rijVan('Anna de Groot');
    await gebruiker.click(within(rij).getByTitle('tickets.refund'));
    await gebruiker.click(await screen.findByRole('button', { name: 'tickets.refund' }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('betaling al verwerkt'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('doet niets als het venster wordt weggeklikt', async () => {
    const gebruiker = toon();

    const rij = await rijVan('Anna de Groot');
    await gebruiker.click(within(rij).getByTitle('tickets.refund'));
    await gebruiker.click(await screen.findByRole('button', { name: 'common.cancel' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(refundOrder).not.toHaveBeenCalled();
  });
});

describe('kaartverkoop - filteren, bladeren en uitvoeren', () => {
  it('vraagt de lijst opnieuw op met het gekozen filter', async () => {
    const gebruiker = toon();

    await rijVan('Anna de Groot');
    await gebruiker.selectOptions(screen.getByLabelText('common.status'), 'refunded');

    await waitFor(() =>
      expect(getTicketSales).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'refunded', page: 1 })),
    );
  });

  it('bladert door en meldt welke bestellingen er getoond worden', async () => {
    vi.mocked(getTicketSales).mockResolvedValue({
      ...LIJST,
      pagination: { page: 1, limit: 25, total: 60, totalPages: 3 },
    });
    const gebruiker = toon();

    await rijVan('Anna de Groot');
    expect(screen.getByText('common.showingOf {"from":1,"to":25,"total":60}')).toBeInTheDocument();

    await gebruiker.click(screen.getByRole('button', { name: '2' }));

    await waitFor(() => expect(getTicketSales).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 })));
    expect(screen.getByText('common.showingOf {"from":26,"to":50,"total":60}')).toBeInTheDocument();
  });

  it('laat de bladerknoppen weg als alles op één pagina past', async () => {
    toon();

    await rijVan('Anna de Groot');
    expect(screen.queryByRole('button', { name: '2' })).toBeNull();
  });

  it('voert uit met dezelfde filters als de lijst', async () => {
    const gebruiker = toon();

    await rijVan('Anna de Groot');
    await gebruiker.selectOptions(screen.getByLabelText('tickets.concert'), 'con-1');
    await gebruiker.click(screen.getByRole('button', { name: 'common.exportCsv' }));

    await waitFor(() => expect(exportTicketSalesCsv).toHaveBeenCalledWith(expect.objectContaining({ concertId: 'con-1' })));
    expect(showSuccess).toHaveBeenCalledWith('tickets.exportSuccess');
  });

  it('meldt het als uitvoeren mislukt', async () => {
    vi.mocked(exportTicketSalesCsv).mockRejectedValue(new Error('bestand te groot'));
    const gebruiker = toon();

    await rijVan('Anna de Groot');
    await gebruiker.click(screen.getByRole('button', { name: 'common.exportCsv' }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('bestand te groot'));
  });
});
