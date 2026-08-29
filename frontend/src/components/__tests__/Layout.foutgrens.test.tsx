/**
 * De foutgrenzen die Layout om de pagina-inhoud zet.
 *
 * Het idee erachter is dat één kapotte pagina niet de hele applicatie mag
 * meenemen: het menu, de kop en de voet blijven staan, zodat de gebruiker
 * ergens anders heen kan. Dat tweede deel - "ergens anders heen kunnen" - is
 * waar het misging; zie het bewijs onderaan.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ReactElement } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import nl from '../../locales/nl.json';
import { ROLES } from '../../utils/constants';

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u1', firstName: 'Ria', lastName: 'de Vries', role: ROLES.MEMBER },
    logout: vi.fn(),
  }),
}));

vi.mock('../../context/ModulesContext', () => ({
  useModules: () => ({ enabled: [], loading: false, loaded: true, isEnabled: () => false, refresh: vi.fn() }),
}));

function vertaal(sleutel: string, standaardOfOpties?: unknown): string {
  const waarde = sleutel.split('.').reduce<unknown>((tak, deel) => {
    return tak && typeof tak === 'object' ? (tak as Record<string, unknown>)[deel] : undefined;
  }, nl);

  if (typeof waarde !== 'string') {
    return typeof standaardOfOpties === 'string' ? standaardOfOpties : sleutel;
  }
  if (standaardOfOpties && typeof standaardOfOpties === 'object') {
    return waarde.replace(/\{\{(\w+)\}\}/g, (_, naam) => String((standaardOfOpties as Record<string, unknown>)[naam]));
  }
  return waarde;
}

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: vertaal }),
  initReactI18next: { type: '3rdParty', init: () => {} },
  withTranslation: () => (Component: React.ComponentType<Record<string, unknown>>) => (props: object) => (
    <Component {...props} t={vertaal} />
  ),
}));

vi.mock('../../api/settings', () => ({
  getSettings: vi.fn().mockResolvedValue({ displayName: 'Harmonie Concordia', logoUrl: '' }),
}));

vi.mock('../../hooks/useKeyboardShortcuts', () => ({
  useKeyboardShortcuts: () => {},
  useShortcutEvent: () => {},
}));

vi.mock('../Icon', () => ({ Icon: ({ name }: { name: string }) => <span data-testid={`icoon-${name}`} /> }));
vi.mock('../DarkModeToggle', () => ({ DarkModeToggle: () => <button>donker</button> }));
vi.mock('../Breadcrumbs', () => ({ Breadcrumbs: () => <nav aria-label="kruimelpad" /> }));
vi.mock('../QuickActionsMenu', () => ({ QuickActionsMenu: () => null }));
vi.mock('../NotificationCenter', () => ({ NotificationBell: () => null }));
vi.mock('../RecentItems', () => ({ RecentItems: () => null }));
vi.mock('../SyncStatusIndicator', () => ({ SyncStatusIndicator: () => null }));
vi.mock('../AssociationSwitcher', () => ({ AssociationSwitcher: () => null }));
vi.mock('../KeyboardShortcutsHelp', () => ({ KeyboardShortcutsHelp: () => null, SequenceIndicator: () => null }));
vi.mock('../GlobalSearch', () => ({
  GlobalSearch: () => null,
  useGlobalSearch: () => ({ isOpen: false, open: vi.fn(), close: vi.fn(), toggle: vi.fn() }),
}));
vi.mock('../OnboardingTour', () => ({ OnboardingTour: () => null, resetOnboarding: vi.fn() }));

import Layout from '../Layout';

/** Een pagina die stukgaat zodra hij getekend wordt. */
function KapottePagina(): ReactElement {
  throw new Error('deze pagina is stuk');
}

beforeEach(() => {
  // React schrijft een gevangen fout altijd naar de console; dat is hier
  // verwacht gedrag en zou de uitvoer onleesbaar maken.
  vi.spyOn(console, 'error').mockImplementation(() => {});
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function toon(beginPad: string) {
  return render(
    <MemoryRouter initialEntries={[beginPad]}>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<KapottePagina />} />
          <Route path="rehearsals" element={<div>de repetitielijst</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('een pagina die stukgaat', () => {
  it('houdt de rest van het scherm overeind', () => {
    toon('/');

    // De naam van het onderdeel staat er onvertaald in ("Page Content"): die
    // komt letterlijk uit de prop in Layout.tsx en gaat ook naar de
    // foutmelding in de console. Dat is bestaand gedrag; hier alleen
    // vastgelegd, niet goedgekeurd.
    expect(screen.getByText('Page Content kon niet worden geladen')).toBeInTheDocument();
    // Het menu, de kop en de voet staan er nog, dus de gebruiker kan verder.
    expect(screen.getByRole('link', { name: /Repetities/ })).toBeInTheDocument();
    expect(screen.getAllByText('Ria de Vries').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'Feedback geven' })).toBeInTheDocument();
  });

  it('laat zich ter plekke opnieuw proberen', async () => {
    const gebruiker = userEvent.setup({ delay: null });
    toon('/');

    // De knop staat er en zet de grens terug; dat de pagina daarna opnieuw
    // stukgaat hoort erbij - hij is immers nog steeds stuk.
    await gebruiker.click(screen.getByRole('button', { name: 'Opnieuw proberen' }));

    expect(screen.getByText('Page Content kon niet worden geladen')).toBeInTheDocument();
  });

  /**
   * BEWIJS van een echte fout.
   *
   * De foutgrens om <Outlet /> hield zijn toestand vast over een
   * paginawissel heen. Wie op een kapotte pagina belandde en daarna in het
   * menu iets anders aanklikte, kreeg dus opnieuw "kon niet worden geladen" -
   * en de pagina waar hij naartoe wilde was in orde. De enige uitweg was de
   * knop "Opnieuw proberen" of de pagina verversen, en dat is precies de
   * ontsnapping die het menu naast de grens had moeten bieden.
   *
   * Rood zonder de reparatie: na de klik op "Repetities" stond er nog steeds
   * "Page Content kon niet worden geladen" en ontbrak "de repetitielijst" -
   * gemeten op de oude code, de test faalde op `findByText('de
   * repetitielijst')`.
   */
  it('is voorbij zodra de gebruiker een andere pagina opent', async () => {
    const gebruiker = userEvent.setup({ delay: null });
    toon('/');
    expect(screen.getByText('Page Content kon niet worden geladen')).toBeInTheDocument();

    await gebruiker.click(screen.getByRole('link', { name: /Repetities/ }));

    expect(await screen.findByText('de repetitielijst')).toBeInTheDocument();
    expect(screen.queryByText('Page Content kon niet worden geladen')).not.toBeInTheDocument();
  });
});
