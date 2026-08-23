/**
 * De repetitiepagina van de kant van wie er iets mee dóét.
 *
 * Rehearsals.karakterisering.test.tsx legt vast wat er te zíén is: welke
 * tabbladen, welke queries, welke kaarten. Wat er daarna gebeurt als iemand op
 * een knop drukt stond nog nergens vast - alle formulieren, mutaties en
 * foutafhandelingen van de pagina waren onbedekt. Dat is wat hier bij komt:
 * een repetitie aanmaken, bewerken en weggooien, standaarddagen beheren, een
 * reeks laten genereren, de spond-koppeling instellen en synchroniseren, je
 * eigen aanwezigheid doorgeven, het repertoire van een repetitie bijwerken en
 * de opstelling ophalen.
 *
 * Van elk pad staat hier ook de mislukte variant, want dat is precies waar de
 * pagina stil kan vallen zonder dat iemand het merkt: elke handler vangt zijn
 * fout af met `showError`, en of die melding er echt komt is niet aan de code
 * af te lezen.
 *
 * De opzet (mocks, wikkel, tabbladen zoeken) volgt bewust die van
 * Rehearsals.karakterisering.test.tsx, zodat de bestanden naast elkaar te
 * lezen zijn. Vertalingen komen hier ook als sleutel terug; dat is wat de
 * pagina buiten de terugvalwaarden om aanbiedt.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import Rehearsals from '../Rehearsals';
import * as api from '../../api';
import { showError, showSuccess } from '../../utils/toast';
import type { Rehearsal, RehearsalDetail, User } from '../../types';

vi.mock('../../api');

let ingelogdeGebruiker: User | null = null;

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

// jsdom kent `window.matchMedia` niet, en ResponsiveTable vraagt er via
// useDarkMode naar zodra de repetitielijst tekent.
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
  pieces: [{ id: 'stuk-1', title: 'Bolero', notes: 'vanaf maat 40', sort_order: 1 }],
  attendance: [{ id: 'aw-1', user_id: 'u-2', spond_member_id: null, member_name: 'Bram Cohen', status: 'accepted' }],
};

function gebruikerMetRol(rol: string): User {
  return { id: 'u-1', email: 'lid@example.org', name: 'Lid', role: rol } as unknown as User;
}

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

  vi.mocked(api.createRehearsal).mockResolvedValue({ id: 'nieuw-1' } as never);
  vi.mocked(api.updateRehearsal).mockResolvedValue(undefined as never);
  vi.mocked(api.deleteRehearsal).mockResolvedValue(undefined as never);
  vi.mocked(api.updateRehearsalPieces).mockResolvedValue(undefined as never);
  vi.mocked(api.addDefaultDay).mockResolvedValue(undefined as never);
  vi.mocked(api.deleteDefaultDay).mockResolvedValue(undefined as never);
  vi.mocked(api.generateRehearsals).mockResolvedValue({ count: 12 });
  vi.mocked(api.createRecurringRehearsals).mockResolvedValue({ count: 5, seriesId: 'r-1', dates: [] });
  vi.mocked(api.saveSpondConfig).mockResolvedValue(undefined as never);
  vi.mocked(api.removeSpondConfig).mockResolvedValue(undefined as never);
  vi.mocked(api.syncSpond).mockResolvedValue({ synced: 7 } as never);
  vi.mocked(api.syncSpondRehearsal).mockResolvedValue(undefined as never);
  vi.mocked(api.updateMyAttendance).mockResolvedValue({
    message: 'rehearsals.attendance.saved',
    status: 'accepted',
    spondSynced: false,
  });
  vi.mocked(api.generateRehearsalSeating).mockResolvedValue({ message: 'ok', memberCount: 4 });
}

function wikkel({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** De tabbladknoppen dragen geen klasse; alleen zij hebben `marginBottom: -2px`. */
function tabbladKnoppen(): HTMLElement[] {
  return screen.queryAllByRole('button').filter((knop) => knop.style.marginBottom === '-2px');
}

function tabblad(label: string): HTMLElement {
  const knop = tabbladKnoppen().find((k) => k.textContent?.trim() === label);
  if (!knop) throw new Error(`tabblad "${label}" niet gevonden`);
  return knop;
}

async function wachtOpPagina(): Promise<void> {
  await waitFor(() => expect(tabbladKnoppen().length).toBeGreaterThan(0));
}

/** Tekent de pagina en wacht tot de lijst er staat. */
async function toon(): Promise<void> {
  render(<Rehearsals />, { wrapper: wikkel });
  await wachtOpPagina();
}

/** Het kaartje waarvan de kop deze tekst heeft. */
function kaart(kop: string): HTMLElement {
  const titel = screen.getAllByText(kop).find((el) => el.classList.contains('card-title'));
  if (!titel) throw new Error(`kaart "${kop}" niet gevonden`);
  return titel.closest('.card') as HTMLElement;
}

