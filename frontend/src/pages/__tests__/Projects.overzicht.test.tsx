/**
 * Eerste tests voor de projectenpagina.
 *
 * Projects.tsx is 665 regels en bevat vijf onderdelen: het overzicht met
 * tellers en een statusfilter, een venster voor een nieuw project, en een
 * detailvenster met vijf tabbladen (overzicht, leden, setlijst, gebeurtenissen
 * en planning). Er was nog geen enkele test.
 *
 * Deze tests beschrijven wat de gebruiker ziet en doet:
 *   - een leeg overzicht geeft de lege staat, niet een leeg raster;
 *   - de tellers tellen wat er staat;
 *   - het statusfilter gaat mee in het verzoek naar de server;
 *   - een mislukte statuswijziging of verwijdering geeft een melding en laat
 *     de pagina staan;
 *   - het detailvenster haalt het juiste project op, en toont bij een leeg
 *     antwoord een nette melding in plaats van een lege dialoog;
 *   - de tabbladen laten zien wat erbij hoort, inclusief de lege staten.
 *
 * Twee dingen om te weten bij het lezen:
 *   - Het menu per kaart is een daisyUI-dropdown. Die staat altijd in de DOM
 *     en wordt met CSS getoond; in jsdom is er geen CSS, dus de knoppen zijn
 *     hier meteen bereikbaar. Dat is een afwijking van de echte browser, maar
 *     wel de enige manier om zonder stijlblad bij die knoppen te komen.
 *   - `useConfirm` is vervangen door een schakelaar, zodat een test zowel het
 *     bevestigde als het afgebroken verwijderen kan doorlopen.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import Projects from '../Projects';
import * as projectenApi from '../../api/projects';
import { showError, showSuccess } from '../../utils/toast';
import type { Project, ProjectDetail } from '../../api/projects';

vi.mock('../../api/projects');

vi.mock('../../hooks/useDocumentTitle', () => ({ useDocumentTitle: () => {} }));

// `initReactI18next` hoort erbij omdat de pagina via utils/locale.ts de echte
// i18n-opzet meetrekt, en die roept het aan tijdens het laden van de module.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (sleutel: string) => sleutel }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('../../utils/toast', () => ({ showSuccess: vi.fn(), showError: vi.fn() }));

vi.mock('../../components/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icoon-${name}`} />,
}));

vi.mock('../../components/Skeleton', () => ({
  SkeletonCard: () => <div data-testid="skelet-kaart" />,
}));

// Deze twee hebben hun eigen queries en hun eigen tests; hier telt alleen dát
// ze op het juiste tabblad tevoorschijn komen en welk project ze meekrijgen.
vi.mock('../../components/ProjectSetlistSection', () => ({
  ProjectSetlistSection: ({ project }: { project: ProjectDetail }) => (
    <div data-testid="setlijst" data-project={project.id} />
  ),
}));

vi.mock('../../components/ProjectEventsSection', () => ({
  ProjectEventsSection: ({ project }: { project: ProjectDetail }) => (
    <div data-testid="gebeurtenissen" data-project={project.id} />
  ),
}));

/** Wat de bevestigingsvraag antwoordt; per test te verzetten. */
let bevestigingsAntwoord = true;
const bevestig = vi.fn(async () => bevestigingsAntwoord);

vi.mock('../../hooks/useConfirm', () => ({
  useConfirm: () => bevestig,
}));

const PROJECTEN: Project[] = [
  {
    id: 'pr-voorjaar',
    name: 'Voorjaarsconcert',
    description: 'Met koor',
    startDate: '2026-03-01',
    status: 'active',
    projectType: 'concert',
    orchestraName: 'Harmonie',
    memberCount: 42,
    concertCount: 2,
    rehearsalCount: 8,
    createdAt: '2026-01-01',
  },
  {
    id: 'pr-concours',
    name: 'Concours 2026',
    status: 'planning',
    projectType: 'competition',
    memberCount: 30,
    concertCount: 1,
    rehearsalCount: 12,
    createdAt: '2026-01-02',
  },
  {
    id: 'pr-kerst',
    name: 'Kerstmatinee',
    status: 'completed',
    projectType: 'concert',
    memberCount: 25,
    concertCount: 1,
    rehearsalCount: 4,
    createdAt: '2025-11-01',
  },
];

