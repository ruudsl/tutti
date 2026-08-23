/**
 * Eerste tests voor de workflowpagina.
 *
 * Workflows.tsx is 1058 regels en was nog nooit getest: de lijst met workflows,
 * het aanmaakformulier, het detailvenster met triggers en acties, en het
 * overzicht van uitvoeringen - alles in één bestand. Deze tests lopen de
 * hoofdweg af zoals een beheerder die loopt: de lijst bekijken, een workflow
 * aan- en uitzetten, hem uitvoeren, hem openen, er een trigger en een actie in
 * wijzigen, de uitvoeringen bekijken en een nieuwe workflow aanmaken.
 *
 * Eén ding is hier geen vastlegging maar een reparatie: een mislukt verzoek was
 * niet te onderscheiden van "er zijn nog geen workflows". Bij die test staat
 * wat er zonder de reparatie gebeurt.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import Workflows from '../Workflows';
import * as workflowApi from '../../api/workflows';
import type { Workflow, WorkflowDetail, WorkflowExecution } from '../../api/workflows';

vi.mock('../../api/workflows');

vi.mock('../../hooks/useDocumentTitle', () => ({ useDocumentTitle: () => {} }));

// De bevestigingsvraag zegt hier standaard ja; wat er ná het bevestigen gebeurt
// is wat de tests controleren.
const bevestiging = { antwoord: true };
vi.mock('../../hooks/useConfirm', () => ({
  useConfirm: () => async () => bevestiging.antwoord,
}));

// De vertaalfunctie geeft hier de sleutel terug, en zet meegegeven waarden
// erachter. Zonder dat laatste zijn de tellers op de kaarten niet te
// controleren: die staan alleen in de ingevulde tekst, niet in de sleutel.
// `initReactI18next` hoort erbij omdat de pagina via utils/dateFormat de echte
// i18n-opzet meetrekt, en die roept het aan tijdens het laden van de module.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (sleutel: string, opties?: Record<string, unknown>) =>
      opties ? `${sleutel}(${Object.values(opties).join(',')})` : sleutel,
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('../../components/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

vi.mock('../../components/Skeleton', () => ({
  SkeletonTable: () => <div data-testid="skelet-tabel" />,
}));

vi.mock('../../utils/toast', () => ({ showSuccess: vi.fn(), showError: vi.fn() }));

function maakWorkflow(overschrijving: Partial<Workflow> = {}): Workflow {
  return {
    id: 'wf-1',
    name: 'Herinnering repetitie',
    description: 'Stuurt een dag van tevoren een notificatie',
    isActive: true,
    runOncePerEntity: false,
    triggerCount: 2,
    actionCount: 1,
    executionCount: 7,
    failedCount: 0,
    createdByName: 'Ruud',
    createdAt: '2026-08-01T10:00:00.000Z',
    updatedAt: '2026-08-01T10:00:00.000Z',
    ...overschrijving,
  };
}

const WORKFLOWS: Workflow[] = [
  maakWorkflow(),
  maakWorkflow({
    id: 'wf-2',
    name: 'Welkomstmail nieuw lid',
    description: undefined,
    isActive: false,
    triggerCount: 1,
    actionCount: 2,
    executionCount: 3,
    failedCount: 2,
  }),
];

function maakDetail(overschrijving: Partial<WorkflowDetail> = {}): WorkflowDetail {
  return {
    ...maakWorkflow(),
    createdBy: 'u1',
    triggers: [
      { id: 'trig-1', triggerType: 'schedule', scheduleCron: '0 9 * * 1', isActive: true },
      { id: 'trig-2', triggerType: 'event', eventName: 'rehearsal.created', isActive: true },
    ],
    actions: [{ id: 'act-1', actionType: 'send_notification', actionOrder: 0, config: {}, isActive: true }],
    ...overschrijving,
  };
}

const UITVOERINGEN: WorkflowExecution[] = [
  {
    id: 'run-1',
    triggeredBy: 'manual',
    triggeredByName: 'Ruud',
    status: 'completed',
    createdAt: '2026-08-10T10:00:00.000Z',
  },
  {
    id: 'run-2',
    triggeredBy: 'schedule',
    status: 'failed',
    errorMessage: 'Mailserver weigerde de verbinding',
    createdAt: '2026-08-11T10:00:00.000Z',
  },
];

function zetApiKlaar(): void {
  const leeg = vi.fn().mockResolvedValue([]);
  for (const naam of Object.keys(workflowApi)) {
    const functie = (workflowApi as Record<string, unknown>)[naam];
    if (typeof functie === 'function') {
      vi.mocked(functie as (...args: unknown[]) => unknown).mockImplementation(leeg);
    }
  }
  vi.mocked(workflowApi.getWorkflows).mockResolvedValue(WORKFLOWS);
  vi.mocked(workflowApi.getWorkflow).mockResolvedValue(maakDetail());
  vi.mocked(workflowApi.getWorkflowExecutions).mockResolvedValue({
    executions: UITVOERINGEN,
    total: UITVOERINGEN.length,
    limit: 50,
    offset: 0,
  });
}

function wikkel({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** De kaart in de lijst waarin deze workflownaam staat. */
function kaartVan(naam: string): HTMLElement {
  const kaart = screen.getByText(naam).closest('.card');
  if (!kaart) throw new Error(`geen kaart gevonden voor ${naam}`);
  return kaart as HTMLElement;
}

