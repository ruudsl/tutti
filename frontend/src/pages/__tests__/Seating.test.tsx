/**
 * Tests voor de opstellingspagina.
 *
 * Deze pagina was nog nooit getest. De tests hieronder lopen de hoofdweg af
 * zoals een gebruiker hem ziet: het orkest kiezen, de opstelling bekijken, en
 * als beheerder secties en toewijzingen beheren.
 *
 * Wat hier bewust vastligt:
 *   - Wie welke tabbladen ziet. Alleen beheer, muziekcommissie en dirigent
 *     krijgen de bewerk-, instel-, toewijzings- en meldingstabbladen. Een
 *     gewoon lid ziet enkel de opstelling.
 *   - Dat er zonder gekozen orkest niets opgehaald wordt. De drie
 *     orkestafhankelijke queries staan op `enabled`; raakt die voorwaarde zoek,
 *     dan gaan er bij het openen verzoeken uit met een leeg orkest-id.
 *   - De uitgeschakelde knop "toewijzing toevoegen". Zonder secties of zonder
 *     leden die nog geen stoel hebben valt er niets toe te wijzen, en dan hoort
 *     de knop niet te werken.
 *   - Dat een mislukt verzoek een melding geeft en de pagina blijft staan.
 *
 * De componenten SeatingEditor, SeatingChartVisualization en
 * SeatingNotificationSettings zijn hier vervangen door stand-ins. Deze tests
 * gaan over de pagina, niet over wat die drie tekenen.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// `delay: null` zet de wachttijd tussen toetsaanslagen uit. Met de standaard
// vertraging tikt userEvent teken voor teken met een pauze ertussen, en dan
// lopen de langere formuliertests op een belaste machine over de tijdslimiet
// van vijf seconden heen. Het gedrag dat getest wordt verandert er niet door.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import Seating from '../Seating';
import type { Instrument, Orchestra, SeatingAssignment, SeatingChart, SeatingSection, User } from '../../types';

vi.mock('../../api', () => ({
  getOrchestras: vi.fn(),
  getUsers: vi.fn(),
  getInstruments: vi.fn(),
  getSeatingSections: vi.fn(),
  getSeatingAssignments: vi.fn(),
  getSeatingChart: vi.fn(),
  createDefaultSeatingLayout: vi.fn(),
  deleteAllSeatingSections: vi.fn(),
  createSeatingSection: vi.fn(),
  updateSeatingSection: vi.fn(),
  deleteSeatingSection: vi.fn(),
  createSeatingAssignment: vi.fn(),
  deleteSeatingAssignment: vi.fn(),
  bulkUpdateSeatingAssignments: vi.fn(),
}));

vi.mock('../../hooks/useDocumentTitle', () => ({ useDocumentTitle: () => {} }));

// De bevestigingsvraag; per test bepalen we of de gebruiker ja of nee zegt.
const bevestig = vi.fn<(vraag: unknown) => Promise<boolean>>();
vi.mock('../../hooks/useConfirm', () => ({ useConfirm: () => bevestig }));

const huidigeGebruiker: { rol: string } = { rol: 'admin' };
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u-admin', role: huidigeGebruiker.rol } }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (sleutel: string) => sleutel }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('../../utils/toast', () => ({ showSuccess: vi.fn(), showError: vi.fn() }));

vi.mock('../../components/Skeleton', () => ({
  SkeletonTable: () => <div data-testid="skelet-tabel" />,
}));

vi.mock('../../components/SeatingChartVisualization', () => ({
  default: ({ chart }: { chart: SeatingChart }) => (
    <div data-testid="opstellingstekening">{chart.seats.map((s) => s.memberName).join(' | ')}</div>
  ),
}));

// De stand-in voor de bewerker biedt alleen de ene knop die de pagina raakt:
// het opslaan van een nieuwe indeling.
vi.mock('../../components/SeatingEditor', () => ({
  default: ({
    onSave,
  }: {
    onSave: (a: { userId: string; sectionId: string; positionInSection: number }[]) => void;
  }) => (
    <button onClick={() => onSave([{ userId: 'u-2', sectionId: 'sec-1', positionInSection: 0 }])}>
      bewerker-opslaan
    </button>
  ),
}));

vi.mock('../../components/SeatingNotificationSettings', () => ({
  default: ({ orchestraId }: { orchestraId: string }) => <div data-testid="meldingen">{orchestraId}</div>,
}));

import * as api from '../../api';
import { showError, showSuccess } from '../../utils/toast';

const ORKESTEN: Orchestra[] = [
  { id: 'orch-1', name: 'Harmonie' },
  { id: 'orch-2', name: 'Jeugdorkest' },
];

const INSTRUMENTEN: Instrument[] = [
  { id: 'instr-1', name: 'Klarinet', tuning: 'Bes' },
  { id: 'instr-2', name: 'Trompet', tuning: null },
];

const SECTIES: SeatingSection[] = [
  {
    id: 'sec-1',
    name: 'Klarinetten',
    rowNumber: 1,
    sortOrder: 0,
    instruments: [{ id: 'instr-1', name: 'Klarinet', tuning: 'Bes', sortOrder: 0 }],
    createdAt: '2026-01-01',
  },
  { id: 'sec-2', name: 'Trompetten', rowNumber: 2, sortOrder: 1, instruments: [], createdAt: '2026-01-01' },
];

const TOEWIJZINGEN: SeatingAssignment[] = [
  {
    id: 'toe-1',
    userId: 'u-1',
    userName: 'Anna Bakker',
    userEmail: 'anna@example.com',
    sectionId: 'sec-1',
    sectionName: 'Klarinetten',
    rowNumber: 1,
    positionInSection: 0,
    seatLabel: 'A1',
    instruments: 'Klarinet',
    notes: null,
  },
];

function maakGebruiker(overschrijving: Partial<User> = {}): User {
  return {
    id: 'u-1',
    email: 'anna@example.com',
    firstName: 'Anna',
    lastName: 'Bakker',
    role: 'member',
    associationId: 'ver-1',
    orchestras: [{ id: 'orch-1', name: 'Harmonie' }],
    instruments: [{ id: 'instr-1', name: 'Klarinet', tuning: 'Bes' }],
    ...overschrijving,
  };
}

const LEDEN: User[] = [
  maakGebruiker(),
  maakGebruiker({ id: 'u-2', firstName: 'Bram', lastName: 'de Vries', email: 'bram@example.com' }),
  // Dit lid zit in een ander orkest en hoort dus niet in de keuzelijst.
  maakGebruiker({
    id: 'u-3',
    firstName: 'Carla',
    lastName: 'Jansen',
    email: 'carla@example.com',
    orchestras: [{ id: 'orch-2', name: 'Jeugdorkest' }],
  }),
];

const LEGE_KAART: SeatingChart = {
  orchestraId: 'orch-1',
  orchestraName: 'Harmonie',
  sections: [],
  seats: [],
  totalRows: 0,
};

function zetApiKlaar(): void {
  vi.mocked(api.getOrchestras).mockResolvedValue(ORKESTEN);
  vi.mocked(api.getUsers).mockResolvedValue(LEDEN);
  vi.mocked(api.getInstruments).mockResolvedValue(INSTRUMENTEN);
  vi.mocked(api.getSeatingSections).mockResolvedValue(SECTIES);
  vi.mocked(api.getSeatingAssignments).mockResolvedValue(TOEWIJZINGEN);
  vi.mocked(api.getSeatingChart).mockResolvedValue(LEGE_KAART);
  vi.mocked(api.createDefaultSeatingLayout).mockResolvedValue({ message: 'ok' });
  vi.mocked(api.deleteAllSeatingSections).mockResolvedValue({ message: 'ok' });
  vi.mocked(api.createSeatingSection).mockResolvedValue({ id: 'sec-3', message: 'ok' });
  vi.mocked(api.updateSeatingSection).mockResolvedValue({ message: 'ok' });
  vi.mocked(api.deleteSeatingSection).mockResolvedValue({ message: 'ok' });
  vi.mocked(api.createSeatingAssignment).mockResolvedValue({ id: 'toe-2', message: 'ok' });
  vi.mocked(api.deleteSeatingAssignment).mockResolvedValue({ message: 'ok' });
  vi.mocked(api.bulkUpdateSeatingAssignments).mockResolvedValue({ message: 'ok' });
}

function wikkel({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** Tekent de pagina en wacht tot de orkesten binnen zijn. */
async function toonPagina() {
  render(<Seating />, { wrapper: wikkel });
  await screen.findByRole('option', { name: 'Harmonie' });
}

