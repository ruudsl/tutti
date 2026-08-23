/**
 * Sessiebeheer: wat een bezoeker over zijn eigen aanmeldingen ziet en kan.
 *
 * Deze pagina is de noodrem van een gebruiker: hier zet hij een apparaat buiten
 * de deur waarvan hij denkt dat een ander erbij kan. Twee dingen mogen daarbij
 * nooit misgaan.
 *
 * Ten eerste mag de huidige sessie geen knop Intrekken krijgen. Wie zichzelf
 * uitgooit, staat buiten en kan de rest van zijn apparaten niet meer bereiken.
 * De pagina merkt de huidige sessie aan met een label en laat de knop weg; die
 * twee horen bij elkaar en worden hier samen nagekeken.
 *
 * Ten tweede is Alles intrekken alleen zinvol als er iets anders is dan het
 * apparaat waarop je zit. Staat die knop er terwijl er niets in te trekken
 * valt, dan belooft hij iets wat hij niet doet.
 *
 * Verder wordt de omschrijving van het apparaat nagekeken: die komt uit de
 * user-agent, en een lege user-agent moet niet leiden tot een lege regel.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import SessionManagement from '../SessionManagement';

const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const TELEFOON_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const { stand, haal, trekIn, trekAllesIn } = vi.hoisted(() => ({
  stand: { fout: false as boolean },
  haal: vi.fn(),
  trekIn: vi.fn(),
  trekAllesIn: vi.fn(),
}));

vi.mock('../../hooks/useDocumentTitle', () => ({ useDocumentTitle: () => {} }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (sleutel: string, opties?: Record<string, unknown>) =>
      opties && 'count' in opties ? `${sleutel}:${opties.count}` : sleutel,
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('../../api', () => ({
  getSessions: () => haal(),
  revokeSession: (id: string) => trekIn(id),
  revokeAllSessions: () => trekAllesIn(),
}));

vi.mock('../../components/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icoon-${name}`} />,
}));

const { meldingen } = vi.hoisted(() => ({ meldingen: { goed: vi.fn(), fout: vi.fn() } }));
vi.mock('../../utils/toast', () => ({
  showSuccess: (m: string) => meldingen.goed(m),
  showError: (m: string) => meldingen.fout(m),
}));

function wikkel({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** Een sessie zoals de server hem teruggeeft. */
function sessie(overschrijf: Partial<Record<string, unknown>> = {}) {
  const nu = new Date();
  return {
    id: 'ses-1',
    ipAddress: '192.0.2.10',
    userAgent: DESKTOP_UA,
    lastActive: nu.toISOString(),
    createdAt: nu.toISOString(),
    expiresAt: new Date(nu.getTime() + 86400000).toISOString(),
    isCurrent: false,
    ...overschrijf,
  };
}

async function toonPagina() {
  const gebruiker = userEvent.setup();
  render(<SessionManagement />, { wrapper: wikkel });
  await screen.findByRole('heading', { name: 'sessions.title' });
  return gebruiker;
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  stand.fout = false;
  haal.mockResolvedValue([
    sessie({ id: 'ses-hier', isCurrent: true }),
    sessie({ id: 'ses-telefoon', userAgent: TELEFOON_UA, ipAddress: '198.51.100.4' }),
  ]);
  trekIn.mockResolvedValue({ message: 'ok' });
  trekAllesIn.mockResolvedValue({ message: 'ok', revokedCount: 1 });
});

describe('sessiebeheer - de huidige sessie blijft buiten schot', () => {
  it('merkt de huidige sessie aan en geeft die geen knop Intrekken', async () => {
    await toonPagina();

    const hier = screen.getByText('sessions.currentSession').closest('.session-card')!;
    // Het label en het ontbreken van de knop horen bij elkaar: de sessie waar
    // je op zit kun je niet vanaf dit scherm afsluiten.
    expect(within(hier).queryByRole('button', { name: 'sessions.revoke' })).toBeNull();
  });

  it('geeft elke andere sessie wel een knop Intrekken', async () => {
    await toonPagina();

    // Precies één knop: er is één andere sessie.
    expect(screen.getAllByRole('button', { name: 'sessions.revoke' })).toHaveLength(1);
  });

  it('laat Alles intrekken weg als er alleen deze sessie is', async () => {
    haal.mockResolvedValue([sessie({ id: 'ses-hier', isCurrent: true })]);

    await toonPagina();

    expect(screen.queryByRole('button', { name: 'sessions.revokeAll' })).toBeNull();
  });
});