const DETAIL: ProjectDetail = {
  ...PROJECTEN[0],
  createdBy: 'gebr-1',
  createdByName: 'Anne Bakker',
  notes: 'Sleutel bij de conciërge',
  budget: 1500,
  endDate: '2026-03-31',
  members: [
    {
      id: 'lid-1',
      userId: 'gebr-2',
      firstName: 'Piet',
      lastName: 'Jansen',
      email: 'piet@voorbeeld.nl',
      role: 'soloist',
      status: 'confirmed',
    },
  ],
  concerts: [{ id: 'co-1', name: 'Openingsconcert', date: '2026-03-14', venue: 'De Kruisberg', sortOrder: 0 }],
  rehearsals: [
    { id: 're-1', date: '2026-03-10', startTime: '19:30', endTime: '21:30', location: 'Repetitiezaal', sortOrder: 0 },
  ],
  setlist: [],
};

function metOmgeving(kind: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{kind}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  bevestigingsAntwoord = true;
  vi.mocked(projectenApi.getProjects).mockResolvedValue(PROJECTEN);
  vi.mocked(projectenApi.getProject).mockResolvedValue(DETAIL);
});

describe('Projects - overzicht', () => {
  it('toont de lege staat als er geen projecten zijn', async () => {
    vi.mocked(projectenApi.getProjects).mockResolvedValue([]);

    render(metOmgeving(<Projects />));

    expect(await screen.findByText('projects.noProjects')).toBeInTheDocument();
    expect(screen.queryByText('Voorjaarsconcert')).not.toBeInTheDocument();
  });

  it('telt totaal, actief, in planning en afgerond', async () => {
    render(metOmgeving(<Projects />));

    await screen.findByText('Voorjaarsconcert');

    const totaal = screen.getByText('projects.total').parentElement!;
    expect(within(totaal).getByText('3')).toBeInTheDocument();

    // Eén actief, één in planning, één afgerond - de drie tellers hiernaast
    // hangen elk aan hun eigen kopje.
    for (const [kop, aantal] of [
      ['projects.active', '1'],
      ['projects.planning', '1'],
      ['projects.completed', '1'],
    ] as const) {
      const kaart = screen.getByText(kop).parentElement!;
      expect(within(kaart).getByText(aantal)).toBeInTheDocument();
    }
  });

  it('geeft het gekozen statusfilter door aan de server', async () => {
    const gebruiker = userEvent.setup();
    render(metOmgeving(<Projects />));
    await screen.findByText('Voorjaarsconcert');

    expect(projectenApi.getProjects).toHaveBeenCalledWith(undefined);

    await gebruiker.selectOptions(screen.getByRole('combobox'), 'planning');

    await waitFor(() => expect(projectenApi.getProjects).toHaveBeenCalledWith({ status: 'planning' }));
  });

  it('toont het skelet zolang de lijst nog onderweg is', async () => {
    let losMaken: (lijst: Project[]) => void = () => {};
    vi.mocked(projectenApi.getProjects).mockReturnValue(
      new Promise((resolve) => {
        losMaken = resolve;
      }),
    );

    render(metOmgeving(<Projects />));

    expect(screen.getAllByTestId('skelet-kaart')).toHaveLength(3);

    losMaken(PROJECTEN);
    expect(await screen.findByText('Voorjaarsconcert')).toBeInTheDocument();
    expect(screen.queryByTestId('skelet-kaart')).not.toBeInTheDocument();
  });
});