async function gaNaarTabblad(gebruiker: ReturnType<typeof userEvent.setup>, sleutel: string) {
  await gebruiker.click(screen.getByRole('button', { name: `seating.tabs.${sleutel}` }));
}

beforeEach(() => {
  vi.clearAllMocks();
  huidigeGebruiker.rol = 'admin';
  bevestig.mockResolvedValue(true);
  zetApiKlaar();
});

describe('opstellingspagina - openen en orkestkeuze', () => {
  it('toont een skelet zolang de orkesten nog laden', async () => {
    let losmaken: (o: Orchestra[]) => void = () => {};
    vi.mocked(api.getOrchestras).mockReturnValue(
      new Promise<Orchestra[]>((resolve) => {
        losmaken = resolve;
      }),
    );

    render(<Seating />, { wrapper: wikkel });

    expect(await screen.findByTestId('skelet-tabel')).toBeInTheDocument();

    losmaken(ORKESTEN);
    await waitFor(() => expect(screen.queryByTestId('skelet-tabel')).not.toBeInTheDocument());
  });

  it('toont de orkesten die de server stuurt en kiest het eerste', async () => {
    await toonPagina();

    const keuzelijst = screen.getByLabelText('seating.selectOrchestra') as HTMLSelectElement;
    expect(
      within(keuzelijst)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Harmonie', 'Jeugdorkest']);
    await waitFor(() => expect(keuzelijst.value).toBe('orch-1'));
  });

  it('haalt de gegevens van het gekozen orkest op, en van geen ander', async () => {
    await toonPagina();

    await waitFor(() => expect(api.getSeatingSections).toHaveBeenCalledWith('orch-1'));
    expect(api.getSeatingAssignments).toHaveBeenCalledWith('orch-1');
    expect(api.getSeatingChart).toHaveBeenCalledWith('orch-1');
    expect(api.getSeatingSections).not.toHaveBeenCalledWith('');
  });

  it('vraagt zonder orkesten helemaal niets op', async () => {
    vi.mocked(api.getOrchestras).mockResolvedValue([]);

    render(<Seating />, { wrapper: wikkel });
    await waitFor(() => expect(api.getOrchestras).toHaveBeenCalled());

    // Zonder gekozen orkest staan de drie orkestqueries uit.
    expect(api.getSeatingSections).not.toHaveBeenCalled();
    expect(api.getSeatingAssignments).not.toHaveBeenCalled();
    expect(api.getSeatingChart).not.toHaveBeenCalled();
  });

  it('haalt na het wisselen van orkest de gegevens van het nieuwe orkest op', async () => {
    const gebruiker = userEvent.setup({ delay: null });
    await toonPagina();
    await waitFor(() => expect(api.getSeatingSections).toHaveBeenCalledWith('orch-1'));

    await gebruiker.selectOptions(screen.getByLabelText('seating.selectOrchestra'), 'orch-2');

    await waitFor(() => expect(api.getSeatingSections).toHaveBeenCalledWith('orch-2'));
    expect(api.getSeatingChart).toHaveBeenCalledWith('orch-2');
  });
});

describe('opstellingspagina - het opstellingstabblad', () => {
  it('tekent de opstelling die de server stuurt', async () => {
    vi.mocked(api.getSeatingChart).mockResolvedValue({
      ...LEGE_KAART,
      seats: [
        {
          id: 'st-1',
          userId: 'u-1',
          memberName: 'Anna Bakker',
          instrumentName: 'Klarinet',
          rowNumber: 1,
          positionInRow: 0,
          sectionName: 'Klarinetten',
        },
      ],
      totalRows: 1,
    });

    await toonPagina();

    expect(await screen.findByTestId('opstellingstekening')).toHaveTextContent('Anna Bakker');
  });

  it('toont de lege staat met een aanmaakknop als er nog geen secties zijn', async () => {
    vi.mocked(api.getSeatingSections).mockResolvedValue([]);

    await toonPagina();

    expect(await screen.findByText('seating.noSections')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'seating.createDefaultLayout' })).toBeInTheDocument();
  });

  it('toont "nog geen toewijzingen" als er wel secties maar geen stoelen zijn', async () => {
    await toonPagina();

    expect(await screen.findByText('seating.noAssignments')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'seating.createDefaultLayout' })).not.toBeInTheDocument();
  });

  it('maakt de standaardindeling aan en meldt dat', async () => {
    const gebruiker = userEvent.setup({ delay: null });
    vi.mocked(api.getSeatingSections).mockResolvedValue([]);
    await toonPagina();

    await gebruiker.click(await screen.findByRole('button', { name: 'seating.createDefaultLayout' }));

    await waitFor(() => expect(api.createDefaultSeatingLayout).toHaveBeenCalledWith('orch-1'));
    expect(showSuccess).toHaveBeenCalledWith('seating.defaultLayoutCreated');
  });

  it('toont een melding en geen witte pagina als het aanmaken mislukt', async () => {
    const gebruiker = userEvent.setup({ delay: null });
    vi.mocked(api.getSeatingSections).mockResolvedValue([]);
    vi.mocked(api.createDefaultSeatingLayout).mockRejectedValue({
      response: { data: { error: 'Er bestaat al een indeling' } },
    });
    await toonPagina();

    await gebruiker.click(await screen.findByRole('button', { name: 'seating.createDefaultLayout' }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('Er bestaat al een indeling'));
    expect(screen.getByRole('heading', { level: 1, name: 'seating.title' })).toBeInTheDocument();
  });

  it('valt bij een fout zonder tekst terug op de algemene foutmelding', async () => {
    const gebruiker = userEvent.setup({ delay: null });
    vi.mocked(api.getSeatingSections).mockResolvedValue([]);
    vi.mocked(api.createDefaultSeatingLayout).mockRejectedValue(new Error('netwerk weg'));
    await toonPagina();

    await gebruiker.click(await screen.findByRole('button', { name: 'seating.createDefaultLayout' }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('common.error'));
  });
});

