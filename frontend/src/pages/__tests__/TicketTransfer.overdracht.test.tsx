/**
 * Een kaartje doorgeven aan iemand anders.
 *
 * Wie een kaartje overdraagt raakt het kwijt: de ontvanger krijgt het per
 * e-mail en de oorspronkelijke koper kan er niet meer mee naar binnen. Daarom
 * loopt dit scherm in twee stappen - eerst het adres invullen, dan een
 * bevestiging waarin nog eens staat wát er naar wíe gaat - en daarom staat er
 * een lopende overdracht op een eigen tabblad, met een knop om hem in te
 * trekken zolang de ontvanger nog niet heeft geklikt.
 *
 * De keuring van het formulier ligt al vast in
 * TicketTransfer.toegankelijkheid.test.tsx; deze tests gaan over de weg die
 * een kaartje aflegt: de lijsten, de twee stappen, het intrekken en de
 * geschiedenis.
 *
 * Alles hier is een *wacht*: het gedrag zat er al en deze tests blijven ook op
 * de oude code groen.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TicketTransferHistory } from '../../types';
import type { ReactNode } from 'react';
import { AriaLiveProvider } from '../../components/AriaLiveRegion';
import TicketTransferPage from '../TicketTransfer';
import {
  getTransferableTickets,
  getPendingTransfers,
  getTransferHistory,
  initiateTicketTransfer,
  cancelTicketTransfer,
} from '../../api';
import { showSuccess, showError } from '../../utils/toast';

vi.mock('../../hooks/useDocumentTitle', () => ({ useDocumentTitle: () => {} }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (sleutel: string) => sleutel }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('../../components/Skeleton', () => ({ SkeletonTable: () => <div data-testid="skelet-tabel" /> }));

vi.mock('../../utils/toast', () => ({ showSuccess: vi.fn(), showError: vi.fn() }));

vi.mock('../../api', () => ({
  getTransferableTickets: vi.fn(),
  getPendingTransfers: vi.fn(),
  getTransferHistory: vi.fn(),
  initiateTicketTransfer: vi.fn(),
  cancelTicketTransfer: vi.fn(),
}));

const NAJAARSCONCERT = {
  id: 'con-1',
  name: 'Najaarsconcert',
  date: '2026-09-12T20:00:00.000Z',
  location: 'De Harmonie',
};
const KERSTCONCERT = { id: 'con-2', name: 'Kerstconcert', date: '2026-12-19T20:00:00.000Z', location: null };

const KAARTJES = [
  {
    id: 'k-1',
    code: 'ABC123',
    ticketType: 'Volwassene',
    buyerName: 'Anna de Groot',
    status: 'valid' as const,
    concert: NAJAARSCONCERT,
    hasPendingTransfer: false,
  },
  {
    id: 'k-2',
    code: 'DEF456',
    ticketType: 'Kind',
    buyerName: 'Anna de Groot',
    status: 'valid' as const,
    concert: NAJAARSCONCERT,
    hasPendingTransfer: true,
  },
  {
    id: 'k-3',
    code: 'GHI789',
    ticketType: 'Volwassene',
    buyerName: 'Anna de Groot',
    status: 'valid' as const,
    concert: KERSTCONCERT,
    hasPendingTransfer: false,
  },
];

const LOPENDE_OVERDRACHT = {
  id: 'ovd-1',
  ticketId: 'k-2',
  ticket: { id: 'k-2', code: 'DEF456', ticketType: 'Kind', concert: NAJAARSCONCERT },
  recipientEmail: 'bram@example.org',
  recipientName: 'Bram Bakker',
  transferCode: 'XYZ',
  status: 'pending' as const,
  createdAt: '2026-08-20T10:00:00.000Z',
  expiresAt: '2026-08-27T10:00:00.000Z',
  acceptedAt: null,
  cancelledAt: null,
};

const GESCHIEDENIS: TicketTransferHistory[] = [
  {
    id: 'gsc-1',
    ticketId: 'k-9',
    ticket: { id: 'k-9', code: 'OUD123', ticketType: 'Volwassene', concert: NAJAARSCONCERT },
    fromName: 'Anna de Groot',
    fromEmail: 'anna@example.org',
    toName: 'Chris Cool',
    toEmail: 'chris@example.org',
    status: 'accepted',
    transferredAt: '2026-07-01T12:00:00.000Z',
  },
  {
    id: 'gsc-2',
    ticketId: 'k-8',
    ticket: { id: 'k-8', code: 'OUD456', ticketType: 'Kind', concert: KERSTCONCERT },
    fromName: 'Anna de Groot',
    fromEmail: 'anna@example.org',
    toName: 'Dirk Dekker',
    toEmail: 'dirk@example.org',
    status: 'cancelled',
    transferredAt: '2026-07-05T12:00:00.000Z',
  },
];

function wikkel({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return (
    <AriaLiveProvider>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </AriaLiveProvider>
  );
}

function toon() {
  const gebruiker = userEvent.setup();
  render(<TicketTransferPage />, { wrapper: wikkel });
  return gebruiker;
}

/** Stapt naar een tabblad en wacht tot de inhoud ervan er staat. */
async function naarTabblad(gebruiker: ReturnType<typeof userEvent.setup>, tab: 'pending' | 'history') {
  await gebruiker.click(screen.getByRole('button', { name: new RegExp(`ticketTransfer.tabs.${tab}`) }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getTransferableTickets).mockResolvedValue(KAARTJES);
  vi.mocked(getPendingTransfers).mockResolvedValue([LOPENDE_OVERDRACHT]);
  vi.mocked(getTransferHistory).mockResolvedValue(GESCHIEDENIS);
  vi.mocked(initiateTicketTransfer).mockResolvedValue({ transfer: LOPENDE_OVERDRACHT, message: 'Overdracht gestart' });
  vi.mocked(cancelTicketTransfer).mockResolvedValue({ success: true, message: 'Overdracht ingetrokken' });
});

