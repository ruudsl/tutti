/**
 * Concerten en repetities koppelen aan een project.
 *
 * Dit blok is het tabblad "gebeurtenissen" in het projectvenster. Het toont
 * wat er gekoppeld is, laat dat losmaken, en heeft twee kieslijsten om er iets
 * bij te koppelen.
 *
 * Het repetitiedeel verdient de meeste aandacht. De serverroutes voor
 * POST /projects/:id/rehearsals en DELETE /projects/:id/rehearsals/:id
 * bestonden een tijd lang niet; ze zijn er nu. Deze tests leggen vast dat het
 * scherm die weg ook echt bewandelt: dat het het id meestuurt dat de gebruiker
 * heeft aangeklikt, dat het ontkoppelen mikt op het id dat GET /projects/:id
 * teruggaf, en dat een weigering van de server een melding oplevert in plaats
 * van een venster dat doet alsof er niets gebeurd is.
 *
 * Dit zijn wachten, geen bewijzen: het scherm riep die functies al goed aan,
 * er viel hier niets te repareren. Ze staan er zodat een volgende verschuiving
 * - een andere veldnaam, een ander id - meteen opvalt in plaats van pas als
 * iemand op "Toevoegen" drukt.
 *
 * Wat er verder in ligt: de lege staten van beide lijsten, dat een al
 * gekoppelde repetitie of een al gekoppeld concert niet nog eens in de
 * keuzelijst staat, en het onderscheid tussen "niets gevonden" en "alles is
 * al gekoppeld" bij het zoeken naar concerten.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ProjectEventsSection } from '../ProjectEventsSection';
import * as projectenApi from '../../api/projects';
import * as concertenApi from '../../api/concerts';
import * as repetitiesApi from '../../api/rehearsals';
import { showError, showSuccess } from '../../utils/toast';
import type { ProjectDetail } from '../../api/projects';
import type { Concert, Rehearsal } from '../../types';

vi.mock('../../api/projects');
vi.mock('../../api/concerts');
vi.mock('../../api/rehearsals');

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (sleutel: string) => sleutel }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('../../utils/toast', () => ({ showSuccess: vi.fn(), showError: vi.fn() }));

vi.mock('../Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icoon-${name}`} />,
}));

const PROJECT: ProjectDetail = {
  id: 'pr-voorjaar',
  name: 'Voorjaarsconcert',
  status: 'active',
  projectType: 'concert',
  memberCount: 10,
  concertCount: 1,
  rehearsalCount: 1,
  createdAt: '2026-01-01',
  createdBy: 'gebr-1',
  createdByName: 'Anne Bakker',
  members: [],
  concerts: [{ id: 'co-gekoppeld', name: 'Openingsconcert', date: '2026-03-14', venue: 'De Kruisberg', sortOrder: 0 }],
  rehearsals: [
    {
      id: 're-gekoppeld',
      date: '2026-03-10',
      startTime: '19:30',
      endTime: '21:30',
      location: 'Repetitiezaal',
      sortOrder: 0,
    },
  ],
  setlist: [],
};

const LEEG_PROJECT: ProjectDetail = { ...PROJECT, concerts: [], rehearsals: [] };

const VRIJ_CONCERT = {
  id: 'co-vrij',
  name: 'Zomerserenade',
  date: '2026-06-20',
  location: 'Muziekkoepel',
} as unknown as Concert;

const VRIJE_REPETITIE = {
  id: 're-vrij',
  date: '2026-03-24',
  start_time: '19:30',
  end_time: '21:30',
  location: 'Dorpshuis',
  orchestra_name: 'Harmonie',
} as unknown as Rehearsal;

const GEKOPPELDE_REPETITIE = { ...VRIJE_REPETITIE, id: 're-gekoppeld' } as Rehearsal;

function metOmgeving(kind: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{kind}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  // De keuzelijst met repetities vraagt een venster van vandaag tot over
  // negentig dagen op; met een vaste klok is dat venster te controleren.
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-03-01T09:00:00Z'));
  vi.mocked(concertenApi.getConcerts).mockResolvedValue({
    data: [VRIJ_CONCERT],
    total: 1,
    page: 1,
    limit: 20,
  });
  vi.mocked(repetitiesApi.getRehearsals).mockResolvedValue([VRIJE_REPETITIE]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ProjectEventsSection - wat er gekoppeld is', () => {
  it('meldt per lijst dat er nog niets gekoppeld is', () => {
    render(metOmgeving(<ProjectEventsSection project={LEEG_PROJECT} />));

    expect(screen.getByText('projects.events.noConcerts')).toBeInTheDocument();
    expect(screen.getByText('projects.events.noRehearsals')).toBeInTheDocument();
  });

  it('toont het gekoppelde concert en de gekoppelde repetitie met hun gegevens', () => {
    render(metOmgeving(<ProjectEventsSection project={PROJECT} />));

    expect(screen.getByText('Openingsconcert')).toBeInTheDocument();
    expect(screen.getByText(/De Kruisberg/)).toBeInTheDocument();
    expect(screen.getByText(/19:30 - 21:30/)).toBeInTheDocument();
    expect(screen.getByText(/Repetitiezaal/)).toBeInTheDocument();

    // De kopjes tellen mee wat er in de lijst staat.
    expect(screen.getByText('projects.concerts (1)')).toBeInTheDocument();
    expect(screen.getByText('projects.rehearsals (1)')).toBeInTheDocument();
  });
});

describe('ProjectEventsSection - repetitie koppelen', () => {
  it('stuurt het aangeklikte repetitie-id naar de koppelroute', async () => {
    const gebruiker = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    vi.mocked(projectenApi.linkRehearsalToProject).mockResolvedValue({ message: 'Repetitie gekoppeld' });
    const naVerversen = vi.fn();

    render(metOmgeving(<ProjectEventsSection project={LEEG_PROJECT} onUpdate={naVerversen} />));

    await gebruiker.click(screen.getByText('projects.events.linkRehearsal'));

    // Het venster haalt de repetities van vandaag tot over negentig dagen op.
    await waitFor(() => expect(repetitiesApi.getRehearsals).toHaveBeenCalledWith('2026-03-01', '2026-05-30'));

    const venster = within(screen.getByRole('dialog'));
    expect(await venster.findByText(/Dorpshuis/)).toBeInTheDocument();

    await gebruiker.click(venster.getByText('common.add'));

    // WACHT - dit riep het scherm al goed aan; de reparatie zat aan de
    // serverkant. De test houdt vast dat het project-id en het repetitie-id in
    // die volgorde meegaan, want dat is precies wat de route leest.
    await waitFor(() =>
      expect(projectenApi.linkRehearsalToProject).toHaveBeenCalledWith('pr-voorjaar', 're-vrij'),
    );
    await waitFor(() => expect(showSuccess).toHaveBeenCalledWith('projects.events.rehearsalLinked'));
    expect(naVerversen).toHaveBeenCalled();

    // Het venster hoort daarna dicht te zijn.
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('laat een al gekoppelde repetitie niet nog eens kiezen', async () => {
    const gebruiker = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    vi.mocked(repetitiesApi.getRehearsals).mockResolvedValue([GEKOPPELDE_REPETITIE]);

    render(metOmgeving(<ProjectEventsSection project={PROJECT} />));

    await gebruiker.click(screen.getByText('projects.events.linkRehearsal'));

    // De enige repetitie in het venster hangt al aan dit project, dus er valt
    // niets te kiezen - en zeker geen tweede koppeling van dezelfde repetitie,
    // want die zou de server met een 409 terugsturen.
    expect(await screen.findByText('projects.events.noRehearsalsAvailable')).toBeInTheDocument();
    expect(screen.queryByText('common.add')).not.toBeInTheDocument();
  });

  it('meldt het als de server de koppeling weigert en houdt het venster open', async () => {
    const gebruiker = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    vi.mocked(projectenApi.linkRehearsalToProject).mockRejectedValue(new Error('409'));

    render(metOmgeving(<ProjectEventsSection project={LEEG_PROJECT} />));

    await gebruiker.click(screen.getByText('projects.events.linkRehearsal'));
    const venster = within(screen.getByRole('dialog'));
    await gebruiker.click(await venster.findByText('common.add'));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('projects.events.errorLinkRehearsal'));
    // Het venster blijft staan zodat de gebruiker iets anders kan kiezen.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('ontkoppelt met het id dat in de projectlijst staat', async () => {
    const gebruiker = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    vi.mocked(projectenApi.unlinkRehearsalFromProject).mockResolvedValue({ message: 'ok' });

    render(metOmgeving(<ProjectEventsSection project={PROJECT} />));

    await gebruiker.click(screen.getByLabelText('projects.events.unlinkRehearsal'));

    // WACHT - het id komt uit GET /projects/:id, en de server verwacht bij het
    // ontkoppelen exact datzelfde id terug.
    await waitFor(() =>
      expect(projectenApi.unlinkRehearsalFromProject).toHaveBeenCalledWith('pr-voorjaar', 're-gekoppeld'),
    );
    expect(showSuccess).toHaveBeenCalledWith('projects.events.rehearsalUnlinked');
  });

  it('meldt het als het ontkoppelen mislukt', async () => {
    const gebruiker = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    vi.mocked(projectenApi.unlinkRehearsalFromProject).mockRejectedValue(new Error('403'));

    render(metOmgeving(<ProjectEventsSection project={PROJECT} />));

    await gebruiker.click(screen.getByLabelText('projects.events.unlinkRehearsal'));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('projects.events.errorUnlinkRehearsal'));
    // De regel blijft staan: de koppeling is immers niet weg.
    expect(screen.getByText(/Repetitiezaal/)).toBeInTheDocument();
  });
});

describe('ProjectEventsSection - concert koppelen', () => {
  it('koppelt het gekozen concert en sluit het venster', async () => {
    const gebruiker = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    vi.mocked(projectenApi.linkConcertToProject).mockResolvedValue({ message: 'ok' });

    render(metOmgeving(<ProjectEventsSection project={LEEG_PROJECT} />));

    await gebruiker.click(screen.getByText('projects.events.linkConcert'));
    const venster = within(screen.getByRole('dialog'));
    await gebruiker.click(await venster.findByRole('button', { name: 'common.add Zomerserenade' }));

    await waitFor(() => expect(projectenApi.linkConcertToProject).toHaveBeenCalledWith('pr-voorjaar', 'co-vrij'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('zoekt op de server en onderscheidt niets-gevonden van alles-gekoppeld', async () => {
    const gebruiker = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    vi.mocked(concertenApi.getConcerts).mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 });

    render(metOmgeving(<ProjectEventsSection project={LEEG_PROJECT} />));
    await gebruiker.click(screen.getByText('projects.events.linkConcert'));

    // Zonder zoekterm en zonder resultaat: alles is al gekoppeld.
    expect(await screen.findByText('projects.events.allConcertsLinked')).toBeInTheDocument();

    await gebruiker.type(screen.getByPlaceholderText('common.search'), 'weense');

    await waitFor(() => expect(concertenApi.getConcerts).toHaveBeenCalledWith({ search: 'weense' }));
    // Mét zoekterm hoort er iets anders te staan, anders denkt de gebruiker
    // dat er niets meer te koppelen valt terwijl hij alleen verkeerd zocht.
    expect(await screen.findByText('projects.events.noConcertsFound')).toBeInTheDocument();
  });

  it('meldt het als het koppelen van een concert mislukt', async () => {
    const gebruiker = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    vi.mocked(projectenApi.linkConcertToProject).mockRejectedValue(new Error('409'));

    render(metOmgeving(<ProjectEventsSection project={LEEG_PROJECT} />));
    await gebruiker.click(screen.getByText('projects.events.linkConcert'));
    const venster = within(screen.getByRole('dialog'));
    await gebruiker.click(await venster.findByRole('button', { name: 'common.add Zomerserenade' }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('projects.events.errorLinkConcert'));
  });

  it('ontkoppelt het concert waar de knop bij staat', async () => {
    const gebruiker = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    vi.mocked(projectenApi.unlinkConcertFromProject).mockResolvedValue({ message: 'ok' });

    render(metOmgeving(<ProjectEventsSection project={PROJECT} />));

    await gebruiker.click(screen.getByLabelText('projects.events.unlinkConcert'));

    await waitFor(() =>
      expect(projectenApi.unlinkConcertFromProject).toHaveBeenCalledWith('pr-voorjaar', 'co-gekoppeld'),
    );
    expect(showSuccess).toHaveBeenCalledWith('projects.events.concertUnlinked');
  });
});