/** Opent het detailscherm van de enige repetitie in de lijst. */
async function openDetail(gebruiker: ReturnType<typeof userEvent.setup>): Promise<void> {
  await gebruiker.click(screen.getByText('rehearsals.days.1 5-1-2099'));
  await screen.findByRole('heading', { name: 'rehearsals.days.1 5-1-2099' });
}

beforeEach(() => {
  vi.clearAllMocks();
  ingelogdeGebruiker = gebruikerMetRol('admin');
  zetApiKlaar();
});

describe('repetitie toevoegen en bewerken', () => {
  async function openNieuwFormulier(gebruiker: ReturnType<typeof userEvent.setup>): Promise<void> {
    await gebruiker.click(screen.getByRole('button', { name: '+ rehearsals.addRehearsal' }));
    await screen.findByText('rehearsals.addRehearsal', { selector: '.card-title' });
  }

  it('stuurt de ingevulde velden mee bij het aanmaken', async () => {
    const gebruiker = userEvent.setup();
    await toon();
    await openNieuwFormulier(gebruiker);

    const formulier = kaart('rehearsals.addRehearsal');
    await gebruiker.type(within(formulier).getByLabelText('rehearsals.date'), '2099-03-10');
    await gebruiker.clear(within(formulier).getByLabelText('rehearsals.startTime'));
    await gebruiker.type(within(formulier).getByLabelText('rehearsals.startTime'), '20:00');
    await gebruiker.type(within(formulier).getByLabelText('rehearsals.location'), 'Het Podium');
    await gebruiker.selectOptions(within(formulier).getByLabelText('rehearsals.type'), 'extra');
    await gebruiker.click(within(formulier).getByRole('button', { name: 'common.save' }));

    await waitFor(() =>
      expect(api.createRehearsal).toHaveBeenCalledWith({
        date: '2099-03-10',
        startTime: '20:00',
        endTime: '21:30',
        location: 'Het Podium',
        type: 'extra',
        notes: '',
        orchestraId: '',
      }),
    );
    expect(showSuccess).toHaveBeenCalledWith('rehearsals.created');
  });

  it('houdt de opslaanknop uit zolang er geen datum staat', async () => {
    const gebruiker = userEvent.setup();
    await toon();
    await openNieuwFormulier(gebruiker);

    expect(within(kaart('rehearsals.addRehearsal')).getByRole('button', { name: 'common.save' })).toBeDisabled();
  });

  it('sluit het formulier zodra het aanmaken gelukt is', async () => {
    const gebruiker = userEvent.setup();
    await toon();
    await openNieuwFormulier(gebruiker);

    const formulier = kaart('rehearsals.addRehearsal');
    await gebruiker.type(within(formulier).getByLabelText('rehearsals.date'), '2099-03-10');
    await gebruiker.click(within(formulier).getByRole('button', { name: 'common.save' }));

    await waitFor(() =>
      expect(screen.queryByText('rehearsals.addRehearsal', { selector: '.card-title' })).not.toBeInTheDocument(),
    );
  });

  it('meldt het als het aanmaken mislukt, en laat het formulier openstaan', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(api.createRehearsal).mockRejectedValue(new Error('de server wil niet'));
    await toon();
    await openNieuwFormulier(gebruiker);

    const formulier = kaart('rehearsals.addRehearsal');
    await gebruiker.type(within(formulier).getByLabelText('rehearsals.date'), '2099-03-10');
    await gebruiker.click(within(formulier).getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('de server wil niet'));
    expect(screen.getByText('rehearsals.addRehearsal', { selector: '.card-title' })).toBeInTheDocument();
  });

  it('vult het bewerkformulier met de gegevens van de gekozen repetitie', async () => {
    const gebruiker = userEvent.setup();
    await toon();

    await gebruiker.click(screen.getByRole('button', { name: 'common.edit' }));

    const formulier = kaart('rehearsals.editRehearsal');
    expect(within(formulier).getByLabelText<HTMLInputElement>('rehearsals.date').value).toBe('2099-01-05');
    expect(within(formulier).getByLabelText<HTMLInputElement>('rehearsals.startTime').value).toBe('19:30');
    expect(within(formulier).getByLabelText<HTMLInputElement>('rehearsals.location').value).toBe('De Zaal');
  });

  it('werkt bij het opslaan van een bewerking dezelfde repetitie bij', async () => {
    const gebruiker = userEvent.setup();
    await toon();

    await gebruiker.click(screen.getByRole('button', { name: 'common.edit' }));
    const formulier = kaart('rehearsals.editRehearsal');
    await gebruiker.clear(within(formulier).getByLabelText('rehearsals.location'));
    await gebruiker.type(within(formulier).getByLabelText('rehearsals.location'), 'De Kerk');
    await gebruiker.click(within(formulier).getByRole('button', { name: 'common.save' }));

    await waitFor(() =>
      expect(api.updateRehearsal).toHaveBeenCalledWith('rep-1', expect.objectContaining({ location: 'De Kerk' })),
    );
    expect(api.createRehearsal).not.toHaveBeenCalled();
    expect(showSuccess).toHaveBeenCalledWith('rehearsals.saved');
  });

  it('sluit het formulier zonder op te slaan bij annuleren', async () => {
    const gebruiker = userEvent.setup();
    await toon();

    await gebruiker.click(screen.getByRole('button', { name: 'common.edit' }));
    await gebruiker.click(within(kaart('rehearsals.editRehearsal')).getByRole('button', { name: 'common.cancel' }));

    expect(screen.queryByText('rehearsals.editRehearsal', { selector: '.card-title' })).not.toBeInTheDocument();
    expect(api.updateRehearsal).not.toHaveBeenCalled();
  });
});

