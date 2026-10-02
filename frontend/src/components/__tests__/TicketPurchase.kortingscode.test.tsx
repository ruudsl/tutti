/**
 * Een kortingscode in de bestelstap van TicketPurchase.
 *
 * De koper vult een code in en drukt op Toepassen. De server zegt vooraf wat
 * de korting wordt (POST /discount-codes/validate); die staat dan in het
 * overzicht. Bij bestellen gaat de code mee en rekent de server opnieuw. Een
 * ongeldige code geeft de reden in de taal van de koper. Is er niets te
 * betalen, dan slaat de stap met de betaalmethode over.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TicketPurchase from '../TicketPurchase';
import { getConcertTickets, createTicketOrder, controleerKortingscode } from '../../api';

vi.mock('../../api', () => ({
  getConcertTickets: vi.fn(),
  createTicketOrder: vi.fn(),
  payTicketOrder: vi.fn(),
  mockPayment: vi.fn(),
  controleerKortingscode: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (sleutel: string, opties?: Record<string, unknown>) =>
      opties && typeof opties === 'object' ? `${sleutel} ${Object.values(opties).join(' ')}` : sleutel,
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('../../utils/toast', () => ({ showSuccess: vi.fn(), showError: vi.fn() }));
vi.mock('../CaptchaWidget', () => ({ default: () => null }));

const bestellen = vi.mocked(createTicketOrder);
const controleren = vi.mocked(controleerKortingscode);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getConcertTickets).mockResolvedValue({
    concert: {
      id: 'c1',
      name: 'Najaarsconcert',
      date: '2026-11-07',
      endDate: null,
      location: 'Zaal',
      description: null,
      concertType: null,
    },
    ticketTypes: [
      {
        id: 'regulier',
        name: 'Regulier',
        price: 20,
        available: 50,
        maxPerOrder: 10,
        onSale: true,
        serviceFee: 0,
      },
    ],
    paymentMethods: ['ideal'],
  } as never);
  bestellen.mockResolvedValue({ orderId: 'o1', status: 'pending', total: 36, expiresAt: '', items: [] });
});

/** Tot en met de bestelstap: twee kaarten, naam en e-mail ingevuld. */
async function naarBestellen(onSuccess = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const gebruiker = userEvent.setup();
  render(
    <QueryClientProvider client={client}>
      <TicketPurchase concertId="c1" onSuccess={onSuccess} />
    </QueryClientProvider>,
  );
  const plus = await screen.findByRole('button', { name: '+' });
  await gebruiker.click(plus);
  await gebruiker.click(plus);
  await gebruiker.click(screen.getByRole('button', { name: 'tickets.proceedToCheckout' }));
  const [naam] = screen.getAllByRole('textbox');
  await gebruiker.type(naam, 'Kees');
  await gebruiker.type(screen.getByLabelText(/tickets.buyerEmail/), 'kees@voorbeeld.nl');
  return gebruiker;
}

describe('kortingscode bij het bestellen van kaarten', () => {
  it('toont de korting na toepassen en stuurt de code mee bij bestellen', async () => {
    controleren.mockResolvedValue({
      valid: true,
      discountType: 'percentage',
      discountValue: 10,
      discountAmount: 4,
      message: '',
    });
    const gebruiker = await naarBestellen();

    await gebruiker.type(screen.getByLabelText('tickets.kortingscode.veld'), 'lente10');
    await gebruiker.click(screen.getByRole('button', { name: 'tickets.kortingscode.toepassen' }));

    expect(controleren).toHaveBeenCalledWith({
      code: 'lente10',
      concertId: 'c1',
      orderTotal: 40,
      ticketTypeIds: ['regulier'],
      buyerEmail: 'kees@voorbeeld.nl',
    });
    expect(await screen.findByText('tickets.kortingscode.korting LENTE10')).toBeInTheDocument();
    expect(screen.getByText('- EUR 4.00')).toBeInTheDocument();
    expect(screen.getByText('EUR 36.00')).toBeInTheDocument();

    await gebruiker.click(screen.getByRole('button', { name: 'tickets.placeOrder' }));
    expect(bestellen).toHaveBeenCalledWith('c1', expect.objectContaining({ discountCode: 'lente10' }));
  });

  it('geeft bij een ongeldige code de reden, en bestelt zonder korting', async () => {
    controleren.mockResolvedValue({
      valid: false,
      discountType: null,
      discountValue: 0,
      discountAmount: 0,
      message: 'This discount code has expired',
      reden: 'verlopen',
    });
    const gebruiker = await naarBestellen();

    await gebruiker.type(screen.getByLabelText('tickets.kortingscode.veld'), 'OUD');
    await gebruiker.click(screen.getByRole('button', { name: 'tickets.kortingscode.toepassen' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('tickets.kortingscode.reden.verlopen');
    await gebruiker.click(screen.getByRole('button', { name: 'tickets.placeOrder' }));
    expect(bestellen).toHaveBeenCalledWith('c1', expect.objectContaining({ discountCode: undefined }));
  });

  it('slaat de betaalstap over als er niets te betalen is', async () => {
    controleren.mockResolvedValue({
      valid: true,
      discountType: 'percentage',
      discountValue: 100,
      discountAmount: 40,
      message: '',
    });
    bestellen.mockResolvedValue({ orderId: 'o2', status: 'paid', total: 0, expiresAt: '', items: [] });
    const onSuccess = vi.fn();
    const gebruiker = await naarBestellen(onSuccess);

    await gebruiker.type(screen.getByLabelText('tickets.kortingscode.veld'), 'VRIJKAART');
    await gebruiker.click(screen.getByRole('button', { name: 'tickets.kortingscode.toepassen' }));
    await screen.findByText('tickets.kortingscode.korting VRIJKAART');
    await gebruiker.click(screen.getByRole('button', { name: 'tickets.placeOrder' }));

    expect(onSuccess).toHaveBeenCalledWith('o2');
    expect(screen.queryByText('tickets.selectPaymentMethod')).not.toBeInTheDocument();
  });

  it('haalt de korting weg als de server de code bij bestellen weigert', async () => {
    controleren.mockResolvedValue({
      valid: true,
      discountType: 'percentage',
      discountValue: 10,
      discountAmount: 4,
      message: '',
    });
    bestellen.mockRejectedValue({ response: { status: 400, data: { error: 'op', code: 'KORTINGSCODE_OP' } } });
    const gebruiker = await naarBestellen();

    await gebruiker.type(screen.getByLabelText('tickets.kortingscode.veld'), 'LENTE10');
    await gebruiker.click(screen.getByRole('button', { name: 'tickets.kortingscode.toepassen' }));
    await screen.findByText('tickets.kortingscode.korting LENTE10');
    await gebruiker.click(screen.getByRole('button', { name: 'tickets.placeOrder' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('tickets.kortingscode.reden.op');
    expect(screen.queryByText('tickets.kortingscode.korting LENTE10')).not.toBeInTheDocument();
  });
});