describe('opstellingspagina - wie welke tabbladen ziet', () => {
  it('laat een gewoon lid alleen de opstelling zien', async () => {
    huidigeGebruiker.rol = 'member';
    await toonPagina();

    expect(screen.getByRole('button', { name: 'seating.tabs.chart' })).toBeInTheDocument();
    for (const sleutel of ['editor', 'config', 'assignments', 'notifications']) {
      expect(screen.queryByRole('button', { name: `seating.tabs.${sleutel}` })).not.toBeInTheDocument();
    }
  });

  it('haalt voor een gewoon lid geen ledenlijst en geen instrumenten op', async () => {
    huidigeGebruiker.rol = 'member';
    await toonPagina();
    await waitFor(() => expect(api.getSeatingSections).toHaveBeenCalled());

    expect(api.getUsers).not.toHaveBeenCalled();
    expect(api.getInstruments).not.toHaveBeenCalled();
  });

  it('laat een gewoon lid zonder secties geen standaardindeling aanmaken', async () => {
    huidigeGebruiker.rol = 'member';
    vi.mocked(api.getSeatingSections).mockResolvedValue([]);
    await toonPagina();

    expect(await screen.findByText('seating.noSections')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'seating.createDefaultLayout' })).not.toBeInTheDocument();
  });

  it.each(['admin', 'music_committee', 'conductor'])('geeft %s de beheertabbladen', async (rol) => {
    huidigeGebruiker.rol = rol;
    await toonPagina();

    expect(screen.getByRole('button', { name: 'seating.tabs.config' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'seating.tabs.assignments' })).toBeInTheDocument();
  });
});