describe('Projects - handelingen op een kaart', () => {
  it('zet een project op actief zonder het detailvenster te openen', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(projectenApi.updateProjectStatus).mockResolvedValue({ message: 'ok' });

    render(metOmgeving(<Projects />));
    await screen.findByText('Concours 2026');

    // Alleen het project in planning heeft "markActive" in zijn menu.
    await gebruiker.click(screen.getByText('projects.markActive'));

    await waitFor(() => expect(projectenApi.updateProjectStatus).toHaveBeenCalledWith('pr-concours', 'active'));
    expect(showSuccess).toHaveBeenCalledWith('projects.statusUpdated');

    // BEWIJS - rood zonder de reparatie in Projects.tsx.
    // De hele kaart heeft een onClick die het detailvenster opent, en de
    // menuknoppen zitten daarbinnen. Zonder stopPropagation zakte de klik op
    // "Markeer als actief" door naar de kaart en werd het detailvenster
    // geopend - dus ook een verzoek om het projectdetail.
    expect(projectenApi.getProject).not.toHaveBeenCalled();
  });

  it('verwijdert pas na bevestiging, en niet als er wordt afgebroken', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(projectenApi.deleteProject).mockResolvedValue({ message: 'ok' });
    bevestigingsAntwoord = false;

    render(metOmgeving(<Projects />));
    await screen.findByText('Voorjaarsconcert');

    await gebruiker.click(screen.getAllByText('common.delete')[0]);
    await waitFor(() => expect(bevestig).toHaveBeenCalledWith('projects.confirmDelete'));
    expect(projectenApi.deleteProject).not.toHaveBeenCalled();

    bevestigingsAntwoord = true;
    await gebruiker.click(screen.getAllByText('common.delete')[0]);

    // deleteProject is rechtstreeks de mutationFn, en react-query geeft daar
    // een tweede argument bij mee. Alleen het eerste is van ons.
    await waitFor(() => expect(projectenApi.deleteProject).toHaveBeenCalled());
    expect(vi.mocked(projectenApi.deleteProject).mock.calls[0][0]).toBe('pr-voorjaar');

    // Zonder de reparatie sprong hier bovendien het detailvenster open van
    // het project dat zojuist verwijderd is.
    expect(projectenApi.getProject).not.toHaveBeenCalled();
  });

  it('meldt het als de server de statuswijziging weigert', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(projectenApi.updateProjectStatus).mockRejectedValue(new Error('403'));

    render(metOmgeving(<Projects />));
    await screen.findByText('Voorjaarsconcert');

    await gebruiker.click(screen.getAllByText('projects.archive')[0]);

    await waitFor(() => expect(showError).toHaveBeenCalledWith('projects.errorUpdate'));
    // De pagina blijft staan; er verdwijnt geen kaart en er komt geen wit
    // scherm.
    expect(screen.getAllByText('Voorjaarsconcert').length).toBeGreaterThan(0);
  });

  it('meldt het als het verwijderen mislukt', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(projectenApi.deleteProject).mockRejectedValue(new Error('409'));

    render(metOmgeving(<Projects />));
    await screen.findByText('Voorjaarsconcert');

    await gebruiker.click(screen.getAllByText('common.delete')[0]);

    await waitFor(() => expect(showError).toHaveBeenCalledWith('projects.errorDelete'));
    expect(screen.getAllByText('Voorjaarsconcert').length).toBeGreaterThan(0);
  });
});

describe('Projects - nieuw project', () => {
  it('houdt de aanmaakknop dicht zolang er geen naam staat', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(projectenApi.createProject).mockResolvedValue({ id: 'nieuw', message: 'ok' });

    render(metOmgeving(<Projects />));
    await screen.findByText('Voorjaarsconcert');

    await gebruiker.click(screen.getByText('projects.new'));

    const aanmaken = screen.getByRole('button', { name: 'common.create' });
    expect(aanmaken).toBeDisabled();

    // Alleen spaties is geen naam.
    const naamveld = screen.getAllByRole('textbox')[0];
    await gebruiker.type(naamveld, '   ');
    expect(aanmaken).toBeDisabled();

    await gebruiker.type(naamveld, 'Zomerserenade');
    expect(aanmaken).toBeEnabled();

    await gebruiker.click(aanmaken);
    await waitFor(() => expect(projectenApi.createProject).toHaveBeenCalled());
    expect(vi.mocked(projectenApi.createProject).mock.calls[0][0]).toEqual(
      expect.objectContaining({ name: '   Zomerserenade', projectType: 'concert' }),
    );
    expect(showSuccess).toHaveBeenCalledWith('projects.created');
  });

  it('meldt het als het aanmaken mislukt en houdt het venster open', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(projectenApi.createProject).mockRejectedValue(new Error('500'));

    render(metOmgeving(<Projects />));
    await screen.findByText('Voorjaarsconcert');

    await gebruiker.click(screen.getByText('projects.new'));
    await gebruiker.type(screen.getAllByRole('textbox')[0], 'Mislukt');
    await gebruiker.click(screen.getByRole('button', { name: 'common.create' }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('projects.errorCreate'));
    expect(screen.getByRole('button', { name: 'common.create' })).toBeInTheDocument();
  });
});