describe('kaartoverdracht - de eigen kaartjes', () => {
  it('zet de kaartjes onder het concert waar ze bij horen', async () => {
    toon();

    const najaar = (await screen.findByRole('heading', { name: 'Najaarsconcert' })).closest('.card') as HTMLElement;
    expect(within(najaar).getByText('ABC123')).toBeInTheDocument();
    expect(within(najaar).getByText('DEF456')).toBeInTheDocument();
    expect(within(najaar).queryByText('GHI789')).toBeNull();
    expect(within(najaar).getByText(/De Harmonie/)).toBeInTheDocument();

    const kerst = screen.getByRole('heading', { name: 'Kerstconcert' }).closest('.card') as HTMLElement;
    expect(within(kerst).getByText('GHI789')).toBeInTheDocument();
  });

  it('laat een kaartje dat al onderweg is niet nog eens overdragen', async () => {
    toon();

    const rij = (await screen.findByText('DEF456')).closest('div[style]')?.parentElement as HTMLElement;
    expect(within(rij).getByText('ticketTransfer.pendingTransfer')).toBeInTheDocument();
    expect(within(rij).getByRole('button', { name: 'ticketTransfer.transfer' })).toBeDisabled();
  });

  it('telt de kaartjes en de lopende overdrachten op de tabbladen', async () => {
    toon();

    await screen.findByText('ABC123');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /ticketTransfer.tabs.transfer/ })).toHaveTextContent('3'),
    );
    expect(screen.getByRole('button', { name: /ticketTransfer.tabs.pending/ })).toHaveTextContent('1');
  });

  it('zegt het als er niets over te dragen valt', async () => {
    vi.mocked(getTransferableTickets).mockResolvedValue([]);
    toon();

    expect(await screen.findByRole('heading', { name: 'ticketTransfer.noTransferableTickets' })).toBeInTheDocument();
  });
});

