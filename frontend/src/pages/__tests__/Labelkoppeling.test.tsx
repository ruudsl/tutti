/**
 * De formulierlabels van de repetitie-, oefen- en seizoensschermen zijn nu aan
 * hun invoerveld gekoppeld.
 *
 * Deze tests keuren wél iets goed - anders dan de vangnetten ernaast, die
 * vastleggen wat de pagina's deden. Elke test hieronder is rood tegen de code
 * van vóór de reparatie: daar stond het label lós naast het veld, zonder
 * `htmlFor` en zonder `id`. Een schermlezer kondigde dan "bewerkbaar veld" aan
 * zonder te zeggen wat erin moest, klikken op het label zette de aanwijzer niet
 * in het veld, en een test kon het veld niet op naam vinden.
 *
 * `getByLabelText` is daarom hier geen willekeurige zoekmethode maar de kern
 * van de test: hij vindt een veld alleen als de koppeling er echt is. Zoeken op
 * de omhullende `.form-group`, zoals de E2E-hulpfuncties nog doen, zou ook
 * slagen op de kapotte code en bewijst dus niets.
 *
 * De koppeling komt van `components/FormField`, die met `useId()` een id maakt,
 * dat op het kindveld zet en het label eraan hangt. Twee blokken op de
 * oefenpagina passen daar niet in - de duur staat in twee velden tegelijk en
 * onder het zoekveld hangt een resultatenlijst - en zijn met de hand
 * gekoppeld; ook díé staan hieronder, want met de hand is precies waar het
 * eerder misging.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { RehearsalForm } from '../Rehearsals/RehearsalForm';
import { RecurringForm } from '../Rehearsals/RecurringForm';
import { EMPTY_REHEARSAL_FORM } from '../Rehearsals/hulpfuncties';
import { WizardStapInfo } from '../SeasonPlanner/WizardStapInfo';
import { WizardStapRepetities } from '../SeasonPlanner/WizardStapRepetities';
import { SjabloonFormulier } from '../SeasonPlanner/SjabloonFormulier';
import { defaultWizardState } from '../SeasonPlanner/types';
import type { TemplateFormState } from '../SeasonPlanner/types';
import PracticeSchedules from '../PracticeSchedules';
import Practice from '../Practice';
import * as api from '../../api';
import type { SeasonTemplate } from '../../api';
import type { User } from '../../types';

vi.mock('../../api');

// `t` geeft de sleutel terug, dus de labels heten hier
// 'rehearsals.date' en niet 'Datum'. Dat is dezelfde afspraak als in de
// vangnetten hiernaast.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (sleutel: string) => sleutel, i18n: { language: 'nl' } }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('../../hooks/useDocumentTitle', () => ({ useDocumentTitle: () => {} }));
vi.mock('../../hooks/useConfirm', () => ({ useConfirm: () => async () => true }));

vi.mock('../../components/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

// De oefenpagina hangt aan een handvol zware onderdelen die niets met de
// labels te maken hebben.
vi.mock('../../components/PracticeTimer', () => ({ default: () => <div data-testid="oefenklok" /> }));
vi.mock('../../components/PracticeLogModal', () => ({ PracticeLogModal: () => <div data-testid="oefenlog" /> }));
vi.mock('../../components/AudioRecorder', () => ({ AudioRecorder: () => <div data-testid="opname" /> }));
vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: () => false }));

// De oefenschema's halen hun gegevens via eigen hooks op; die worden hier
// vervangen zodat de pagina meteen staat.
let ingelogdeGebruiker: User | null = null;
let schemaDetail: unknown = null;

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: ingelogdeGebruiker }),
}));

vi.mock('../../hooks/useOrchestras', () => ({
  useOrchestras: () => ({ data: [{ id: 'ork-1', name: 'Harmonie' }] }),
}));

vi.mock('../../hooks/useMusicTitles', () => ({
  useMusicTitles: () => ({ data: [{ id: 'stuk-1', title: 'Ouverture' }] }),
}));

const leegMutatieObject = { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false };

vi.mock('../../hooks/usePracticeSchedules', () => ({
  usePracticeSchedules: () => ({ data: schemaLijst, isLoading: false }),
  usePracticeSchedule: () => ({ data: schemaDetail, isLoading: false }),
  useCreatePracticeSchedule: () => leegMutatieObject,
  useDeletePracticeSchedule: () => leegMutatieObject,
  useAddMilestone: () => leegMutatieObject,
  useUpdateMilestone: () => leegMutatieObject,
  useDeleteMilestone: () => leegMutatieObject,
  useUpdateSectionProgress: () => leegMutatieObject,
  useInitializeSections: () => leegMutatieObject,
}));

const schemaLijst = [
  {
    id: 'schema-1',
    targetDate: '2026-05-01',
    priority: 2,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    musicTitle: { id: 'stuk-1', title: 'Ouverture' },
    orchestra: { id: 'ork-1', name: 'Harmonie' },
    createdBy: { name: 'Dirigent' },
    milestoneCount: 0,
    completedMilestones: 0,
    progress: 0,
  },
];

function wikkel({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** Het label wijst het veld aan én zet er de aanwijzer in als je erop klikt. */
async function verwachtGekoppeld(labeltekst: string) {
  const veld = screen.getByLabelText(labeltekst);
  expect(veld).toHaveAttribute('id');
  expect(screen.getByText(labeltekst)).toHaveAttribute('for', veld.getAttribute('id'));
  return veld;
}

