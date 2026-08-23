/**
 * Het navigatiemenu van Layout, per rol.
 *
 * De vraag die dit bestand beantwoordt is niet "tekent de zijbalk", maar
 * "welke onderdelen krijgt deze gebruiker te zien". Dat is de enige plek in de
 * applicatie waar een rol iets zichtbaar maakt of weghaalt, en het is ook de
 * plek waar het mis kan gaan op een manier die de gebruiker meteen merkt: een
 * menu-item naar een pagina waar de route hem toch wegstuurt, is een klik naar
 * het dashboard zonder uitleg.
 *
 * Het complete menu wordt uitgelezen via het mobiele menu. In de zijbalk staan
 * de onderdelen van een groep pas uitgeklapt zodra die groep actief is; het
 * mobiele paneel toont alles tegelijk en is daarmee de volledige lijst.
 *
 * De laatste test in dit bestand vergelijkt het menu met de routetabel in
 * App.tsx. Die is een *wacht* en geen bewijs: op de huidige code klopt de
 * tabel aan beide kanten, en de test staat er om te merken wanneer iemand aan
 * één kant iets toevoegt.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import fs from 'fs';
import path from 'path';
import nl from '../../locales/nl.json';
import { ROLES } from '../../utils/constants';

const uitloggen = vi.fn();
let huidigeRol: string = ROLES.MEMBER;
let aanstaandeModules: string[] = [];

/** Alle modulesleutels uit utils/modules.ts; standaard staat alles aan. */
const ALLE_MODULES = [
  'accounting',
  'ticketing',
  'stage',
  'polls',
  'tasks',
  'posts',
  'mailings',
  'contacts',
  'issues',
  'practice',
  'externals',
  'inventory',
  'projects',
  'resources',
  'wiki',
  'performances',
  'workflows',
  'seasons',
  'attendance',
];

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u1', firstName: 'Ria', lastName: 'de Vries', role: huidigeRol },
    logout: uitloggen,
  }),
}));

vi.mock('../../context/ModulesContext', () => ({
  useModules: () => ({
    enabled: aanstaandeModules,
    loading: false,
    loaded: true,
    isEnabled: () => true,
    refresh: vi.fn(),
  }),
}));

/** De echte Nederlandse teksten, zodat de tests opzoeken wat de gebruiker leest. */
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

// De buren van het menu doen er hier niet toe; ze halen wel elk hun eigen
// gegevens op en dat zou de test over netwerk laten struikelen.
vi.mock('../Icon', () => ({ Icon: ({ name }: { name: string }) => <span data-testid={`icoon-${name}`} /> }));
vi.mock('../DarkModeToggle', () => ({ DarkModeToggle: () => <button>donker</button> }));
vi.mock('../Breadcrumbs', () => ({ Breadcrumbs: () => <nav aria-label="kruimelpad" /> }));
vi.mock('../QuickActionsMenu', () => ({ QuickActionsMenu: () => null }));
vi.mock('../NotificationCenter', () => ({ NotificationBell: () => null }));
vi.mock('../RecentItems', () => ({ RecentItems: () => null }));
vi.mock('../SyncStatusIndicator', () => ({ SyncStatusIndicator: () => null }));
vi.mock('../AssociationSwitcher', () => ({ AssociationSwitcher: () => null }));
vi.mock('../KeyboardShortcutsHelp', () => ({
  KeyboardShortcutsHelp: () => null,
  SequenceIndicator: () => null,
}));
vi.mock('../GlobalSearch', () => ({
  GlobalSearch: () => null,
  useGlobalSearch: () => ({ isOpen: false, open: vi.fn(), close: vi.fn(), toggle: vi.fn() }),
}));
vi.mock('../OnboardingTour', () => ({
  OnboardingTour: ({ forceShow }: { forceShow?: boolean }) => (forceShow ? <div>rondleiding</div> : null),
  resetOnboarding: vi.fn(),
}));

import Layout from '../Layout';
import { getSettings } from '../../api/settings';

beforeEach(() => {
  huidigeRol = ROLES.MEMBER;
  aanstaandeModules = [...ALLE_MODULES];
  uitloggen.mockClear();
  localStorage.clear();
});