describe('repetitie verwijderen', () => {
  it('vraagt eerst om bevestiging en verwijdert dan pas', async () => {
    const gebruiker = userEvent.setup();
    await toon();

    await gebruiker.click(screen.getByRole('button', { name: 'common.delete' }));
    const vraag = screen.getByRole('alertdialog');
    expect(vraag).toHaveTextContent('rehearsals.deleteConfirm');
    expect(api.deleteRehearsal).not.toHaveBeenCalled();

    await gebruiker.click(within(vraag).getAllByRole('button', { name: 'common.delete' })[0]);

    await waitFor(() => expect(api.deleteRehearsal).toHaveBeenCalledWith('rep-1'));
    expect(showSuccess).toHaveBeenCalledWith('rehearsals.deleted');
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  });

  it('verwijdert niets als de vraag geannuleerd wordt', async () => {
    const gebruiker = userEvent.setup();
    await toon();

    await gebruiker.click(screen.getByRole('button', { name: 'common.delete' }));
    await gebruiker.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'common.cancel' }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(api.deleteRehearsal).not.toHaveBeenCalled();
  });

  it('meldt het als het verwijderen mislukt', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(api.deleteRehearsal).mockRejectedValue(new Error('nog in gebruik'));
    await toon();

    await gebruiker.click(screen.getByRole('button', { name: 'common.delete' }));
    await gebruiker.click(within(screen.getByRole('alertdialog')).getAllByRole('button', { name: 'common.delete' })[0]);

    await waitFor(() => expect(showError).toHaveBeenCalledWith('nog in gebruik'));
  });
});

describe('vaste repetitiedagen', () => {
  it('voegt een dag toe met de ingevulde tijden en klapt het formulier daarna dicht', async () => {
    const gebruiker = userEvent.setup();
    await toon();

    await gebruiker.click(screen.getByRole('button', { name: '+ rehearsals.addDefaultDay' }));
    const kaartje = kaart('rehearsals.defaultDays');
    await gebruiker.selectOptions(within(kaartje).getByLabelText('rehearsals.date'), '3');
    await gebruiker.type(within(kaartje).getByLabelText('rehearsals.location'), 'De Zaal');
    await gebruiker.click(within(kaartje).getByRole('button', { name: 'common.save' }));

    await waitFor(() =>
      expect(api.addDefaultDay).toHaveBeenCalledWith({
        dayOfWeek: 3,
        startTime: '19:30',
        endTime: '21:30',
        location: 'De Zaal',
        orchestraId: '',
      }),
    );
    await waitFor(() =>
      expect(within(kaart('rehearsals.defaultDays')).queryByLabelText('rehearsals.location')).not.toBeInTheDocument(),
    );
  });

  it('meldt het als het toevoegen mislukt en laat het formulier openstaan', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(api.addDefaultDay).mockRejectedValue(new Error('bestaat al'));
    await toon();

    await gebruiker.click(screen.getByRole('button', { name: '+ rehearsals.addDefaultDay' }));
    await gebruiker.click(within(kaart('rehearsals.defaultDays')).getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('bestaat al'));
    expect(within(kaart('rehearsals.defaultDays')).getByLabelText('rehearsals.location')).toBeInTheDocument();
  });

  it('verwijdert een bestaande dag', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(api.getDefaultDays).mockResolvedValue([
      {
        id: 'dag-1',
        day_of_week: 2,
        start_time: '19:30',
        end_time: '21:30',
        location: 'De Zaal',
        orchestra_id: null,
        orchestra_name: null,
      },
    ]);
    await toon();

    const kaartje = kaart('rehearsals.defaultDays');
    await waitFor(() => expect(within(kaartje).getByText('rehearsals.days.2')).toBeInTheDocument());
    await gebruiker.click(within(kaartje).getByRole('button', { name: '×' }));

    await waitFor(() => expect(api.deleteDefaultDay).toHaveBeenCalledWith('dag-1'));
  });
});

