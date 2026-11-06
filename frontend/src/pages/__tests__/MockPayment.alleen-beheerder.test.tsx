/**
 * De testbetaling zonder betaaldienst (pages/MockPayment.tsx).
 *
 * Zonder ingestelde betaaldienst stuurt de kaartverkoop een koper naar deze
 * pagina. Afronden mag alleen een beheerder; een koper die op de knop drukte
 * werd zonder uitleg naar het inlogscherm gestuurd. Wat hier vastligt: de
 * koper krijgt uitleg en geen knop, de beheerder houdt de knoppen, en een
 * mislukte poging zegt dat hij mislukt is.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../../hooks/useDocumentTitle', () => ({ useDocumentTitle: () => {} }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (sleutel: string) => sleutel }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

let gebruiker: { id: string; role: string } | null = null;
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: gebruiker }),
}));

const { betaal } = vi.hoisted(() => ({ betaal: vi.fn() }));
vi.mock('../../api', () => ({ mockPayment: betaal }));

import MockPayment from '../MockPayment';

function toon() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/tickets/orders/bestelling-1/mock-payment']}>
        <Routes>
          <Route path="/tickets/orders/:orderId/mock-payment" element={<MockPayment />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  gebruiker = null;
  betaal.mockReset();
});

describe('testbetaling', () => {
  it('geeft een koper zonder account uitleg in plaats van een knop', () => {
    toon();

    expect(screen.getByRole('status')).toHaveTextContent('tickets.testbetaling.alleenBeheerder');
    expect(screen.queryByRole('button', { name: 'tickets.testbetaling.simuleer' })).not.toBeInTheDocument();
  });

  it('geeft een ingelogd lid dezelfde uitleg', () => {
    gebruiker = { id: 'lid', role: 'member' };
    toon();

    expect(screen.getByRole('status')).toHaveTextContent('tickets.testbetaling.alleenBeheerder');
    expect(screen.queryByRole('button', { name: 'tickets.testbetaling.simuleer' })).not.toBeInTheDocument();
  });

  it('laat de beheerder de betaling afronden', async () => {
    gebruiker = { id: 'beheerder', role: 'admin' };
    betaal.mockResolvedValue({ success: true });
    const klikker = userEvent.setup({ delay: null });
    toon();

    await klikker.click(screen.getByRole('button', { name: 'tickets.testbetaling.simuleer' }));

    expect(betaal).toHaveBeenCalledWith('bestelling-1', 'pay');
    expect(await screen.findByText('tickets.testbetaling.bevestiging')).toBeInTheDocument();
  });

  it('zegt het als afronden mislukt', async () => {
    gebruiker = { id: 'beheerder', role: 'admin' };
    betaal.mockRejectedValue(new Error('404'));
    const klikker = userEvent.setup({ delay: null });
    toon();

    await klikker.click(screen.getByRole('button', { name: 'tickets.testbetaling.simuleer' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('tickets.testbetaling.mislukt');
  });
});
