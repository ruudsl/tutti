/**
 * De startlijst en de e-mailwaarschuwing op het dashboard van de beheerder.
 *
 * Wat hier vastligt:
 * - de lijst toont elke stap, met een knop naar de plek waar je hem regelt;
 * - zonder SMTP staat er een waarschuwing, die niet weg te klikken is;
 * - de lijst is te verbergen, en blijft dan weg voor die beheerder;
 * - is alles gedaan, dan staat er niets.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import Startlijst from '../Startlijst';
import * as settings from '../../api/settings';

vi.mock('../../api/settings', () => ({ getStartlijst: vi.fn() }));
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'beheer-1', associationId: 'ver-1', role: 'admin' } }),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (sleutel: string, opties?: Record<string, unknown>) =>
      opties ? `${sleutel} ${JSON.stringify(opties)}` : sleutel,
  }),
}));
vi.mock('../Icon', () => ({ Icon: () => null }));

const ALLE = ['email', 'tweestap', 'modules', 'orkesten', 'leden', 'repetities', 'bewaartermijnen'] as const;

function metGedaan(...gedaan: string[]) {
  vi.mocked(settings.getStartlijst).mockResolvedValue({
    stappen: ALLE.map((sleutel) => ({ sleutel, gedaan: gedaan.includes(sleutel) })),
  });
}

function toon() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Startlijst />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe('de startlijst', () => {
  it('toont elke stap met een knop naar de plek waar je hem regelt', async () => {
    metGedaan('orkesten');
    toon();

    expect(await screen.findByText('startlijst.titel')).toBeInTheDocument();
    expect(screen.getByText(/"gedaan":1,"totaal":7/)).toBeInTheDocument();
    const knoppen = screen.getAllByRole('link', { name: 'startlijst.regelen' }).map((a) => a.getAttribute('href'));
    expect(knoppen).toEqual(['/settings', '#accountbeveiliging', '/modules', '/users', '/rehearsals', '/gdpr-admin']);
  });

  it('waarschuwt zonder e-mail, ook als de lijst verborgen is', async () => {
    metGedaan();
    toon();

    expect(await screen.findByRole('alert')).toHaveTextContent('startlijst.geenMail.titel');
    await userEvent.click(screen.getByRole('button', { name: 'startlijst.verbergen' }));

    expect(screen.queryByText('startlijst.titel')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('blijft verborgen na het verbergen', async () => {
    metGedaan('email');
    const { unmount } = toon();
    await userEvent.click(await screen.findByRole('button', { name: 'startlijst.verbergen' }));
    unmount();

    toon();
    await screen.findByText((_, el) => el === document.body);

    expect(screen.queryByText('startlijst.titel')).not.toBeInTheDocument();
  });

  it('toont niets als alles gedaan is', async () => {
    metGedaan(...ALLE);
    const { container } = toon();

    await vi.waitFor(() => expect(settings.getStartlijst).toHaveBeenCalled());
    await new Promise((klaar) => setTimeout(klaar, 0));
    expect(container).toBeEmptyDOMElement();
  });
});