describe('sessiebeheer - intrekken', () => {
  it('vraagt eerst om bevestiging en trekt dan pas in', async () => {
    const gebruiker = await toonPagina();

    await gebruiker.click(screen.getByRole('button', { name: 'sessions.revoke' }));

    const venster = await screen.findByRole('alertdialog');
    expect(within(venster).getByText('sessions.revokeConfirmTitle')).toBeInTheDocument();
    // Nog niets gebeurd zolang er niet bevestigd is.
    expect(trekIn).not.toHaveBeenCalled();

    await gebruiker.click(within(venster).getByRole('button', { name: 'sessions.revoke' }));

    await waitFor(() => expect(trekIn).toHaveBeenCalledWith('ses-telefoon'));
    await waitFor(() => expect(meldingen.goed).toHaveBeenCalledWith('sessions.sessionRevoked'));
  });

  it('doet niets als de bevestiging wordt afgebroken', async () => {
    const gebruiker = await toonPagina();

    await gebruiker.click(screen.getByRole('button', { name: 'sessions.revoke' }));
    const venster = await screen.findByRole('alertdialog');
    await gebruiker.click(within(venster).getByRole('button', { name: 'common.cancel' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(trekIn).not.toHaveBeenCalled();
  });

  it('meldt het als intrekken mislukt en laat de sessie staan', async () => {
    trekIn.mockRejectedValue(new Error('kapot'));
    const gebruiker = await toonPagina();

    await gebruiker.click(screen.getByRole('button', { name: 'sessions.revoke' }));
    const venster = await screen.findByRole('alertdialog');
    await gebruiker.click(within(venster).getByRole('button', { name: 'sessions.revoke' }));

    await waitFor(() => expect(meldingen.fout).toHaveBeenCalledWith('errors.generic'));
  });

  it('noemt in de bevestiging van Alles intrekken hoeveel sessies het betreft', async () => {
    haal.mockResolvedValue([
      sessie({ id: 'ses-hier', isCurrent: true }),
      sessie({ id: 'ses-a' }),
      sessie({ id: 'ses-b', userAgent: TELEFOON_UA }),
    ]);
    const gebruiker = await toonPagina();

    await gebruiker.click(screen.getByRole('button', { name: 'sessions.revokeAll' }));

    const venster = await screen.findByRole('alertdialog');
    // Twee: de huidige sessie telt niet mee.
    expect(within(venster).getByText('sessions.revokeAllConfirmMessage:2')).toBeInTheDocument();

    await gebruiker.click(within(venster).getByRole('button', { name: 'sessions.revokeAll' }));
    await waitFor(() => expect(trekAllesIn).toHaveBeenCalled());
  });
});

describe('sessiebeheer - wat er per sessie te lezen is', () => {
  it('beschrijft een computer met browser en besturingssysteem', async () => {
    await toonPagina();

    expect(screen.getByText('Chrome on Windows')).toBeInTheDocument();
    // Een computer krijgt een schermicoon, geen telefoonicoon.
    const hier = screen.getByText('Chrome on Windows').closest('.session-card')!;
    expect(within(hier).getByTestId('icoon-monitor')).toBeInTheDocument();
  });

  it('beschrijft een telefoon als telefoon, met een eigen icoon', async () => {
    await toonPagina();

    const telefoon = screen.getByText(/mobile - Mobile Safari/).closest('.session-card')!;
    expect(within(telefoon).getByTestId('icoon-smartphone')).toBeInTheDocument();
  });

  it('laat een lege user-agent niet als lege regel staan', async () => {
    haal.mockResolvedValue([sessie({ id: 'ses-onbekend', userAgent: null, isCurrent: false })]);

    await toonPagina();

    expect(screen.getByText('Unknown')).toBeInTheDocument();
    expect(screen.getByTestId('icoon-laptop')).toBeInTheDocument();
  });

  it('toont het ip-adres als het bekend is en laat de regel weg als het ontbreekt', async () => {
    haal.mockResolvedValue([
      sessie({ id: 'ses-met-ip', ipAddress: '203.0.113.7' }),
      sessie({ id: 'ses-zonder-ip', ipAddress: null, userAgent: TELEFOON_UA }),
    ]);

    await toonPagina();

    const metIp = screen.getByText('Chrome on Windows').closest('.session-card')!;
    expect(within(metIp).getByText(/203\.0\.113\.7/)).toBeInTheDocument();

    const zonderIp = screen.getByText(/mobile - Mobile Safari/).closest('.session-card')!;
    expect(within(zonderIp).queryByText(/sessions.ipAddress/)).toBeNull();
  });

  it('schrijft de laatste activiteit in gewone taal', async () => {
    const nu = Date.now();
    haal.mockResolvedValue([
      sessie({ id: 'a', lastActive: new Date(nu - 5 * 60000).toISOString() }),
      sessie({ id: 'b', userAgent: TELEFOON_UA, lastActive: new Date(nu - 3 * 3600000).toISOString() }),
      sessie({ id: 'c', userAgent: null, lastActive: new Date(nu - 2 * 86400000).toISOString() }),
    ]);

    await toonPagina();

    expect(screen.getByText(/5 min ago/)).toBeInTheDocument();
    expect(screen.getByText(/3 hours ago/)).toBeInTheDocument();
    expect(screen.getByText(/2 days ago/)).toBeInTheDocument();
  });

  it('valt terug op de aanmaakdatum als er nog geen activiteit is', async () => {
    haal.mockResolvedValue([
      sessie({ id: 'a', lastActive: '', createdAt: new Date(Date.now() - 1000).toISOString() }),
    ]);

    await toonPagina();

    expect(screen.getByText(/Just now/)).toBeInTheDocument();
  });
});

describe('sessiebeheer - randgevallen', () => {
  it('meldt het als er geen sessies te tonen zijn', async () => {
    haal.mockResolvedValue([]);

    await toonPagina();

    expect(screen.getByText('sessions.noSessions')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'sessions.revokeAll' })).toBeNull();
  });

  it('toont een foutmelding in plaats van een lege lijst als ophalen mislukt', async () => {
    haal.mockRejectedValue(new Error('kapot'));

    render(<SessionManagement />, { wrapper: wikkel });

    expect(await screen.findByText('errors.generic')).toBeInTheDocument();
    // Geen kop en geen knoppen: er valt niets te beheren zonder gegevens.
    expect(screen.queryByRole('button', { name: 'sessions.revokeAll' })).toBeNull();
  });
});
