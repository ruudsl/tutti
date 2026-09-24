/**
 * De vensters van de apparatuurpagina.
 *
 * `Equipment.rollen.test.tsx` legt de rolbewaking en de foutstaat van de lijst
 * vast. Wat daar buiten viel is alles wat achter een knop zit: aanmaken,
 * bewerken, uitlenen, innemen, onderhoud vastleggen, schade melden, bijwerken
 * en verwijderen, en het detailvenster met zijn vier tabbladen. Dat is het
 * grootste deel van het bestand, en het is ook het deel waar een gebruiker
 * echt iets verandert.
 *
 * Deze tests gaan over wat een gebruiker ziet en doet, niet over of er iets
 * getekend wordt. Ze leggen drie soorten dingen vast:
 *
 *   - Een formulier verstuurt niet met een leeg verplicht veld. Bij aanmaken is
 *     dat de naam, bij uitlenen de lener, bij onderhoud en schade de
 *     omschrijving.
 *   - Een mislukte aanvraag geeft een melding en laat het venster openstaan met
 *     de ingevulde gegevens erin. Geen witte pagina, geen venster dat dichtvalt
 *     alsof het gelukt is.
 *   - Een apparaat dat al uitgeleend is, kan niet nog eens uitgeleend worden:
 *     de knop staat er niet. Alleen innemen kan dan.
 *
 * De gegevens hieronder hebben de vorm die backend/src/routes/equipment.ts
 * teruggeeft, en de verwachte aanroepen hebben de velden die de schema's daar
 * accepteren. Tot september 2026 gebruikten ze een verzonnen model
 * (instrumentType, brandModel, loanHistory, damageLogs op het detail); de
 * pagina en deze tests waren het met elkaar eens en allebei met de backend
 * oneens. Dat de api-laag de juiste routes aanspreekt staat in
 * api/__tests__/equipment-backendcontract.test.ts.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import Equipment from '../Equipment';
import * as api from '../../api/equipment';
import * as leden from '../../api/member-directory';
import * as toast from '../../utils/toast';
import type {
  EquipmentDamageLog,
  EquipmentDetail,
  EquipmentLoan,
  EquipmentMaintenance,
  Equipment as EquipmentItem,
} from '../../types';

vi.mock('../../api/equipment');
vi.mock('../../api/member-directory');
vi.mock('../../hooks/useDocumentTitle', () => ({ useDocumentTitle: () => {} }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (sleutel: string) => sleutel }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('../../components/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

vi.mock('../../components/Skeleton', () => ({
  SkeletonCard: () => <div data-testid="skelet-kaart" />,
}));

vi.mock('../../components/EquipmentStats', () => ({
  EquipmentStats: () => <div data-testid="apparatuur-cijfers" />,
}));

vi.mock('../../utils/toast', () => ({ showSuccess: vi.fn(), showError: vi.fn() }));

let huidigeRol = 'admin';
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'lid-1', role: huidigeRol } }),
}));

/** Een item zoals GET /equipment het in de lijst stuurt. */
function apparaat(overschrijving: Partial<EquipmentItem> = {}): EquipmentItem {
  return {
    id: 'apparaat-1',
    name: 'Bugel',
    description: null,
    categoryId: null,
    categoryName: null,
    categoryColor: null,
    inventoryNumber: 'EQ-00001',
    serialNumber: 'SN-001',
    brand: 'Yamaha',
    model: 'YFH-631',
    equipmentType: 'instrument',
    status: 'available',
    condition: 'good',
    location: 'Instrumentenkast',
    isLoanable: true,
    currentValue: 700,
    activeLoans: 0,
    imagePath: null,
    ...overschrijving,
  };
}

/** Een uitlening zoals GET /equipment/:id haar in `loans` meestuurt. */
function lening(overschrijving: Partial<EquipmentLoan> = {}): EquipmentLoan {
  return {
    id: 'lening-1',
    userId: 'lid-2',
    userName: 'Wies Bakker',
    checkoutDate: '2026-03-01 10:00:00',
    expectedReturnDate: null,
    actualReturnDate: null,
    status: 'active',
    ...overschrijving,
  };
}

function onderhoudsregel(overschrijving: Partial<EquipmentMaintenance> = {}): EquipmentMaintenance {
  return {
    id: 'onderhoud-1',
    maintenanceType: 'cleaning',
    description: 'Ventielen gereinigd',
    performedDate: '2026-02-01',
    performedByName: null,
    cost: 45,
    ...overschrijving,
  };
}

/** Het detail zoals GET /equipment/:id het stuurt: zonder schade. */
function detail(overschrijving: Partial<EquipmentDetail> = {}): EquipmentDetail {
  const { activeLoans: _a, categoryColor: _c, ...lijstvelden } = apparaat();
  return {
    ...lijstvelden,
    storageLocation: null,
    purchaseDate: '2020-05-01',
    purchasePrice: 850,
    warrantyExpiry: null,
    lastMaintenance: null,
    nextMaintenance: null,
    requiresTraining: false,
    notes: null,
    createdAt: '2026-01-01 00:00:00',
    loans: [],
    maintenance: [],
    ...overschrijving,
  };
}

