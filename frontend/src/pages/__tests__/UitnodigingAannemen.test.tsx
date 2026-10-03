/**
 * De pagina achter de link in een uitnodigingsmail: /invite/<token>.
 *
 * Die route bestond niet. De server maakte een link `/invite/<token>`, maar wie
 * erop klikte kwam op het dashboard of het inlogscherm, en de uitnodiging was
 * nergens aan te nemen. Wat hier vastligt:
 *   - uitgelogd: je ziet voor welke vereniging het is en gaat via het
 *     inlogscherm terug hierheen;
 *   - ingelogd met het goede adres: aannemen, en dan de melding dat je lid bent;
 *   - ingelogd met een ander adres: geen aanneemknop, wel de weg om te wisselen;
 *   - een onbekende of verlopen uitnodiging, en een weigering van de server,
 *     geven een melding.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import UitnodigingAannemen from '../UitnodigingAannemen';

const { stand } = vi.hoisted(() => ({
  stand: {
    gebruiker: null as null | { email: string },
    uitnodiging: undefined as undefined | Record<string, string>,
    fout: false,
    aannemen: vi.fn(async (_token: string) => {}),
    uitloggen: vi.fn(),
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (sleutel: string, opties?: Record<string, unknown>) =>
      opties ? `${sleutel} ${Object.values(opties).join(' ')}` : sleutel,
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('../../hooks/useDocumentTitle', () => ({ useDocumentTitle: () => {} }));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: stand.gebruiker, logout: stand.uitloggen }),
}));

vi.mock('../../hooks/useMultiAssociation', () => ({
  useInvitationDetails: () => ({ data: stand.uitnodiging, isLoading: false, isError: stand.fout }),
  useAcceptInvitation: () => ({ mutateAsync: stand.aannemen, isPending: false }),
}));

const TOKEN = 'a'.repeat(64);

/** Toont waar de pagina naartoe stuurde, met de meegegeven staat. */
function Inlogscherm() {
  const locatie = useLocation();
  return <div>inlogscherm {JSON.stringify(locatie.state)}</div>;
}

function toon() {
  render(
    <MemoryRouter initialEntries={[`/invite/${TOKEN}`]}>
      <Routes>
        <Route path="/invite/:token" element={<UitnodigingAannemen />} />
        <Route path="/login" element={<Inlogscherm />} />
      </Routes>
    </MemoryRouter>,
  );
  return userEvent.setup();
}

beforeEach(() => {
  stand.gebruiker = null;
  stand.fout = false;
  stand.uitnodiging = {
    email: 'kees@voorbeeld.nl',
    associationName: 'Fanfare West',
    role: 'member',
    expiresAt: '2026-10-09T12:00:00.000Z',
  };
  stand.aannemen.mockReset();
  stand.aannemen.mockResolvedValue(undefined);
  stand.uitloggen.mockReset();
});

describe('uitnodiging aannemen', () => {
  it('stuurt wie uitgelogd is naar het inlogscherm, met de weg terug', async () => {
    const gebruiker = toon();

    expect(screen.getByText(/Fanfare West/)).toBeInTheDocument();
    await gebruiker.click(screen.getByRole('button', { name: 'uitnodiging.inloggen' }));

    expect(screen.getByText(`inlogscherm {"terug":"/invite/${TOKEN}"}`)).toBeInTheDocument();
  });

  it('neemt aan voor wie met het goede adres is ingelogd, ongeacht hoofdletters', async () => {
    stand.gebruiker = { email: 'Kees@Voorbeeld.nl' };
    const gebruiker = toon();

    await gebruiker.click(screen.getByRole('button', { name: 'uitnodiging.aannemen' }));

    expect(stand.aannemen).toHaveBeenCalledWith(TOKEN);
    expect(await screen.findByText('uitnodiging.gelukt Fanfare West')).toBeInTheDocument();
  });

  it('geeft wie met een ander adres is ingelogd geen aanneemknop, wel de weg om te wisselen', async () => {
    stand.gebruiker = { email: 'iemand-anders@voorbeeld.nl' };
    const gebruiker = toon();

    expect(screen.queryByRole('button', { name: 'uitnodiging.aannemen' })).not.toBeInTheDocument();
    expect(
      screen.getByText('uitnodiging.anderAccount iemand-anders@voorbeeld.nl kees@voorbeeld.nl'),
    ).toBeInTheDocument();

    await gebruiker.click(screen.getByRole('button', { name: 'uitnodiging.anderAccountInloggen' }));

    expect(stand.uitloggen).toHaveBeenCalled();
    expect(screen.getByText(`inlogscherm {"terug":"/invite/${TOKEN}"}`)).toBeInTheDocument();
  });

  it('meldt een onbekende, gebruikte of verlopen uitnodiging', () => {
    stand.fout = true;
    stand.uitnodiging = undefined;
    toon();

    expect(screen.getByText('uitnodiging.nietGevonden')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'uitnodiging.aannemen' })).not.toBeInTheDocument();
  });

  it('toont de reden als de server het aannemen weigert', async () => {
    stand.gebruiker = { email: 'kees@voorbeeld.nl' };
    stand.aannemen.mockRejectedValueOnce(new Error('Deze uitnodiging is niet meer geldig. Vraag om een nieuwe.'));
    const gebruiker = toon();

    await gebruiker.click(screen.getByRole('button', { name: 'uitnodiging.aannemen' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Deze uitnodiging is niet meer geldig');
    expect(screen.queryByText(/uitnodiging.gelukt/)).not.toBeInTheDocument();
  });
});