/** De balk onderaan het detailvenster met uitvoeren, uitvoeringen en verwijderen. */
function voetbalk(venster: HTMLElement): HTMLElement {
  return within(venster).getByRole('button', { name: /workflows\.run/ }).parentElement as HTMLElement;
}

/** De rij in het detailvenster waarin deze tekst staat. */
function rijMet(venster: HTMLElement, tekst: string): HTMLElement {
  const rij = within(venster).getByText(tekst).closest('.bg-base-200');
  if (!rij) throw new Error(`geen rij gevonden met ${tekst}`);
  return rij as HTMLElement;
}

async function openDetail(): Promise<HTMLElement> {
  render(<Workflows />, { wrapper: wikkel });
  await screen.findByText('Herinnering repetitie');
  await userEvent.click(kaartVan('Herinnering repetitie'));
  return screen.findByRole('dialog');
}

beforeEach(() => {
  vi.clearAllMocks();
  bevestiging.antwoord = true;
  zetApiKlaar();
});

describe('workflowpagina - de lijst', () => {
  it('toont de workflows die de server stuurt, met beschrijving en tellers', async () => {
    render(<Workflows />, { wrapper: wikkel });

    await screen.findByText('Herinnering repetitie');

    const kaart = kaartVan('Herinnering repetitie');
    expect(within(kaart).getByText('workflows.active')).toBeInTheDocument();
    expect(within(kaart).getByText('Stuurt een dag van tevoren een notificatie')).toBeInTheDocument();
    expect(within(kaart).getByText('workflows.triggers(2)')).toBeInTheDocument();
    expect(within(kaart).getByText('workflows.actions(1)')).toBeInTheDocument();
    expect(within(kaart).getByText('workflows.executions(7)')).toBeInTheDocument();
  });

  it('meldt mislukte uitvoeringen alleen bij de workflow die ze heeft', async () => {
    render(<Workflows />, { wrapper: wikkel });

    await screen.findByText('Welkomstmail nieuw lid');

    expect(within(kaartVan('Welkomstmail nieuw lid')).getByText('workflows.failed(2)')).toBeInTheDocument();
    expect(within(kaartVan('Herinnering repetitie')).queryByText(/workflows\.failed/)).not.toBeInTheDocument();
  });

  it('merkt een uitgezette workflow als inactief', async () => {
    render(<Workflows />, { wrapper: wikkel });

    await screen.findByText('Welkomstmail nieuw lid');

    expect(within(kaartVan('Welkomstmail nieuw lid')).getByText('workflows.inactive')).toBeInTheDocument();
  });

  it('toont de lege staat als de server geen workflows teruggeeft', async () => {
    vi.mocked(workflowApi.getWorkflows).mockResolvedValue([]);

    render(<Workflows />, { wrapper: wikkel });

    expect(await screen.findByText('workflows.empty')).toBeInTheDocument();
  });

  /**
   * Reparatie. De pagina keek alleen naar `isLoading`, en `useQuery` geeft bij
   * een mislukt verzoek de standaardwaarde - hier een lege lijst - terug. Een
   * storing zag er daardoor uit als "nog geen workflows gedefinieerd", en een
   * beheerder die zijn automatiseringen kwijt is denkt dan dat ze weg zijn.
   *
   * Zonder de `isError`-tak in Workflows.tsx is deze test rood: er verschijnt
   * dan geen melding maar de lege staat.
   */
  it('toont een melding met herstelknop als de workflows niet opgehaald konden worden', async () => {
    vi.mocked(workflowApi.getWorkflows).mockRejectedValue(new Error('netwerk stuk'));

    render(<Workflows />, { wrapper: wikkel });

    expect(await screen.findByText('common.error')).toBeInTheDocument();
    expect(screen.queryByText('workflows.empty')).not.toBeInTheDocument();

    vi.mocked(workflowApi.getWorkflows).mockResolvedValue(WORKFLOWS);
    await userEvent.click(screen.getByRole('button', { name: /common\.retry/ }));

    expect(await screen.findByText('Herinnering repetitie')).toBeInTheDocument();
  });
});

