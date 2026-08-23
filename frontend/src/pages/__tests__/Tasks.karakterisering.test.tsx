/**
 * Eerste tests voor de takenpagina.
 *
 * Tasks.tsx is 1076 regels en was nog nooit getest: de pagina zelf plus drie
 * modals - het detailscherm, het aanmaakformulier en het lijstbeheer - in één
 * bestand. Deze tests lopen de hoofdweg af zoals een gebruiker die loopt: de
 * lijst bekijken, filteren, een taak afvinken, een taak openen, er een
 * checklist-item en een reactie bij zetten, een nieuwe taak aanmaken en de
 * lijsten beheren.
 *
 * Twee dingen zijn hier geen vastlegging maar een reparatie; bij allebei staat
 * bij de test wat er zonder de reparatie gebeurt:
 *   - Het afvinkvakje in de takenlijst opende ook het detailvenster.
 *   - Een mislukt verzoek was niet van "geen taken" te onderscheiden.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import Tasks from '../Tasks';
import * as takenApi from '../../api/tasks';
import type { Task, TaskDetail, TaskList } from '../../api/tasks';

vi.mock('../../api/tasks');

vi.mock('../../hooks/useDocumentTitle', () => ({ useDocumentTitle: () => {} }));

// De bevestigingsvraag zegt hier altijd ja; wat er ná het bevestigen gebeurt is
// wat de tests controleren.
const bevestiging = { antwoord: true };
vi.mock('../../hooks/useConfirm', () => ({
  useConfirm: () => async () => bevestiging.antwoord,
}));

// De rol bepaalt of de knop "lijsten beheren" er staat; per test overschrijven
// we hem.
const huidigeGebruiker = { id: 'u1', rol: 'admin' };
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: huidigeGebruiker.id, role: huidigeGebruiker.rol } }),
}));

// `initReactI18next` hoort erbij omdat de pagina via utils/dateFormat de echte
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

// Het statusoverzicht en de sjablonendialoog hebben hun eigen verzoeken en hun
// eigen gedrag; die horen niet in de tests van deze pagina thuis.
vi.mock('../../components/TaskSummary', () => ({
  TaskSummary: () => <div data-testid="statusoverzicht" />,
}));

vi.mock('../../components/TaskTemplatesDialog', () => ({
  TaskTemplatesDialog: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="sjablonen">
      <button onClick={onClose}>sluit sjablonen</button>
    </div>
  ),
}));

vi.mock('../../utils/toast', () => ({ showSuccess: vi.fn(), showError: vi.fn() }));

const LIJSTEN: TaskList[] = [
  {
    id: 'lijst-1',
    name: 'Concertvoorbereiding',
    color: '#3b82f6',
    sortOrder: 1,
    openCount: 2,
    totalCount: 5,
    createdAt: '2026-01-01T10:00:00.000Z',
  },
  {
    id: 'lijst-2',
    name: 'Ledenadministratie',
    sortOrder: 2,
    openCount: 0,
    totalCount: 1,
    createdAt: '2026-01-01T10:00:00.000Z',
  },
];

function maakTaak(overschrijving: Partial<Task> = {}): Task {
  return {
    id: 'taak-1',
    title: 'Podium reserveren',
    description: 'Bel de zaal over de opstelling',
    taskListId: 'lijst-1',
    listName: 'Concertvoorbereiding',
    listColor: '#3b82f6',
    status: 'todo',
    priority: 'high',
    dueDate: '2026-09-01T12:00:00.000Z',
    createdBy: 'u1',
    createdByName: 'Ruud',
    assignedTo: 'u2',
    assignedToName: 'Anna',
    checklistTotal: 3,
    checklistDone: 1,
    createdAt: '2026-08-01T10:00:00.000Z',
    updatedAt: '2026-08-01T10:00:00.000Z',
    ...overschrijving,
  };
}

const TAKEN: Task[] = [
  maakTaak(),
  maakTaak({
    id: 'taak-2',
    title: 'Programmaboekje drukken',
    description: undefined,
    taskListId: undefined,
    listName: undefined,
    listColor: undefined,
    status: 'done',
    priority: 'low',
    dueDate: undefined,
    assignedTo: undefined,
    assignedToName: undefined,
    checklistTotal: 0,
    checklistDone: 0,
  }),
];

function maakDetail(overschrijving: Partial<TaskDetail> = {}): TaskDetail {
  return {
    ...maakTaak(),
    checklist: [
      { id: 'item-1', content: 'Zaal bellen', isCompleted: true, sortOrder: 0 },
      { id: 'item-2', content: 'Opstelling doorgeven', isCompleted: false, sortOrder: 1 },
    ],
    comments: [
      {
        id: 'reactie-1',
        content: 'Zaal is gebeld',
        authorId: 'u1',
        authorName: 'Ruud',
        createdAt: '2026-08-02T10:00:00.000Z',
        updatedAt: '2026-08-02T10:00:00.000Z',
      },
      {
        id: 'reactie-2',
        content: 'Opstelling volgt nog',
        authorId: 'u2',
        authorName: 'Anna',
        createdAt: '2026-08-03T10:00:00.000Z',
        updatedAt: '2026-08-03T10:00:00.000Z',
      },
    ],
    assignments: [],
    ...overschrijving,
  };
}

function zetApiKlaar(): void {
  const leeg = vi.fn().mockResolvedValue([]);
  for (const naam of Object.keys(takenApi)) {
    const functie = (takenApi as Record<string, unknown>)[naam];
    if (typeof functie === 'function') {
      vi.mocked(functie as (...args: unknown[]) => unknown).mockImplementation(leeg);
    }
  }
  vi.mocked(takenApi.getTasks).mockResolvedValue(TAKEN);
  vi.mocked(takenApi.getTaskLists).mockResolvedValue(LIJSTEN);
  vi.mocked(takenApi.getTask).mockResolvedValue(maakDetail());
}

function wikkel({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

/** De select of het invoerveld dat bij het label met deze tekst hoort. */
function veldBij(label: string): HTMLElement {
  const groep = screen.getByText(label).closest('.form-control');
  if (!groep) throw new Error(`geen form-control gevonden bij label ${label}`);
  const veld = groep.querySelector('select, input, textarea');
  if (!veld) throw new Error(`geen veld gevonden bij label ${label}`);
  return veld as HTMLElement;
}