describe('repetities laten genereren', () => {
  it('genereert tussen de twee ingevulde datums', async () => {
    const gebruiker = userEvent.setup();
    await toon();

    await gebruiker.click(screen.getByRole('button', { name: 'rehearsals.generate' }));
    const kaartje = kaart('rehearsals.generate');
    await gebruiker.type(within(kaartje).getByLabelText('rehearsals.generateFrom'), '2099-01-01');
    await gebruiker.type(within(kaartje).getByLabelText('rehearsals.generateTo'), '2099-06-30');
    await gebruiker.click(within(kaartje).getByRole('button', { name: 'rehearsals.generateButton' }));

    await waitFor(() => expect(api.generateRehearsals).toHaveBeenCalledWith('2099-01-01', '2099-06-30'));
    expect(showSuccess).toHaveBeenCalledWith('rehearsals.generated');
    await waitFor(() =>
      expect(screen.queryByText('rehearsals.generate', { selector: '.card-title' })).not.toBeInTheDocument(),
    );
  });

  it('houdt de knop uit zolang een van beide datums ontbreekt', async () => {
    const gebruiker = userEvent.setup();
    await toon();

    await gebruiker.click(screen.getByRole('button', { name: 'rehearsals.generate' }));
    const kaartje = kaart('rehearsals.generate');
    await gebruiker.type(within(kaartje).getByLabelText('rehearsals.generateFrom'), '2099-01-01');

    expect(within(kaartje).getByRole('button', { name: 'rehearsals.generateButton' })).toBeDisabled();
  });

  it('meldt het als het genereren mislukt', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(api.generateRehearsals).mockRejectedValue(new Error('geen vaste dagen'));
    await toon();

    await gebruiker.click(screen.getByRole('button', { name: 'rehearsals.generate' }));
    const kaartje = kaart('rehearsals.generate');
    await gebruiker.type(within(kaartje).getByLabelText('rehearsals.generateFrom'), '2099-01-01');
    await gebruiker.type(within(kaartje).getByLabelText('rehearsals.generateTo'), '2099-06-30');
    await gebruiker.click(within(kaartje).getByRole('button', { name: 'rehearsals.generateButton' }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('geen vaste dagen'));
  });
});

describe('een reeks terugkerende repetities', () => {
  /** Opent het herhaalformulier en vult de einddatum, want zonder die datum kan er niets. */
  async function openReeksformulier(
    gebruiker: ReturnType<typeof userEvent.setup>,
    tot = '2099-12-31',
  ): Promise<HTMLElement> {
    await gebruiker.click(screen.getByRole('button', { name: 'rehearsals.recurring.title' }));
    const kaartje = kaart('rehearsals.recurring.title');
    await gebruiker.type(within(kaartje).getByLabelText('rehearsals.recurring.until'), tot);
    return kaartje;
  }

  it('vertaalt de gekozen weekdag en het interval naar een rrule', async () => {
    const gebruiker = userEvent.setup();
    await toon();
    const kaartje = await openReeksformulier(gebruiker);

    await gebruiker.selectOptions(within(kaartje).getByLabelText('rehearsals.recurring.dayOfWeek'), '4');
    await gebruiker.selectOptions(within(kaartje).getByLabelText('rehearsals.recurring.interval'), '2');
    await gebruiker.type(within(kaartje).getByLabelText('rehearsals.location'), 'De Zaal');
    await gebruiker.click(within(kaartje).getByRole('button', { name: 'rehearsals.recurring.create' }));

    await waitFor(() =>
      expect(api.createRecurringRehearsals).toHaveBeenCalledWith({
        rrule: 'FREQ=WEEKLY;BYDAY=TH;INTERVAL=2',
        startTime: '19:30',
        endTime: '21:30',
        location: 'De Zaal',
        orchestraId: undefined,
        until: '2099-12-31',
      }),
    );
    expect(showSuccess).toHaveBeenCalledWith('rehearsals.recurring.created');
  });

  it('laat het interval weg uit de rrule bij een wekelijkse reeks', async () => {
    const gebruiker = userEvent.setup();
    await toon();
    const kaartje = await openReeksformulier(gebruiker);

    await gebruiker.click(within(kaartje).getByRole('button', { name: 'rehearsals.recurring.create' }));

    await waitFor(() =>
      expect(api.createRecurringRehearsals).toHaveBeenCalledWith(
        expect.objectContaining({ rrule: 'FREQ=WEEKLY;BYDAY=MO' }),
      ),
    );
  });

  it('sluit het formulier na een geslaagde reeks', async () => {
    const gebruiker = userEvent.setup();
    await toon();
    const kaartje = await openReeksformulier(gebruiker);

    await gebruiker.click(within(kaartje).getByRole('button', { name: 'rehearsals.recurring.create' }));

    await waitFor(() =>
      expect(screen.queryByText('rehearsals.recurring.title', { selector: '.card-title' })).not.toBeInTheDocument(),
    );
  });

  it('meldt het als de reeks niet aangemaakt kan worden', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(api.createRecurringRehearsals).mockRejectedValue(new Error('te veel datums'));
    await toon();
    const kaartje = await openReeksformulier(gebruiker);

    await gebruiker.click(within(kaartje).getByRole('button', { name: 'rehearsals.recurring.create' }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('te veel datums'));
    expect(screen.getByText('rehearsals.recurring.title', { selector: '.card-title' })).toBeInTheDocument();
  });

  it('houdt de knop uit zolang er geen einddatum staat, want dan is er geen voorbeeld', async () => {
    const gebruiker = userEvent.setup();
    await toon();

    await gebruiker.click(screen.getByRole('button', { name: 'rehearsals.recurring.title' }));
    const kaartje = kaart('rehearsals.recurring.title');

    expect(within(kaartje).getByRole('button', { name: 'rehearsals.recurring.create' })).toBeDisabled();
  });
});