describe('workflowpagina - aan- en uitzetten en uitvoeren', () => {
  it('zet een actieve workflow uit zonder het detailvenster te openen', async () => {
    render(<Workflows />, { wrapper: wikkel });
    await screen.findByText('Herinnering repetitie');

    // De schakelknop is de eerste van de twee knoppen op de kaart; het
    // pictogram alleen is niet uniek, want de uitvoerknop gebruikt hetzelfde.
    const kaart = kaartVan('Herinnering repetitie');
    expect(within(kaart).getAllByRole('button')[0]).toContainElement(within(kaart).getByTestId('icon-pause'));
    await userEvent.click(within(kaart).getAllByRole('button')[0]);

    await waitFor(() => expect(workflowApi.updateWorkflow).toHaveBeenCalledWith('wf-1', { isActive: false }));
    expect(workflowApi.getWorkflow).not.toHaveBeenCalled();
  });

  it('zet een inactieve workflow aan', async () => {
    render(<Workflows />, { wrapper: wikkel });
    await screen.findByText('Welkomstmail nieuw lid');

    const kaart = kaartVan('Welkomstmail nieuw lid');
    await userEvent.click(within(kaart).getAllByRole('button')[0]);

    await waitFor(() => expect(workflowApi.updateWorkflow).toHaveBeenCalledWith('wf-2', { isActive: true }));
  });

  it('voert een actieve workflow uit en houdt die knop uit bij een inactieve', async () => {
    render(<Workflows />, { wrapper: wikkel });
    await screen.findByText('Herinnering repetitie');

    expect(within(kaartVan('Welkomstmail nieuw lid')).getByRole('button', { name: /workflows\.run/ })).toBeDisabled();

    await userEvent.click(within(kaartVan('Herinnering repetitie')).getByRole('button', { name: /workflows\.run/ }));

    await waitFor(() => expect(workflowApi.runWorkflow).toHaveBeenCalled());
    expect(vi.mocked(workflowApi.runWorkflow).mock.calls[0][0]).toBe('wf-1');
  });
});