function toon(beginPad = '/') {
  return render(
    <MemoryRouter initialEntries={[beginPad]}>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<div>dashboardinhoud</div>} />
          <Route path="*" element={<div>pagina-inhoud</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

/** Opent het mobiele menu en geeft alle paden terug waar het naartoe wijst. */
async function menuPaden(gebruiker: ReturnType<typeof userEvent.setup>): Promise<string[]> {
  await gebruiker.click(screen.getByRole('button', { name: 'Meer' }));
  const paneel = screen.getByRole('dialog', { name: 'Menu' });
  const paden = within(paneel)
    .getAllByRole('link')
    .map((link) => link.getAttribute('href') || '');
  return [...new Set(paden)];
}

describe('welke menu-onderdelen een rol ziet', () => {
  it('toont een gewoon lid alleen wat van hem is', async () => {
    const gebruiker = userEvent.setup({ delay: null });
    toon();

    const paden = await menuPaden(gebruiker);

    expect(paden.sort()).toEqual(
      [
        '/',
        '/my-music',
        '/rehearsals',
        '/availability',
        '/my-tickets',
        '/members',
        '/contacts',
        '/issues',
        '/practice-schedules',
        '/practice',
        '/posts',
        '/polls',
        '/tasks',
        '/tools',
        '/wiki',
        '/outfits',
        '/performances',
        // De twee vaste voetlinks van het menu.
        '/user-guide',
        '/profile',
      ].sort(),
    );
  });

  it("houdt de beheerpagina's bij een gewoon lid uit het menu", async () => {
    const gebruiker = userEvent.setup({ delay: null });
    toon();

    const paden = await menuPaden(gebruiker);

    for (const verboden of ['/users', '/settings', '/modules', '/audit-logs', '/health', '/orchestras', '/theme']) {
      expect(paden).not.toContain(verboden);
    }
    expect(screen.queryByText('Beheer')).not.toBeInTheDocument();
  });

  it('geeft de beheerder het beheerblok erbij', async () => {
    huidigeRol = ROLES.ADMIN;
    const gebruiker = userEvent.setup({ delay: null });
    toon();

    const paden = await menuPaden(gebruiker);

    expect(paden).toEqual(
      expect.arrayContaining(['/users', '/settings', '/modules', '/audit-logs', '/health', '/orchestras']),
    );
    // En wat het lid al zag, blijft staan.
    expect(paden).toEqual(expect.arrayContaining(['/', '/my-music', '/rehearsals', '/members']));
  });

  it('geeft de dirigent het orkestblok maar niet het beheerblok', async () => {
    huidigeRol = ROLES.CONDUCTOR;
    const gebruiker = userEvent.setup({ delay: null });
    toon();

    const paden = await menuPaden(gebruiker);

    expect(paden).toEqual(expect.arrayContaining(['/seating', '/voice-parts', '/concerts', '/attendance-analytics']));
    expect(paden).not.toContain('/users');
    expect(paden).not.toContain('/settings');
    expect(paden).not.toContain('/music-pieces');
  });

  it('geeft de instrumentencommissie de inventaris maar niet de uniformen', async () => {
    huidigeRol = ROLES.EQUIPMENT_COMMITTEE;
    const gebruiker = userEvent.setup({ delay: null });
    toon();

    const paden = await menuPaden(gebruiker);

    expect(paden).toEqual(expect.arrayContaining(['/instrument-assets', '/equipment', '/resources']));
    expect(paden).not.toContain('/uniforms');
    expect(paden).not.toContain('/users');
  });
});

describe('uitgezette modules', () => {
  it('haalt de ticketonderdelen uit het menu', async () => {
    huidigeRol = ROLES.ADMIN;
    aanstaandeModules = ALLE_MODULES.filter((m) => m !== 'ticketing');
    const gebruiker = userEvent.setup({ delay: null });
    toon();

    const paden = await menuPaden(gebruiker);

    expect(paden).not.toContain('/my-tickets');
    expect(paden).not.toContain('/ticket-sales');
    expect(paden).not.toContain('/ticket-scanner');
    expect(paden).not.toContain('/payment-settings');
    // De rest van de agenda blijft gewoon staan.
    expect(paden).toEqual(expect.arrayContaining(['/rehearsals', '/availability']));
  });

  it('laat een hele groep verdwijnen zodra er niets van over is', async () => {
    huidigeRol = ROLES.ADMIN;
    aanstaandeModules = ALLE_MODULES.filter((m) => m !== 'inventory');
    const gebruiker = userEvent.setup({ delay: null });
    toon();

    const paden = await menuPaden(gebruiker);

    expect(paden).not.toContain('/instrument-assets');
    expect(paden).not.toContain('/uniforms');
    expect(paden).not.toContain('/equipment');
    expect(screen.queryByText('Inventaris')).not.toBeInTheDocument();
  });
});

describe('de kop en de zijbalk', () => {
  it('noemt de gebruiker bij naam en rol', () => {
    huidigeRol = ROLES.CONDUCTOR;
    toon();

    expect(screen.getAllByText('Ria de Vries').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Dirigent').length).toBeGreaterThan(0);
  });

  it('logt uit en stuurt naar het inlogscherm', async () => {
    const gebruiker = userEvent.setup({ delay: null });
    toon();

    await gebruiker.click(screen.getAllByRole('button', { name: 'Uitloggen' })[0]);

    expect(uitloggen).toHaveBeenCalled();
  });

  it('onthoudt dat de zijbalk ingeklapt is', async () => {
    const gebruiker = userEvent.setup({ delay: null });
    toon();

    await gebruiker.click(screen.getByRole('button', { name: 'Zijbalk inklappen' }));

    expect(localStorage.getItem('sidebar-collapsed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Zijbalk uitklappen' })).toBeInTheDocument();
  });

  it('klapt de onderdelen van de actieve groep uit', async () => {
    huidigeRol = ROLES.ADMIN;
    toon('/rehearsals');

    const zijbalk = document.querySelector('aside') as HTMLElement;
    const paden = within(zijbalk)
      .getAllByRole('link')
      .map((l) => l.getAttribute('href'));

    // De agendagroep is actief, dus die staat open...
    expect(paden).toEqual(expect.arrayContaining(['/rehearsals', '/availability', '/concerts']));
    // ...en de bibliotheek niet.
    expect(paden).not.toContain('/titles');
  });

  it('sluit het mobiele menu zodra er iets aangeklikt wordt', async () => {
    const gebruiker = userEvent.setup({ delay: null });
    toon();
    await gebruiker.click(screen.getByRole('button', { name: 'Meer' }));
    const paneel = screen.getByRole('dialog', { name: 'Menu' });

    await gebruiker.click(within(paneel).getByRole('link', { name: /Repetities/ }));

    expect(screen.queryByRole('dialog', { name: 'Menu' })).not.toBeInTheDocument();
    expect(screen.getByText('pagina-inhoud')).toBeInTheDocument();
  });

  it('sluit het mobiele menu met de kruisknop', async () => {
    const gebruiker = userEvent.setup({ delay: null });
    toon();
    await gebruiker.click(screen.getByRole('button', { name: 'Meer' }));

    await gebruiker.click(screen.getByRole('button', { name: 'Menu sluiten' }));

    expect(screen.queryByRole('dialog', { name: 'Menu' })).not.toBeInTheDocument();
  });

  it('logt ook vanuit het mobiele menu uit', async () => {
    const gebruiker = userEvent.setup({ delay: null });
    toon();
    await gebruiker.click(screen.getByRole('button', { name: 'Meer' }));
    const paneel = screen.getByRole('dialog', { name: 'Menu' });

    await gebruiker.click(within(paneel).getByRole('button', { name: 'Uitloggen' }));

    expect(uitloggen).toHaveBeenCalled();
  });

  it('zet de naam van de vereniging in de kop', async () => {
    toon();

    expect(await screen.findByText(/Harmonie Concordia/)).toBeInTheDocument();
  });

  it('valt terug op Tutti als de merkinstellingen niet opgehaald kunnen worden', async () => {
    vi.mocked(getSettings).mockRejectedValueOnce(new Error('geen verbinding'));
    const waarschuwing = vi.spyOn(console, 'warn').mockImplementation(() => {});
    toon();

    expect(await screen.findByText(/Tutti/)).toBeInTheDocument();
    waarschuwing.mockRestore();
  });

  it('start de rondleiding opnieuw vanuit de zijbalk', async () => {
    const gebruiker = userEvent.setup({ delay: null });
    toon();

    await gebruiker.click(screen.getByRole('button', { name: 'Start rondleiding' }));

    expect(screen.getByText('rondleiding')).toBeInTheDocument();
  });
});

/**
 * WACHT, geen bewijs.
 *
 * Het menu en de routetabel zijn twee losse lijsten die hetzelfde moeten
 * zeggen. Staan ze uit elkaar, dan klikt de gebruiker op een onderdeel en
 * stuurt PrivateRoute hem terug naar het dashboard zonder een woord uitleg.
 * Dat is eerder gebeurd: het concertoverzicht liet de dirigent niet toe
 * terwijl het menu hem "Concerten" wel toonde (zie het commentaar bij die
 * route in App.tsx). Op de huidige code kloppen beide lijsten, dus deze test
 * staat groen op de code van vóór deze wijziging - hij is er om het volgende
 * verschil te vangen.
 */
describe('menu tegenover de routetabel', () => {
  /** Pad -> toegestane rollen, of null als iedereen mag. Uit App.tsx. */
  function routeRollen(): Record<string, string[] | null> {
    const bron = fs.readFileSync(path.join(__dirname, '../../App.tsx'), 'utf-8');
    const tabel: Record<string, string[] | null> = { '/': null };

    // Het gat tussen `path=` en `<PrivateRoute roles=` mag geen tweede
    // `path=` bevatten. Zonder die voorwaarde springt een route zonder rollen
    // over de eerstvolgende route heen en pikt diens rollen mee.
    const metRollen = /path="([^"]+)"\s*\n\s*element=\{((?:(?!path=")[\s\S])*?)<PrivateRoute roles=\{\[([^\]]*)\]\}/g;
    for (const treffer of bron.matchAll(metRollen)) {
      tabel['/' + treffer[1]] = treffer[3]
        .split(',')
        .map((r) => r.trim().replace('ROLES.', ''))
        .filter(Boolean)
        .map((naam) => (ROLES as Record<string, string>)[naam]);
    }

    const zonderRollen = /<Route path="([^"]+)" element=\{<\w+ \/>\} \/>/g;
    for (const treffer of bron.matchAll(zonderRollen)) {
      const pad = '/' + treffer[1];
      if (!(pad in tabel)) tabel[pad] = null;
    }

    return tabel;
  }

  it.each([
    ['een gewoon lid', ROLES.MEMBER],
    ['de dirigent', ROLES.CONDUCTOR],
    ['de muziekcommissie', ROLES.MUSIC_COMMITTEE],
    ['de instrumentencommissie', ROLES.EQUIPMENT_COMMITTEE],
    ['het bestuur', ROLES.BOARD],
    ['de beheerder', ROLES.ADMIN],
  ])('wijst bij %s naar niets wat de route weigert', async (_naam, rol) => {
    huidigeRol = rol;
    const gebruiker = userEvent.setup({ delay: null });
    toon();
    const tabel = routeRollen();

    // Eerst zeker weten dat de tabel er is. Zonder deze regel zou een
    // herschrijving van App.tsx waar de opzoeker niets meer vindt, zich
    // voordoen als tientallen menu-onderdelen die "niet in de routetabel
    // staan" - en dat wijst de verkeerde kant op.
    expect(Object.keys(tabel).length).toBeGreaterThan(50);

    for (const pad of await menuPaden(gebruiker)) {
      expect(tabel, `${pad} staat in het menu maar niet in de routetabel`).toHaveProperty(pad);

      const toegestaan = tabel[pad];
      if (toegestaan !== null) {
        expect(toegestaan, `${pad} staat in het menu van ${rol} maar de route laat die rol niet toe`).toContain(rol);
      }
    }
  });
});