/** Een schademelding zoals GET /equipment/:id/damage haar stuurt. */
function schade(overschrijving: Partial<EquipmentDamageLog> = {}): EquipmentDamageLog {
  return {
    id: 'schade-1',
    description: 'Beker gedeukt bij vervoer',
    severity: 'moderate',
    photos: [],
    repairCost: null,
    repairedAt: null,
    repairedBy: null,
    repairedByName: null,
    notes: null,
    reportedBy: 'lid-1',
    reportedByName: 'Anna Admin',
    createdAt: '2026-04-02T09:00:00.000Z',
    ...overschrijving,
  };
}

function wikkel({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  // De pagina houdt haar filters in de URL (useSearchParams), dus er moet een
  // router omheen staan.
  return (
    <MemoryRouter>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
}

/**
 * Het binnenste geopende venster. De detailmodal opent zelf weer modals voor
 * uitlenen, innemen, onderhoud en schade; die staan dan allebei in de boom.
 * Portals hangen in volgorde van openen onder body, dus de laatste is de
 * bovenste.
 */
function binnensteVenster(): HTMLElement {
  const vensters = screen.getAllByRole('dialog');
  return vensters[vensters.length - 1];
}

/** Opent het detailvenster van het eerste apparaat door op de kaart te klikken. */
async function openDetail(gebruiker: ReturnType<typeof userEvent.setup>, naam = 'Bugel') {
  await gebruiker.click(await screen.findByRole('heading', { name: naam }));
  await waitFor(() => expect(screen.getAllByRole('dialog').length).toBeGreaterThan(0));
}

/** Opent het detail en daarin het tabblad met schademeldingen. */
async function openSchadetab(gebruiker: ReturnType<typeof userEvent.setup>) {
  await openDetail(gebruiker);
  await gebruiker.click(await within(binnensteVenster()).findByRole('button', { name: /equipment\.damageLogs/ }));
}

beforeEach(() => {
  vi.clearAllMocks();
  huidigeRol = 'admin';
  vi.mocked(api.getEquipmentCategories).mockResolvedValue([]);
  vi.mocked(api.getEquipment).mockResolvedValue([apparaat()]);
  vi.mocked(api.getEquipmentItem).mockResolvedValue(detail());
  vi.mocked(api.getEquipmentDamageLogs).mockResolvedValue([]);
  vi.mocked(api.createEquipment).mockResolvedValue({ id: 'apparaat-nieuw', inventoryNumber: 'EQ-00002', message: '' });
  vi.mocked(api.updateEquipment).mockResolvedValue(undefined);
  vi.mocked(api.deleteEquipment).mockResolvedValue(undefined);
  vi.mocked(api.createEquipmentLoan).mockResolvedValue({ id: 'lening-nieuw', message: '' });
  vi.mocked(api.returnEquipmentLoan).mockResolvedValue(undefined);
  vi.mocked(api.recordEquipmentMaintenance).mockResolvedValue({ id: 'onderhoud-nieuw', message: '' });
  vi.mocked(api.addEquipmentDamageLog).mockResolvedValue({ id: 'schade-nieuw', message: '' });
  vi.mocked(api.updateEquipmentDamageLog).mockResolvedValue(undefined);
  vi.mocked(api.deleteEquipmentDamageLog).mockResolvedValue(undefined);
  vi.mocked(leden.getMemberDirectory).mockResolvedValue([
    { id: 'lid-2', firstName: 'Wies', lastName: 'Bakker', photoUrl: null, instruments: [], orchestras: [] },
    { id: 'lid-3', firstName: 'Joost', lastName: 'Visser', photoUrl: null, instruments: [], orchestras: [] },
  ]);
});

describe('apparatuur - het aanmaakvenster', () => {
  it('verstuurt niet zolang de naam leeg is', async () => {
    const gebruiker = userEvent.setup();
    render(<Equipment />, { wrapper: wikkel });

    await gebruiker.click(await screen.findByRole('button', { name: 'equipment.new' }));
    const venster = within(binnensteVenster());

    // Het verplichte veld is leeg: de knop hoort niet te werken.
    const aanmaken = venster.getByRole('button', { name: 'common.create' });
    expect(aanmaken).toBeDisabled();
    await gebruiker.click(aanmaken);
    expect(api.createEquipment).not.toHaveBeenCalled();

    // Alleen spaties is net zo leeg.
    await gebruiker.type(venster.getByLabelText(/common\.name/), '   ');
    expect(venster.getByRole('button', { name: 'common.create' })).toBeDisabled();

    await gebruiker.clear(venster.getByLabelText(/common\.name/));
    await gebruiker.type(venster.getByLabelText(/common\.name/), 'Hoorn');
    expect(venster.getByRole('button', { name: 'common.create' })).toBeEnabled();
  });

  it('stuurt de velden die de backend kent, lege als undefined en getallen omgezet', async () => {
    const gebruiker = userEvent.setup();
    render(<Equipment />, { wrapper: wikkel });

    await gebruiker.click(await screen.findByRole('button', { name: 'equipment.new' }));
    const venster = within(binnensteVenster());

    await gebruiker.type(venster.getByLabelText(/common\.name/), 'Mengpaneel');
    await gebruiker.selectOptions(venster.getByLabelText(/equipment\.equipmentType/), 'audio');
    await gebruiker.type(venster.getByLabelText(/equipment\.brand/), 'Behringer');
    await gebruiker.type(venster.getByLabelText(/equipment\.purchasePrice/), '1250.50');
    await gebruiker.type(venster.getByLabelText(/equipment\.maintenanceInterval/), '12');
    await gebruiker.click(venster.getByLabelText(/equipment\.isLoanable/));
    await gebruiker.click(venster.getByRole('button', { name: 'common.create' }));

    await waitFor(() => expect(api.createEquipment).toHaveBeenCalled());
    expect(vi.mocked(api.createEquipment).mock.calls[0][0]).toEqual({
      name: 'Mengpaneel',
      equipmentType: 'audio',
      description: undefined,
      categoryId: undefined,
      inventoryNumber: undefined,
      brand: 'Behringer',
      model: undefined,
      serialNumber: undefined,
      status: 'available',
      condition: 'good',
      location: undefined,
      purchaseDate: undefined,
      purchasePrice: 1250.5,
      currentValue: undefined,
      maintenanceIntervalMonths: 12,
      isLoanable: false,
      notes: undefined,
    });
    expect(toast.showSuccess).toHaveBeenCalledWith('equipment.created');
  });

  it('houdt het venster open met een melding als het aanmaken mislukt', async () => {
    vi.mocked(api.createEquipment).mockRejectedValue(new Error('server weg'));
    const gebruiker = userEvent.setup();
    render(<Equipment />, { wrapper: wikkel });

    await gebruiker.click(await screen.findByRole('button', { name: 'equipment.new' }));
    const venster = within(binnensteVenster());
    await gebruiker.type(venster.getByLabelText(/common\.name/), 'Hoorn');
    await gebruiker.click(venster.getByRole('button', { name: 'common.create' }));

    await waitFor(() => expect(toast.showError).toHaveBeenCalledWith('equipment.errorCreate'));
    // Het venster staat er nog, met wat er ingevuld was: anders is het werk weg
    // en lijkt het bovendien gelukt.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(within(binnensteVenster()).getByLabelText(/common\.name/)).toHaveValue('Hoorn');
  });

  it('sluit het venster met annuleren zonder iets te versturen', async () => {
    const gebruiker = userEvent.setup();
    render(<Equipment />, { wrapper: wikkel });

    await gebruiker.click(await screen.findByRole('button', { name: 'equipment.new' }));
    await gebruiker.click(within(binnensteVenster()).getByRole('button', { name: 'common.cancel' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(api.createEquipment).not.toHaveBeenCalled();
  });
});

describe('apparatuur - het bewerkvenster', () => {
  it('stuurt alleen wat veranderd is, en alleen velden die PATCH wegschrijft', async () => {
    const gebruiker = userEvent.setup();
    render(<Equipment />, { wrapper: wikkel });

    await gebruiker.click(await screen.findByRole('button', { name: 'common.edit' }));
    const venster = within(binnensteVenster());

    // PATCH /equipment/:id schrijft alleen naam, omschrijving, status, staat
    // en locatie weg. Een veld als merk hoort hier dus niet te staan: het zou
    // "bijgewerkt" melden zonder dat er iets verandert.
    expect(venster.queryByLabelText(/equipment\.brand/)).not.toBeInTheDocument();
    expect(venster.getByLabelText(/common\.name/)).toHaveValue('Bugel');

    // Nog niets veranderd: niets te bewaren.
    expect(venster.getByRole('button', { name: 'common.save' })).toBeDisabled();

    await gebruiker.selectOptions(venster.getByLabelText(/common\.status/), 'repair');
    await gebruiker.clear(venster.getByLabelText(/common\.location/));
    await gebruiker.type(venster.getByLabelText(/common\.location/), 'Zolder');
    await gebruiker.click(venster.getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(api.updateEquipment).toHaveBeenCalled());
    expect(api.updateEquipment).toHaveBeenCalledWith('apparaat-1', { status: 'repair', location: 'Zolder' });
    expect(toast.showSuccess).toHaveBeenCalledWith('equipment.updated');
  });

  it('meldt een mislukte wijziging en laat het venster staan', async () => {
    vi.mocked(api.updateEquipment).mockRejectedValue(new Error('mis'));
    const gebruiker = userEvent.setup();
    render(<Equipment />, { wrapper: wikkel });

    await gebruiker.click(await screen.findByRole('button', { name: 'common.edit' }));
    await gebruiker.selectOptions(within(binnensteVenster()).getByLabelText(/equipment\.condition/), 'poor');
    await gebruiker.click(within(binnensteVenster()).getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(toast.showError).toHaveBeenCalledWith('equipment.errorUpdate'));
    expect(within(binnensteVenster()).getByLabelText(/equipment\.condition/)).toHaveValue('poor');
  });
});

describe('apparatuur - het detailvenster', () => {
  it('haalt het gekozen apparaat en zijn schademeldingen op en toont de kenmerken', async () => {
    const gebruiker = userEvent.setup();
    render(<Equipment />, { wrapper: wikkel });
    await openDetail(gebruiker);

    expect(api.getEquipmentItem).toHaveBeenCalledWith('apparaat-1');
    // Het detail van de backend bevat geen schade; die heeft een eigen route.
    expect(api.getEquipmentDamageLogs).toHaveBeenCalledWith('apparaat-1');
    const venster = within(binnensteVenster());
    expect(venster.getByText('Yamaha YFH-631')).toBeInTheDocument();
    expect(venster.getByText(/SN-001/)).toBeInTheDocument();
    expect(venster.getByText('EQ-00001')).toBeInTheDocument();
  });

  it('meldt het netjes als het apparaat niet op te halen is', async () => {
    vi.mocked(api.getEquipmentItem).mockRejectedValue(new Error('niet gevonden'));
    const gebruiker = userEvent.setup();
    render(<Equipment />, { wrapper: wikkel });
    await openDetail(gebruiker);

    // Geen lege modal en geen witte pagina, maar een uitleg.
    expect(await screen.findByText('equipment.notFound')).toBeInTheDocument();
  });

  it('geeft een gewoon lid geen knoppen die het toch niet mag gebruiken', async () => {
    huidigeRol = 'member';
    const gebruiker = userEvent.setup();
    render(<Equipment />, { wrapper: wikkel });
    await openDetail(gebruiker);

    const venster = within(binnensteVenster());
    expect(venster.queryByRole('button', { name: 'equipment.assignLoan' })).not.toBeInTheDocument();
    expect(venster.queryByRole('button', { name: 'equipment.reportDamage' })).not.toBeInTheDocument();
    // De tabbladen mag het wel zien; kijken is geen beheren.
    expect(venster.getByRole('button', { name: /equipment\.loanHistory/ })).toBeInTheDocument();
  });

  it('wisselt tussen de tabbladen en toont per tabblad de eigen gegevens', async () => {
    vi.mocked(api.getEquipmentItem).mockResolvedValue(
      detail({
        notes: 'Deuk in de beker',
        loans: [lening({ status: 'returned', actualReturnDate: '2026-04-01 12:00:00' })],
        maintenance: [onderhoudsregel()],
      }),
    );
    vi.mocked(api.getEquipmentDamageLogs).mockResolvedValue([
      schade({ repairCost: 120, repairedAt: '2026-04-10', repairedByName: 'Jan de Reparateur' }),
    ]);
    const gebruiker = userEvent.setup();
    render(<Equipment />, { wrapper: wikkel });
    await openDetail(gebruiker);

    let venster = within(binnensteVenster());
    expect(venster.getByText('Deuk in de beker')).toBeInTheDocument();

    await gebruiker.click(venster.getByRole('button', { name: /equipment\.loanHistory/ }));
    venster = within(binnensteVenster());
    expect(venster.getByText('Wies Bakker')).toBeInTheDocument();

    await gebruiker.click(venster.getByRole('button', { name: /equipment\.damageLogs \(1\)/ }));
    venster = within(binnensteVenster());
    expect(venster.getByText('Beker gedeukt bij vervoer')).toBeInTheDocument();
    expect(venster.getByText(/Jan de Reparateur/)).toBeInTheDocument();
    expect(venster.getByText('equipment.repaired')).toBeInTheDocument();

    await gebruiker.click(venster.getByRole('button', { name: 'equipment.maintenance' }));
    venster = within(binnensteVenster());
    expect(venster.getByText('equipment.never')).toBeInTheDocument();
    expect(venster.getByText('Ventielen gereinigd')).toBeInTheDocument();
  });

  it('toont lege tabbladen als zodanig en niet als een lege tabel', async () => {
    const gebruiker = userEvent.setup();
    render(<Equipment />, { wrapper: wikkel });
    await openDetail(gebruiker);

    await gebruiker.click(within(binnensteVenster()).getByRole('button', { name: /equipment\.loanHistory/ }));
    expect(within(binnensteVenster()).getByText('equipment.noLoanHistory')).toBeInTheDocument();

    await gebruiker.click(within(binnensteVenster()).getByRole('button', { name: /equipment\.damageLogs/ }));
    expect(within(binnensteVenster()).getByText('equipment.noDamageLogs')).toBeInTheDocument();

    await gebruiker.click(within(binnensteVenster()).getByRole('button', { name: 'equipment.maintenance' }));
    expect(within(binnensteVenster()).getByText('equipment.noMaintenance')).toBeInTheDocument();
  });

  it('waarschuwt als het onderhoud over de datum is', async () => {
    vi.mocked(api.getEquipmentItem).mockResolvedValue(
      detail({ lastMaintenance: '2020-01-01', nextMaintenance: '2021-01-01' }),
    );
    const gebruiker = userEvent.setup();
    render(<Equipment />, { wrapper: wikkel });
    await openDetail(gebruiker);

    // Bovenin, zonder dat je eerst het tabblad hoeft te openen: dit vervangt
    // de onderhoudsmeldingen van /maintenance-alerts, een route die nooit
    // bestond.
    expect(within(binnensteVenster()).getByText('equipment.maintenanceOverdue')).toBeInTheDocument();

    await gebruiker.click(within(binnensteVenster()).getByRole('button', { name: 'equipment.maintenance' }));
    expect(within(binnensteVenster()).getByText('equipment.overdue')).toBeInTheDocument();
  });

  it('waarschuwt niet voor onderhoud dat nog moet komen', async () => {
    vi.mocked(api.getEquipmentItem).mockResolvedValue(detail({ nextMaintenance: '2999-01-01' }));
    const gebruiker = userEvent.setup();
    render(<Equipment />, { wrapper: wikkel });
    await openDetail(gebruiker);

    expect(within(binnensteVenster()).queryByText('equipment.maintenanceOverdue')).not.toBeInTheDocument();
  });
});

describe('apparatuur - uitlenen en innemen', () => {
  it('biedt uitlenen niet aan voor een apparaat dat al uitgeleend is', async () => {
    vi.mocked(api.getEquipment).mockResolvedValue([apparaat({ status: 'in_use', activeLoans: 1 })]);
    vi.mocked(api.getEquipmentItem).mockResolvedValue(detail({ status: 'in_use', loans: [lening()] }));
    const gebruiker = userEvent.setup();
    render(<Equipment />, { wrapper: wikkel });
    await openDetail(gebruiker);

    const venster = within(binnensteVenster());
    // Dit is de kern: twee keer uitlenen kan niet, dus de knop hoort weg te
    // zijn. Innemen is wat er dan overblijft.
    expect(venster.queryByRole('button', { name: 'equipment.assignLoan' })).not.toBeInTheDocument();
    expect(venster.getByRole('button', { name: 'equipment.returnLoan' })).toBeInTheDocument();
    expect(venster.getByText(/equipment\.currentlyWith/)).toBeInTheDocument();
    expect(venster.getByText('Wies Bakker')).toBeInTheDocument();
  });

  it('biedt innemen niet aan voor een apparaat dat op de plank ligt', async () => {
    const gebruiker = userEvent.setup();
    render(<Equipment />, { wrapper: wikkel });
    await openDetail(gebruiker);

    const venster = within(binnensteVenster());
    expect(venster.getByRole('button', { name: 'equipment.assignLoan' })).toBeInTheDocument();
    expect(venster.queryByRole('button', { name: 'equipment.returnLoan' })).not.toBeInTheDocument();
  });

  it('biedt uitlenen niet aan voor een apparaat dat niet uitleenbaar is', async () => {
    // POST /equipment/loans weigert zo'n item met een 400.
    vi.mocked(api.getEquipmentItem).mockResolvedValue(detail({ isLoanable: false }));
    const gebruiker = userEvent.setup();
    render(<Equipment />, { wrapper: wikkel });
    await openDetail(gebruiker);

    expect(within(binnensteVenster()).queryByRole('button', { name: 'equipment.assignLoan' })).not.toBeInTheDocument();
  });

  it('leent niet uit zonder lener, en stuurt na kiezen de juiste gegevens', async () => {
    const gebruiker = userEvent.setup();
    render(<Equipment />, { wrapper: wikkel });
    await openDetail(gebruiker);

    await gebruiker.click(within(binnensteVenster()).getByRole('button', { name: 'equipment.assignLoan' }));
    let venster = within(binnensteVenster());

    const uitlenen = venster.getAllByRole('button', { name: 'equipment.assignLoan' })[0];
    expect(uitlenen).toBeDisabled();
    await gebruiker.click(uitlenen);
    expect(api.createEquipmentLoan).not.toHaveBeenCalled();

    // De lener kies je uit de leden, niet door een gebruikers-id over te typen.
    await waitFor(() => expect(venster.getByRole('option', { name: 'Wies Bakker' })).toBeInTheDocument());
    await gebruiker.selectOptions(venster.getByLabelText(/equipment\.borrower/), 'lid-2');
    fireEvent.change(venster.getByLabelText(/equipment\.expectedReturnDate/), { target: { value: '2026-12-04' } });
    await gebruiker.selectOptions(venster.getByLabelText(/equipment\.conditionAtLoan/), 'excellent');

    venster = within(binnensteVenster());
    await gebruiker.click(venster.getAllByRole('button', { name: 'equipment.assignLoan' })[0]);

    await waitFor(() => expect(api.createEquipmentLoan).toHaveBeenCalled());
    expect(api.createEquipmentLoan).toHaveBeenCalledWith('apparaat-1', {
      userId: 'lid-2',
      expectedReturnDate: '2026-12-04',
      conditionAtCheckout: 'excellent',
      checkoutNotes: undefined,
    });
    expect(toast.showSuccess).toHaveBeenCalledWith('equipment.loanCreated');
  });

  it('meldt een mislukte uitlening en laat het venster staan', async () => {
    vi.mocked(api.createEquipmentLoan).mockRejectedValue(new Error('bezet'));
    const gebruiker = userEvent.setup();
    render(<Equipment />, { wrapper: wikkel });
    await openDetail(gebruiker);

    await gebruiker.click(within(binnensteVenster()).getByRole('button', { name: 'equipment.assignLoan' }));
    const lener = within(binnensteVenster()).getByLabelText(/equipment\.borrower/);
    await waitFor(() => expect(within(binnensteVenster()).getByRole('option', { name: 'Wies Bakker' })).toBeTruthy());
    await gebruiker.selectOptions(lener, 'lid-2');
    await gebruiker.click(within(binnensteVenster()).getAllByRole('button', { name: 'equipment.assignLoan' })[0]);

    await waitFor(() => expect(toast.showError).toHaveBeenCalledWith('equipment.errorLoan'));
    expect(within(binnensteVenster()).getByLabelText(/equipment\.borrower/)).toHaveValue('lid-2');
  });

  it('neemt in op de lopende uitlening met de opgegeven staat', async () => {
    vi.mocked(api.getEquipmentItem).mockResolvedValue(
      detail({
        status: 'in_use',
        loans: [
          lening({ id: 'lening-7' }),
          lening({ id: 'lening-oud', status: 'returned', actualReturnDate: '2025-01-01' }),
        ],
      }),
    );
    const gebruiker = userEvent.setup();
    render(<Equipment />, { wrapper: wikkel });
    await openDetail(gebruiker);

    await gebruiker.click(within(binnensteVenster()).getByRole('button', { name: 'equipment.returnLoan' }));
    let venster = within(binnensteVenster());
    await gebruiker.selectOptions(venster.getByLabelText(/equipment\.conditionAtReturn/), 'fair');
    await gebruiker.type(venster.getByLabelText(/common\.notes/), 'kras op klep');

    venster = within(binnensteVenster());
    await gebruiker.click(venster.getAllByRole('button', { name: 'equipment.returnLoan' })[0]);

    await waitFor(() => expect(api.returnEquipmentLoan).toHaveBeenCalled());
    // De id moet die van de lopende uitlening zijn, niet die van het apparaat
    // of van een oude uitlening: anders wordt de verkeerde regel afgesloten.
    expect(api.returnEquipmentLoan).toHaveBeenCalledWith('lening-7', {
      conditionAtReturn: 'fair',
      returnNotes: 'kras op klep',
    });
    expect(toast.showSuccess).toHaveBeenCalledWith('equipment.loanReturned');
  });

  it('meldt een mislukte inname', async () => {
    vi.mocked(api.returnEquipmentLoan).mockRejectedValue(new Error('mis'));
    vi.mocked(api.getEquipmentItem).mockResolvedValue(detail({ status: 'in_use', loans: [lening()] }));
    const gebruiker = userEvent.setup();
    render(<Equipment />, { wrapper: wikkel });
    await openDetail(gebruiker);

    await gebruiker.click(within(binnensteVenster()).getByRole('button', { name: 'equipment.returnLoan' }));
    await gebruiker.click(within(binnensteVenster()).getAllByRole('button', { name: 'equipment.returnLoan' })[0]);

    await waitFor(() => expect(toast.showError).toHaveBeenCalledWith('equipment.errorReturn'));
  });
});

describe('apparatuur - onderhoud vastleggen', () => {
  it('legt onderhoud vast met soort, datum, omschrijving en volgende datum', async () => {
    const gebruiker = userEvent.setup();
    render(<Equipment />, { wrapper: wikkel });
    await openDetail(gebruiker);

    await gebruiker.click(within(binnensteVenster()).getByRole('button', { name: 'equipment.recordMaintenance' }));
    let venster = within(binnensteVenster());

    // De backend eist een omschrijving; zonder is de knop dicht.
    expect(venster.getAllByRole('button', { name: 'equipment.recordMaintenance' })[0]).toBeDisabled();

    await gebruiker.selectOptions(venster.getByLabelText(/equipment\.maintenanceType/), 'service');
    fireEvent.change(venster.getByLabelText(/equipment\.maintenanceDate/), { target: { value: '2026-03-01' } });
    await gebruiker.type(venster.getByLabelText(/common\.description/), 'kleppen gesmeerd');
    fireEvent.change(venster.getByLabelText(/equipment\.nextMaintenance/), { target: { value: '2027-03-01' } });

    venster = within(binnensteVenster());
    await gebruiker.click(venster.getAllByRole('button', { name: 'equipment.recordMaintenance' })[0]);

    await waitFor(() => expect(api.recordEquipmentMaintenance).toHaveBeenCalled());
    expect(api.recordEquipmentMaintenance).toHaveBeenCalledWith('apparaat-1', {
      maintenanceType: 'service',
      performedDate: '2026-03-01',
      description: 'kleppen gesmeerd',
      externalProvider: undefined,
      cost: undefined,
      nextMaintenanceDate: '2027-03-01',
      notes: undefined,
    });
    expect(toast.showSuccess).toHaveBeenCalledWith('equipment.maintenanceRecorded');
  });

  it('meldt het als het vastleggen mislukt', async () => {
    vi.mocked(api.recordEquipmentMaintenance).mockRejectedValue(new Error('mis'));
    const gebruiker = userEvent.setup();
    render(<Equipment />, { wrapper: wikkel });
    await openDetail(gebruiker);

    await gebruiker.click(within(binnensteVenster()).getByRole('button', { name: 'equipment.recordMaintenance' }));
    await gebruiker.type(within(binnensteVenster()).getByLabelText(/common\.description/), 'poetsbeurt');
    await gebruiker.click(
      within(binnensteVenster()).getAllByRole('button', { name: 'equipment.recordMaintenance' })[0],
    );

    await waitFor(() => expect(toast.showError).toHaveBeenCalledWith('equipment.errorMaintenance'));
    expect(within(binnensteVenster()).getByLabelText(/common\.description/)).toHaveValue('poetsbeurt');
  });
});

describe('apparatuur - schade melden', () => {
  it('meldt geen schade zonder omschrijving', async () => {
    const gebruiker = userEvent.setup();
    render(<Equipment />, { wrapper: wikkel });
    await openDetail(gebruiker);

    await gebruiker.click(within(binnensteVenster()).getByRole('button', { name: 'equipment.reportDamage' }));
    const venster = within(binnensteVenster());

    const melden = venster.getAllByRole('button', { name: 'equipment.reportDamage' })[0];
    expect(melden).toBeDisabled();
    await gebruiker.click(melden);
    expect(api.addEquipmentDamageLog).not.toHaveBeenCalled();
  });

  it('stuurt de melding met ernst en omgezette reparatiekosten, en haalt de lijst opnieuw op', async () => {
    const gebruiker = userEvent.setup();
    render(<Equipment />, { wrapper: wikkel });
    await openDetail(gebruiker);
    await waitFor(() => expect(api.getEquipmentDamageLogs).toHaveBeenCalledTimes(1));

    await gebruiker.click(within(binnensteVenster()).getByRole('button', { name: 'equipment.reportDamage' }));
    let venster = within(binnensteVenster());
    await gebruiker.type(venster.getByLabelText(/common\.description/), 'klep klemt');
    await gebruiker.selectOptions(venster.getByLabelText(/equipment\.severity/), 'unusable');
    await gebruiker.type(venster.getByLabelText(/equipment\.repairCost/), '75.25');

    venster = within(binnensteVenster());
    await gebruiker.click(venster.getAllByRole('button', { name: 'equipment.reportDamage' })[0]);

    await waitFor(() => expect(api.addEquipmentDamageLog).toHaveBeenCalled());
    expect(api.addEquipmentDamageLog).toHaveBeenCalledWith('apparaat-1', {
      description: 'klep klemt',
      severity: 'unusable',
      repairCost: 75.25,
      notes: undefined,
    });
    expect(toast.showSuccess).toHaveBeenCalledWith('equipment.damageReported');
    // De melding verandert staat en status van het item in de backend; de
    // schadelijst en het detail moeten opnieuw opgehaald worden.
    await waitFor(() => expect(api.getEquipmentDamageLogs).toHaveBeenCalledTimes(2));
    expect(vi.mocked(api.getEquipmentItem).mock.calls.length).toBeGreaterThan(1);
  });

  it('meldt een mislukte schademelding en houdt de tekst vast', async () => {
    vi.mocked(api.addEquipmentDamageLog).mockRejectedValue(new Error('mis'));
    const gebruiker = userEvent.setup();
    render(<Equipment />, { wrapper: wikkel });
    await openDetail(gebruiker);

    await gebruiker.click(within(binnensteVenster()).getByRole('button', { name: 'equipment.reportDamage' }));
    await gebruiker.type(within(binnensteVenster()).getByLabelText(/common\.description/), 'klep klemt');
    await gebruiker.click(within(binnensteVenster()).getAllByRole('button', { name: 'equipment.reportDamage' })[0]);

    await waitFor(() => expect(toast.showError).toHaveBeenCalledWith('equipment.errorDamage'));
    expect(within(binnensteVenster()).getByLabelText(/common\.description/)).toHaveValue('klep klemt');
  });
});

describe('apparatuur - schade bijwerken en verwijderen', () => {
  it('markeert een melding als gerepareerd met datum en kosten', async () => {
    vi.mocked(api.getEquipmentDamageLogs).mockResolvedValue([schade()]);
    const gebruiker = userEvent.setup();
    render(<Equipment />, { wrapper: wikkel });
    await openSchadetab(gebruiker);

    await gebruiker.click(within(binnensteVenster()).getByRole('button', { name: 'equipment.updateDamage' }));
    let venster = within(binnensteVenster());
    // Niets veranderd: niets te bewaren.
    expect(venster.getByRole('button', { name: 'common.save' })).toBeDisabled();

    await gebruiker.click(venster.getByLabelText(/equipment\.markRepaired/));
    venster = within(binnensteVenster());
    fireEvent.change(venster.getByLabelText(/equipment\.repairedAt/), { target: { value: '2026-06-01' } });
    await gebruiker.type(venster.getByLabelText(/equipment\.repairCost/), '90');
    await gebruiker.click(venster.getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(api.updateEquipmentDamageLog).toHaveBeenCalled());
    expect(api.updateEquipmentDamageLog).toHaveBeenCalledWith('apparaat-1', 'schade-1', {
      repairedAt: '2026-06-01',
      repairCost: 90,
    });
    expect(toast.showSuccess).toHaveBeenCalledWith('equipment.damageUpdated');
  });

  it('meldt een mislukte wijziging van een schademelding', async () => {
    vi.mocked(api.getEquipmentDamageLogs).mockResolvedValue([schade()]);
    vi.mocked(api.updateEquipmentDamageLog).mockRejectedValue(new Error('mis'));
    const gebruiker = userEvent.setup();
    render(<Equipment />, { wrapper: wikkel });
    await openSchadetab(gebruiker);

    await gebruiker.click(within(binnensteVenster()).getByRole('button', { name: 'equipment.updateDamage' }));
    await gebruiker.type(within(binnensteVenster()).getByLabelText(/common\.notes/), 'offerte gevraagd');
    await gebruiker.click(within(binnensteVenster()).getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(toast.showError).toHaveBeenCalledWith('equipment.errorDamageUpdate'));
    expect(within(binnensteVenster()).getByLabelText(/common\.notes/)).toHaveValue('offerte gevraagd');
  });

  it('laat de materiaalcommissie wel bijwerken maar niet verwijderen', async () => {
    // DELETE /equipment/:id/damage/:reportId draagt requireRole('admin'); de
    // commissie zou op die knop een 403 krijgen.
    huidigeRol = 'equipment_committee';
    vi.mocked(api.getEquipmentDamageLogs).mockResolvedValue([schade()]);
    const gebruiker = userEvent.setup();
    render(<Equipment />, { wrapper: wikkel });
    await openSchadetab(gebruiker);

    const venster = within(binnensteVenster());
    expect(venster.getByRole('button', { name: 'equipment.updateDamage' })).toBeInTheDocument();
    expect(venster.queryByRole('button', { name: 'equipment.deleteDamage' })).not.toBeInTheDocument();
  });

  it('verwijdert een melding pas na bevestigen', async () => {
    vi.mocked(api.getEquipmentDamageLogs).mockResolvedValue([schade()]);
    const gebruiker = userEvent.setup();
    render(<Equipment />, { wrapper: wikkel });
    await openSchadetab(gebruiker);

    await gebruiker.click(within(binnensteVenster()).getByRole('button', { name: 'equipment.deleteDamage' }));
    const vraag = await screen.findByRole('alertdialog');
    expect(api.deleteEquipmentDamageLog).not.toHaveBeenCalled();

    await gebruiker.click(within(vraag).getByRole('button', { name: 'common.delete' }));

    await waitFor(() => expect(api.deleteEquipmentDamageLog).toHaveBeenCalledWith('apparaat-1', 'schade-1'));
    expect(toast.showSuccess).toHaveBeenCalledWith('equipment.damageDeleted');
  });
});

describe('apparatuur - verwijderen', () => {
  it('vraagt eerst om bevestiging en noemt daarbij het apparaat', async () => {
    const gebruiker = userEvent.setup();
    render(<Equipment />, { wrapper: wikkel });

    await gebruiker.click(await screen.findByRole('button', { name: 'common.delete' }));
    const vraag = await screen.findByRole('alertdialog');
    expect(within(vraag).getByText('equipment.confirmDelete')).toBeInTheDocument();
    expect(api.deleteEquipment).not.toHaveBeenCalled();

    await gebruiker.click(within(vraag).getByRole('button', { name: 'common.cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(api.deleteEquipment).not.toHaveBeenCalled();
  });

  it('verwijdert pas na bevestigen', async () => {
    const gebruiker = userEvent.setup();
    render(<Equipment />, { wrapper: wikkel });

    await gebruiker.click(await screen.findByRole('button', { name: 'common.delete' }));
    await gebruiker.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'common.delete' }),
    );

    // react-query geeft de mutatiefunctie een tweede argument mee (de
    // context), dus kijken we alleen naar het eerste.
    await waitFor(() => expect(api.deleteEquipment).toHaveBeenCalled());
    expect(vi.mocked(api.deleteEquipment).mock.calls[0][0]).toBe('apparaat-1');
    expect(toast.showSuccess).toHaveBeenCalledWith('equipment.deleted');
  });

  it('meldt het als verwijderen mislukt', async () => {
    vi.mocked(api.deleteEquipment).mockRejectedValue(new Error('mag niet'));
    const gebruiker = userEvent.setup();
    render(<Equipment />, { wrapper: wikkel });

    await gebruiker.click(await screen.findByRole('button', { name: 'common.delete' }));
    await gebruiker.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'common.delete' }),
    );

    await waitFor(() => expect(toast.showError).toHaveBeenCalledWith('equipment.errorDelete'));
  });
});
