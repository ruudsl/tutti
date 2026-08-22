/**
 * De labels van de kaartverkooppagina horen bij hun veld.
 *
 * De vier filters bovenaan en het terugbetalingsveld hadden allemaal een
 * `form-label` die los van het veld stond, zonder `htmlFor` en zonder `id`. Een
 * schermlezer kondigde daar naamloze velden aan en klikken op een label zette
 * de aanwijzer nergens.
 *
 * Alle vijf zijn echte formuliervelden met precies één invoerelement eronder en
 * lopen sinds de ombouw via `components/FormField`. De vier filters staan in
 * een raster zonder `form-group`, dus die krijgen `className=""` mee - anders
 * schoof de ombouw ook de opmaak op.
 *
 * `getByLabelText` is hier de kern van de test: die vindt een veld alleen als
 * de koppeling er echt is.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import TicketSales from '../TicketSales';

// vi.mock wordt naar boven getild, dus alles wat een mock-fabriek gebruikt moet
// via vi.hoisted mee omhoog.
const { BESTELLING } = vi.hoisted(() => ({
  BESTELLING: {
    id: 'best-1',
    orderNumber: 'T-0001',
    concertName: 'Najaarsconcert',
    buyerName: 'Anna de Groot',
    buyerEmail: 'anna@example.org',
    status: 'paid',
    total: 25,
    ticketCount: 2,
    createdAt: '2026-08-01T10:00:00.000Z',
  },
}));

vi.mock('../../api', () => ({
  getTicketSales: async () => ({
    orders: [BESTELLING],
    pagination: { page: 1, limit: 25, total: 1, totalPages: 1 },
    summary: { totalRevenue: 25, totalOrders: 1, totalTickets: 2 },
  }),
  getPaymentDetails: async () => ({}),
  exportTicketSalesCsv: async () => ({}),
  refundOrder: async () => ({}),
}));

vi.mock('../../hooks/useConcerts', () => ({
  useConcerts: () => ({ data: { data: [{ id: 'con-1', name: 'Najaarsconcert' }] } }),
}));

vi.mock('../../hooks/useDocumentTitle', () => ({ useDocumentTitle: () => {} }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (sleutel: string) => sleutel }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('../../components/Skeleton', () => ({
  SkeletonTable: () => <div data-testid="skelet-tabel" />,
}));

function wikkel({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('kaartverkoop - labels gekoppeld aan hun veld', () => {
  it('vindt de vier filtervelden op hun labeltekst', async () => {
    render(<TicketSales />, { wrapper: wikkel });

    // De pagina toont eerst een skelet; de filterbalk komt pas met de gegevens.
    expect((await screen.findByLabelText('tickets.concert')).tagName).toBe('SELECT');
    expect(screen.getByLabelText('common.status').tagName).toBe('SELECT');
    expect(screen.getByLabelText('common.startDate')).toHaveAttribute('type', 'date');
    expect(screen.getByLabelText('common.endDate')).toHaveAttribute('type', 'date');
  });

  it('vult de begindatum in via het label', async () => {
    const gebruiker = userEvent.setup();
    render(<TicketSales />, { wrapper: wikkel });

    // Klikken op het label zet de aanwijzer in het veld: dat kon vóór de
    // koppeling niet, en het is de reden dat een label bij een veld hoort.
    await gebruiker.click(await screen.findByText('common.startDate'));
    expect(screen.getByLabelText('common.startDate')).toHaveFocus();

    await gebruiker.type(screen.getByLabelText('common.startDate'), '2026-08-01');
    expect(screen.getByLabelText('common.startDate')).toHaveValue('2026-08-01');
  });

  it('koppelt ook het reden-veld in het terugbetalingsvenster', async () => {
    const gebruiker = userEvent.setup();
    render(<TicketSales />, { wrapper: wikkel });

    // De knop draagt alleen een pictogram, dus we zoeken hem op zijn tooltip.
    await gebruiker.click(await screen.findByTitle('tickets.refund'));

    expect(await screen.findByLabelText('tickets.refundReason')).toHaveAttribute(
      'placeholder',
      'tickets.refundReasonPlaceholder',
    );
  });
});