beforeEach(() => {
  vi.clearAllMocks();
  ingelogdeGebruiker = {
    id: 'u1',
    email: 'beheerder@example.com',
    firstName: 'Bea',
    lastName: 'Heerder',
    role: 'admin',
    associationId: 'ver-1',
  };
  schemaDetail = null;
});

describe('RehearsalForm', () => {
  function toon() {
    render(
      <RehearsalForm
        form={EMPTY_REHEARSAL_FORM}
        setForm={vi.fn()}
        editingId={null}
        orchestras={[]}
        handleSaveRehearsal={vi.fn()}
        isSaving={false}
        confirmClose={(vervolg) => vervolg()}
        closeForm={vi.fn()}
      />,
    );
  }

  it('koppelt alle zeven velden van het repetitieformulier aan hun label', async () => {
    toon();

    for (const label of [
      'rehearsals.date',
      'rehearsals.startTime',
      'rehearsals.endTime',
      'rehearsals.location',
      'rehearsals.type',
      'rehearsals.orchestra',
      'rehearsals.notes',
    ]) {
      await verwachtGekoppeld(label);
    }
  });

  it('zet de aanwijzer in het datumveld als je op "datum" klikt', async () => {
    const gebruiker = userEvent.setup();
    toon();

    await gebruiker.click(screen.getByText('rehearsals.date'));

    expect(screen.getByLabelText('rehearsals.date')).toHaveFocus();
  });
});

describe('RecurringForm', () => {
  it('koppelt alle zeven velden van het reeksformulier aan hun label', async () => {
    render(
      <RecurringForm
        recurringForm={{
          dayOfWeek: 2,
          interval: 1,
          startTime: '19:30',
          endTime: '21:30',
          location: '',
          orchestraId: '',
          until: '',
        }}
        setRecurringForm={vi.fn()}
        orchestras={[]}
        recurringPreview={[]}
        setRecurringPreview={vi.fn()}
        recurringLoading={false}
        handleCreateRecurring={vi.fn()}
        setShowRecurring={vi.fn()}
      />,
    );

    for (const label of [
      'rehearsals.recurring.dayOfWeek',
      'rehearsals.recurring.interval',
      'rehearsals.startTime',
      'rehearsals.endTime',
      'rehearsals.location',
      'rehearsals.orchestra',
      'rehearsals.recurring.until',
    ]) {
      await verwachtGekoppeld(label);
    }
  });
});

describe('WizardStapInfo', () => {
  const sjabloon: SeasonTemplate = {
    id: 'sj-1',
    name: 'Standaardseizoen',
    description: null,
    defaultRehearsalDay: 2,
    defaultRehearsalTime: '19:30',
    defaultRehearsalDuration: 120,
    defaultRehearsalLocation: null,
    typicalConcertsCount: 2,
    templateData: null,
    createdBy: null,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  };

  it('koppelt de zes velden van stap 1 aan hun label', async () => {
    render(
      <WizardStapInfo
        wizardState={defaultWizardState}
        setWizardState={vi.fn()}
        templates={[sjabloon]}
        applyTemplate={vi.fn()}
      />,
    );

    // De sterretjes horen bij de labeltekst; wie ze wegpoetst breekt de
    // koppeling niet, maar wél deze test - en dat is precies de bedoeling.
    for (const label of [
      'seasonPlanner.fields.name *',
      'seasonPlanner.fields.startDate *',
      'seasonPlanner.fields.endDate *',
      'seasonPlanner.fields.template',
      'seasonPlanner.fields.budgetTotal',
      'common.notes',
    ]) {
      await verwachtGekoppeld(label);
    }
  });
});

