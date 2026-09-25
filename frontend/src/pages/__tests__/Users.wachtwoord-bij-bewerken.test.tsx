/**
 * Een nieuw wachtwoord bij het bewerken van een lid volgt dezelfde regel als
 * bij het aanmaken: minimaal acht tekens.
 *
 * Bij bewerken stond er geen minimum op het veld. De server weigert een te
 * kort wachtwoord inmiddels, en dan kreeg de beheerder alleen een algemene
 * validatiefout in plaats van de melding bij het veld. Leeg laten blijft
 * mogen: dan blijft het huidige wachtwoord staan.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import Users from '../Users';

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

vi.mock('../../components/CustomFields', () => ({
  CustomFieldFormSection: () => <div data-testid="eigen-velden" />,
}));

vi.mock('../../utils/downloadUrl', () => ({ useDownloadToken: () => null }));

const { bijwerken } = vi.hoisted(() => ({ bijwerken: vi.fn() }));

vi.mock('../../hooks/useUsers', () => {
  const muteerder = () => ({ mutate: () => {}, mutateAsync: async () => {}, isPending: false });
  return {
    useUsers: () => ({
      data: [
        {
          id: 'lid-1',
          email: 'lid@example.com',
          firstName: 'Anna',
          lastName: 'Bakker',
          role: 'member',
          instruments: [],
          orchestras: [],
        },
      ],
      isLoading: false,
    }),
    useCreateUser: muteerder,
    useUpdateUser: () => ({ mutate: bijwerken, mutateAsync: async () => {}, isPending: false }),
    useDeleteUser: muteerder,
  };
});

vi.mock('../../hooks/useInstruments', () => ({
  useInstruments: () => ({ data: [], isLoading: false }),
}));

vi.mock('../../hooks/useOrchestras', () => ({
  useOrchestras: () => ({ data: [], isLoading: false }),
}));

function wikkel({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

async function bewerkMetWachtwoord(wachtwoord: string) {
  const gebruiker = userEvent.setup();
  render(<Users />, { wrapper: wikkel });
  await gebruiker.click((await screen.findAllByRole('button', { name: 'common.edit: Anna Bakker' }))[0]);
  const venster = await screen.findByRole('dialog');
  if (wachtwoord) {
    await gebruiker.type(within(venster).getByLabelText('users.passwordHint'), wachtwoord);
  }
  await gebruiker.click(within(venster).getByRole('button', { name: 'common.save' }));
  return venster;
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('ledenpagina - wachtwoord bij bewerken', () => {
  it('weigert een nieuw wachtwoord van zeven tekens, met de melding bij het veld', async () => {
    const venster = await bewerkMetWachtwoord('abcdef1');

    expect(await within(venster).findByText('errors.passwordTooShort')).toBeInTheDocument();
    expect(bijwerken).not.toHaveBeenCalled();
  });

  it('slaat op met een nieuw wachtwoord van acht tekens', async () => {
    await bewerkMetWachtwoord('abcdefg1');

    await vi.waitFor(() => expect(bijwerken).toHaveBeenCalledTimes(1));
    expect(bijwerken.mock.calls[0][0].data.password).toBe('abcdefg1');
  });

  it('slaat op zonder wachtwoord als het veld leeg blijft', async () => {
    await bewerkMetWachtwoord('');

    await vi.waitFor(() => expect(bijwerken).toHaveBeenCalledTimes(1));
    expect(bijwerken.mock.calls[0][0].data.password).toBeUndefined();
  });
});