describe('Projects - detailvenster', () => {
  async function openDetail() {
    const gebruiker = userEvent.setup();
    render(metOmgeving(<Projects />));
    await screen.findByText('Voorjaarsconcert');
    await gebruiker.click(screen.getByText('Voorjaarsconcert'));
    return gebruiker;
  }

  it('haalt het aangeklikte project op en toont de kerngegevens', async () => {
    await openDetail();

    await waitFor(() => expect(projectenApi.getProject).toHaveBeenCalledWith('pr-voorjaar'));

    expect(await screen.findByText('Anne Bakker')).toBeInTheDocument();
    expect(screen.getByText('Sleutel bij de conciërge')).toBeInTheDocument();
    // Het venster telt leden, concerten en repetities uit het detail, niet uit
    // de kaart in de lijst.
    expect(screen.getByText('1 projects.rehearsals')).toBeInTheDocument();
  });

  it('toont een melding als het project niet gevonden wordt', async () => {
    vi.mocked(projectenApi.getProject).mockResolvedValue(undefined as unknown as ProjectDetail);

    await openDetail();

    expect(await screen.findByText('projects.notFound')).toBeInTheDocument();
  });

  it('laat de lege staat zien op het tabblad leden als er niemand is', async () => {
    vi.mocked(projectenApi.getProject).mockResolvedValue({ ...DETAIL, members: [] });

    const gebruiker = await openDetail();
    await screen.findByText('Anne Bakker');

    await gebruiker.click(screen.getByText('projects.members (0)'));

    expect(await screen.findByText('projects.noMembers')).toBeInTheDocument();
  });

  it('toont de leden met hun status in een tabel', async () => {
    const gebruiker = await openDetail();
    await screen.findByText('Anne Bakker');

    await gebruiker.click(screen.getByText('projects.members (1)'));

    expect(await screen.findByText('Piet Jansen')).toBeInTheDocument();
    expect(screen.getByText('piet@voorbeeld.nl')).toBeInTheDocument();
    expect(screen.getByText('projects.memberStatuses.confirmed')).toBeInTheDocument();
  });

  it('zet concerten en repetities samen in de planning, op datum', async () => {
    const gebruiker = await openDetail();
    await screen.findByText('Anne Bakker');

    await gebruiker.click(screen.getByText('projects.schedule'));

    const regels = await screen.findAllByText(/Openingsconcert|projects.rehearsal/);
    // De repetitie is van 10 maart en het concert van 14 maart, dus de
    // repetitie hoort bovenaan te staan.
    expect(regels[0]).toHaveTextContent('projects.rehearsal');
    // Locatie en zaal staan als los tekstknoopje tussen de icoontjes in, dus
    // hier wordt op de omhullende regel gezocht.
    expect(screen.getByText(/De Kruisberg/)).toBeInTheDocument();
    expect(screen.getByText(/Repetitiezaal/)).toBeInTheDocument();
  });

  it('meldt een lege planning in plaats van een lege lijst', async () => {
    vi.mocked(projectenApi.getProject).mockResolvedValue({ ...DETAIL, concerts: [], rehearsals: [] });

    const gebruiker = await openDetail();
    await screen.findByText('Anne Bakker');

    await gebruiker.click(screen.getByText('projects.schedule'));

    expect(await screen.findByText('projects.noSchedule')).toBeInTheDocument();
  });

  it('geeft het project door aan het setlijst- en gebeurtenissenblok', async () => {
    const gebruiker = await openDetail();
    await screen.findByText('Anne Bakker');

    await gebruiker.click(screen.getByText('projects.setlist (0)'));
    expect(await screen.findByTestId('setlijst')).toHaveAttribute('data-project', 'pr-voorjaar');

    await gebruiker.click(screen.getByText('projects.events.label'));
    expect(await screen.findByTestId('gebeurtenissen')).toHaveAttribute('data-project', 'pr-voorjaar');
  });
});
