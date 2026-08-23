/**
 * Een afgekeurd veld in het overdrachtsvenster moet ook voor een schermlezer
 * afgekeurd zijn.
 *
 * Dit formulier valideert met de hand en zette bij een fout de klasse
 * `is-invalid` op het veld. Die klasse werd door geen enkele stijlregel
 * opgepakt, en een klasse staat sowieso niet in de toegankelijkheidsboom. Wie
 * het scherm niet ziet drukte hier dus op Doorgaan, kreeg geen enkel signaal
 * terug en bleef in een venster staan dat niet verder wilde.
 *
 * Extra aandachtspunt op deze pagina: de velden droegen alleen een door useId
 * gemaakt id (zoiets als ":r3:"). Daar kon focusFirstError niets mee - vandaar
 * dat veldKenmerken ook het name-kenmerk zet.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { AriaLiveProvider } from '../../components/AriaLiveRegion';
import TicketTransferPage from '../TicketTransfer';

vi.mock('../../hooks/useDocumentTitle', () => ({ useDocumentTitle: () => {} }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (sleutel: string) => sleutel }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('../../components/Skeleton', () => ({ SkeletonTable: () => <div data-testid="skelet-tabel" /> }));

vi.mock('../../utils/toast', () => ({ showSuccess: vi.fn(), showError: vi.fn() }));

const kaartje = {
  id: 'kaartje-1',
  code: 'ABC123',
  ticketType: 'Staanplaats',
  buyerName: 'Jan Jansen',
  status: 'valid' as const,
  concert: { id: 'concert-1', name: 'Nieuwjaarsconcert', date: '2026-01-05T20:00:00Z', location: 'De Zaal' },
  hasPendingTransfer: false,
};

vi.mock('../../api', () => ({
  getTransferableTickets: vi.fn(async () => [kaartje]),
  getPendingTransfers: vi.fn(async () => []),
  getTransferHistory: vi.fn(async () => []),
  initiateTicketTransfer: vi.fn(async () => ({})),
  cancelTicketTransfer: vi.fn(async () => ({})),
}));

function wikkel({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return (
    <AriaLiveProvider>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </AriaLiveProvider>
  );
}

/** Opent het overdrachtsvenster, zoals iemand die een kaartje wil doorgeven. */
async function openOverdrachtsvenster() {
  const gebruiker = userEvent.setup();
  render(<TicketTransferPage />, { wrapper: wikkel });
  await gebruiker.click(await screen.findByRole('button', { name: /ticketTransfer.transfer$/ }));
  const venster = await screen.findByRole('dialog');
  return { gebruiker, venster };
}

/** Drukt op Doorgaan zonder iets in te vullen. */
async function verzendLeeg(gebruiker: ReturnType<typeof userEvent.setup>, venster: HTMLElement) {
  await gebruiker.click(within(venster).getByRole('button', { name: /ticketTransfer.continue/ }));
}

describe('TicketTransfer - een afgekeurd veld in de toegankelijkheidsboom', () => {
  it('markeert de lege velden als ongeldig', async () => {
    const { gebruiker, venster } = await openOverdrachtsvenster();

    await verzendLeeg(gebruiker, venster);

    expect(screen.getByLabelText(/ticketTransfer.recipientEmail/)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText(/ticketTransfer.recipientName/)).toHaveAttribute('aria-invalid', 'true');
  });

  it('koppelt de foutmelding aan het veld', async () => {
    const { gebruiker, venster } = await openOverdrachtsvenster();

    await verzendLeeg(gebruiker, venster);

    // Zonder deze verwijzing hoort een schermlezer wel "ongeldig", maar niet
    // waarom - en dan blijft de melding op het scherm los tekstwerk.
    const email = screen.getByLabelText(/ticketTransfer.recipientEmail/);
    const meldingId = email.getAttribute('aria-describedby');
    expect(meldingId).toBeTruthy();
    expect(document.getElementById(meldingId!)).toHaveTextContent('ticketTransfer.validation.emailRequired');
  });

  it('zet de cursor in het bovenste foute veld', async () => {
    const { gebruiker, venster } = await openOverdrachtsvenster();

    await verzendLeeg(gebruiker, venster);

    // De velden dragen alleen een door useId gemaakt id; focusFirstError vindt
    // ze via het name-kenmerk dat veldKenmerken erbij zet.
    expect(document.activeElement).toBe(screen.getByLabelText(/ticketTransfer.recipientEmail/));
  });

  it('meldt de fout dringend aan de schermlezer', async () => {
    const { gebruiker, venster } = await openOverdrachtsvenster();

    await verzendLeeg(gebruiker, venster);

    expect(screen.getByRole('alert')).toHaveTextContent('2 validatiefouten gevonden');
  });

  it('markeert alleen het veld dat werkelijk fout is', async () => {
    const { gebruiker, venster } = await openOverdrachtsvenster();

    await gebruiker.type(screen.getByLabelText(/ticketTransfer.recipientEmail/), 'nieuwe@eigenaar.nl');
    await verzendLeeg(gebruiker, venster);

    expect(screen.getByLabelText(/ticketTransfer.recipientEmail/)).not.toHaveAttribute('aria-invalid');
    expect(screen.getByLabelText(/ticketTransfer.recipientName/)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Validatiefout: ticketTransfer.validation.nameRequired');
  });

  it('markeert een adres dat de eigen keuring niet doorstaat', async () => {
    const { gebruiker, venster } = await openOverdrachtsvenster();

    // "jan@lokaal" komt langs de ingebouwde keuring van type="email" - die eist
    // geen punt - maar niet langs de keuring van deze pagina. Een adres zonder
    // apenstaartje zou het formulier niet eens laten verzenden: de browser
    // blokkeert dan zelf, en dan komt validateForm er nooit aan te pas.
    await gebruiker.type(screen.getByLabelText(/ticketTransfer.recipientEmail/), 'jan@lokaal');
    await verzendLeeg(gebruiker, venster);

    const email = screen.getByLabelText(/ticketTransfer.recipientEmail/);
    expect(email).toHaveAttribute('aria-invalid', 'true');
    expect(document.getElementById(email.getAttribute('aria-describedby')!)).toHaveTextContent(
      'ticketTransfer.validation.emailInvalid',
    );
  });
});