describe('WizardStapRepetities', () => {
  it('koppelt de vijf velden van stap 2 aan hun label', async () => {
    render(
      <WizardStapRepetities
        wizardState={defaultWizardState}
        setWizardState={vi.fn()}
        orchestras={[]}
        rehearsalPreview={[]}
        toggleExcludeDate={vi.fn()}
      />,
    );

    for (const label of [
      'seasonPlanner.fields.rehearsalDay',
      'rehearsals.startTime',
      'rehearsals.endTime',
      'rehearsals.location',
      'rehearsals.orchestra',
    ]) {
      await verwachtGekoppeld(label);
    }
  });

  // Het vinkje "repetities genereren" staat ín zijn label en had de koppeling
  // dus al. Het is bewust niet naar FormField verhuisd; deze test bewaakt dat
  // het toch vindbaar blijft.
  it('laat het vinkje voor het genereren van repetities ongemoeid maar vindbaar', () => {
    render(
      <WizardStapRepetities
        wizardState={defaultWizardState}
        setWizardState={vi.fn()}
        orchestras={[]}
        rehearsalPreview={[]}
        toggleExcludeDate={vi.fn()}
      />,
    );

    const vinkje = screen.getByLabelText('seasonPlanner.fields.generateRehearsals');
    expect(vinkje).toHaveAttribute('type', 'checkbox');
  });
});

describe('SjabloonFormulier', () => {
  const sjabloonForm: TemplateFormState = {
    name: '',
    description: '',
    defaultRehearsalDay: 2,
    defaultRehearsalTime: '19:30',
    defaultRehearsalDuration: 120,
    defaultRehearsalLocation: '',
    typicalConcertsCount: 2,
  };

  it('koppelt de zes velden van het sjabloonformulier aan hun label', async () => {
    render(
      <SjabloonFormulier
        templateForm={sjabloonForm}
        setTemplateForm={vi.fn()}
        onOpslaan={vi.fn()}
        opslaanBezig={false}
        onAnnuleren={vi.fn()}
      />,
    );

    for (const label of [
      'common.name *',
      'common.description',
      'seasonPlanner.fields.defaultRehearsalDay',
      'seasonPlanner.fields.defaultRehearsalTime',
      'seasonPlanner.fields.typicalConcerts',
      'seasonPlanner.fields.defaultRehearsalLocation',
    ]) {
      await verwachtGekoppeld(label);
    }
  });
});

describe('PracticeSchedules', () => {
  it('koppelt de vijf velden van het nieuwe-schemaformulier aan hun label', async () => {
    const gebruiker = userEvent.setup();
    render(<PracticeSchedules />, { wrapper: wikkel });

    await gebruiker.click(screen.getByRole('button', { name: 'practiceSchedules.create' }));

    for (const label of [
      'music.title *',
      'common.orchestra *',
      'practiceSchedules.targetDate *',
      'practiceSchedules.priority',
      'common.notes',
    ]) {
      await verwachtGekoppeld(label);
    }
  });

  it('koppelt de drie velden van het mijlpaalformulier aan hun label', async () => {
    schemaDetail = { ...schemaLijst[0], milestones: [] };
    const gebruiker = userEvent.setup();
    render(<PracticeSchedules />, { wrapper: wikkel });

    await gebruiker.click(screen.getByText('Ouverture'));
    await gebruiker.click(screen.getByRole('button', { name: 'practiceSchedules.addMilestone' }));

    for (const label of ['common.title *', 'common.description', 'practiceSchedules.targetDate *']) {
      await verwachtGekoppeld(label);
    }
  });
});

describe('Practice', () => {
  beforeEach(() => {
    vi.mocked(api.getMusicTitles).mockResolvedValue([]);
    vi.mocked(api.getPracticeLogs).mockResolvedValue([]);
    vi.mocked(api.getPracticeStats).mockResolvedValue({
      totalMinutes: 0,
      weekMinutes: 0,
      monthMinutes: 0,
      currentStreak: 0,
      mostPracticed: [],
    });
    vi.mocked(api.getPracticeGoals).mockResolvedValue({ goals: [], progress: { daily: 0, weekly: 0 } });
  });

  it('koppelt de twee velden van het doelformulier aan hun label', async () => {
    const gebruiker = userEvent.setup();
    render(<Practice />, { wrapper: wikkel });

    await gebruiker.click(await screen.findByRole('button', { name: 'practice.setGoal' }));

    await verwachtGekoppeld('practice.goalType');
    await verwachtGekoppeld('practice.targetMinutes');
  });

  it('koppelt de velden van het oefenlogformulier aan hun label', async () => {
    const gebruiker = userEvent.setup();
    render(<Practice />, { wrapper: wikkel });

    await gebruiker.click(await screen.findByRole('button', { name: '+ practice.logSession' }));

    // 'practice.selectPiece' en 'practice.duration' zijn de twee blokken die
    // niet in FormField pasten en met de hand gekoppeld zijn. Het zoekveld is
    // een tekstveld, de duur wijst naar het getalveld naast de schuifregelaar.
    const zoekveld = await verwachtGekoppeld('practice.selectPiece');
    expect(zoekveld).toHaveAttribute('type', 'text');

    const duur = await verwachtGekoppeld('practice.duration');
    expect(duur).toHaveAttribute('type', 'number');

    await verwachtGekoppeld('practice.notes');
  });
});
