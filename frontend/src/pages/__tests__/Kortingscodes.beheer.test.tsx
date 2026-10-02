/**
 * Het beheer van kortingscodes (pagina /kortingscodes).
 *
 * Er was een backend om codes aan te maken, maar geen scherm. Wat hier
 * vastligt: de lijst toont korting, gebruik en geldigheid; een nieuwe code
 * gaat in hoofdletters naar de server, met de einddatum tot en met die dag en
 * een gekozen concert als beperking; aan- en uitzetten en verwijderen (na
 * bevestiging) doen wat ze zeggen.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Kortingscodes from '../Kortingscodes';
import {
  getKortingscodes,
  maakKortingscode,
  verwijderKortingscode,
  wijzigKortingscode,
  type Kortingscode,
} from '../../api';

vi.mock('../../api', () => ({
  getKortingscodes: vi.fn(),
  maakKortingscode: vi.fn(),
  wijzigKortingscode: vi.fn(),
  verwijderKortingscode: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (sleutel: string, opties?: Record<string, unknown>) =>
      opties ? `${sleutel} ${Object.values(opties).join(' ')}` : sleutel,
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('../../hooks/useDocumentTitle', () => ({ useDocumentTitle: () => {} }));
vi.mock('../../hooks/useConcerts', () => ({
  useConcerts: () => ({ data: { data: [{ id: 'concert-1', name: 'Najaarsconcert' }] } }),
}));
vi.mock('../../utils/toast', () => ({ showSuccess: vi.fn(), showError: vi.fn() }));
vi.mock('../../components/Skeleton', () => ({ SkeletonTable: () => <div data-testid="laden" /> }));

const CODE: Kortingscode = {
  id: 'k1',
  code: 'LENTE10',
  description: 'Voorjaarsactie',
  discountType: 'percentage',
  discountValue: 10,
  minOrderAmount: 0,
  maxUses: 50,
  usesCount: 12,
  maxUsesPerUser: 1,
  validFrom: null,
  validUntil: null,
  concertIds: null,
  ticketTypeIds: null,
  isActive: true,
  createdAt: '2026-10-01',
};

function toon() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <Kortingscodes />
    </QueryClientProvider>,
  );
  return userEvent.setup();
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getKortingscodes).mockResolvedValue([CODE]);
  vi.mocked(maakKortingscode).mockResolvedValue(CODE);
  vi.mocked(wijzigKortingscode).mockResolvedValue(undefined);
  vi.mocked(verwijderKortingscode).mockResolvedValue(undefined);
});

describe('kortingscodes beheren', () => {
  it('toont code, korting en gebruik', async () => {
    toon();

    const rij = (await screen.findByText('LENTE10')).closest('tr')!;
    expect(within(rij).getByText('10%')).toBeInTheDocument();
    expect(within(rij).getByText('12 / 50')).toBeInTheDocument();
  });

  it('maakt een code aan in hoofdletters, tot en met de einddag, voor één concert', async () => {
    const gebruiker = toon();
    await screen.findByText('LENTE10');

    await gebruiker.click(screen.getByRole('button', { name: 'discountCodes.addCode' }));
    await gebruiker.type(screen.getByLabelText(/discountCodes.code/), 'herfst5');
    await gebruiker.selectOptions(screen.getByLabelText('discountCodes.discountType'), 'fixed_amount');
    await gebruiker.type(screen.getByLabelText(/discountCodes.discountValue/), '5,50');
    await gebruiker.type(screen.getByLabelText('discountCodes.maxUses'), '100');
    await gebruiker.type(screen.getByLabelText('discountCodes.validUntil'), '2026-12-31');
    await gebruiker.selectOptions(screen.getByLabelText('discountCodes.concert'), 'concert-1');
    await gebruiker.click(screen.getByRole('button', { name: 'common.save' }));

    expect(maakKortingscode).toHaveBeenCalledWith({
      code: 'HERFST5',
      description: undefined,
      discountType: 'fixed_amount',
      discountValue: 5.5,
      maxUses: 100,
      maxUsesPerUser: 1,
      validUntil: new Date('2026-12-31T23:59:59').toISOString(),
      concertIds: ['concert-1'],
    });
  });

  it('laat geen percentage boven de honderd opslaan', async () => {
    const gebruiker = toon();
    await screen.findByText('LENTE10');

    await gebruiker.click(screen.getByRole('button', { name: 'discountCodes.addCode' }));
    await gebruiker.type(screen.getByLabelText(/discountCodes.code/), 'TEVEEL');
    await gebruiker.type(screen.getByLabelText(/discountCodes.discountValue/), '150');

    expect(screen.getByRole('button', { name: 'common.save' })).toBeDisabled();
  });

  it('zet een code uit', async () => {
    const gebruiker = toon();

    await gebruiker.click(await screen.findByRole('checkbox', { name: 'discountCodes.isActive: LENTE10' }));

    expect(wijzigKortingscode).toHaveBeenCalledWith('k1', { isActive: false });
  });

  it('verwijdert pas na bevestiging', async () => {
    const gebruiker = toon();

    await gebruiker.click(await screen.findByRole('button', { name: 'common.delete: LENTE10' }));
    expect(verwijderKortingscode).not.toHaveBeenCalled();

    const dialoog = screen.getByRole('alertdialog');
    await gebruiker.click(within(dialoog).getByRole('button', { name: 'common.delete' }));
    expect(verwijderKortingscode).toHaveBeenCalledWith('k1');
  });
});
