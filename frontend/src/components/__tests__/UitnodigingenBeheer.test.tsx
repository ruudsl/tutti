/**
 * Uitnodigingen versturen als beheerder.
 *
 * Na het versturen verdween het formulier en bleef de link uit het antwoord
 * ongebruikt; zonder ingestelde e-mail kwam de uitnodiging dus nergens aan.
 * Nu staat de link na het versturen op het scherm, om te kopiëren, en geeft
 * een geweigerde uitnodiging (rolgrens, dubbel adres) een melding.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UitnodigingenBeheer } from '../UitnodigingenBeheer';
import { showError, showSuccess } from '../../utils/toast';

const { maak } = vi.hoisted(() => ({
  maak: vi.fn(async (_invoer: { email: string; role: string }) => ({
    id: 'uit-1',
    inviteUrl: 'https://tutti.voorbeeld.nl/invite/abc',
  })),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (sleutel: string, opties?: Record<string, unknown>) =>
      opties ? `${sleutel} ${Object.values(opties).join(' ')}` : sleutel,
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('../Icon', () => ({ Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} /> }));
vi.mock('../../utils/toast', () => ({ showSuccess: vi.fn(), showError: vi.fn() }));

vi.mock('../../hooks/useMultiAssociation', () => ({
  useInvitations: () => ({ data: [], isLoading: false }),
  useCreateInvitation: () => ({ mutateAsync: maak, isPending: false }),
  useDeleteInvitation: () => ({ mutate: vi.fn() }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  maak.mockResolvedValue({ id: 'uit-1', inviteUrl: 'https://tutti.voorbeeld.nl/invite/abc' });
});

async function verstuur(email: string, rol?: string) {
  const gebruiker = userEvent.setup();
  render(<UitnodigingenBeheer />);
  await gebruiker.click(screen.getByRole('button', { name: /multiAssociation.invitations.invite/ }));
  await gebruiker.type(screen.getByLabelText('multiAssociation.invitations.emailPlaceholder'), email);
  if (rol) await gebruiker.selectOptions(screen.getByLabelText('multiAssociation.roleLabel'), rol);
  await gebruiker.click(screen.getByRole('button', { name: 'common.submit' }));
  return gebruiker;
}

describe('uitnodigingen versturen', () => {
  it('toont na het versturen de link om zelf door te geven', async () => {
    await verstuur('kees@voorbeeld.nl', 'board');

    expect(maak).toHaveBeenCalledWith({ email: 'kees@voorbeeld.nl', role: 'board' });
    expect(await screen.findByText('uitnodiging.linkKlaar kees@voorbeeld.nl')).toBeInTheDocument();
    expect(screen.getByLabelText('uitnodiging.link')).toHaveValue('https://tutti.voorbeeld.nl/invite/abc');
  });

  it('kopieert de link', async () => {
    const gebruiker = await verstuur('kees@voorbeeld.nl');
    const klembord = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);

    await gebruiker.click(await screen.findByRole('button', { name: 'uitnodiging.kopieer' }));

    expect(klembord).toHaveBeenCalledWith('https://tutti.voorbeeld.nl/invite/abc');
    expect(showSuccess).toHaveBeenCalledWith('uitnodiging.gekopieerd');
  });

  it('meldt een geweigerde uitnodiging en toont geen link', async () => {
    maak.mockRejectedValueOnce(new Error('Er staat al een uitnodiging open voor dit e-mailadres.'));

    await verstuur('kees@voorbeeld.nl');

    expect(showError).toHaveBeenCalledWith('Er staat al een uitnodiging open voor dit e-mailadres.');
    expect(screen.queryByLabelText('uitnodiging.link')).not.toBeInTheDocument();
  });

  it('legt uit voor wie een uitnodiging bedoeld is', () => {
    render(<UitnodigingenBeheer />);

    expect(screen.getByText('uitnodiging.uitleg')).toBeInTheDocument();
  });
});
