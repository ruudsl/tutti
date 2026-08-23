/**
 * De routetabel van App.tsx: wie mag waar komen.
 *
 * App.tsx is geen scherm maar een toegangslijst. Elke route staat er met de
 * rollen die hem mogen openen, en een rol die per ongeluk mist of te veel
 * staat is geen opmaakfoutje maar een gat. Er zijn tientallen routes en ze
 * worden met de hand onderhouden, dus dat gat ontstaat vanzelf.
 *
 * Deze tests laden geen enkele echte pagina. Elke pagina is vervangen door een
 * blokje met een herkenbaar merkteken, zodat wat hier gemeten wordt puur het
 * gedrag van de routetabel en PrivateRoute is: welk pad, met welke rol, levert
 * welke uitkomst op.
 *
 * De tabel VERWACHTE_ROLLEN hieronder is met opzet met de hand geschreven en
 * niet uit de bron afgeleid. Zij is de bedoeling; App.tsx is de uitvoering.
 * Wie ze uit dezelfde bron zou halen, test niets.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { ROLES } from '../utils/constants';

/**
 * Gedeelde stand die de nagebootste contexten uitlezen. Staat in vi.hoisted
 * omdat vi.mock-fabrieken boven de imports uit worden getild.
 */
const { stand, maakPagina } = vi.hoisted(() => {
  const stand: { rol: string | null; modules: string[]; modulesGeladen: boolean } = {
    rol: null,
    modules: [],
    modulesGeladen: true,
  };

  /** Vervangt een pagina door een blokje met een merkteken. */
  const maakPagina = (naam: string) => async () => {
    const React = await import('react');
    return {
      default: () => React.createElement('div', { 'data-testid': `pagina-${naam}` }, naam),
    };
  };

  return { stand, maakPagina };
});

