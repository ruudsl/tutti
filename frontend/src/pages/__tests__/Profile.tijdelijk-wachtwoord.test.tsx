/**
 * Een nieuw lid met het tijdelijke wachtwoord van de aanmelding.
 *
 * App.tsx stuurt zo'n lid naar het profiel. Daar hoort het lid te lezen
 * waarom, en na het wijzigen moet het profiel opnieuw worden opgehaald: pas
 * dan is de vlag weg en mag het lid weer verder dan deze pagina.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Profile from '../Profile';

vi.mock('../../hooks/useDocumentTitle', () => ({ useDocumentTitle: () => {} }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (sleutel: string) => sleutel }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

const { houder, leeg, verversProfiel, wijzigWachtwoord } = vi.hoisted(() => ({
  houder: { gebruiker: {} as Record<string, unknown> },
  leeg: () => null,
  verversProfiel: vi.fn(async () => {}),
  wijzigWachtwoord: vi.fn(async () => ({})),
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: houder.gebruiker, refreshProfile: verversProfiel }),
}));

vi.mock('../../api', () => ({
  changePassword: wijzigWachtwoord,
  setupMfa: async () => ({}),
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
  houder.gebruiker = { id: 'u1', email: 'nieuw@example.org', mfaEnabled: false, mustChangePassword: true };
});

describe('profielpagina - tijdelijk wachtwoord', () => {
  it('zegt waarom het lid hier is', () => {
    render(<Profile />);

    expect(screen.getByRole('alert')).toHaveTextContent('profile.changePassword.required');
  });

  it('zegt niets bij een lid met een eigen wachtwoord', () => {
    houder.gebruiker = { ...houder.gebruiker, mustChangePassword: false };
    render(<Profile />);

    expect(screen.queryByText('profile.changePassword.required')).not.toBeInTheDocument();
  });

  it('toont alleen wat nodig is om het wachtwoord te wijzigen', () => {
    // De API weigert dit lid de rest; die onderdelen gaven alleen foutmeldingen.
    render(<Profile />);

    expect(screen.getByLabelText('profile.changePassword.new')).toBeInTheDocument();
    expect(screen.queryByText('profile.mfa.title')).not.toBeInTheDocument();
  });

  it('toont de rest van het profiel weer met een eigen wachtwoord', () => {
    houder.gebruiker = { ...houder.gebruiker, mustChangePassword: false };
    render(<Profile />);

    expect(screen.getByText('profile.mfa.title')).toBeInTheDocument();
  });

  it('haalt na het wijzigen het profiel opnieuw op', async () => {
    const gebruiker = userEvent.setup();
    render(<Profile />);

    await gebruiker.type(screen.getByLabelText('profile.changePassword.current'), 'Tijdelijk!2026');
    await gebruiker.type(screen.getByLabelText('profile.changePassword.new'), 'MijnEigen!2026');
    await gebruiker.type(screen.getByLabelText('profile.changePassword.confirm'), 'MijnEigen!2026');
    await gebruiker.click(screen.getByRole('button', { name: 'profile.changePassword.button' }));

    await waitFor(() => expect(wijzigWachtwoord).toHaveBeenCalledWith('Tijdelijk!2026', 'MijnEigen!2026'));
    await waitFor(() => expect(verversProfiel).toHaveBeenCalled());
  });
});