/** De kaart in de takenlijst waarin deze taaktitel staat. */
function kaartVan(titel: string): HTMLElement {
  const kaart = screen.getByText(titel).closest('.card');
  if (!kaart) throw new Error(`geen kaart gevonden voor ${titel}`);
  return kaart as HTMLElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  huidigeGebruiker.rol = 'admin';
  huidigeGebruiker.id = 'u1';
  bevestiging.antwoord = true;
  zetApiKlaar();
});

describe('takenpagina - de lijst', () => {
  it('toont de taken die de server stuurt, met lijstnaam, toegewezene en checkliststand', async () => {
    render(<Tasks />, { wrapper: wikkel });

    await screen.findByText('Podium reserveren');
    expect(screen.getByText('Programmaboekje drukken')).toBeInTheDocument();

    const kaart = kaartVan('Podium reserveren');
    expect(within(kaart).getByText('Concertvoorbereiding')).toBeInTheDocument();
    expect(within(kaart).getByText('Bel de zaal over de opstelling')).toBeInTheDocument();
    expect(within(kaart).getByText('Anna')).toBeInTheDocument();
    expect(within(kaart).getByText('1/3')).toBeInTheDocument();
    expect(within(kaart).getByText('tasks.status.todo')).toBeInTheDocument();
  });

  it('vinkt de afgeronde taak aan en streept hem door', async () => {
    render(<Tasks />, { wrapper: wikkel });

    await screen.findByText('Programmaboekje drukken');

    const afgerond = kaartVan('Programmaboekje drukken');
    expect(within(afgerond).getByRole('checkbox')).toBeChecked();
    expect(screen.getByText('Programmaboekje drukken').className).toContain('line-through');

    const open = kaartVan('Podium reserveren');
    expect(within(open).getByRole('checkbox')).not.toBeChecked();
  });

  it('toont de lege staat als de server geen taken teruggeeft', async () => {
    vi.mocked(takenApi.getTasks).mockResolvedValue([]);

    render(<Tasks />, { wrapper: wikkel });

    expect(await screen.findByText('tasks.noTasks')).toBeInTheDocument();
  });

  /**
   * Reparatie. De pagina keek alleen naar `isLoading`, en `useQuery` geeft bij
   * een mislukt verzoek een lege lijst terug. Een storing was daardoor niet van
   * "er zijn nog geen taken" te onderscheiden: de gebruiker kreeg "tasks.noTasks"
   * te zien en ging ervan uit dat zijn lijst leeg was.
   *
   * Zonder de `isError`-tak in Tasks.tsx is deze test rood: er verschijnt dan
   * geen melding maar de lege staat.
   */
  it('toont een melding met herstelknop als de taken niet opgehaald konden worden', async () => {
    vi.mocked(takenApi.getTasks).mockRejectedValue(new Error('netwerk stuk'));

    render(<Tasks />, { wrapper: wikkel });

    expect(await screen.findByText('common.error')).toBeInTheDocument();
    expect(screen.queryByText('tasks.noTasks')).not.toBeInTheDocument();

    // De herstelknop moet ook echt opnieuw ophalen.
    vi.mocked(takenApi.getTasks).mockResolvedValue(TAKEN);
    await userEvent.click(screen.getByRole('button', { name: /common\.retry/ }));

    expect(await screen.findByText('Podium reserveren')).toBeInTheDocument();
  });
});