describe('de spond-koppeling', () => {
  it('slaat gebruikersnaam, wachtwoord en groep op', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(api.getSpondGroups).mockResolvedValue([{ id: 'g-1', name: 'Harmonie', memberCount: 40 }]);
    await toon();

    await gebruiker.click(screen.getByRole('button', { name: 'rehearsals.spond.configure' }));
    const kaartje = kaart('rehearsals.spond.title');
    await gebruiker.type(within(kaartje).getByLabelText('rehearsals.spond.username'), 'dirigent@example.org');
    await gebruiker.type(within(kaartje).getByLabelText('rehearsals.spond.password'), 'geheim');
    await gebruiker.click(within(kaartje).getByRole('button', { name: 'rehearsals.spond.selectGroup' }));

    await waitFor(() => expect(api.getSpondGroups).toHaveBeenCalled());
    await gebruiker.selectOptions(within(kaartje).getByLabelText('rehearsals.spond.selectGroup'), 'g-1');
    await gebruiker.click(within(kaartje).getByRole('button', { name: 'rehearsals.spond.saveConfig' }));

    await waitFor(() =>
      expect(api.saveSpondConfig).toHaveBeenCalledWith({
        username: 'dirigent@example.org',
        password: 'geheim',
        groupId: 'g-1',
        syncEnabled: true,
      }),
    );
    expect(showSuccess).toHaveBeenCalledWith('rehearsals.spond.configSaved');
  });

  it('houdt opslaan uit zolang er geen gebruikersnaam en wachtwoord staan', async () => {
    const gebruiker = userEvent.setup();
    await toon();

    await gebruiker.click(screen.getByRole('button', { name: 'rehearsals.spond.configure' }));
    const kaartje = kaart('rehearsals.spond.title');
    expect(within(kaartje).getByRole('button', { name: 'rehearsals.spond.saveConfig' })).toBeDisabled();

    await gebruiker.type(within(kaartje).getByLabelText('rehearsals.spond.username'), 'dirigent@example.org');
    expect(within(kaartje).getByRole('button', { name: 'rehearsals.spond.saveConfig' })).toBeDisabled();

    await gebruiker.type(within(kaartje).getByLabelText('rehearsals.spond.password'), 'geheim');
    expect(within(kaartje).getByRole('button', { name: 'rehearsals.spond.saveConfig' })).toBeEnabled();
  });

  it('meldt het als het inloggen bij spond mislukt', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(api.saveSpondConfig).mockRejectedValue(new Error('inloggen geweigerd'));
    await toon();

    await gebruiker.click(screen.getByRole('button', { name: 'rehearsals.spond.configure' }));
    const kaartje = kaart('rehearsals.spond.title');
    await gebruiker.type(within(kaartje).getByLabelText('rehearsals.spond.username'), 'dirigent@example.org');
    await gebruiker.type(within(kaartje).getByLabelText('rehearsals.spond.password'), 'fout');
    await gebruiker.click(within(kaartje).getByRole('button', { name: 'rehearsals.spond.saveConfig' }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('inloggen geweigerd'));
  });

  it('meldt het als de groepen niet op te halen zijn', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(api.getSpondGroups).mockRejectedValue(new Error('sessie verlopen'));
    await toon();

    await gebruiker.click(screen.getByRole('button', { name: 'rehearsals.spond.configure' }));
    const kaartje = kaart('rehearsals.spond.title');
    await gebruiker.type(within(kaartje).getByLabelText('rehearsals.spond.username'), 'dirigent@example.org');
    await gebruiker.type(within(kaartje).getByLabelText('rehearsals.spond.password'), 'geheim');
    await gebruiker.click(within(kaartje).getByRole('button', { name: 'rehearsals.spond.selectGroup' }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('sessie verlopen'));
  });

  describe('als er al een koppeling staat', () => {
    beforeEach(() => {
      vi.mocked(api.getSpondConfig).mockResolvedValue({
        configured: true,
        username: 'dirigent@example.org',
        groupId: 'groep-12345678',
        syncEnabled: true,
        lastSync: null,
      });
    });

    it('synchroniseert alle repetities', async () => {
      const gebruiker = userEvent.setup();
      await toon();

      await gebruiker.click(await screen.findByRole('button', { name: 'rehearsals.spond.syncAll' }));

      await waitFor(() => expect(api.syncSpond).toHaveBeenCalled());
      expect(showSuccess).toHaveBeenCalledWith('rehearsals.spond.syncSuccess');
    });

    it('meldt het als de synchronisatie mislukt', async () => {
      const gebruiker = userEvent.setup();
      vi.mocked(api.syncSpond).mockRejectedValue(new Error('spond onbereikbaar'));
      await toon();

      await gebruiker.click(await screen.findByRole('button', { name: 'rehearsals.spond.syncAll' }));

      await waitFor(() => expect(showError).toHaveBeenCalledWith('spond onbereikbaar'));
    });

    it('neemt bij bewerken de bekende gegevens over en laat het wachtwoord leeg', async () => {
      const gebruiker = userEvent.setup();
      await toon();

      // "common.edit" staat ook bij elke rij in de repetitielijst, dus zoeken
      // binnen de spond-kaart en niet op de hele pagina.
      await waitFor(() =>
        expect(within(kaart('rehearsals.spond.title')).getAllByRole('button').length).toBeGreaterThan(1),
      );
      await gebruiker.click(within(kaart('rehearsals.spond.title')).getByRole('button', { name: 'common.edit' }));

      const kaartje = kaart('rehearsals.spond.title');
      expect(within(kaartje).getByLabelText<HTMLInputElement>('rehearsals.spond.username').value).toBe(
        'dirigent@example.org',
      );
      expect(within(kaartje).getByLabelText<HTMLInputElement>('rehearsals.spond.password').value).toBe('');
      // Leeg laten mag: het wachtwoord ligt al versleuteld op de server.
      expect(within(kaartje).getByText('rehearsals.spond.passwordKeepHint')).toBeInTheDocument();
      expect(within(kaartje).getByRole('button', { name: 'rehearsals.spond.saveConfig' })).toBeEnabled();
    });

    it('verwijdert de koppeling pas na bevestiging', async () => {
      const gebruiker = userEvent.setup();
      await toon();

      await gebruiker.click(await screen.findByRole('button', { name: 'rehearsals.spond.removeConfig' }));
      const vraag = screen.getByRole('alertdialog');
      expect(vraag).toHaveTextContent('rehearsals.spond.removeConfirm');
      expect(api.removeSpondConfig).not.toHaveBeenCalled();

      await gebruiker.click(within(vraag).getByRole('button', { name: 'common.remove' }));

      await waitFor(() => expect(api.removeSpondConfig).toHaveBeenCalled());
      expect(showSuccess).toHaveBeenCalledWith('rehearsals.spond.configRemoved');
      await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    });
  });
});