// --- de pagina's, allemaal weggemockt -------------------------------------
vi.mock('../pages/AcceptTransfer', maakPagina('AcceptTransfer'));
vi.mock('../pages/AccessibilityStatement', maakPagina('AccessibilityStatement'));
vi.mock('../pages/Accounting', maakPagina('Accounting'));
vi.mock('../pages/AttendanceAnalytics', maakPagina('AttendanceAnalytics'));
vi.mock('../pages/AuditLogs', maakPagina('AuditLogs'));
vi.mock('../pages/Availability', maakPagina('Availability'));
vi.mock('../pages/Changelog', maakPagina('Changelog'));
vi.mock('../pages/ConcertStageSetup', maakPagina('ConcertStageSetup'));
vi.mock('../pages/Concerts', maakPagina('Concerts'));
vi.mock('../pages/Contacts', maakPagina('Contacts'));
vi.mock('../pages/CustomFieldsAdmin', maakPagina('CustomFieldsAdmin'));
vi.mock('../pages/Dashboard', maakPagina('Dashboard'));
vi.mock('../pages/DataExport', maakPagina('DataExport'));
vi.mock('../pages/EmailCampaigns', maakPagina('EmailCampaigns'));
vi.mock('../pages/EntraSync', maakPagina('EntraSync'));
vi.mock('../pages/Equipment', maakPagina('Equipment'));
vi.mock('../pages/Events', maakPagina('Events'));
vi.mock('../pages/ExternalMusicians', maakPagina('ExternalMusicians'));
vi.mock('../pages/ForgotPassword', maakPagina('ForgotPassword'));
vi.mock('../pages/GdprAdmin', maakPagina('GdprAdmin'));
vi.mock('../pages/Genres', maakPagina('Genres'));
vi.mock('../pages/GuestList', maakPagina('GuestList'));
vi.mock('../pages/HealthDashboard', maakPagina('HealthDashboard'));
vi.mock('../pages/HolidaySettings', maakPagina('HolidaySettings'));
vi.mock('../pages/ImslpBrowser', maakPagina('ImslpBrowser'));
vi.mock('../pages/InfoScreen', maakPagina('InfoScreen'));
vi.mock('../pages/InstrumentAssets', maakPagina('InstrumentAssets'));
vi.mock('../pages/Issues', maakPagina('Issues'));
vi.mock('../pages/Loans', maakPagina('Loans'));
vi.mock('../pages/MemberDirectory', maakPagina('MemberDirectory'));
vi.mock('../pages/MicrosoftCallback', maakPagina('MicrosoftCallback'));
vi.mock('../pages/MockPayment', maakPagina('MockPayment'));
vi.mock('../pages/Modules', maakPagina('Modules'));
vi.mock('../pages/MultiAssociation', maakPagina('MultiAssociation'));
vi.mock('../pages/MusicListManager', maakPagina('MusicListManager'));
vi.mock('../pages/MusicPieces', maakPagina('MusicPieces'));
vi.mock('../pages/MusicSharing', maakPagina('MusicSharing'));
vi.mock('../pages/MusicTitles', maakPagina('MusicTitles'));
vi.mock('../pages/MyMusic', maakPagina('MyMusic'));
vi.mock('../pages/MyTickets', maakPagina('MyTickets'));
vi.mock('../pages/NeighborPreferences', maakPagina('NeighborPreferences'));
vi.mock('../pages/Occupancy', maakPagina('Occupancy'));
vi.mock('../pages/Onboarding', maakPagina('Onboarding'));
vi.mock('../pages/Orchestras', maakPagina('Orchestras'));
vi.mock('../pages/Outfits', maakPagina('Outfits'));
vi.mock('../pages/PaymentSettings', maakPagina('PaymentSettings'));
vi.mock('../pages/PdfTools', maakPagina('PdfTools'));
vi.mock('../pages/Performances', maakPagina('Performances'));
vi.mock('../pages/Polls', maakPagina('Polls'));
vi.mock('../pages/Posts', maakPagina('Posts'));
vi.mock('../pages/Practice', maakPagina('Practice'));
vi.mock('../pages/PracticeSchedules', maakPagina('PracticeSchedules'));
vi.mock('../pages/PrivacySettings', maakPagina('PrivacySettings'));
vi.mock('../pages/Profile', maakPagina('Profile'));
vi.mock('../pages/Projects', maakPagina('Projects'));
vi.mock('../pages/PublicCalendar', maakPagina('PublicCalendar'));
vi.mock('../pages/PublicTicketSale', maakPagina('PublicTicketSale'));
vi.mock('../pages/Rehearsals', maakPagina('Rehearsals'));
vi.mock('../pages/ReplacementRequests', maakPagina('ReplacementRequests'));
vi.mock('../pages/ResetPassword', maakPagina('ResetPassword'));
vi.mock('../pages/Resources', maakPagina('Resources'));
vi.mock('../pages/SeasonPlanner', maakPagina('SeasonPlanner'));
vi.mock('../pages/Seating', maakPagina('Seating'));
vi.mock('../pages/SessionManagement', maakPagina('SessionManagement'));
vi.mock('../pages/Settings', maakPagina('Settings'));
vi.mock('../pages/ShareTarget', maakPagina('ShareTarget'));
vi.mock('../pages/StageDesigner', maakPagina('StageDesigner'));
vi.mock('../pages/Statistics', maakPagina('Statistics'));
vi.mock('../pages/Tasks', maakPagina('Tasks'));
vi.mock('../pages/ThemeSettings', maakPagina('ThemeSettings'));
vi.mock('../pages/TicketSales', maakPagina('TicketSales'));
vi.mock('../pages/TicketScanner', maakPagina('TicketScanner'));
vi.mock('../pages/TicketTransfer', maakPagina('TicketTransfer'));
vi.mock('../pages/Tools', maakPagina('Tools'));
vi.mock('../pages/Tours', maakPagina('Tours'));
vi.mock('../pages/Uniforms', maakPagina('Uniforms'));
vi.mock('../pages/Upload', maakPagina('Upload'));
vi.mock('../pages/UserGuide', maakPagina('UserGuide'));
vi.mock('../pages/Users', maakPagina('Users'));
vi.mock('../pages/VoiceParts', maakPagina('VoiceParts'));
vi.mock('../pages/Wiki', maakPagina('Wiki'));
vi.mock('../pages/Workflows', maakPagina('Workflows'));
vi.mock('../pages/Login', maakPagina('Login'));

// --- alles eromheen dat niets met routeren te maken heeft -----------------

