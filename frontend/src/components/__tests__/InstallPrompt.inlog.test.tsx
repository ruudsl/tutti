/**
 * De installatiebalk hoort niet op het inlogscherm.
 *
 * De balk stond er altijd al, maar was dode code: Chrome stuurt
 * `beforeinstallprompt` alleen als er een service worker draait, en die
 * registreerde nooit. Sinds die fout weg is verschijnt de balk wél - en dan
 * meteen op het inlogscherm, aan iemand die de applicatie nog niet binnen is.
 *
 * Dat is de verkeerde volgorde, en het kostte ook meetbaar: op het inlogscherm
 * was deze balk het grootste element op het scherm en bepaalde hij daarmee de
 * LCP van de meting.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { InstallPrompt } from '../InstallPrompt';

const installatieStatus = {
  canInstall: true,
  isDismissed: false,
  promptInstall: vi.fn(),
  dismissPrompt: vi.fn(),
  isInstalled: false,
};

let ingelogd: { id: string } | null = null;

vi.mock('../../hooks/usePWAInstall', () => ({
  usePWAInstall: () => installatieStatus,
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: ingelogd }),
  AuthProvider: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (sleutel: string) => sleutel,
    i18n: { language: 'nl', changeLanguage: vi.fn() },
  }),
}));

describe('InstallPrompt', () => {
  beforeEach(() => {
    installatieStatus.canInstall = true;
    installatieStatus.isDismissed = false;
  });

  it('toont niets aan wie niet is ingelogd, ook als installeren kan', () => {
    ingelogd = null;
    const { container } = render(<InstallPrompt />);
    expect(container).toBeEmptyDOMElement();
  });

  it('toont de balk aan een ingelogd lid', () => {
    ingelogd = { id: 'lid-1' };
    render(<InstallPrompt />);
    expect(screen.getByRole('alert')).toHaveTextContent('pwa.install_title');
  });

  it('blijft weg als het lid hem heeft weggeklikt', () => {
    ingelogd = { id: 'lid-1' };
    installatieStatus.isDismissed = true;
    const { container } = render(<InstallPrompt />);
    expect(container).toBeEmptyDOMElement();
  });

  it('blijft weg als de browser niet kan installeren', () => {
    ingelogd = { id: 'lid-1' };
    installatieStatus.canInstall = false;
    const { container } = render(<InstallPrompt />);
    expect(container).toBeEmptyDOMElement();
  });
});