describe('het detailscherm van een repetitie', () => {
  it('bewerkt het repertoire en laat lege regels weg bij het opslaan', async () => {
    const gebruiker = userEvent.setup();
    await toon();
    await openDetail(gebruiker);

    const kaartje = kaart('rehearsals.pieces');
    await gebruiker.click(within(kaartje).getByRole('button', { name: 'common.edit' }));

    const velden = within(kaart('rehearsals.pieces')).getAllByPlaceholderText('rehearsals.pieceTitle');
    expect(velden[0]).toHaveValue('Bolero');

    await gebruiker.click(within(kaart('rehearsals.pieces')).getByRole('button', { name: '+ rehearsals.addPiece' }));
    await gebruiker.click(within(kaart('rehearsals.pieces')).getByRole('button', { name: 'rehearsals.savePieces' }));

    // De tweede regel is leeg gebleven en gaat niet mee.
    await waitFor(() =>
      expect(api.updateRehearsalPieces).toHaveBeenCalledWith('rep-1', [{ title: 'Bolero', notes: 'vanaf maat 40' }]),
    );
    expect(showSuccess).toHaveBeenCalledWith('rehearsals.piecesSaved');
  });

  it('gooit een stuk weg uit de bewerklijst', async () => {
    const gebruiker = userEvent.setup();
    await toon();
    await openDetail(gebruiker);

    await gebruiker.click(within(kaart('rehearsals.pieces')).getByRole('button', { name: 'common.edit' }));
    await gebruiker.click(within(kaart('rehearsals.pieces')).getByRole('button', { name: '×' }));
    await gebruiker.click(within(kaart('rehearsals.pieces')).getByRole('button', { name: 'rehearsals.savePieces' }));

    await waitFor(() => expect(api.updateRehearsalPieces).toHaveBeenCalledWith('rep-1', []));
  });

  it('meldt het als het opslaan van het repertoire mislukt', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(api.updateRehearsalPieces).mockRejectedValue(new Error('titel te lang'));
    await toon();
    await openDetail(gebruiker);

    await gebruiker.click(within(kaart('rehearsals.pieces')).getByRole('button', { name: 'common.edit' }));
    await gebruiker.click(within(kaart('rehearsals.pieces')).getByRole('button', { name: 'rehearsals.savePieces' }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('titel te lang'));
  });

  it('haalt de opstelling op als daarom gevraagd wordt', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(api.getRehearsalSeating).mockResolvedValue([
      {
        id: 'st-1',
        userId: 'u-2',
        spondMemberId: null,
        memberName: 'Bram Cohen',
        instrumentName: 'Cello',
        sectionId: null,
        sectionName: 'Strijkers',
        rowNumber: 1,
        positionInRow: 1,
      },
    ]);
    await toon();
    await openDetail(gebruiker);

    await gebruiker.click(screen.getByRole('button', { name: 'seating.viewSeating' }));

    expect(await screen.findByTestId('opstelling')).toHaveTextContent('Bram Cohen');
    expect(api.getRehearsalSeating).toHaveBeenCalledWith('rep-1');
  });

  it('meldt het als de opstelling niet op te halen is', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(api.getRehearsalSeating).mockRejectedValue(new Error('geen indeling'));
    await toon();
    await openDetail(gebruiker);

    await gebruiker.click(screen.getByRole('button', { name: 'seating.viewSeating' }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('geen indeling'));
    expect(screen.queryByTestId('opstelling')).not.toBeInTheDocument();
  });

  it('laat een opstelling genereren en toont die meteen', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(api.getRehearsalSeating).mockResolvedValue([
      {
        id: 'st-1',
        userId: 'u-2',
        spondMemberId: null,
        memberName: 'Bram Cohen',
        instrumentName: 'Cello',
        sectionId: null,
        sectionName: 'Strijkers',
        rowNumber: 2,
        positionInRow: 1,
      },
    ]);
    await toon();
    await openDetail(gebruiker);

    // De knop verschijnt alleen als er iemand op "komt" staat.
    await gebruiker.click(screen.getByRole('button', { name: 'seating.generateSeating' }));

    await waitFor(() => expect(api.generateRehearsalSeating).toHaveBeenCalledWith('rep-1'));
    expect(await screen.findByTestId('opstelling')).toHaveTextContent('Bram Cohen');
    expect(showSuccess).toHaveBeenCalledWith('seating.seatingGenerated');
  });

  it('meldt het als het genereren van de opstelling mislukt', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(api.generateRehearsalSeating).mockRejectedValue(new Error('geen secties'));
    await toon();
    await openDetail(gebruiker);

    await gebruiker.click(screen.getByRole('button', { name: 'seating.generateSeating' }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('geen secties'));
  });

  it('synchroniseert één repetitie met spond en ververst het detail', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(api.getSpondConfig).mockResolvedValue({
      configured: true,
      username: 'dirigent@example.org',
      groupId: 'groep-12345678',
      syncEnabled: true,
      lastSync: null,
    });
    await toon();
    await openDetail(gebruiker);

    await gebruiker.click(await screen.findByRole('button', { name: 'rehearsals.spond.syncNow' }));

    await waitFor(() => expect(api.syncSpondRehearsal).toHaveBeenCalledWith('rep-1'));
    expect(showSuccess).toHaveBeenCalledWith('rehearsals.spond.syncRehearsalSuccess');
  });
});