describe('takenpagina - filteren', () => {
  it('stuurt de gekozen status mee naar de server', async () => {
    render(<Tasks />, { wrapper: wikkel });
    await screen.findByText('Podium reserveren');

    await userEvent.selectOptions(veldBij('tasks.filterStatus'), 'in_progress');

    await waitFor(() =>
      expect(takenApi.getTasks).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'in_progress' })),
    );
  });

  it('stuurt de gekozen lijst mee naar de server en biedt de lijsten van de server aan', async () => {
    render(<Tasks />, { wrapper: wikkel });
    await screen.findByText('Podium reserveren');

    const lijstFilter = veldBij('tasks.filterList');
    expect(within(lijstFilter).getByRole('option', { name: 'Ledenadministratie' })).toBeInTheDocument();

    await userEvent.selectOptions(lijstFilter, 'lijst-1');

    await waitFor(() =>
      expect(takenApi.getTasks).toHaveBeenLastCalledWith(expect.objectContaining({ listId: 'lijst-1' })),
    );
  });

  it('stuurt de zoekterm mee en laat hem in het veld staan', async () => {
    render(<Tasks />, { wrapper: wikkel });
    await screen.findByText('Podium reserveren');

    const zoekveld = screen.getByPlaceholderText('tasks.searchPlaceholder');
    await userEvent.type(zoekveld, 'podium');

    await waitFor(() =>
      expect(takenApi.getTasks).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'podium' })),
    );
    expect(zoekveld).toHaveValue('podium');
  });

  it('vraagt afgeronde taken pas op als het vinkje aan staat', async () => {
    render(<Tasks />, { wrapper: wikkel });
    await screen.findByText('Podium reserveren');

    expect(takenApi.getTasks).toHaveBeenLastCalledWith(expect.objectContaining({ showCompleted: false }));

    await userEvent.click(screen.getByText('tasks.showCompleted'));

    await waitFor(() =>
      expect(takenApi.getTasks).toHaveBeenLastCalledWith(expect.objectContaining({ showCompleted: true })),
    );
  });
});

