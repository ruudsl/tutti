/**
 * De labels van de gastenlijst horen bij hun veld.
 *
 * Zowel de filters boven de lijst als het venster "Gast toevoegen" zetten hun
 * label eerst los naast het veld neer, in een `form-group` zonder `htmlFor` en
 * zonder `id`. Een schermlezer kondigde een bewerkbaar veld aan zonder te
 * zeggen wat erin moest, klikken op het label zette de aanwijzer nergens, en
 * een test kon het veld niet op naam vinden.
 *
 * `getByLabelText` is hier dus geen willekeurige zoekmethode maar de kern van
 * de test: die vindt een veld alleen als de koppeling er echt is. Zoeken via de
 * omhullende `.form-group` zou ook slagen op de kapotte code en bewijst niets.
 *
 * Dertien velden lopen sinds de ombouw via `components/FormField`. Het
 * kaartsoortveld in het toevoegvenster is met de hand gekoppeld omdat er een
 * hulptekst in dezelfde `form-group` staat; ook die staat hieronder, want
 * handwerk raakt eerder zoek dan een component.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import GuestList from '../GuestList';

vi.mock('../../api', () => ({
  getGuestList: async () => ({
    entries: [],
    pagination: { page: 1, limit: 25, total: 0, totalPages: 1 },
    summary: { totalGuests: 0, totalTickets: 0, ticketsSent: 0, ticketsPending: 0 },
  }),
  getConcertTickets: async () => ({ ticketTypes: [{ id: 'kaart-1', name: 'Vriendenkaart' }] }),
  addGuest: async () => ({}),
  updateGuest: async () => ({}),
  deleteGuest: async () => ({}),
  sendGuestTickets: async () => ({}),
  sendAllGuestTickets: async () => ({}),
}));

vi.mock('../../hooks/useDocumentTitle', () => ({ useDocumentTitle: () => {} }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (sleutel: string) => sleutel }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('react-router-dom', () => ({
  useParams: () => ({ concertId: 'concert-1' }),
  Link: ({ children }: { children: ReactNode }) => <a href="#">{children}</a>,
}));

vi.mock('../../components/Skeleton', () => ({
  SkeletonTable: () => <div data-testid="skelet-tabel" />,
}));

function wikkel({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

async function toonPagina() {
  const gebruiker = userEvent.setup();
  render(<GuestList />, { wrapper: wikkel });
  // De filters staan er pas als de lijst geladen is
  await screen.findByLabelText('common.search');
  return gebruiker;
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('gastenlijst - labels gekoppeld aan hun veld', () => {
  it('vindt de filtervelden boven de lijst op hun labeltekst', async () => {
    await toonPagina();

    expect(screen.getByLabelText('common.search')).toHaveAttribute('placeholder', 'guestList.searchPlaceholder');
    expect(screen.getByLabelText('common.status').tagName).toBe('SELECT');
  });

  it('vindt de velden van het toevoegvenster op hun labeltekst', async () => {
    const gebruiker = await toonPagina();
    await gebruiker.click(screen.getByRole('button', { name: 'guestList.addGuest' }));

    expect(await screen.findByLabelText('guestList.organisation')).toHaveAttribute('type', 'text');
    expect(screen.getByLabelText(/guestList.name/)).toBeRequired();
    expect(screen.getByLabelText(/guestList.email/)).toHaveAttribute('type', 'email');
    expect(screen.getByLabelText(/guestList.ticketCount/)).toHaveAttribute('type', 'number');
    expect(screen.getByLabelText('guestList.notes').tagName).toBe('TEXTAREA');
  });

  it('koppelt ook het met de hand gekoppelde kaartsoortveld, mét zijn hulptekst', async () => {
    const gebruiker = await toonPagina();
    await gebruiker.click(screen.getByRole('button', { name: 'guestList.addGuest' }));

    const kaartsoort = await screen.findByLabelText('guestList.ticketType');
    expect(kaartsoort.tagName).toBe('SELECT');

    // De hulptekst onder het veld hoort er ook bij: die staat buiten het label,
    // dus alleen aria-describedby brengt hem bij het veld.
    const hulptekst = screen.getByText('guestList.ticketTypeHelp');
    expect(kaartsoort).toHaveAttribute('aria-describedby', hulptekst.getAttribute('id'));
  });

  it('zet de aanwijzer in het veld als je op het label klikt', async () => {
    const gebruiker = await toonPagina();
    await gebruiker.click(screen.getByRole('button', { name: 'guestList.addGuest' }));

    // De kolomkop van de lijst heet net zo als het label, dus zoeken binnen het venster
    const venster = await screen.findByRole('dialog');

    // Klikken op het label zet de aanwijzer in het veld: dat kon vóór de
    // koppeling niet, en het is de reden dat een label bij een veld hoort.
    await gebruiker.click(within(venster).getByText('guestList.organisation'));
    expect(screen.getByLabelText('guestList.organisation')).toHaveFocus();
  });
});