describe('je eigen aanwezigheid doorgeven', () => {
  it('zet de status om en telt het aantal in de lijst meteen bij', async () => {
    const gebruiker = userEvent.setup();
    await toon();
    await openDetail(gebruiker);

    await gebruiker.click(screen.getByRole('button', { name: 'rehearsals.attendance.accept' }));

    await waitFor(() => expect(api.updateMyAttendance).toHaveBeenCalledWith('rep-1', true));
    expect(await screen.findByText('rehearsals.attendance.statuses.accepted')).toBeInTheDocument();
  });

  it('geeft ook een afmelding door', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(api.updateMyAttendance).mockResolvedValue({
      message: 'rehearsals.attendance.saved',
      status: 'declined',
      spondSynced: false,
    });
    await toon();
    await openDetail(gebruiker);

    await gebruiker.click(screen.getByRole('button', { name: 'rehearsals.attendance.decline' }));

    await waitFor(() => expect(api.updateMyAttendance).toHaveBeenCalledWith('rep-1', false));
    expect(await screen.findByText('rehearsals.attendance.statuses.declined')).toBeInTheDocument();
  });

  it('meldt het extra als de afmelding ook naar spond ging', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(api.updateMyAttendance).mockResolvedValue({
      message: 'rehearsals.attendance.saved',
      status: 'accepted',
      spondSynced: true,
    });
    await toon();
    await openDetail(gebruiker);

    await gebruiker.click(screen.getByRole('button', { name: 'rehearsals.attendance.accept' }));

    await waitFor(() => expect(showSuccess).toHaveBeenCalledWith('rehearsals.attendance.syncedToSpond'));
  });

  it('draait de status terug als het doorgeven mislukt', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(api.updateMyAttendance).mockRejectedValue(new Error('geen verbinding'));
    await toon();
    await openDetail(gebruiker);

    await gebruiker.click(screen.getByRole('button', { name: 'rehearsals.attendance.accept' }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('geen verbinding'));
    // Terug op de stand van vóór de klik, niet blijven hangen op "aanwezig".
    expect(screen.getByText('rehearsals.attendance.statuses.unknown')).toBeInTheDocument();
  });

  it('valt terug op onbekend als de eigen status niet op te halen is', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(api.getMyAttendanceStatus).mockRejectedValue(new Error('niet gekoppeld'));
    await toon();
    await openDetail(gebruiker);

    expect(screen.getByText('rehearsals.attendance.statuses.unknown')).toBeInTheDocument();
    expect(screen.queryByText('rehearsals.attendance.willSyncToSpond')).not.toBeInTheDocument();
  });
});