vi.mock('../context/AuthContext', () => {
  return {
    AuthProvider: ({ children }: { children: ReactNode }) => children,
    useAuth: () => ({
      user: stand.rol === null ? null : { id: 1, role: stand.rol, name: 'Testlid' },
      login: vi.fn(),
      loginWithToken: vi.fn(),
      logout: vi.fn(),
      refreshProfile: vi.fn(),
    }),
  };
});

vi.mock('../context/ModulesContext', () => {
  return {
    ModulesProvider: ({ children }: { children: ReactNode }) => children,
    useModules: () => ({
      enabled: stand.modules,
      loading: false,
      loaded: stand.modulesGeladen,
      isEnabled: (sleutel: string) => stand.modules.includes(sleutel),
      refresh: vi.fn(),
    }),
  };
});

vi.mock('../hooks/useTheme', () => ({ useTheme: () => undefined }));

vi.mock('../hooks/useConfirm', () => {
  return {
    ConfirmProvider: ({ children }: { children: ReactNode }) => children,
    useConfirm: () => vi.fn(),
  };
});

vi.mock('../lib/queryClient', () => ({
  queryClient: {},
  queryPersister: undefined,
  persistOptions: {},
}));

vi.mock('@tanstack/react-query-persist-client', () => {
  return { PersistQueryClientProvider: ({ children }: { children: ReactNode }) => children };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (sleutel: string) => sleutel, i18n: { language: 'nl' } }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('../utils/toast', () => ({ Toaster: () => null, showError: vi.fn(), showSuccess: vi.fn() }));

vi.mock('../components/ErrorBoundary', () => {
  return { ErrorBoundary: ({ children }: { children: ReactNode }) => children };
});

vi.mock('../components/SectionErrorBoundary', () => {
  return { SectionErrorBoundary: ({ children }: { children: ReactNode }) => children };
});

vi.mock('../components/AriaLiveRegion', () => {
  return { AriaLiveProvider: ({ children }: { children: ReactNode }) => children };
});

vi.mock('../components/PrivacyConsentGate', () => {
  return { PrivacyConsentGate: ({ children }: { children: ReactNode }) => children };
});

vi.mock('../components/OfflineIndicator', () => ({ OfflineIndicator: () => null }));
vi.mock('../components/PWAUpdatePrompt', () => ({ PWAUpdatePrompt: () => null }));
vi.mock('../components/InstallPrompt', () => ({ InstallPrompt: () => null }));

vi.mock('../components/NotFound', async () => {
  const React = await import('react');
  return { NotFound: () => React.createElement('div', { 'data-testid': 'pagina-NietGevonden' }) };
});

// Layout is het omhulsel van alle beschermde routes; hier alleen het luik waar
// de onderliggende route in verschijnt.
vi.mock('../components/Layout', async () => {
  const React = await import('react');
  const { Outlet } = await import('react-router-dom');
  return {
    default: () => React.createElement('div', { 'data-testid': 'layout' }, React.createElement(Outlet, null)),
  };
});

import App from '../App';

/** Alle modulesleutels, zodat modulegrendels de rolgrendels niet vertroebelen. */
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

const ALLE_ROLLEN = [
  ROLES.ADMIN,
  ROLES.BOARD,
  ROLES.MUSIC_COMMITTEE,
  ROLES.EQUIPMENT_COMMITTEE,
  ROLES.UNIFORMS_COMMITTEE,
  ROLES.CONDUCTOR,
  ROLES.MEMBER,
];

/** Zet de bezoeker neer op een pad en tekent de app. */
function bezoek(pad: string) {
  window.history.pushState({}, '', pad);
  render(<App />);
}

/** Wacht tot de luie pagina binnen is en geeft het merkteken terug. */
async function zichtbarePagina(): Promise<string> {
  const element = await screen.findByTestId(/^pagina-/);
  return element.getAttribute('data-testid')!.replace('pagina-', '');
}

beforeEach(() => {
  stand.rol = null;
  stand.modules = [...ALLE_MODULES];
  stand.modulesGeladen = true;
});

afterEach(() => {
  cleanup();
});

/**
 * De bedoeling, met de hand geschreven: pad, merkteken van de pagina, en de
 * rollen die er binnen horen te komen. `null` betekent: elke ingelogde rol.
 */
const VERWACHTE_ROLLEN: [pad: string, pagina: string, rollen: string[] | null][] = [
  // Open voor elk ingelogd lid
  ['/', 'Dashboard', null],
  ['/profile', 'Profile', null],
  ['/sessions', 'SessionManagement', null],
  ['/data-export', 'DataExport', null],
  ['/my-music', 'MyMusic', null],
  ['/tools', 'Tools', null],
  ['/issues', 'Issues', null],
  ['/contacts', 'Contacts', null],
  ['/privacy-settings', 'PrivacySettings', null],
  ['/polls', 'Polls', null],
  ['/tasks', 'Tasks', null],
  ['/posts', 'Posts', null],
  ['/outfits', 'Outfits', null],
  ['/wiki', 'Wiki', null],
  ['/performances', 'Performances', null],
  ['/rehearsals', 'Rehearsals', null],
  ['/availability', 'Availability', null],
  ['/practice', 'Practice', null],
  ['/members', 'MemberDirectory', null],
  ['/user-guide', 'UserGuide', null],
  ['/accessibility', 'AccessibilityStatement', null],
  ['/practice-schedules', 'PracticeSchedules', null],
  ['/my-tickets', 'MyTickets', null],
  ['/tickets/transfer', 'TicketTransfer', null],

  // Alleen de beheerder
  ['/custom-fields', 'CustomFieldsAdmin', [ROLES.ADMIN]],
  ['/email-campaigns', 'EmailCampaigns', [ROLES.ADMIN]],
  ['/accounting', 'Accounting', [ROLES.ADMIN]],
  ['/workflows', 'Workflows', [ROLES.ADMIN]],
  ['/users', 'Users', [ROLES.ADMIN]],
  ['/orchestras', 'Orchestras', [ROLES.ADMIN]],
  ['/settings', 'Settings', [ROLES.ADMIN]],
  ['/modules', 'Modules', [ROLES.ADMIN]],
  ['/theme', 'ThemeSettings', [ROLES.ADMIN]],
  ['/changelog', 'Changelog', [ROLES.ADMIN]],
  ['/holiday-settings', 'HolidaySettings', [ROLES.ADMIN]],
  ['/multi-association', 'MultiAssociation', [ROLES.ADMIN]],
  ['/entra-sync', 'EntraSync', [ROLES.ADMIN]],
  ['/onboarding', 'Onboarding', [ROLES.ADMIN]],
  ['/audit-logs', 'AuditLogs', [ROLES.ADMIN]],
  ['/health', 'HealthDashboard', [ROLES.ADMIN]],
  ['/gdpr-admin', 'GdprAdmin', [ROLES.ADMIN]],
  ['/payment-settings', 'PaymentSettings', [ROLES.ADMIN]],

  // Beheerder en muziekcommissie
  ['/music-pieces', 'MusicPieces', [ROLES.ADMIN, ROLES.MUSIC_COMMITTEE]],
  ['/titles', 'MusicTitles', [ROLES.ADMIN, ROLES.MUSIC_COMMITTEE]],
  ['/upload', 'Upload', [ROLES.ADMIN, ROLES.MUSIC_COMMITTEE]],
  ['/pdf-tools', 'PdfTools', [ROLES.ADMIN, ROLES.MUSIC_COMMITTEE]],
  ['/imslp', 'ImslpBrowser', [ROLES.ADMIN, ROLES.MUSIC_COMMITTEE]],
  ['/genres', 'Genres', [ROLES.ADMIN, ROLES.MUSIC_COMMITTEE]],
  ['/loans', 'Loans', [ROLES.ADMIN, ROLES.MUSIC_COMMITTEE]],
  ['/statistics', 'Statistics', [ROLES.ADMIN, ROLES.MUSIC_COMMITTEE]],
  ['/lists', 'MusicListManager', [ROLES.ADMIN, ROLES.MUSIC_COMMITTEE]],
  ['/lists/3/7', 'MusicListManager', [ROLES.ADMIN, ROLES.MUSIC_COMMITTEE]],
  ['/music-sharing', 'MusicSharing', [ROLES.ADMIN, ROLES.MUSIC_COMMITTEE]],
  ['/ticket-sales', 'TicketSales', [ROLES.ADMIN, ROLES.MUSIC_COMMITTEE]],
  ['/concerts/12/guest-list', 'GuestList', [ROLES.ADMIN, ROLES.MUSIC_COMMITTEE]],

  // Beheerder, muziekcommissie en dirigent
  ['/projects', 'Projects', [ROLES.ADMIN, ROLES.MUSIC_COMMITTEE, ROLES.CONDUCTOR]],
  ['/external-musicians', 'ExternalMusicians', [ROLES.ADMIN, ROLES.MUSIC_COMMITTEE, ROLES.CONDUCTOR]],
  ['/replacement-requests', 'ReplacementRequests', [ROLES.ADMIN, ROLES.MUSIC_COMMITTEE, ROLES.CONDUCTOR]],
  ['/attendance-analytics', 'AttendanceAnalytics', [ROLES.ADMIN, ROLES.MUSIC_COMMITTEE, ROLES.CONDUCTOR]],
  ['/season-planner', 'SeasonPlanner', [ROLES.ADMIN, ROLES.MUSIC_COMMITTEE, ROLES.CONDUCTOR]],
  ['/seating', 'Seating', [ROLES.ADMIN, ROLES.MUSIC_COMMITTEE, ROLES.CONDUCTOR]],
  ['/voice-parts', 'VoiceParts', [ROLES.ADMIN, ROLES.MUSIC_COMMITTEE, ROLES.CONDUCTOR]],
  ['/occupancy', 'Occupancy', [ROLES.ADMIN, ROLES.MUSIC_COMMITTEE, ROLES.CONDUCTOR]],
  ['/neighbor-preferences', 'NeighborPreferences', [ROLES.ADMIN, ROLES.MUSIC_COMMITTEE, ROLES.CONDUCTOR]],
  ['/stage-designer', 'StageDesigner', [ROLES.ADMIN, ROLES.MUSIC_COMMITTEE, ROLES.CONDUCTOR]],
  ['/concerts/12/stage', 'ConcertStageSetup', [ROLES.ADMIN, ROLES.MUSIC_COMMITTEE, ROLES.CONDUCTOR]],
  ['/ticket-scanner', 'TicketScanner', [ROLES.ADMIN, ROLES.MUSIC_COMMITTEE, ROLES.CONDUCTOR]],
  // De dirigent hoort hier ook bij; zie de test 'dirigent en de concertenlijst'
  // verderop voor waarom dat een reparatie was en geen aanname.
  ['/concerts', 'Concerts', [ROLES.ADMIN, ROLES.MUSIC_COMMITTEE, ROLES.CONDUCTOR]],

  // Bestuur
  ['/tours', 'Tours', [ROLES.ADMIN, ROLES.BOARD]],
  ['/events', 'Events', [ROLES.ADMIN, ROLES.BOARD]],

  // Commissies
  ['/resources', 'Resources', [ROLES.ADMIN, ROLES.EQUIPMENT_COMMITTEE]],
  ['/equipment', 'Equipment', [ROLES.ADMIN, ROLES.EQUIPMENT_COMMITTEE]],
  ['/instrument-assets', 'InstrumentAssets', [ROLES.ADMIN, ROLES.EQUIPMENT_COMMITTEE]],
  ['/uniforms', 'Uniforms', [ROLES.ADMIN, ROLES.UNIFORMS_COMMITTEE]],
];

/** Welke rollen daadwerkelijk op `pad` de pagina `pagina` te zien krijgen. */
async function rollenDieBinnenkomen(pad: string, pagina: string): Promise<string[]> {
  const binnen: string[] = [];
  for (const rol of ALLE_ROLLEN) {
    stand.rol = rol;
    bezoek(pad);
    if ((await zichtbarePagina()) === pagina) {
      binnen.push(rol);
    }
    cleanup();
  }
  return binnen;
}

describe('App - rolgrendels per route', () => {
  it.each(VERWACHTE_ROLLEN)('%s laat precies de bedoelde rollen binnen', async (pad, pagina, rollen) => {
    const verwacht = rollen ?? ALLE_ROLLEN;

    expect(await rollenDieBinnenkomen(pad, pagina)).toEqual([...verwacht].sort(vergelijkRol));
  });

  it('stuurt een gewoon lid van een beheerdersroute terug naar het dashboard', async () => {
    stand.rol = ROLES.MEMBER;
    bezoek('/users');

    expect(await zichtbarePagina()).toBe('Dashboard');
    expect(screen.queryByTestId('pagina-Users')).toBeNull();
  });

  it('laat geen enkele rol zonder grendel bij een pagina met een grendel komen', async () => {
    // Samenvattende controle: geen van de beschermde routes staat per ongeluk
    // voor iedereen open.
    const beschermd = VERWACHTE_ROLLEN.filter(([, , rollen]) => rollen !== null);

    for (const [pad, pagina, rollen] of beschermd) {
      const buiten = ALLE_ROLLEN.filter((rol) => !rollen!.includes(rol));
      expect(buiten.length, `${pad} heeft geen enkele uitgesloten rol`).toBeGreaterThan(0);
      expect(pagina.length).toBeGreaterThan(0);
    }
  });
});

/** Sorteert rollen in de volgorde van ALLE_ROLLEN, zodat vergelijken kan. */
function vergelijkRol(a: string, b: string): number {
  return ALLE_ROLLEN.indexOf(a as never) - ALLE_ROLLEN.indexOf(b as never);
}

describe('App - de dirigent en de concertenlijst', () => {
  /**
   * ECHTE FOUT, met bewijs.
   *
   * In het menu (Layout.tsx) staat /concerts met roles
   * [ADMIN, MUSIC_COMMITTEE, CONDUCTOR], en /concerts/:id/stage in App.tsx
   * eveneens met de dirigent erbij. De routegrendel van /concerts zelf noemde
   * alleen [ADMIN, MUSIC_COMMITTEE]. Gevolg: de dirigent zag het menu-item
   * "Concerten" staan, klikte, en belandde zonder uitleg op het dashboard - en
   * kon daardoor ook de podiumopstelling per concert niet bereiken, want die
   * begint bij de lijst.
   *
   * De backend geeft de dirigent wel toegang: concerts.ts regel 431
   * (requireRole('admin','music_committee','conductor')) en alle routes in
   * stage-layouts.ts. Het menu en de backend waren het eens, alleen deze ene
   * regel in App.tsx niet.
   *
   * BEWIJS dat deze test rood is zonder de reparatie: met de oude App.tsx
   * (`git checkout HEAD -- src/App.tsx`) faalt hij met
   *   AssertionError: expected 'Dashboard' to be 'Concerts'
   * en na terugzetten van de reparatie is hij groen.
   */
  it('laat de dirigent bij de concertenlijst, net als het menu belooft', async () => {
    stand.rol = ROLES.CONDUCTOR;
    bezoek('/concerts');

    expect(await zichtbarePagina()).toBe('Concerts');
  });

  it('houdt een gewoon lid wel buiten de concertenlijst', async () => {
    stand.rol = ROLES.MEMBER;
    bezoek('/concerts');

    expect(await zichtbarePagina()).toBe('Dashboard');
  });

  it('laat de dirigent ook bij de podiumopstelling van een concert', async () => {
    stand.rol = ROLES.CONDUCTOR;
    bezoek('/concerts/12/stage');

    expect(await zichtbarePagina()).toBe('ConcertStageSetup');
  });
});

describe('App - uitgelogde bezoeker', () => {
  it.each(['/', '/profile', '/users', '/my-music', '/concerts'])(
    'stuurt een uitgelogde bezoeker van %s naar de inlogpagina',
    async (pad) => {
      bezoek(pad);

      expect(await zichtbarePagina()).toBe('Login');
    },
  );

  it('stuurt een uitgelogde bezoeker van een onbekend pad ook naar de inlogpagina', async () => {
    bezoek('/dit-pad-bestaat-niet');

    expect(await zichtbarePagina()).toBe('Login');
  });

  it('toont de inlogpagina met de slug van een vereniging', async () => {
    bezoek('/login/harmonie-sint-cecilia');

    expect(await zichtbarePagina()).toBe('Login');
  });

  it.each([
    ['/forgot-password', 'ForgotPassword'],
    ['/reset-password', 'ResetPassword'],
    ['/auth/microsoft/callback', 'MicrosoftCallback'],
  ])('laat %s zonder inloggen zien', async (pad, pagina) => {
    bezoek(pad);

    expect(await zichtbarePagina()).toBe(pagina);
  });
});

describe('App - publieke routes zonder inloggen', () => {
  it.each([
    ['/tickets/42', 'PublicTicketSale'],
    ['/tickets/orders/99/mock-payment', 'MockPayment'],
    ['/tickets/transfer/accept/NEP-CODE-1234', 'AcceptTransfer'],
    ['/calendar/harmonie-sint-cecilia', 'PublicCalendar'],
    ['/info-screen/harmonie-sint-cecilia', 'InfoScreen'],
    ['/share-target', 'ShareTarget'],
  ])('%s is bereikbaar zonder inloggen', async (pad, pagina) => {
    bezoek(pad);

    expect(await zichtbarePagina()).toBe(pagina);
  });

  it('geeft /tickets/transfer aan het ingelogde overdrachtsscherm, niet aan de publieke verkooppagina', async () => {
    // /tickets/:concertId zou dit pad ook vangen. Het vaste segment hoort te
    // winnen van het variabele, anders belandt een lid dat zijn kaartje
    // doorgeeft op de openbare verkooppagina van een concert dat "transfer"
    // heet.
    stand.rol = ROLES.MEMBER;
    bezoek('/tickets/transfer');

    expect(await zichtbarePagina()).toBe('TicketTransfer');
  });
});

describe('App - ingelogde bezoeker op een publieke route', () => {
  it.each(['/login', '/forgot-password', '/reset-password'])(
    'stuurt een ingelogde bezoeker van %s door naar het dashboard',
    async (pad) => {
      stand.rol = ROLES.MEMBER;
      bezoek(pad);

      expect(await zichtbarePagina()).toBe('Dashboard');
    },
  );
});

describe('App - onbekende paden', () => {
  it('geeft een ingelogde bezoeker de nietgevonden-pagina', async () => {
    stand.rol = ROLES.MEMBER;
    bezoek('/dit-pad-bestaat-niet');

    expect(await zichtbarePagina()).toBe('NietGevonden');
  });

  it('zet die nietgevonden-pagina binnen de gewone omlijsting, zodat het menu blijft staan', async () => {
    stand.rol = ROLES.MEMBER;
    bezoek('/dit-pad-bestaat-niet');
    await zichtbarePagina();

    expect(screen.getByTestId('layout')).toBeInTheDocument();
  });

  it('geeft ook een diep onbekend pad de nietgevonden-pagina', async () => {
    stand.rol = ROLES.ADMIN;
    bezoek('/users/17/iets/wat/niet/bestaat');

    expect(await zichtbarePagina()).toBe('NietGevonden');
  });
});

describe('App - uitgezette modules', () => {
  it('stuurt een beheerder weg van een pagina waarvan de module uit staat', async () => {
    stand.rol = ROLES.ADMIN;
    stand.modules = ALLE_MODULES.filter((m) => m !== 'accounting');
    bezoek('/accounting');

    expect(await zichtbarePagina()).toBe('Dashboard');
  });

  it('laat de pagina wel zien zolang de modulestand nog niet binnen is', async () => {
    // Anders wordt bij de eerste keer laden iedereen weggestuurd van pagina's
    // die gewoon mogen.
    stand.rol = ROLES.ADMIN;
    stand.modules = [];
    stand.modulesGeladen = false;
    bezoek('/accounting');

    expect(await zichtbarePagina()).toBe('Accounting');
  });

  it('kijkt ook naar het voorvoegsel van het pad', async () => {
    stand.rol = ROLES.ADMIN;
    stand.modules = ALLE_MODULES.filter((m) => m !== 'ticketing');
    bezoek('/ticket-sales');

    expect(await zichtbarePagina()).toBe('Dashboard');
  });

  it("raakt pagina's zonder module niet", async () => {
    stand.rol = ROLES.MEMBER;
    stand.modules = [];
    bezoek('/profile');

    expect(await zichtbarePagina()).toBe('Profile');
  });
});

describe("App - laadscherm tussen twee pagina's", () => {
  it('meldt met een leesbare status dat er geladen wordt', async () => {
    stand.rol = ROLES.MEMBER;
    bezoek('/my-music');

    // Het valscherm van Suspense staat er voordat de luie pagina binnen is.
    const status = screen.queryByRole('status');
    if (status) {
      expect(status).toHaveAttribute('aria-live', 'polite');
    }
    await waitFor(() => expect(screen.getByTestId('pagina-MyMusic')).toBeInTheDocument());
  });
});
