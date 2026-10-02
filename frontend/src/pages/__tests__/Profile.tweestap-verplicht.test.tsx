/**
 * Een lid dat van zijn vereniging tweestapsverificatie moet hebben, en die
 * nog niet heeft. App.tsx stuurt zo'n lid naar het profiel; daar hoort het te
 * lezen waarom, bij de knop om het in te stellen. De eigen velden blijven
 * weg: de API weigert die tot tweestap aanstaat.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import Profile from '../Profile';

vi.mock('../../hooks/useDocumentTitle', () => ({ useDocumentTitle: () => {} }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (sleutel: string) => sleutel }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

const { houder, leeg } = vi.hoisted(() => ({
  houder: { gebruiker: {} as Record<string, unknown> },
  leeg: () => null,
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: houder.gebruiker, refreshProfile: vi.fn(async () => {}) }),
}));

vi.mock('../../api', () => ({
  changePassword: async () => ({}),
  setupMfa: async () => ({}),
  enableMfa: async () => ({}),
  disableMfa: async () => ({}),
}));

vi.mock('../../components/SessionsManager', () => ({ SessionsManager: leeg }));
vi.mock('../../components/LanguageSwitcher', () => ({ LanguageSwitcher: leeg }));
vi.mock('../../components/GdprExport', () => ({ GdprExport: leeg }));
vi.mock('../../components/NotificationPreferences', () => ({ default: leeg }));
vi.mock('../../components/CalendarSync', () => ({ CalendarSync: leeg }));
vi.mock('../../components/CustomFields', () => ({
  CustomFieldsSection: () => <div data-testid="eigen-velden" />,
}));

beforeEach(() => {
  houder.gebruiker = { id: 'u1', email: 'lid@example.org', mfaEnabled: false, tweestapInstellenVerplicht: true };
});

describe('profielpagina - tweestap verplicht', () => {
  it('zegt waarom het lid hier is, bij de knop om het in te stellen', () => {
    render(<Profile />);

    expect(screen.getByRole('alert')).toHaveTextContent('profile.mfa.verplicht');
    expect(screen.getByRole('button', { name: 'profile.mfa.setupButton' })).toBeInTheDocument();
  });

  it('laat de eigen velden weg tot tweestap aanstaat', () => {
    render(<Profile />);

    expect(screen.queryByTestId('eigen-velden')).not.toBeInTheDocument();
  });

  it('zegt niets en toont alles bij een lid dat niets hoeft', () => {
    houder.gebruiker = { ...houder.gebruiker, tweestapInstellenVerplicht: false };
    render(<Profile />);

    expect(screen.queryByText('profile.mfa.verplicht')).not.toBeInTheDocument();
    expect(screen.getByTestId('eigen-velden')).toBeInTheDocument();
  });
});
