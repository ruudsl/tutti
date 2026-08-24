/**
 * Drie gerepareerde fouten op de repetitiepagina.
 *
 * Deze tests keuren wél iets goed - anders dan het vangnet in
 * Rehearsals.karakterisering.test.tsx, dat vastlegt wat de pagina deed. Elke
 * test hieronder is rood tegen de code van vóór de reparatie:
 *
 *   1. De opstellingskaart bleef van de vórige repetitie staan. `showSeating`
 *      en `rehearsalSeating` werden nergens teruggezet, dus wie repetitie A
 *      bekeek, terugging en B opende, kreeg bij B de stoelindeling van A.
 *   2. `handleOpenDetail` slikte fouten: een mislukte `getRehearsal` gaf
 *      alleen een `console.error`, en de gebruiker bleef op de lijst staan
 *      alsof zijn klik niet aankwam.
 *   3. De voorbeeldlijst van terugkerende repetities rekende met `new Date()`
 *      - vandaag mét de klok erbij - tegen `new Date(until)`, wat middernacht
 *      UTC is. De repetitie die precies op de einddatum viel, verdween.
 *
 * De opzet (mocks, wikkel, tabbladherkenning) is bewust dezelfde als in het
 * vangnet, zodat beide bestanden naast elkaar te lezen zijn. Eén verschil:
 * SeatingChartVisualization is hier geen leeg blokje maar toont de namen, want
 * juist die namen zijn het bewijs dat de kaart bij de goede repetitie hoort.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import Rehearsals from '../Rehearsals';
import * as api from '../../api';
import { showError } from '../../utils/toast';
import type { Rehearsal, RehearsalDetail, RehearsalSeat, User } from '../../types';

vi.mock('../../api');

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

// Toont de namen op de stoelen: zonder die namen kun je niet zien wélke
// indeling er staat, en dan meet test 1 niets.
vi.mock('../../components/SeatingChartVisualization', () => ({
  default: ({ chart }: { chart: { seats: { memberName: string }[] } }) => (
    <div data-testid="opstelling">{chart.seats.map((s) => s.memberName).join(', ')}</div>
  ),
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

function repetitie(id: string, datum: string): Rehearsal {
  return {
    id,
    date: datum,
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
    piece_count: 0,
    accepted_count: 1,
    declined_count: 0,
  };
}

const REPETITIE_A = repetitie('rep-a', '2099-01-05');
const REPETITIE_B = repetitie('rep-b', '2099-01-12');

function detail(r: Rehearsal): RehearsalDetail {
  return { ...r, pieces: [], attendance: [] };
}

function stoel(id: string, naam: string): RehearsalSeat {
  return {
    id,
    userId: `gebruiker-${id}`,
    memberName: naam,
    instrumentName: 'Viool',
    rowNumber: 1,
    positionInRow: 1,
    sectionName: 'Strijkers',
  } as unknown as RehearsalSeat;
}

function gebruiker(rol: string): User {
  return { id: 'u-1', email: 'lid@example.org', name: 'Lid', role: rol } as unknown as User;
}

function zetApiKlaar(): void {
  vi.mocked(api.getRehearsals).mockResolvedValue([REPETITIE_A, REPETITIE_B]);
  vi.mocked(api.getDefaultDays).mockResolvedValue([]);
  vi.mocked(api.getOrchestras).mockResolvedValue([]);
  vi.mocked(api.getSpondConfig).mockResolvedValue({ configured: false });
  vi.mocked(api.getHolidays).mockResolvedValue({ holidays: [], settings: { showHolidaysInCalendar: true } } as never);
  vi.mocked(api.getAttendanceSummary).mockResolvedValue({ members: [], rehearsalCount: 0 } as never);
  vi.mocked(api.getRehearsal).mockImplementation(async (id: string) =>
    detail(id === REPETITIE_B.id ? REPETITIE_B : REPETITIE_A),
  );
  vi.mocked(api.getMyAttendanceStatus).mockResolvedValue({ status: 'unknown', canSyncToSpond: false } as never);
  vi.mocked(api.getSpondGroups).mockResolvedValue([]);
  // Elke repetitie zijn eigen indeling; daaraan is te zien of de kaart
  // meeverhuist naar de repetitie die je opent.
  vi.mocked(api.getRehearsalSeating).mockImplementation(async (id: string) =>
    id === REPETITIE_B.id ? [stoel('s-b', 'Bram uit B')] : [stoel('s-a', 'Anja uit A')],
  );
}

function wikkel({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function tabbladKnoppen(): HTMLElement[] {
  return screen.queryAllByRole('button').filter((knop) => knop.style.marginBottom === '-2px');
}

async function wachtOpPagina(): Promise<void> {
  await waitFor(() => expect(tabbladKnoppen().length).toBeGreaterThan(0));
}

beforeEach(() => {
  vi.clearAllMocks();
  ingelogdeGebruiker = gebruiker('admin');
  zetApiKlaar();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('repetitiepagina - de opstelling hoort bij één repetitie', () => {
  it('toont bij een volgende repetitie niet de opstelling van de vorige', async () => {
    const gebruikerActie = userEvent.setup();
    render(<Rehearsals />, { wrapper: wikkel });
    await wachtOpPagina();

    // Repetitie A openen en haar opstelling bekijken.
    await gebruikerActie.click(screen.getByText('rehearsals.days.1 5-1-2099'));
    await waitFor(() => expect(screen.getByText('seating.rehearsalSeating')).toBeInTheDocument());
    await gebruikerActie.click(screen.getByRole('button', { name: 'seating.viewSeating' }));
    await waitFor(() => expect(screen.getByTestId('opstelling')).toHaveTextContent('Anja uit A'));

    // Terug naar de lijst, en dan repetitie B openen.
    await gebruikerActie.click(screen.getByRole('button', { name: '← common.back' }));
    await waitFor(() => expect(tabbladKnoppen()).toHaveLength(3));
    await gebruikerActie.click(screen.getByText('rehearsals.days.1 12-1-2099'));
    await waitFor(() => expect(screen.getByText('seating.rehearsalSeating')).toBeInTheDocument());

    // De kaart staat dicht en houdt geen namen van A meer vast. Vóór de
    // reparatie stond hier 'Anja uit A' bij repetitie B in beeld.
    expect(screen.queryByTestId('opstelling')).not.toBeInTheDocument();
    expect(screen.queryByText('Anja uit A')).not.toBeInTheDocument();
  });

  it('laat de opstelling wél staan als hetzelfde detailscherm ververst wordt', async () => {
    const gebruikerActie = userEvent.setup();
    vi.mocked(api.updateRehearsalPieces).mockResolvedValue(undefined);
    render(<Rehearsals />, { wrapper: wikkel });
    await wachtOpPagina();

    await gebruikerActie.click(screen.getByText('rehearsals.days.1 5-1-2099'));
    await waitFor(() => expect(screen.getByText('seating.rehearsalSeating')).toBeInTheDocument());
    await gebruikerActie.click(screen.getByRole('button', { name: 'seating.viewSeating' }));
    await waitFor(() => expect(screen.getByTestId('opstelling')).toHaveTextContent('Anja uit A'));

    // Stukken opslaan haalt hetzelfde detail opnieuw op. Dat mag de kaart niet
    // onder de gebruiker vandaan dichtklappen.
    await gebruikerActie.click(screen.getByRole('button', { name: 'common.edit' }));
    await gebruikerActie.click(screen.getByRole('button', { name: 'rehearsals.savePieces' }));

    await waitFor(() => expect(api.updateRehearsalPieces).toHaveBeenCalled());
    await waitFor(() => expect(api.getRehearsal).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId('opstelling')).toHaveTextContent('Anja uit A');
  });
});

describe('repetitiepagina - een mislukte detailaanroep is zichtbaar', () => {
  it('meldt het als het openen van een repetitie mislukt', async () => {
    vi.mocked(api.getRehearsal).mockRejectedValue(new Error('geen verbinding'));
    const gebruikerActie = userEvent.setup();
    render(<Rehearsals />, { wrapper: wikkel });
    await wachtOpPagina();

    await gebruikerActie.click(screen.getByText('rehearsals.days.1 5-1-2099'));

    // Vóór de reparatie gebeurde hier alleen een console.error.
    await waitFor(() => expect(showError).toHaveBeenCalled());

    // En de gebruiker blijft op de lijst staan, want er is geen detail.
    expect(tabbladKnoppen()).toHaveLength(3);
  });
});

describe('repetitiepagina - het voorbeeld van een terugkerende reeks', () => {
  /**
   * Vaste klok, want anders hangt het voorbeeld aan de dag waarop de test
   * draait. `shouldAdvanceTime` laat de nep-klok met de echte mee lopen, zodat
   * `waitFor` en userEvent gewoon werken; alleen het beginpunt ligt vast. Er
   * wordt hier niets van `setTimeout(0)` verwacht.
   *
   * 22-08-2026 is een zaterdag. De eerste maandag daarna is 24-08; wekelijks
   * geeft dat 24-08, 31-08, 07-09, 14-09, 21-09 en 28-09.
   */
  function zetKlokOpZaterdag22Augustus2026(): void {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-08-22T12:00:00Z'));
  }

  function vulEinddatum(container: HTMLElement, datum: string): void {
    const datumvelden = container.querySelectorAll<HTMLInputElement>('input[type="date"]');
    // Alleen het herhaalformulier heeft op dit tabblad een datumveld. Klopt dat
    // niet meer, dan pakt de test het verkeerde veld en meet hij onzin.
    expect(datumvelden).toHaveLength(1);
    fireEvent.change(datumvelden[0], { target: { value: datum } });
  }

  it('neemt de einddatum zelf mee - het veld heet niet voor niets "tot en met"', async () => {
    zetKlokOpZaterdag22Augustus2026();
    const { container } = render(<Rehearsals />, { wrapper: wikkel });
    await wachtOpPagina();

    fireEvent.click(screen.getByRole('button', { name: 'rehearsals.recurring.title' }));
    await waitFor(() => expect(screen.getByText('rehearsals.recurring.description')).toBeInTheDocument());

    vulEinddatum(container, '2026-09-28');

    // De maandag die precies op de einddatum valt hoort erbij. Vóór de
    // reparatie viel die eruit: `new Date()` droeg 12:00 uur mee en lag
    // daarmee ná middernacht van `new Date('2026-09-28')`.
    await waitFor(() => expect(screen.getByText('rehearsals.days.1 28-9-2026')).toBeInTheDocument());
    expect(screen.getByText('rehearsals.days.1 24-8-2026')).toBeInTheDocument();
    expect(screen.getByText('rehearsals.days.1 21-9-2026')).toBeInTheDocument();
  });

  it('houdt een reeks van één dag over als de einddatum vandaag is', async () => {
    // Maandag 24-08-2026, de gekozen weekdag is maandag: de reeks bestaat uit
    // vandaag en verder niets. Vóór de reparatie bleef het voorbeeld leeg en
    // was de aanmaakknop uit, want vandaag-met-klok lag ná middernacht UTC.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-08-24T12:00:00Z'));

    const { container } = render(<Rehearsals />, { wrapper: wikkel });
    await wachtOpPagina();

    fireEvent.click(screen.getByRole('button', { name: 'rehearsals.recurring.title' }));
    await waitFor(() => expect(screen.getByText('rehearsals.recurring.description')).toBeInTheDocument());

    vulEinddatum(container, '2026-08-24');

    await waitFor(() => expect(screen.getByText('rehearsals.days.1 24-8-2026')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'rehearsals.recurring.create' })).toBeEnabled();
  });
});
