/**
 * Vangnet voor het opknippen van de repetitiepagina.
 *
 * Rehearsals.tsx is 1950 regels: drie tabbladen, een detailscherm en een
 * handvol formulier- en bevestigingsblokken in één component. Dat wordt
 * opgeknipt, en bij het verplaatsen van code is de vraag niet of het er mooier
 * uitziet maar of het scherm daarna nog precies hetzelfde doet.
 *
 * Deze tests keuren niets goed. Ze leggen vast wat de pagina op dit moment
 * doet - welke tabbladen er zijn, welke gegevens per tabblad opgehaald worden,
 * en wat er in beeld komt - zodat een verschuiving tijdens het opknippen
 * meteen opvalt in plaats van pas als iemand de pagina opent. Zo'n test heet
 * een karakteriseringstest: hij beschrijft het bestaande gedrag, ook waar dat
 * gedrag misschien niet ideaal is.
 *
 * Wat hier bewust vastligt omdat het makkelijk sneuvelt bij een verhuizing:
 *   - De `enabled` per query. De pagina haalt de beheergegevens
 *     (standaarddagen, orkesten) alleen op voor een beheerder en de
 *     spond-instellingen alleen voor een admin. Raakt die voorwaarde zoek, dan
 *     doet de pagina bij het openen voor ieder lid vijf verzoeken in plaats
 *     van twee, en dat merk je niet aan het scherm - je merkt het aan de
 *     403's in het serverlog.
 *   - Het aanwezigheidsoverzicht hangt niet aan een query maar aan een
 *     `useEffect` op `activeTab`. Verhuist dat effect mee zonder zijn
 *     voorwaarde, dan haalt de pagina bij openen meteen alle aanwezigheid over
 *     drie maanden op.
 *   - De volgorde van de tabbladen, en welk tabblad open staat bij het openen.
 *
 * Eén ding werkt hier anders dan bij de boekhoudpagina: de tabbladknoppen
 * hebben géén klasse. Ze staan volledig op inline stijlen. Zoeken op tekst
 * alleen is riskant (`rehearsals.title` staat óók in de `<h1>` en
 * `rehearsals.attendance.title` staat óók als kolomkop in de lijst), dus de
 * knoppen worden herkend aan de inline stijl die alleen zij hebben:
 * `marginBottom: -2px`, waarmee ze over de rand van de tabbladbalk heen
 * vallen. Dat is een implementatiedetail, maar het is wél het detail dat een
 * pure verhuizing ongemoeid hoort te laten.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import Rehearsals from '../Rehearsals';
import * as api from '../../api';
import type { Rehearsal, RehearsalDetail, User } from '../../types';

vi.mock('../../api');

// De ingelogde gebruiker bepaalt welke queries aan staan, dus die moet per
// test te verzetten zijn.
let ingelogdeGebruiker: User | null = null;

// De Spond-koppeling is sinds 24-08-2026 een module. De pagina vraagt de stand
// op; zonder deze mock valt hij om op "useModules moet binnen een
// ModulesProvider worden gebruikt". `spondModuleAan` is per test te zetten.
const spondModuleAan = true;

vi.mock('../../context/ModulesContext', () => ({
  useModules: () => ({
    enabled: spondModuleAan ? ['spond'] : [],
    loading: false,
    loaded: true,
    isEnabled: (sleutel: string) => (sleutel === 'spond' ? spondModuleAan : true),
    refresh: vi.fn(),
  }),
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: ingelogdeGebruiker }),
}));

vi.mock('../../hooks/useDocumentTitle', () => ({ useDocumentTitle: () => {} }));
vi.mock('../../hooks/useUnsavedChanges', () => ({
  useUnsavedChanges: () => ({ confirmClose: (fn: () => void) => fn(), dialog: null }),
}));

// `initReactI18next` hoort erbij omdat de pagina via utils/locale.ts de echte
// i18n-opzet meetrekt, en die roept het aan tijdens het laden van de module.
// Zonder deze export klapt het bestand al bij de import, vóór er één test
// gedraaid heeft.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (sleutel: string) => sleutel }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('../../components/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

vi.mock('../../components/Skeleton', () => ({
  SkeletonTable: () => <div data-testid="skelet-tabel" />,
}));

vi.mock('../../components/SeatingChartVisualization', () => ({
  default: () => <div data-testid="opstelling" />,
}));

vi.mock('../../components/AttendanceDashboard', () => ({
  default: () => <div data-testid="aanwezigheidsdashboard" />,
}));

vi.mock('../../components/CalendarSync', () => ({
  AddToCalendarButton: () => <div data-testid="agendaknop" />,
}));

vi.mock('../../components/CustomFields', () => ({
  CustomFieldFormSection: () => <div data-testid="eigen-velden-formulier" />,
  CustomFieldRenderer: () => <div data-testid="eigen-velden-weergave" />,
}));

vi.mock('../../utils/toast', () => ({ showSuccess: vi.fn(), showError: vi.fn() }));

// jsdom kent `window.matchMedia` niet, en ResponsiveTable vraagt er via
// useDarkMode naar zodra de repetitielijst tekent. Zonder deze stub klapt niet
// de pagina maar de test, en dan meet het vangnet niets.
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

const REPETITIE: Rehearsal = {
  id: 'rep-1',
  date: '2099-01-05',
  start_time: '19:30',
  end_time: '21:30',
  location: 'De Zaal',
  type: 'regular',
  notes: null,
  orchestra_id: null,
  orchestra_name: null,
  spond_event_id: null,
  created_by: null,
  created_by_name: null,
  piece_count: 2,
  accepted_count: 3,
  declined_count: 1,
};

const REPETITIE_DETAIL: RehearsalDetail = {
  ...REPETITIE,
  pieces: [],
  attendance: [],
};

function gebruiker(rol: string): User {
  // De pagina kijkt alleen naar `role`; de rest van `User` is voor dit vangnet
  // niet interessant, vandaar de omweg via `unknown`.
  return { id: 'u-1', email: 'lid@example.org', name: 'Lid', role: rol } as unknown as User;
}

/**
 * De pagina roept zo'n twintig api-functies aan. Ze geven hier allemaal iets
 * leegs terug, zodat elk onderdeel zijn "nog niets"-toestand toont. Dat is
 * voor een vangnet genoeg: het gaat om wélke aanroepen gebeuren en welke
 * onderdelen verschijnen, niet om de inhoud van de rijen.
 */
