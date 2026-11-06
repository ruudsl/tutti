/**
 * De app-schil zolang een lid eerst een eigen wachtwoord moet kiezen of
 * tweestapsverificatie moet instellen.
 *
 * Het lid staat dan op zijn profiel en de server weigert bijna elk ander
 * verzoek (403). De schil haalde toch alles op: modules, instellingen,
 * meldingen, recente items, zoekgeschiedenis, de verenigingskiezer. Elke
 * pagina gaf zo een stuk of twintig 403's, en omdat de instellingen niet
 * kwamen stond er "Tutti" in de kop in plaats van de naam van de vereniging.
 *
 * Wat hier vastligt: in die toestand blijven menu, zoeken, meldingen, recente
 * items, verenigingskiezer en snelle acties weg, de instellingen worden niet
 * opgevraagd, en de kop toont de naam die het inlogantwoord meegaf.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ROLES } from '../../utils/constants';

const stand = vi.hoisted(() => ({
  gebruiker: {
    id: 'u1',
    firstName: 'Ria',
    lastName: 'de Vries',
    role: 'member',
    associationName: 'Harmonie Sint Jan',
    mustChangePassword: false as boolean,
    tweestapInstellenVerplicht: false as boolean,
  },
  superbeheerderOpgevraagd: [] as boolean[],
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: stand.gebruiker, logout: vi.fn() }),
}));

vi.mock('../../context/ModulesContext', () => ({
  useModules: () => ({ enabled: [], loading: false, loaded: true, isEnabled: () => true, refresh: vi.fn() }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (sleutel: string, standaard?: unknown) => (typeof standaard === 'string' ? standaard : sleutel),
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
  withTranslation: () => (Component: React.ComponentType<Record<string, unknown>>) => (props: object) => (
    <Component {...props} t={(s: string) => s} />
  ),
}));

vi.mock('../../api/settings', () => ({
  getSettings: vi.fn().mockResolvedValue({ displayName: 'Uit de instellingen', logoUrl: '' }),
}));

vi.mock('../../hooks/useKeyboardShortcuts', () => ({ useKeyboardShortcuts: () => {}, useShortcutEvent: () => {} }));
vi.mock('../Icon', () => ({ Icon: () => <span /> }));
vi.mock('../DarkModeToggle', () => ({ DarkModeToggle: () => null }));
vi.mock('../Breadcrumbs', () => ({ Breadcrumbs: () => null }));
vi.mock('../SyncStatusIndicator', () => ({ SyncStatusIndicator: () => null }));
vi.mock('../QuickActionsMenu', () => ({ QuickActionsMenu: () => <div data-testid="snelle-acties" /> }));
vi.mock('../NotificationCenter', () => ({ NotificationBell: () => <div data-testid="meldingen" /> }));
vi.mock('../RecentItems', () => ({ RecentItems: () => <div data-testid="recent" /> }));
vi.mock('../AssociationSwitcher', () => ({ AssociationSwitcher: () => <div data-testid="verenigingskiezer" /> }));
vi.mock('../../hooks/useMultiAssociation', () => ({
  useIsSuperAdmin: ({ enabled = true }: { enabled?: boolean } = {}) => {
    stand.superbeheerderOpgevraagd.push(enabled);
    return { data: undefined };
  },
}));
vi.mock('../KeyboardShortcutsHelp', () => ({ KeyboardShortcutsHelp: () => null, SequenceIndicator: () => null }));
vi.mock('../GlobalSearch', () => ({
  GlobalSearch: () => <div data-testid="zoeken" />,
  useGlobalSearch: () => ({ isOpen: false, open: vi.fn(), close: vi.fn(), toggle: vi.fn() }),
}));
vi.mock('../OnboardingTour', () => ({ OnboardingTour: () => null, resetOnboarding: vi.fn() }));

import Layout from '../Layout';
import { getSettings } from '../../api/settings';

beforeEach(() => {
  stand.gebruiker.role = ROLES.MEMBER;
  stand.gebruiker.mustChangePassword = false;
  stand.gebruiker.tweestapInstellenVerplicht = false;
  stand.superbeheerderOpgevraagd = [];
  vi.mocked(getSettings).mockClear();
  localStorage.clear();
});

function toon() {
  return render(
    <MemoryRouter initialEntries={['/profile']}>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route path="*" element={<div>profielpagina</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

const SCHIL = ['meldingen', 'recent', 'verenigingskiezer', 'snelle-acties', 'zoeken'];

describe('de app-schil zolang er eerst iets geregeld moet worden', () => {
  it('laat menu, zoeken, meldingen en verenigingskiezer weg zolang het wachtwoord gekozen moet worden', () => {
    stand.gebruiker.mustChangePassword = true;
    toon();

    expect(screen.getByText('profielpagina')).toBeInTheDocument();
    for (const deel of SCHIL) expect(screen.queryByTestId(deel), deel).not.toBeInTheDocument();
    expect(document.querySelector('.app-sidebar')).toBeNull();
    expect(document.querySelector('.mobile-bottom-tabs')).toBeNull();
  });

  it('vraagt dan geen instellingen en geen superbeheerder op, en toont de naam van de vereniging', () => {
    stand.gebruiker.mustChangePassword = true;
    toon();

    expect(getSettings).not.toHaveBeenCalled();
    expect(stand.superbeheerderOpgevraagd.every((aan) => aan === false)).toBe(true);
    expect(screen.getByText('Harmonie Sint Jan')).toBeInTheDocument();
  });

  it('doet hetzelfde zolang tweestapsverificatie ingesteld moet worden', () => {
    stand.gebruiker.tweestapInstellenVerplicht = true;
    toon();

    for (const deel of SCHIL) expect(screen.queryByTestId(deel), deel).not.toBeInTheDocument();
    expect(getSettings).not.toHaveBeenCalled();
  });

  it('toont alles weer als er niets meer geregeld hoeft te worden', async () => {
    toon();

    for (const deel of SCHIL) expect(screen.getByTestId(deel), deel).toBeInTheDocument();
    expect(document.querySelector('.app-sidebar')).not.toBeNull();
    expect(getSettings).toHaveBeenCalled();
    expect(await screen.findByText('Uit de instellingen')).toBeInTheDocument();
  });
});