describe('opstellingspagina - secties beheren', () => {
  it('toont de secties met hun instrumenten in een tabel', async () => {
    const gebruiker = userEvent.setup({ delay: null });
    await toonPagina();
    await gaNaarTabblad(gebruiker, 'config');

    const rijen = await screen.findAllByRole('row');
    expect(within(rijen[1]).getByText('Klarinetten')).toBeInTheDocument();
    expect(within(rijen[1]).getByText('Klarinet')).toBeInTheDocument();
    // Een sectie zonder instrumenten toont een streepje, geen lege cel.
    expect(within(rijen[2]).getByText('-')).toBeInTheDocument();
  });

  it('toont de lege staat als er geen secties zijn', async () => {
    const gebruiker = userEvent.setup({ delay: null });
    vi.mocked(api.getSeatingSections).mockResolvedValue([]);
    await toonPagina();
    await gaNaarTabblad(gebruiker, 'config');

    expect(screen.getByText('seating.noSections')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    // Zonder secties valt er niets te verwijderen.
    expect(screen.queryByRole('button', { name: 'seating.deleteAllSections' })).not.toBeInTheDocument();
  });

  it('maakt een nieuwe sectie aan met de volgende rij als voorstel', async () => {
    const gebruiker = userEvent.setup({ delay: null });
    await toonPagina();
    await gaNaarTabblad(gebruiker, 'config');
    await gebruiker.click(await screen.findByRole('button', { name: 'seating.addSection' }));

    expect(screen.getByLabelText('seating.rowNumber')).toHaveValue(3);
    await gebruiker.type(screen.getByLabelText('seating.sectionName'), 'Hoorns');
    await gebruiker.click(screen.getByLabelText(/Trompet/));
    await gebruiker.click(screen.getByRole('button', { name: 'common.save' }));

    await waitFor(() =>
      expect(api.createSeatingSection).toHaveBeenCalledWith({
        orchestraId: 'orch-1',
        name: 'Hoorns',
        rowNumber: 3,
        instrumentIds: ['instr-2'],
      }),
    );
    expect(showSuccess).toHaveBeenCalledWith('seating.sectionCreated');
    await waitFor(() => expect(screen.queryByLabelText('seating.sectionName')).not.toBeInTheDocument());
  });

  it('vult bij bewerken het formulier met de bestaande sectie en werkt hem bij', async () => {
    const gebruiker = userEvent.setup({ delay: null });
    await toonPagina();
    await gaNaarTabblad(gebruiker, 'config');

    const rijen = await screen.findAllByRole('row');
    await gebruiker.click(within(rijen[1]).getByRole('button', { name: 'common.edit' }));

    expect(screen.getByLabelText('seating.sectionName')).toHaveValue('Klarinetten');
    expect(screen.getByLabelText('seating.rowNumber')).toHaveValue(1);
    expect(screen.getByLabelText(/Klarinet \(Bes\)/)).toBeChecked();

    // Het instrument er weer afhalen en opslaan.
    await gebruiker.click(screen.getByLabelText(/Klarinet \(Bes\)/));
    await gebruiker.click(screen.getByRole('button', { name: 'common.save' }));

    await waitFor(() =>
      expect(api.updateSeatingSection).toHaveBeenCalledWith('sec-1', {
        name: 'Klarinetten',
        rowNumber: 1,
        instrumentIds: [],
      }),
    );
    expect(api.createSeatingSection).not.toHaveBeenCalled();
    expect(showSuccess).toHaveBeenCalledWith('seating.sectionUpdated');
  });

  it('meldt het als het opslaan van een sectie mislukt en houdt het formulier open', async () => {
    const gebruiker = userEvent.setup({ delay: null });
    vi.mocked(api.createSeatingSection).mockRejectedValue({ response: { data: { error: 'Naam bestaat al' } } });
    await toonPagina();
    await gaNaarTabblad(gebruiker, 'config');
    await gebruiker.click(await screen.findByRole('button', { name: 'seating.addSection' }));
    await gebruiker.type(screen.getByLabelText('seating.sectionName'), 'Hoorns');
    await gebruiker.click(screen.getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('Naam bestaat al'));
    expect(screen.getByLabelText('seating.sectionName')).toHaveValue('Hoorns');
  });

  it('sluit het sectieformulier zonder op te slaan bij annuleren', async () => {
    const gebruiker = userEvent.setup({ delay: null });
    await toonPagina();
    await gaNaarTabblad(gebruiker, 'config');
    await gebruiker.click(await screen.findByRole('button', { name: 'seating.addSection' }));
    await gebruiker.click(screen.getByRole('button', { name: 'common.cancel' }));

    expect(screen.queryByLabelText('seating.sectionName')).not.toBeInTheDocument();
    expect(api.createSeatingSection).not.toHaveBeenCalled();
  });

  it('verwijdert een sectie pas na bevestiging', async () => {
    const gebruiker = userEvent.setup({ delay: null });
    bevestig.mockResolvedValue(false);
    await toonPagina();
    await gaNaarTabblad(gebruiker, 'config');

    const rijen = await screen.findAllByRole('row');
    await gebruiker.click(within(rijen[1]).getByRole('button', { name: 'common.delete' }));

    await waitFor(() => expect(bevestig).toHaveBeenCalledWith('seating.confirmDeleteSection'));
    expect(api.deleteSeatingSection).not.toHaveBeenCalled();

    bevestig.mockResolvedValue(true);
    await gebruiker.click(within(rijen[1]).getByRole('button', { name: 'common.delete' }));

    await waitFor(() => expect(api.deleteSeatingSection).toHaveBeenCalledWith('sec-1'));
    expect(showSuccess).toHaveBeenCalledWith('seating.sectionDeleted');
  });

  it('verwijdert alle secties pas na bevestiging', async () => {
    const gebruiker = userEvent.setup({ delay: null });
    bevestig.mockResolvedValue(false);
    await toonPagina();
    await gaNaarTabblad(gebruiker, 'config');

    const knop = await screen.findByRole('button', { name: 'seating.deleteAllSections' });
    await gebruiker.click(knop);

    await waitFor(() => expect(bevestig).toHaveBeenCalledWith('seating.confirmDeleteAllSections'));
    expect(api.deleteAllSeatingSections).not.toHaveBeenCalled();

    bevestig.mockResolvedValue(true);
    await gebruiker.click(knop);

    await waitFor(() => expect(api.deleteAllSeatingSections).toHaveBeenCalledWith('orch-1'));
  });

  it('meldt het als het verwijderen van alle secties mislukt', async () => {
    const gebruiker = userEvent.setup({ delay: null });
    vi.mocked(api.deleteAllSeatingSections).mockRejectedValue({ response: { data: { error: 'Mag niet' } } });
    await toonPagina();
    await gaNaarTabblad(gebruiker, 'config');
    await gebruiker.click(await screen.findByRole('button', { name: 'seating.deleteAllSections' }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('Mag niet'));
  });
});

describe('opstellingspagina - toewijzingen', () => {
  it('toont de toewijzingen die de server stuurt', async () => {
    const gebruiker = userEvent.setup({ delay: null });
    await toonPagina();
    await gaNaarTabblad(gebruiker, 'assignments');

    const rijen = await screen.findAllByRole('row');
    expect(within(rijen[1]).getByText('Anna Bakker')).toBeInTheDocument();
    expect(within(rijen[1]).getByText('Klarinetten')).toBeInTheDocument();
    // De positie telt in de weergave vanaf 1, in de gegevens vanaf 0.
    expect(within(rijen[1]).getByText('1')).toBeInTheDocument();
    expect(within(rijen[1]).getByText('A1')).toBeInTheDocument();
  });

  it('toont de lege staat als er nog geen toewijzingen zijn', async () => {
    const gebruiker = userEvent.setup({ delay: null });
    vi.mocked(api.getSeatingAssignments).mockResolvedValue([]);
    await toonPagina();
    await gaNaarTabblad(gebruiker, 'assignments');

    expect(await screen.findByText('seating.noAssignments')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('meldt dat er eerst secties moeten zijn voordat er toegewezen kan worden', async () => {
    const gebruiker = userEvent.setup({ delay: null });
    vi.mocked(api.getSeatingSections).mockResolvedValue([]);
    vi.mocked(api.getSeatingAssignments).mockResolvedValue([]);
    await toonPagina();
    await gaNaarTabblad(gebruiker, 'assignments');

    expect(await screen.findByText('seating.noSectionsForAssignment')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'seating.addAssignment' })).toBeDisabled();
  });

  it('laat toevoegen niet toe als er niemand meer over is om toe te wijzen', async () => {
    const gebruiker = userEvent.setup({ delay: null });
    // Alle drie de leden zitten in orch-2, dus voor orch-1 blijft er niemand over.
    vi.mocked(api.getUsers).mockResolvedValue(
      LEDEN.map((l) => ({ ...l, orchestras: [{ id: 'orch-2', name: 'Jeugdorkest' }] })),
    );
    await toonPagina();
    await gaNaarTabblad(gebruiker, 'assignments');

    await waitFor(() => expect(screen.getByRole('button', { name: 'seating.addAssignment' })).toBeDisabled());
  });

  it('biedt alleen leden van dit orkest aan die nog geen stoel hebben', async () => {
    const gebruiker = userEvent.setup({ delay: null });
    await toonPagina();
    await gaNaarTabblad(gebruiker, 'assignments');

    const toevoegen = screen.getByRole('button', { name: 'seating.addAssignment' });
    await waitFor(() => expect(toevoegen).toBeEnabled());
    await gebruiker.click(toevoegen);

    const ledenlijst = screen.getByLabelText('seating.member');
    const namen = within(ledenlijst)
      .getAllByRole('option')
      .map((o) => o.textContent);
    // Anna heeft al stoel A1 en Carla zit in het jeugdorkest.
    expect(namen).toHaveLength(2);
    expect(namen[1]).toContain('Bram de Vries');
    expect(namen.join(' ')).not.toContain('Anna');
    expect(namen.join(' ')).not.toContain('Carla');
  });

  it('slaat een nieuwe toewijzing op', async () => {
    const gebruiker = userEvent.setup({ delay: null });
    await toonPagina();
    await gaNaarTabblad(gebruiker, 'assignments');

    const toevoegen = screen.getByRole('button', { name: 'seating.addAssignment' });
    await waitFor(() => expect(toevoegen).toBeEnabled());
    await gebruiker.click(toevoegen);

    await gebruiker.selectOptions(screen.getByLabelText('seating.member'), 'u-2');
    await gebruiker.selectOptions(screen.getByLabelText('seating.section'), 'sec-2');
    await gebruiker.type(screen.getByLabelText('seating.seatLabel'), 'B3');
    await gebruiker.type(screen.getByLabelText('seating.notes'), 'zit graag links');
    await gebruiker.click(screen.getByRole('button', { name: 'common.save' }));

    await waitFor(() =>
      expect(api.createSeatingAssignment).toHaveBeenCalledWith({
        orchestraId: 'orch-1',
        userId: 'u-2',
        sectionId: 'sec-2',
        positionInSection: 0,
        seatLabel: 'B3',
        notes: 'zit graag links',
      }),
    );
    expect(showSuccess).toHaveBeenCalledWith('seating.assignmentCreated');
  });

  it('laat stoelnummer en notitie weg als ze leeg blijven', async () => {
    const gebruiker = userEvent.setup({ delay: null });
    await toonPagina();
    await gaNaarTabblad(gebruiker, 'assignments');

    const toevoegen = screen.getByRole('button', { name: 'seating.addAssignment' });
    await waitFor(() => expect(toevoegen).toBeEnabled());
    await gebruiker.click(toevoegen);

    await gebruiker.selectOptions(screen.getByLabelText('seating.member'), 'u-2');
    await gebruiker.selectOptions(screen.getByLabelText('seating.section'), 'sec-1');
    await gebruiker.click(screen.getByRole('button', { name: 'common.save' }));

    await waitFor(() =>
      expect(api.createSeatingAssignment).toHaveBeenCalledWith(
        expect.objectContaining({ seatLabel: undefined, notes: undefined }),
      ),
    );
  });

  it('meldt het als het opslaan van een toewijzing mislukt', async () => {
    const gebruiker = userEvent.setup({ delay: null });
    vi.mocked(api.createSeatingAssignment).mockRejectedValue({
      response: { data: { error: 'Die stoel is bezet' } },
    });
    await toonPagina();
    await gaNaarTabblad(gebruiker, 'assignments');

    const toevoegen = screen.getByRole('button', { name: 'seating.addAssignment' });
    await waitFor(() => expect(toevoegen).toBeEnabled());
    await gebruiker.click(toevoegen);
    await gebruiker.selectOptions(screen.getByLabelText('seating.member'), 'u-2');
    await gebruiker.selectOptions(screen.getByLabelText('seating.section'), 'sec-1');
    await gebruiker.click(screen.getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('Die stoel is bezet'));
  });

  it('sluit het toewijzingsformulier bij annuleren', async () => {
    const gebruiker = userEvent.setup({ delay: null });
    await toonPagina();
    await gaNaarTabblad(gebruiker, 'assignments');

    const toevoegen = screen.getByRole('button', { name: 'seating.addAssignment' });
    await waitFor(() => expect(toevoegen).toBeEnabled());
    await gebruiker.click(toevoegen);
    await gebruiker.click(screen.getByRole('button', { name: 'common.cancel' }));

    expect(screen.queryByLabelText('seating.member')).not.toBeInTheDocument();
    expect(api.createSeatingAssignment).not.toHaveBeenCalled();
  });

  it('verwijdert een toewijzing pas na bevestiging', async () => {
    const gebruiker = userEvent.setup({ delay: null });
    bevestig.mockResolvedValue(false);
    await toonPagina();
    await gaNaarTabblad(gebruiker, 'assignments');

    const rijen = await screen.findAllByRole('row');
    const verwijderen = within(rijen[1]).getByRole('button', { name: 'common.delete' });
    await gebruiker.click(verwijderen);

    await waitFor(() => expect(bevestig).toHaveBeenCalledWith('seating.confirmDeleteAssignment'));
    expect(api.deleteSeatingAssignment).not.toHaveBeenCalled();

    bevestig.mockResolvedValue(true);
    await gebruiker.click(verwijderen);

    await waitFor(() => expect(api.deleteSeatingAssignment).toHaveBeenCalledWith('toe-1'));
    expect(showSuccess).toHaveBeenCalledWith('seating.assignmentDeleted');
  });

  it('meldt het als het verwijderen van een toewijzing mislukt', async () => {
    const gebruiker = userEvent.setup({ delay: null });
    vi.mocked(api.deleteSeatingAssignment).mockRejectedValue({ response: { data: { error: 'Niet gelukt' } } });
    await toonPagina();
    await gaNaarTabblad(gebruiker, 'assignments');

    const rijen = await screen.findAllByRole('row');
    await gebruiker.click(within(rijen[1]).getByRole('button', { name: 'common.delete' }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('Niet gelukt'));
  });
});

describe('opstellingspagina - het bewerktabblad', () => {
  it('biedt zonder secties eerst het aanmaken van de standaardindeling aan', async () => {
    const gebruiker = userEvent.setup({ delay: null });
    vi.mocked(api.getSeatingSections).mockResolvedValue([]);
    await toonPagina();
    await gaNaarTabblad(gebruiker, 'editor');

    expect(await screen.findByText('seating.noSections')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'bewerker-opslaan' })).not.toBeInTheDocument();
  });

  it('slaat een indeling uit de bewerker in één keer op', async () => {
    const gebruiker = userEvent.setup({ delay: null });
    await toonPagina();
    await gaNaarTabblad(gebruiker, 'editor');

    await gebruiker.click(await screen.findByRole('button', { name: 'bewerker-opslaan' }));

    await waitFor(() =>
      expect(api.bulkUpdateSeatingAssignments).toHaveBeenCalledWith('orch-1', [
        { userId: 'u-2', sectionId: 'sec-1', positionInSection: 0 },
      ]),
    );
    expect(showSuccess).toHaveBeenCalledWith('seating.assignmentsSaved');
  });

  it('meldt het als het opslaan uit de bewerker mislukt', async () => {
    const gebruiker = userEvent.setup({ delay: null });
    vi.mocked(api.bulkUpdateSeatingAssignments).mockRejectedValue({
      response: { data: { error: 'Opslaan mislukt' } },
    });
    await toonPagina();
    await gaNaarTabblad(gebruiker, 'editor');
    await gebruiker.click(await screen.findByRole('button', { name: 'bewerker-opslaan' }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('Opslaan mislukt'));
  });
});

describe('opstellingspagina - het meldingentabblad', () => {
  it('geeft het gekozen orkest door aan de meldingsinstellingen', async () => {
    const gebruiker = userEvent.setup({ delay: null });
    await toonPagina();
    await gaNaarTabblad(gebruiker, 'notifications');

    expect(await screen.findByTestId('meldingen')).toHaveTextContent('orch-1');
  });
});