function zetApiKlaar(): void {
  vi.mocked(api.getRehearsals).mockResolvedValue([REPETITIE]);
  vi.mocked(api.getDefaultDays).mockResolvedValue([]);
  vi.mocked(api.getOrchestras).mockResolvedValue([]);
  vi.mocked(api.getSpondConfig).mockResolvedValue({ configured: false });
  vi.mocked(api.getHolidays).mockResolvedValue({ holidays: [], settings: { showHolidaysInCalendar: true } } as never);
  vi.mocked(api.getAttendanceSummary).mockResolvedValue({ members: [], rehearsalCount: 0 } as never);
  vi.mocked(api.getRehearsal).mockResolvedValue(REPETITIE_DETAIL);
  vi.mocked(api.getMyAttendanceStatus).mockResolvedValue({ status: 'unknown', canSyncToSpond: false } as never);
  vi.mocked(api.getSpondGroups).mockResolvedValue([]);
  vi.mocked(api.getRehearsalSeating).mockResolvedValue([]);
}

function wikkel({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/**
 * De tabbladknoppen dragen geen klasse; ze zijn alleen te herkennen aan de
 * inline stijl `marginBottom: -2px`. Geen enkele andere knop op de pagina
 * heeft die.
 */
function tabbladKnoppen(): HTMLElement[] {
  // `queryAllByRole` en niet `getAllByRole`: tijdens de laadtoestand staat er
  // geen enkele knop op de pagina, en dan hoort dit een lege lijst te geven in
  // plaats van te struikelen.
  return screen.queryAllByRole('button').filter((knop) => knop.style.marginBottom === '-2px');
}

function tabblad(label: string): HTMLElement | undefined {
  return tabbladKnoppen().find((knop) => knop.textContent?.trim() === label);
}

/** Wacht tot de laadtoestand voorbij is en de tabbladbalk staat. */
async function wachtOpPagina(): Promise<void> {
  await waitFor(() => expect(tabbladKnoppen().length).toBeGreaterThan(0));
}

beforeEach(() => {
  vi.clearAllMocks();
  ingelogdeGebruiker = gebruiker('admin');
  zetApiKlaar();
});

describe('repetitiepagina - vastgelegd gedrag vóór het opknippen', () => {
  it('toont drie tabbladen, in deze volgorde', async () => {
    render(<Rehearsals />, { wrapper: wikkel });
    await wachtOpPagina();

    expect(tabbladKnoppen().map((knop) => knop.textContent?.trim())).toEqual([
      'rehearsals.title',
      'rehearsals.attendance.title',
      'rehearsals.attendanceDashboard',
    ]);
  });

  it('begint op het repetitietabblad', async () => {
    render(<Rehearsals />, { wrapper: wikkel });
    await wachtOpPagina();

    expect(tabblad('rehearsals.title')!.style.fontWeight).toBe('bold');
    expect(tabblad('rehearsals.attendance.title')!.style.fontWeight).toBe('normal');
    expect(tabblad('rehearsals.attendanceDashboard')!.style.fontWeight).toBe('normal');
  });

  it('toont eerst een skelet zolang de repetities nog binnenkomen', () => {
    vi.mocked(api.getRehearsals).mockReturnValue(new Promise(() => {}));

    render(<Rehearsals />, { wrapper: wikkel });

    expect(screen.getByTestId('skelet-tabel')).toBeInTheDocument();
    expect(tabbladKnoppen()).toHaveLength(0);
  });

  it.each([['rehearsals.attendance.title'], ['rehearsals.attendanceDashboard'], ['rehearsals.title']])(
    'schakelt naar %s',
    async (label) => {
      const gebruikerActie = userEvent.setup();
      render(<Rehearsals />, { wrapper: wikkel });
      await wachtOpPagina();

      // De knop wordt na de klik opnieuw opgezocht in plaats van de referentie
      // van vóór de klik vast te houden: React vervangt het element bij een
      // hertekening, en dan draagt de oude referentie de nieuwe stijl nooit.
      await gebruikerActie.click(tabblad(label)!);

      await waitFor(() => expect(tabblad(label)!.style.fontWeight).toBe('bold'));
    },
  );

  it('toont het dashboard pas op het dashboardtabblad', async () => {
    const gebruikerActie = userEvent.setup();
    render(<Rehearsals />, { wrapper: wikkel });
    await wachtOpPagina();

    expect(screen.queryByTestId('aanwezigheidsdashboard')).not.toBeInTheDocument();

    await gebruikerActie.click(tabblad('rehearsals.attendanceDashboard')!);

    await waitFor(() => expect(screen.getByTestId('aanwezigheidsdashboard')).toBeInTheDocument());
  });
});

describe('repetitiepagina - welke gegevens wanneer opgehaald worden', () => {
  it('haalt bij openen de repetities en de feestdagen op', async () => {
    render(<Rehearsals />, { wrapper: wikkel });
    await wachtOpPagina();

    expect(api.getRehearsals).toHaveBeenCalled();
    await waitFor(() => expect(api.getHolidays).toHaveBeenCalled());
  });

  // Het aanwezigheidsoverzicht hangt aan een useEffect op het actieve tabblad,
  // niet aan een query. Zonder die voorwaarde vraagt de pagina bij openen
  // meteen drie maanden aanwezigheid op voor iedereen die de pagina bezoekt.
  it('haalt het aanwezigheidsoverzicht pas op als dat tabblad open staat', async () => {
    const gebruikerActie = userEvent.setup();
    render(<Rehearsals />, { wrapper: wikkel });
    await wachtOpPagina();

    expect(api.getAttendanceSummary).not.toHaveBeenCalled();

    await gebruikerActie.click(tabblad('rehearsals.attendance.title')!);

    await waitFor(() => expect(api.getAttendanceSummary).toHaveBeenCalled());
  });

  it('haalt het aanwezigheidsoverzicht niet op voor het dashboardtabblad', async () => {
    const gebruikerActie = userEvent.setup();
    render(<Rehearsals />, { wrapper: wikkel });
    await wachtOpPagina();

    await gebruikerActie.click(tabblad('rehearsals.attendanceDashboard')!);

    await waitFor(() => expect(screen.getByTestId('aanwezigheidsdashboard')).toBeInTheDocument());
    expect(api.getAttendanceSummary).not.toHaveBeenCalled();
  });

  it('haalt voor een gewoon lid geen standaarddagen, orkesten of spond-instellingen op', async () => {
    ingelogdeGebruiker = gebruiker('member');

    render(<Rehearsals />, { wrapper: wikkel });
    await wachtOpPagina();

    expect(api.getDefaultDays).not.toHaveBeenCalled();
    expect(api.getOrchestras).not.toHaveBeenCalled();
    expect(api.getSpondConfig).not.toHaveBeenCalled();
  });

  it('haalt voor de muziekcommissie wél standaarddagen en orkesten op, maar geen spond-instellingen', async () => {
    ingelogdeGebruiker = gebruiker('music_committee');

    render(<Rehearsals />, { wrapper: wikkel });
    await wachtOpPagina();

    await waitFor(() => {
      expect(api.getDefaultDays).toHaveBeenCalled();
      expect(api.getOrchestras).toHaveBeenCalled();
    });
    expect(api.getSpondConfig).not.toHaveBeenCalled();
  });

  it('haalt de spond-instellingen alleen op voor een admin', async () => {
    render(<Rehearsals />, { wrapper: wikkel });
    await wachtOpPagina();

    await waitFor(() => expect(api.getSpondConfig).toHaveBeenCalled());
  });
});

describe('repetitiepagina - wat een beheerder extra ziet', () => {
  it('toont een beheerder de knoppen om repetities toe te voegen', async () => {
    render(<Rehearsals />, { wrapper: wikkel });
    await wachtOpPagina();

    expect(screen.getByRole('button', { name: '+ rehearsals.addRehearsal' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'rehearsals.generate' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'rehearsals.recurring.title' })).toBeInTheDocument();
  });

  it('toont een gewoon lid die knoppen niet', async () => {
    ingelogdeGebruiker = gebruiker('member');

    render(<Rehearsals />, { wrapper: wikkel });
    await wachtOpPagina();

    expect(screen.queryByRole('button', { name: '+ rehearsals.addRehearsal' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'rehearsals.generate' })).not.toBeInTheDocument();
  });

  it('toont de standaarddagen en de spond-koppeling aan een admin', async () => {
    render(<Rehearsals />, { wrapper: wikkel });
    await wachtOpPagina();

    expect(screen.getByText('rehearsals.defaultDays')).toBeInTheDocument();
    expect(screen.getByText('rehearsals.spond.title')).toBeInTheDocument();
  });

  it('vouwt het standaarddagformulier open na een klik', async () => {
    const gebruikerActie = userEvent.setup();
    render(<Rehearsals />, { wrapper: wikkel });
    await wachtOpPagina();

    expect(screen.queryByText('rehearsals.defaultDaysDescription')).toBeInTheDocument();
    expect(screen.queryAllByText('rehearsals.startTime')).toHaveLength(0);

    await gebruikerActie.click(screen.getByRole('button', { name: '+ rehearsals.addDefaultDay' }));

    await waitFor(() => expect(screen.getAllByText('rehearsals.startTime').length).toBeGreaterThan(0));
  });

  it('vouwt het spond-instelformulier open na een klik', async () => {
    const gebruikerActie = userEvent.setup();
    render(<Rehearsals />, { wrapper: wikkel });
    await waitFor(() => expect(screen.getByText('rehearsals.spond.configure')).toBeInTheDocument());

    await gebruikerActie.click(screen.getByRole('button', { name: 'rehearsals.spond.configure' }));

    await waitFor(() => expect(screen.getByText('rehearsals.spond.username')).toBeInTheDocument());
    expect(screen.getByText('rehearsals.spond.saveConfig')).toBeInTheDocument();
  });

  it('opent het formulier voor een nieuwe repetitie', async () => {
    const gebruikerActie = userEvent.setup();
    render(<Rehearsals />, { wrapper: wikkel });
    await wachtOpPagina();

    await gebruikerActie.click(screen.getByRole('button', { name: '+ rehearsals.addRehearsal' }));

    await waitFor(() => expect(screen.getByText('rehearsals.addRehearsal')).toBeInTheDocument());
  });

  it('opent het herhaalformulier met een voorbeeldlijst', async () => {
    const gebruikerActie = userEvent.setup();
    render(<Rehearsals />, { wrapper: wikkel });
    await wachtOpPagina();

    await gebruikerActie.click(screen.getByRole('button', { name: 'rehearsals.recurring.title' }));

    await waitFor(() => expect(screen.getByText('rehearsals.recurring.description')).toBeInTheDocument());
    expect(screen.getByText('rehearsals.recurring.dayOfWeek')).toBeInTheDocument();
  });

  it('opent het genereerformulier', async () => {
    const gebruikerActie = userEvent.setup();
    render(<Rehearsals />, { wrapper: wikkel });
    await wachtOpPagina();

    await gebruikerActie.click(screen.getByRole('button', { name: 'rehearsals.generate' }));

    await waitFor(() => expect(screen.getByText('rehearsals.generateDescription')).toBeInTheDocument());
  });
});

describe('repetitiepagina - lijst en detailscherm', () => {
  it('toont de komende repetities met hun aantal', async () => {
    render(<Rehearsals />, { wrapper: wikkel });
    await wachtOpPagina();

    expect(screen.getByText('rehearsals.upcoming (1)')).toBeInTheDocument();
  });

  // Het detailscherm is een aparte tak in dezelfde component: is er een
  // repetitie gekozen, dan komt de lijst helemaal niet in beeld. Die
  // eigenschap moet het opknippen overleven.
  it('opent het detailscherm bij een klik op een repetitie en haalt daar de details op', async () => {
    const gebruikerActie = userEvent.setup();
    render(<Rehearsals />, { wrapper: wikkel });
    await wachtOpPagina();

    await gebruikerActie.click(screen.getByText('rehearsals.days.1 5-1-2099'));

    await waitFor(() => expect(api.getRehearsal).toHaveBeenCalledWith('rep-1'));
    await waitFor(() => expect(api.getMyAttendanceStatus).toHaveBeenCalledWith('rep-1'));

    // Het detailscherm vervangt de lijst inclusief de tabbladbalk.
    await waitFor(() => expect(tabbladKnoppen()).toHaveLength(0));
    expect(screen.getByText('rehearsals.attendance.myAttendance')).toBeInTheDocument();
    expect(screen.getByText('rehearsals.pieces')).toBeInTheDocument();
    expect(screen.getByTestId('agendaknop')).toBeInTheDocument();
  });

  it('toont een beheerder in het detailscherm de opstelling en de eigen velden om te bewerken', async () => {
    const gebruikerActie = userEvent.setup();
    render(<Rehearsals />, { wrapper: wikkel });
    await wachtOpPagina();

    await gebruikerActie.click(screen.getByText('rehearsals.days.1 5-1-2099'));

    await waitFor(() => expect(screen.getByText('seating.rehearsalSeating')).toBeInTheDocument());
    expect(screen.getByTestId('eigen-velden-formulier')).toBeInTheDocument();
  });

  it('keert vanuit het detailscherm terug naar de lijst', async () => {
    const gebruikerActie = userEvent.setup();
    render(<Rehearsals />, { wrapper: wikkel });
    await wachtOpPagina();

    await gebruikerActie.click(screen.getByText('rehearsals.days.1 5-1-2099'));
    await waitFor(() => expect(tabbladKnoppen()).toHaveLength(0));

    await gebruikerActie.click(screen.getByRole('button', { name: '← common.back' }));

    await waitFor(() => expect(tabbladKnoppen()).toHaveLength(3));
  });
});

describe('repetitiepagina - als het ophalen mislukt', () => {
  // Een pagina die bij een mislukte aanroep helemaal niets toont is niet van
  // een kapotte pagina te onderscheiden. Dat de tabbladen blijven staan is dus
  // gedrag dat het opknippen moet overleven.
  it('houdt de tabbladen staan als het ophalen mislukt', async () => {
    vi.mocked(api.getRehearsals).mockRejectedValue(new Error('geen verbinding'));
    vi.mocked(api.getHolidays).mockRejectedValue(new Error('geen verbinding'));
    vi.mocked(api.getDefaultDays).mockRejectedValue(new Error('geen verbinding'));
    vi.mocked(api.getOrchestras).mockRejectedValue(new Error('geen verbinding'));
    vi.mocked(api.getSpondConfig).mockRejectedValue(new Error('geen verbinding'));

    render(<Rehearsals />, { wrapper: wikkel });

    await waitFor(() => expect(tabbladKnoppen()).toHaveLength(3));
    expect(screen.getByText('rehearsals.upcoming (0)')).toBeInTheDocument();
  });

  it('blijft op het aanwezigheidstabblad staan als het overzicht mislukt', async () => {
    vi.mocked(api.getAttendanceSummary).mockRejectedValue(new Error('geen verbinding'));
    const gebruikerActie = userEvent.setup();

    render(<Rehearsals />, { wrapper: wikkel });
    await wachtOpPagina();

    await gebruikerActie.click(tabblad('rehearsals.attendance.title')!);

    await waitFor(() => expect(api.getAttendanceSummary).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText('rehearsals.attendance.noData')).toBeInTheDocument());
    expect(tabbladKnoppen()).toHaveLength(3);
  });
});