describe('takenpagina - wie welke knoppen ziet', () => {
  it('geeft een beheerder de knop om lijsten te beheren', async () => {
    render(<Tasks />, { wrapper: wikkel });

    expect(await screen.findByRole('button', { name: /tasks\.manageLists/ })).toBeInTheDocument();
  });

  it('geeft de muziekcommissie diezelfde knop', async () => {
    huidigeGebruiker.rol = 'music_committee';

    render(<Tasks />, { wrapper: wikkel });

    expect(await screen.findByRole('button', { name: /tasks\.manageLists/ })).toBeInTheDocument();
  });

  it('geeft een gewoon lid die knop niet, maar wel de knop om een taak aan te maken', async () => {
    huidigeGebruiker.rol = 'member';

    render(<Tasks />, { wrapper: wikkel });

    await screen.findByText('Podium reserveren');
    expect(screen.queryByRole('button', { name: /tasks\.manageLists/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /tasks\.createTask/ })).toBeInTheDocument();
  });
});

describe('takenpagina - een taak afvinken', () => {
  /**
   * Reparatie. Het vakje riep `e.stopPropagation()` aan in zijn `onChange`,
   * maar de kaart eromheen luistert naar `onClick`. Dat zijn in React twee
   * losse gebeurtenissen uit dezelfde muisklik, en de klik wordt als eerste
   * afgehandeld: het vakje aanvinken opende dus óók het detailvenster van de
   * taak. Het vakje heeft nu zijn eigen `onClick` die de klik tegenhoudt.
   *
   * Zonder die `onClick` in Tasks.tsx is deze test rood: `getTask` wordt dan
   * wel aangeroepen en het detailvenster staat open.
   */
  it('werkt de status bij zonder het detailvenster te openen', async () => {
    render(<Tasks />, { wrapper: wikkel });
    await screen.findByText('Podium reserveren');

    await userEvent.click(within(kaartVan('Podium reserveren')).getByRole('checkbox'));

    await waitFor(() => expect(takenApi.updateTask).toHaveBeenCalledWith('taak-1', { status: 'done' }));
    expect(takenApi.getTask).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('zet een afgeronde taak terug op te doen', async () => {
    render(<Tasks />, { wrapper: wikkel });
    await screen.findByText('Programmaboekje drukken');

    await userEvent.click(within(kaartVan('Programmaboekje drukken')).getByRole('checkbox'));

    await waitFor(() => expect(takenApi.updateTask).toHaveBeenCalledWith('taak-2', { status: 'todo' }));
  });
});

describe('takenpagina - het detailvenster', () => {
  async function openDetail() {
    render(<Tasks />, { wrapper: wikkel });
    await screen.findByText('Podium reserveren');
    await userEvent.click(kaartVan('Podium reserveren'));
    return screen.findByRole('dialog');
  }

  it('haalt pas een detail op als er een taak aangeklikt is', async () => {
    render(<Tasks />, { wrapper: wikkel });
    await screen.findByText('Podium reserveren');

    expect(takenApi.getTask).not.toHaveBeenCalled();
  });

  it('toont de checklist en de reacties van de geopende taak', async () => {
    const venster = await openDetail();

    expect(takenApi.getTask).toHaveBeenCalledWith('taak-1');
    expect(within(venster).getByText('Zaal bellen')).toBeInTheDocument();
    expect(within(venster).getByText('Opstelling doorgeven')).toBeInTheDocument();
    expect(within(venster).getByText('Zaal is gebeld')).toBeInTheDocument();
    expect(within(venster).getByText('Anna')).toBeInTheDocument();
  });

  it('meldt het als er nog geen reacties zijn', async () => {
    vi.mocked(takenApi.getTask).mockResolvedValue(maakDetail({ comments: [] }));

    const venster = await openDetail();

    expect(within(venster).getByText('tasks.noComments')).toBeInTheDocument();
  });

  it('zet een gewijzigde status door naar de server', async () => {
    const venster = await openDetail();

    await userEvent.selectOptions(within(venster).getByDisplayValue('tasks.status.todo'), 'review');

    await waitFor(() => expect(takenApi.updateTask).toHaveBeenCalledWith('taak-1', { status: 'review' }));
  });

  it('voegt een checklist-item toe en laat de knop uit zolang het veld leeg is', async () => {
    const venster = await openDetail();

    const veld = within(venster).getByPlaceholderText('tasks.addChecklistItem');
    const knop = veld.parentElement?.querySelector('button') as HTMLButtonElement;
    expect(knop).toBeDisabled();

    await userEvent.type(veld, 'Stoelen tellen');
    expect(knop).toBeEnabled();
    await userEvent.click(knop);

    await waitFor(() => expect(takenApi.addChecklistItem).toHaveBeenCalledWith('taak-1', 'Stoelen tellen'));
  });

  it('vinkt een checklist-item af', async () => {
    const venster = await openDetail();

    const regel = within(venster).getByText('Opstelling doorgeven').parentElement as HTMLElement;
    await userEvent.click(within(regel).getByRole('checkbox'));

    await waitFor(() =>
      expect(takenApi.updateChecklistItem).toHaveBeenCalledWith('taak-1', 'item-2', { isCompleted: true }),
    );
  });

  it('plaatst een reactie met de entertoets', async () => {
    const venster = await openDetail();

    await userEvent.type(within(venster).getByPlaceholderText('tasks.addCommentPlaceholder'), 'Zaal bevestigd{Enter}');

    await waitFor(() => expect(takenApi.addTaskComment).toHaveBeenCalledWith('taak-1', 'Zaal bevestigd'));
  });

  it('geeft alleen bij de eigen reactie een verwijderknop', async () => {
    const venster = await openDetail();

    const eigen = within(venster).getByText('Zaal is gebeld').parentElement as HTMLElement;
    const vanAnder = within(venster).getByText('Opstelling volgt nog').parentElement as HTMLElement;

    expect(within(eigen).queryByTestId('icon-trash')).toBeInTheDocument();
    expect(within(vanAnder).queryByTestId('icon-trash')).not.toBeInTheDocument();
  });

  it('verwijdert de taak na bevestiging en sluit het venster', async () => {
    const venster = await openDetail();

    await userEvent.click(within(venster).getByRole('button', { name: /common\.delete/ }));

    // `deleteTask` is rechtstreeks als mutationFn doorgegeven, dus react-query
    // geeft er zelf een tweede argument bij; alleen het eerste is van ons.
    await waitFor(() => expect(takenApi.deleteTask).toHaveBeenCalled());
    expect(vi.mocked(takenApi.deleteTask).mock.calls[0][0]).toBe('taak-1');
  });

  it('verwijdert niets als de bevestiging geweigerd wordt', async () => {
    bevestiging.antwoord = false;
    const venster = await openDetail();

    await userEvent.click(within(venster).getByRole('button', { name: /common\.delete/ }));

    await waitFor(() => expect(takenApi.deleteTask).not.toHaveBeenCalled());
  });
});

describe('takenpagina - een taak aanmaken', () => {
  async function openAanmaken() {
    render(<Tasks />, { wrapper: wikkel });
    await screen.findByText('Podium reserveren');
    await userEvent.click(screen.getByRole('button', { name: /tasks\.createTask/ }));
    return screen.findByRole('dialog');
  }

  it('houdt de aanmaakknop uit zolang de titel leeg is', async () => {
    const venster = await openAanmaken();

    const knop = within(venster).getByRole('button', { name: /tasks\.createTask/ });
    expect(knop).toBeDisabled();

    await userEvent.type(within(venster).getByPlaceholderText('tasks.titlePlaceholder'), '   ');
    expect(knop).toBeDisabled();
  });

  it('stuurt titel, beschrijving, prioriteit en lijst naar de server', async () => {
    const venster = await openAanmaken();

    await userEvent.type(within(venster).getByPlaceholderText('tasks.titlePlaceholder'), 'Bladmuziek kopiëren');
    await userEvent.type(within(venster).getByPlaceholderText('tasks.descriptionPlaceholder'), 'Twintig sets');
    await userEvent.selectOptions(within(venster).getByDisplayValue('tasks.priority.medium'), 'urgent');
    await userEvent.selectOptions(within(venster).getByDisplayValue('tasks.noList'), 'lijst-2');

    await userEvent.click(within(venster).getByRole('button', { name: /tasks\.createTask/ }));

    await waitFor(() => expect(takenApi.createTask).toHaveBeenCalled());
    expect(vi.mocked(takenApi.createTask).mock.calls[0][0]).toEqual({
      title: 'Bladmuziek kopiëren',
      description: 'Twintig sets',
      priority: 'urgent',
      taskListId: 'lijst-2',
    });
  });

  it('sluit het venster met annuleren zonder iets te versturen', async () => {
    const venster = await openAanmaken();

    await userEvent.click(within(venster).getByRole('button', { name: 'common.cancel' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(takenApi.createTask).not.toHaveBeenCalled();
  });
});

describe('takenpagina - lijsten beheren', () => {
  async function openLijstbeheer() {
    render(<Tasks />, { wrapper: wikkel });
    await screen.findByText('Podium reserveren');
    await userEvent.click(screen.getByRole('button', { name: /tasks\.manageLists/ }));
    return screen.findByRole('dialog');
  }

  it('toont elke lijst met het aantal open taken van het totaal', async () => {
    const venster = await openLijstbeheer();

    expect(within(venster).getByText('Concertvoorbereiding')).toBeInTheDocument();
    expect(within(venster).getByText('(2/5)')).toBeInTheDocument();
    expect(within(venster).getByText('(0/1)')).toBeInTheDocument();
  });

  it('meldt het als er nog geen lijsten zijn', async () => {
    vi.mocked(takenApi.getTaskLists).mockResolvedValue([]);

    const venster = await openLijstbeheer();

    expect(within(venster).getByText('tasks.noLists')).toBeInTheDocument();
  });

  it('maakt een nieuwe lijst aan met de gekozen kleur', async () => {
    const venster = await openLijstbeheer();

    await userEvent.type(within(venster).getByPlaceholderText('tasks.newListName'), 'Sponsoring');
    await userEvent.click(within(venster).getByRole('button', { name: '#22c55e' }));
    const plusKnop = within(venster).getByTestId('icon-plus').closest('button') as HTMLButtonElement;
    await userEvent.click(plusKnop);

    await waitFor(() => expect(takenApi.createTaskList).toHaveBeenCalledWith({ name: 'Sponsoring', color: '#22c55e' }));
  });

  it('hernoemt een bestaande lijst', async () => {
    const venster = await openLijstbeheer();

    const regel = within(venster).getByText('Concertvoorbereiding').closest('.p-3') as HTMLElement;
    await userEvent.click(within(regel).getByTitle('common.edit'));

    const naamveld = within(venster).getByDisplayValue('Concertvoorbereiding');
    await userEvent.clear(naamveld);
    await userEvent.type(naamveld, 'Concertlogistiek');
    await userEvent.click(within(venster).getByRole('button', { name: 'common.save' }));

    await waitFor(() =>
      expect(takenApi.updateTaskList).toHaveBeenCalledWith('lijst-1', {
        name: 'Concertlogistiek',
        color: '#3b82f6',
      }),
    );
  });

  it('verwijdert een lijst na bevestiging', async () => {
    const venster = await openLijstbeheer();

    const regel = within(venster).getByText('Ledenadministratie').closest('.p-3') as HTMLElement;
    await userEvent.click(within(regel).getByTitle('common.delete'));

    await waitFor(() => expect(takenApi.deleteTaskList).toHaveBeenCalled());
    expect(vi.mocked(takenApi.deleteTaskList).mock.calls[0][0]).toBe('lijst-2');
  });

  it('verwijdert niets als de bevestiging geweigerd wordt', async () => {
    bevestiging.antwoord = false;
    const venster = await openLijstbeheer();

    const regel = within(venster).getByText('Ledenadministratie').closest('.p-3') as HTMLElement;
    await userEvent.click(within(regel).getByTitle('common.delete'));

    await waitFor(() => expect(takenApi.deleteTaskList).not.toHaveBeenCalled());
  });
});