describe('workflowpagina - het detailvenster', () => {
  it('haalt pas een detail op als er een workflow aangeklikt is', async () => {
    render(<Workflows />, { wrapper: wikkel });
    await screen.findByText('Herinnering repetitie');

    expect(workflowApi.getWorkflow).not.toHaveBeenCalled();
  });

  it('toont de triggers en acties van de geopende workflow', async () => {
    const venster = await openDetail();

    expect(workflowApi.getWorkflow).toHaveBeenCalledWith('wf-1');
    expect(within(venster).getByText('workflows.triggerType.schedule')).toBeInTheDocument();
    expect(within(venster).getByText('0 9 * * 1')).toBeInTheDocument();
    expect(within(venster).getByText('rehearsal.created')).toBeInTheDocument();
    expect(within(venster).getByText('workflows.actionType.send_notification')).toBeInTheDocument();
  });

  it('meldt het als een workflow geen triggers of acties heeft', async () => {
    vi.mocked(workflowApi.getWorkflow).mockResolvedValue(maakDetail({ triggers: [], actions: [] }));

    const venster = await openDetail();

    expect(within(venster).getByText('workflows.noTriggers')).toBeInTheDocument();
    expect(within(venster).getByText('workflows.noActions')).toBeInTheDocument();
  });

  it('voegt een trigger op eventnaam toe', async () => {
    const venster = await openDetail();

    await userEvent.click(within(venster).getByRole('button', { name: /workflows\.addTrigger/ }));
    await userEvent.selectOptions(within(venster).getByDisplayValue('workflows.triggerType.manual'), 'event');
    await userEvent.type(within(venster).getByPlaceholderText('e.g., member.created'), 'concert.created');
    await userEvent.click(within(venster).getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(workflowApi.addWorkflowTrigger).toHaveBeenCalled());
    const [workflowId, gegevens] = vi.mocked(workflowApi.addWorkflowTrigger).mock.calls[0];
    expect(workflowId).toBe('wf-1');
    expect(gegevens).toMatchObject({ triggerType: 'event', eventName: 'concert.created' });
  });

  it('laat het toevoegformulier weer los bij annuleren', async () => {
    const venster = await openDetail();

    await userEvent.click(within(venster).getByRole('button', { name: /workflows\.addTrigger/ }));
    expect(within(venster).getByDisplayValue('workflows.triggerType.manual')).toBeInTheDocument();

    await userEvent.click(within(venster).getByRole('button', { name: 'common.cancel' }));

    expect(within(venster).queryByDisplayValue('workflows.triggerType.manual')).not.toBeInTheDocument();
    expect(workflowApi.addWorkflowTrigger).not.toHaveBeenCalled();
  });

  it('bewerkt een bestaande trigger met de waarden die er al stonden', async () => {
    const venster = await openDetail();

    await userEvent.click(within(rijMet(venster, '0 9 * * 1')).getByTitle('common.edit'));

    const cronVeld = within(venster).getByDisplayValue('0 9 * * 1');
    await userEvent.clear(cronVeld);
    await userEvent.type(cronVeld, '0 18 * * 5');
    await userEvent.click(within(venster).getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(workflowApi.updateWorkflowTrigger).toHaveBeenCalled());
    const [workflowId, triggerId, wijzigingen] = vi.mocked(workflowApi.updateWorkflowTrigger).mock.calls[0];
    expect(workflowId).toBe('wf-1');
    expect(triggerId).toBe('trig-1');
    expect(wijzigingen).toMatchObject({ triggerType: 'schedule', scheduleCron: '0 18 * * 5' });
  });

  it('verwijdert een trigger na bevestiging', async () => {
    const venster = await openDetail();

    await userEvent.click(within(rijMet(venster, 'rehearsal.created')).getByTitle('common.delete'));

    await waitFor(() => expect(workflowApi.removeWorkflowTrigger).toHaveBeenCalledWith('wf-1', 'trig-2'));
  });

  it('verwijdert geen trigger als de bevestiging geweigerd wordt', async () => {
    bevestiging.antwoord = false;
    const venster = await openDetail();

    await userEvent.click(within(rijMet(venster, 'rehearsal.created')).getByTitle('common.delete'));

    await waitFor(() => expect(workflowApi.removeWorkflowTrigger).not.toHaveBeenCalled());
  });

  it('voegt een actie toe met de ingevulde instellingen', async () => {
    const venster = await openDetail();

    await userEvent.click(within(venster).getByRole('button', { name: /workflows\.addAction/ }));
    await userEvent.selectOptions(
      within(venster).getByDisplayValue('workflows.actionType.send_notification'),
      'webhook',
    );
    await userEvent.type(within(venster).getByRole('textbox'), 'https://voorbeeld.test/haak');
    await userEvent.click(within(venster).getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(workflowApi.addWorkflowAction).toHaveBeenCalled());
    const [workflowId, gegevens] = vi.mocked(workflowApi.addWorkflowAction).mock.calls[0];
    expect(workflowId).toBe('wf-1');
    expect(gegevens).toMatchObject({
      actionType: 'webhook',
      actionOrder: 1,
      config: { url: 'https://voorbeeld.test/haak' },
    });
  });

  it('bewerkt een bestaande actie', async () => {
    const venster = await openDetail();

    await userEvent.click(within(rijMet(venster, 'workflows.actionType.send_notification')).getByTitle('common.edit'));
    await userEvent.type(within(venster).getByRole('textbox'), 'Vergeet de repetitie niet');
    await userEvent.click(within(venster).getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(workflowApi.updateWorkflowAction).toHaveBeenCalled());
    const [workflowId, actionId, wijzigingen] = vi.mocked(workflowApi.updateWorkflowAction).mock.calls[0];
    expect(workflowId).toBe('wf-1');
    expect(actionId).toBe('act-1');
    expect(wijzigingen).toMatchObject({ config: { message: 'Vergeet de repetitie niet' } });
  });

  it('verwijdert een actie na bevestiging', async () => {
    const venster = await openDetail();

    await userEvent.click(
      within(rijMet(venster, 'workflows.actionType.send_notification')).getByTitle('common.delete'),
    );

    await waitFor(() => expect(workflowApi.removeWorkflowAction).toHaveBeenCalledWith('wf-1', 'act-1'));
  });

  it('verwijdert de workflow na bevestiging', async () => {
    const venster = await openDetail();

    await userEvent.click(within(voetbalk(venster)).getByRole('button', { name: /common\.delete/ }));

    await waitFor(() => expect(workflowApi.deleteWorkflow).toHaveBeenCalled());
    expect(vi.mocked(workflowApi.deleteWorkflow).mock.calls[0][0]).toBe('wf-1');
  });

  it('verwijdert de workflow niet als de bevestiging geweigerd wordt', async () => {
    bevestiging.antwoord = false;
    const venster = await openDetail();

    await userEvent.click(within(voetbalk(venster)).getByRole('button', { name: /common\.delete/ }));

    await waitFor(() => expect(workflowApi.deleteWorkflow).not.toHaveBeenCalled());
  });
});

