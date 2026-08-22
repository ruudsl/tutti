/**
 * De labels van de profielpagina horen bij hun veld.
 *
 * Bij het wachtwoord wijzigen, bij het aanzetten van tweestapsverificatie en
 * bij het uitzetten ervan stonden label en veld los naast elkaar in dezelfde
 * `form-group`, zonder `htmlFor` en zonder `id`. Een schermlezer kondigde een
 * bewerkbaar veld aan zonder te zeggen wat erin moest, klikken op het label
 * zette de aanwijzer nergens, en een test kon het veld niet op naam vinden.
 *
 * Dat weegt hier zwaarder dan elders: het zijn vier wachtwoordvelden op één
 * pagina. Zonder koppeling zijn ze voor een schermlezer niet uit elkaar te
 * houden - vier keer "wachtwoord, bewerkbaar" en verder niets.
 *
 * `getByLabelText` is dus geen willekeurige zoekmethode maar de kern van de
 * test: die vindt een veld alleen als de koppeling er echt is. Zoeken via de
 * omhullende `.form-group` zou ook slagen op de kapotte code en bewijst niets.
 *
 * Alle vijf de velden lopen sinds de ombouw via `components/FormField`.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Profile from '../Profile';

vi.mock('../../hooks/useDocumentTitle', () => ({ useDocumentTitle: () => {} }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (sleutel: string) => sleutel }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

// De gebruiker is per test in te stellen: met tweestapsverificatie aan staat er
// een ander formulier dan met die uit.
const { houder, leeg } = vi.hoisted(() => ({
  houder: { gebruiker: { id: 'u1', name: 'Marieke', email: 'marieke@example.org', mfaEnabled: false } },
  // De omliggende blokken van de profielpagina doen niets met labels; ze halen
  // wel gegevens op, dus ze staan hier stil.
  leeg: () => null,
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: houder.gebruiker, refreshProfile: async () => {} }),
}));

vi.mock('../../api', () => ({
  changePassword: async () => ({}),
  setupMfa: async () => ({ qrCode: 'data:image/png;base64,x', secret: 'GEHEIM123' }),
  enableMfa: async () => ({}),
  disableMfa: async () => ({}),
}));

vi.mock('../../components/SessionsManager', () => ({ SessionsManager: leeg }));
vi.mock('../../components/LanguageSwitcher', () => ({ LanguageSwitcher: leeg }));
vi.mock('../../components/GdprExport', () => ({ GdprExport: leeg }));
vi.mock('../../components/NotificationPreferences', () => ({ default: leeg }));
vi.mock('../../components/CalendarSync', () => ({ CalendarSync: leeg }));
vi.mock('../../components/CustomFields', () => ({ CustomFieldsSection: leeg }));

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  houder.gebruiker = { id: 'u1', name: 'Marieke', email: 'marieke@example.org', mfaEnabled: false };
});

describe('profielpagina - labels gekoppeld aan hun veld', () => {
  it('houdt de drie wachtwoordvelden uit elkaar op hun labeltekst', async () => {
    render(<Profile />);

    // Drie velden van hetzelfde type op één formulier: zonder koppeling zijn
    // ze niet te onderscheiden, met koppeling wijst elk label er precies een aan.
    const huidig = screen.getByLabelText('profile.changePassword.current');
    const nieuw = screen.getByLabelText('profile.changePassword.new');
    const herhaal = screen.getByLabelText('profile.changePassword.confirm');

    for (const veld of [huidig, nieuw, herhaal]) {
      expect(veld).toHaveAttribute('type', 'password');
      expect(veld).toBeRequired();
    }
    expect(new Set([huidig.id, nieuw.id, herhaal.id]).size).toBe(3);
  });

  it('zet de aanwijzer in het veld als je op het label klikt', async () => {
    const gebruiker = userEvent.setup();
    render(<Profile />);

    // Klikken op het label zet de aanwijzer in het veld: dat kon vóór de
    // koppeling niet, en het is de reden dat een label bij een veld hoort.
    await gebruiker.click(screen.getByText('profile.changePassword.new'));
    await gebruiker.keyboard('nieuwgeheim');

    expect(screen.getByLabelText('profile.changePassword.new')).toHaveValue('nieuwgeheim');
    expect(screen.getByLabelText('profile.changePassword.current')).toHaveValue('');
  });

  it('koppelt ook het veld voor de verificatiecode van tweestapsverificatie', async () => {
    const gebruiker = userEvent.setup();
    render(<Profile />);

    await gebruiker.click(screen.getByRole('button', { name: 'profile.mfa.setupButton' }));

    const code = await screen.findByLabelText('profile.mfa.verificationCode');
    expect(code).toHaveAttribute('maxlength', '6');
  });

  it('koppelt ook het wachtwoordveld waarmee tweestapsverificatie uit gaat', async () => {
    houder.gebruiker = { ...houder.gebruiker, mfaEnabled: true };
    render(<Profile />);

    expect(screen.getByLabelText('profile.mfa.disablePassword')).toHaveAttribute('type', 'password');
  });
});