describe('kaartoverdracht - in twee stappen weggeven', () => {
  it('vraagt eerst om een bevestiging met naam en adres erin', async () => {
    const gebruiker = toon();

    await gebruiker.click((await screen.findAllByRole('button', { name: 'ticketTransfer.transfer' }))[0]);
    await gebruiker.type(screen.getByLabelText(/ticketTransfer.recipientEmail/), 'bram@example.org');
    await gebruiker.type(screen.getByLabelText(/ticketTransfer.recipientName/), 'Bram Bakker');
    await gebruiker.click(screen.getByRole('button', { name: 'ticketTransfer.continue' }));

    // De bevestiging herhaalt wat er weggaat en naar wie: dit is het laatste
    // moment waarop iemand kan zien dat hij het verkeerde adres intypte.
    const bevestiging = await screen.findByText('ticketTransfer.confirmMessage');
    const venster = bevestiging.closest('[role="dialog"]') as HTMLElement;
    expect(within(venster).getByText(/Bram Bakker/)).toBeInTheDocument();
    expect(within(venster).getByText(/bram@example.org/)).toBeInTheDocument();
    expect(within(venster).getByText(/Volwassene/)).toBeInTheDocument();
    // Nog niets verstuurd zolang er niet bevestigd is.
    expect(initiateTicketTransfer).not.toHaveBeenCalled();
  });

  it('verstuurt de overdracht pas na de bevestiging', async () => {
    const gebruiker = toon();

    await gebruiker.click((await screen.findAllByRole('button', { name: 'ticketTransfer.transfer' }))[0]);
    await gebruiker.type(screen.getByLabelText(/ticketTransfer.recipientEmail/), 'bram@example.org');
    await gebruiker.type(screen.getByLabelText(/ticketTransfer.recipientName/), 'Bram Bakker');
    await gebruiker.click(screen.getByRole('button', { name: 'ticketTransfer.continue' }));
    await gebruiker.click(await screen.findByRole('button', { name: 'ticketTransfer.confirmAndSend' }));

    await waitFor(() =>
      expect(initiateTicketTransfer).toHaveBeenCalledWith('k-1', {
        recipientEmail: 'bram@example.org',
        recipientName: 'Bram Bakker',
      }),
    );
    expect(showSuccess).toHaveBeenCalledWith('ticketTransfer.transferInitiated');
    // Beide vensters gaan dicht; blijven staan zou een tweede verzending
    // uitnodigen.
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('meldt het als de overdracht niet lukt en laat het venster staan', async () => {
    vi.mocked(initiateTicketTransfer).mockRejectedValue(new Error('adres onbekend'));
    const gebruiker = toon();

    await gebruiker.click((await screen.findAllByRole('button', { name: 'ticketTransfer.transfer' }))[0]);
    await gebruiker.type(screen.getByLabelText(/ticketTransfer.recipientEmail/), 'bram@example.org');
    await gebruiker.type(screen.getByLabelText(/ticketTransfer.recipientName/), 'Bram Bakker');
    await gebruiker.click(screen.getByRole('button', { name: 'ticketTransfer.continue' }));
    await gebruiker.click(await screen.findByRole('button', { name: 'ticketTransfer.confirmAndSend' }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('adres onbekend'));
    expect(screen.getByRole('button', { name: 'ticketTransfer.confirmAndSend' })).toBeInTheDocument();
  });

  it('laat het formulier leeg achter na sluiten, zodat het volgende kaartje schoon begint', async () => {
    const gebruiker = toon();

    await gebruiker.click((await screen.findAllByRole('button', { name: 'ticketTransfer.transfer' }))[0]);
    await gebruiker.type(screen.getByLabelText(/ticketTransfer.recipientEmail/), 'typfout@example.org');
    await gebruiker.click(screen.getByRole('button', { name: 'common.cancel' }));

    await gebruiker.click((await screen.findAllByRole('button', { name: 'ticketTransfer.transfer' }))[0]);
    expect(screen.getByLabelText(/ticketTransfer.recipientEmail/)).toHaveValue('');
  });
});

describe('kaartoverdracht - een lopende overdracht intrekken', () => {
  it('toont ontvanger, kaartje en vervaldatum', async () => {
    const gebruiker = toon();

    await screen.findAllByRole('button', { name: 'ticketTransfer.transfer' });
    await naarTabblad(gebruiker, 'pending');

    const rij = (await screen.findByText('Bram Bakker')).closest('tr') as HTMLElement;
    expect(within(rij).getByText('bram@example.org')).toBeInTheDocument();
    expect(within(rij).getByText('DEF456')).toBeInTheDocument();
    expect(within(rij).getByText('Najaarsconcert')).toBeInTheDocument();
  });

  it('vraagt eerst na en trekt hem dan pas in', async () => {
    const gebruiker = toon();

    await screen.findAllByRole('button', { name: 'ticketTransfer.transfer' });
    await naarTabblad(gebruiker, 'pending');
    await gebruiker.click(await screen.findByRole('button', { name: 'ticketTransfer.cancelTransfer' }));

    const venster = (await screen.findByText('ticketTransfer.cancelConfirmMessage')).closest(
      '[role="dialog"]',
    ) as HTMLElement;
    expect(within(venster).getByText(/Bram Bakker/)).toBeInTheDocument();
    expect(cancelTicketTransfer).not.toHaveBeenCalled();

    await gebruiker.click(within(venster).getByRole('button', { name: 'ticketTransfer.yesCancel' }));

    await waitFor(() => expect(cancelTicketTransfer).toHaveBeenCalledWith('ovd-1'));
    expect(showSuccess).toHaveBeenCalledWith('ticketTransfer.transferCancelled');
  });

  it('laat de overdracht met rust als er nee gezegd wordt', async () => {
    const gebruiker = toon();

    await screen.findAllByRole('button', { name: 'ticketTransfer.transfer' });
    await naarTabblad(gebruiker, 'pending');
    await gebruiker.click(await screen.findByRole('button', { name: 'ticketTransfer.cancelTransfer' }));
    await gebruiker.click(await screen.findByRole('button', { name: 'common.no' }));

    await waitFor(() => expect(screen.queryByText('ticketTransfer.cancelConfirmMessage')).toBeNull());
    expect(cancelTicketTransfer).not.toHaveBeenCalled();
  });

  it('meldt het als intrekken mislukt', async () => {
    vi.mocked(cancelTicketTransfer).mockRejectedValue(new Error('al aanvaard'));
    const gebruiker = toon();

    await screen.findAllByRole('button', { name: 'ticketTransfer.transfer' });
    await naarTabblad(gebruiker, 'pending');
    await gebruiker.click(await screen.findByRole('button', { name: 'ticketTransfer.cancelTransfer' }));
    await gebruiker.click(await screen.findByRole('button', { name: 'ticketTransfer.yesCancel' }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('al aanvaard'));
  });

  it('zegt het als er niets loopt', async () => {
    vi.mocked(getPendingTransfers).mockResolvedValue([]);
    const gebruiker = toon();

    await screen.findAllByRole('button', { name: 'ticketTransfer.transfer' });
    await naarTabblad(gebruiker, 'pending');

    expect(await screen.findByRole('heading', { name: 'ticketTransfer.noPendingTransfers' })).toBeInTheDocument();
  });
});

describe('kaartoverdracht - de geschiedenis', () => {
  it('laat zien wie wat aan wie gaf en hoe het afliep', async () => {
    const gebruiker = toon();

    await screen.findAllByRole('button', { name: 'ticketTransfer.transfer' });
    await naarTabblad(gebruiker, 'history');

    const aanvaard = (await screen.findByText('Chris Cool')).closest('tr') as HTMLElement;
    expect(within(aanvaard).getByText('chris@example.org')).toBeInTheDocument();
    expect(within(aanvaard).getByText('Anna de Groot')).toBeInTheDocument();
    expect(within(aanvaard).getByText('ticketTransfer.status.accepted')).toBeInTheDocument();

    const ingetrokken = screen.getByText('Dirk Dekker').closest('tr') as HTMLElement;
    expect(within(ingetrokken).getByText('ticketTransfer.status.cancelled')).toBeInTheDocument();
  });

  it('zegt het als er nog nooit iets is doorgegeven', async () => {
    vi.mocked(getTransferHistory).mockResolvedValue([]);
    const gebruiker = toon();

    await screen.findAllByRole('button', { name: 'ticketTransfer.transfer' });
    await naarTabblad(gebruiker, 'history');

    expect(await screen.findByRole('heading', { name: 'ticketTransfer.noHistory' })).toBeInTheDocument();
  });
});