describe('workflowpagina - uitvoeringen', () => {
  it('haalt de uitvoeringen pas op als het overzicht geopend wordt', async () => {
    const venster = await openDetail();

    expect(workflowApi.getWorkflowExecutions).not.toHaveBeenCalled();

    await userEvent.click(within(venster).getByRole('button', { name: /workflows\.viewExecutions/ }));

    await waitFor(() => expect(workflowApi.getWorkflowExecutions).toHaveBeenCalledWith('wf-1'));
    expect(await screen.findByText('workflows.status.completed')).toBeInTheDocument();
    expect(screen.getByText('workflows.status.failed')).toBeInTheDocument();
    expect(screen.getByText('Mailserver weigerde de verbinding')).toBeInTheDocument();
  });

  it('meldt het als er nog geen uitvoeringen zijn', async () => {
    vi.mocked(workflowApi.getWorkflowExecutions).mockResolvedValue({ executions: [], total: 0, limit: 50, offset: 0 });

    const venster = await openDetail();
    await userEvent.click(within(venster).getByRole('button', { name: /workflows\.viewExecutions/ }));

    expect(await screen.findByText('workflows.noExecutions')).toBeInTheDocument();
  });
});

describe('workflowpagina - een workflow aanmaken', () => {
  async function openAanmaken(): Promise<HTMLElement> {
    render(<Workflows />, { wrapper: wikkel });
    await screen.findByText('Herinnering repetitie');
    await userEvent.click(screen.getByRole('button', { name: /workflows\.add/ }));
    return screen.findByRole('dialog');
  }

  it('verstuurt niets zolang de verplichte naam leeg is', async () => {
    const venster = await openAanmaken();

    await userEvent.click(within(venster).getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(workflowApi.createWorkflow).not.toHaveBeenCalled());
    expect(within(venster).getAllByRole('textbox')[0]).toBeInvalid();
  });

  it('stuurt naam, trigger en actie naar de server', async () => {
    const venster = await openAanmaken();

    const velden = within(venster).getAllByRole('textbox');
    await userEvent.type(velden[0], 'Verjaardagsmail');
    await userEvent.type(velden[1], 'Feliciteert leden op hun verjaardag');
    await userEvent.selectOptions(within(venster).getByDisplayValue('workflows.triggerType.manual'), 'schedule');
    await userEvent.selectOptions(
      within(venster).getByDisplayValue('workflows.actionType.send_notification'),
      'send_email',
    );
    await userEvent.click(within(venster).getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(workflowApi.createWorkflow).toHaveBeenCalled());
    expect(vi.mocked(workflowApi.createWorkflow).mock.calls[0][0]).toMatchObject({
      name: 'Verjaardagsmail',
      description: 'Feliciteert leden op hun verjaardag',
      isActive: true,
      triggers: [{ triggerType: 'schedule' }],
      actions: [{ actionType: 'send_email', actionOrder: 0 }],
    });
  });

  it('sluit het venster met annuleren zonder iets te versturen', async () => {
    const venster = await openAanmaken();

    await userEvent.click(within(venster).getByRole('button', { name: 'common.cancel' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(workflowApi.createWorkflow).not.toHaveBeenCalled();
  });
});