describe('het aanwezigheidsoverzicht sorteren', () => {
  const LEDEN = [
    { name: 'Chris Dekker', spondMemberId: 'sm-3', userId: null, accepted: 2, declined: 0, unknown: 0, total: 10 },
    { name: 'Anna Bakker', spondMemberId: 'sm-1', userId: null, accepted: 5, declined: 1, unknown: 0, total: 10 },
    { name: 'Bram Cohen', spondMemberId: 'sm-2', userId: null, accepted: 4, declined: 0, unknown: 0, total: 4 },
  ];

  function namenInTabel(): string[] {
    const rijen = document.querySelectorAll('.data-table tbody tr');
    return Array.from(rijen).map((rij) => rij.querySelector('td')?.textContent ?? '');
  }

  async function openOverzicht(gebruiker: ReturnType<typeof userEvent.setup>): Promise<void> {
    vi.mocked(api.getAttendanceSummary).mockResolvedValue({ members: LEDEN, rehearsalCount: 10 } as never);
    await toon();
    await gebruiker.click(tabblad('rehearsals.attendance.title'));
    await waitFor(() => expect(namenInTabel()).toHaveLength(3));
  }

  it('staat standaard op naam', async () => {
    const gebruiker = userEvent.setup();
    await openOverzicht(gebruiker);

    expect(namenInTabel()).toEqual(['Anna Bakker', 'Bram Cohen', 'Chris Dekker']);
  });

  it('sorteert op aantal aanwezigheden', async () => {
    const gebruiker = userEvent.setup();
    await openOverzicht(gebruiker);

    await gebruiker.click(screen.getByText(/rehearsals\.attendance\.present/));

    expect(namenInTabel()).toEqual(['Anna Bakker', 'Bram Cohen', 'Chris Dekker']);
  });

  it('sorteert op percentage, en dat is een andere volgorde dan het aantal', async () => {
    const gebruiker = userEvent.setup();
    await openOverzicht(gebruiker);

    await gebruiker.click(screen.getByText(/rehearsals\.attendance\.percentage/));

    // Bram komt 4 van de 4 keer (100%), Anna 5 van de 10 (50%), Chris 2 van de 10 (20%).
    expect(namenInTabel()).toEqual(['Bram Cohen', 'Anna Bakker', 'Chris Dekker']);
  });

  it('haalt het overzicht opnieuw op als de periode verschuift', async () => {
    const gebruiker = userEvent.setup();
    await openOverzicht(gebruiker);
    vi.mocked(api.getAttendanceSummary).mockClear();

    await gebruiker.clear(screen.getByLabelText('rehearsals.attendance.from'));
    await gebruiker.type(screen.getByLabelText('rehearsals.attendance.from'), '2098-01-01');

    await waitFor(() =>
      expect(api.getAttendanceSummary).toHaveBeenCalledWith('2098-01-01', expect.any(String), undefined),
    );
  });
});

describe('wat een gewoon lid niet kan', () => {
  beforeEach(() => {
    ingelogdeGebruiker = gebruikerMetRol('member');
  });

  it('krijgt geen bewerk- of verwijderknoppen in de lijst', async () => {
    await toon();

    expect(screen.queryByRole('button', { name: 'common.edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'common.delete' })).not.toBeInTheDocument();
  });

  it('ziet in het detailscherm geen bewerkknop bij het repertoire en geen opstelling', async () => {
    const gebruiker = userEvent.setup();
    await toon();
    await openDetail(gebruiker);

    expect(within(kaart('rehearsals.pieces')).queryByRole('button', { name: 'common.edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'seating.viewSeating' })).not.toBeInTheDocument();
    expect(screen.getByTestId('eigen-velden-weergave')).toBeInTheDocument();
  });
});
