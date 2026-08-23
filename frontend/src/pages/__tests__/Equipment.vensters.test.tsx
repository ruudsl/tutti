/**
 * De vensters van de apparatuurpagina.
 *
 * `Equipment.rollen.test.tsx` legt de rolbewaking en de foutstaat van de lijst
 * vast. Wat daar buiten viel is alles wat achter een knop zit: aanmaken,
 * uitlenen, innemen, onderhoud vastleggen, schade melden en het detailvenster
 * met zijn vier tabbladen. Dat is het grootste deel van het bestand, en het is
 * ook het deel waar een gebruiker echt iets verandert.
 *
 * Deze tests gaan over wat een gebruiker ziet en doet, niet over of er iets
 * getekend wordt. Ze leggen drie soorten dingen vast:
 *
 *   - Een formulier verstuurt niet met een leeg verplicht veld. Bij aanmaken is
 *     dat het instrumenttype, bij uitlenen de lener, bij schade de omschrijving.
 *   - Een mislukte aanvraag geeft een melding en laat het venster openstaan met
 *     de ingevulde gegevens erin. Geen witte pagina, geen venster dat dichtvalt
 *     alsof het gelukt is.
 *   - Een apparaat dat al uitgeleend is, kan niet nog eens uitgeleend worden:
 *     de knop staat er niet. Alleen innemen kan dan.
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
import * as toast from '../../utils/toast';
import type { EquipmentDetail, EquipmentLoan, Equipment as EquipmentItem } from '../../types';

vi.mock('../../api/equipment');
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

function apparaat(overschrijving: Partial<EquipmentItem> = {}): EquipmentItem {
  return {
    id: 'apparaat-1',
    instrumentType: 'Bugel',
    brandModel: 'Yamaha YFH-631',
    serialNumber: 'SN-001',
    yearOfManufacture: 2020,
    status: 'available',
    notes: null,
    maintenanceIntervalMonths: 12,
    lastMaintenanceDate: null,
    nextMaintenanceDate: null,
    purchasePrice: 850,
    currentValue: 700,
    currentUser: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overschrijving,
  };
}

function lening(overschrijving: Partial<EquipmentLoan> = {}): EquipmentLoan {
  return {
    id: 'lening-1',
    user: { id: 'lid-2', firstName: 'Wies', lastName: 'Bakker', email: 'wies@example.org' },
    loanDate: '2026-03-01',
    returnDate: null,
    conditionAtLoan: 'goed',
    conditionAtReturn: null,
    notes: null,
    agreementPdfPath: null,
    ...overschrijving,
  };
}

function detail(overschrijving: Partial<EquipmentDetail> = {}): EquipmentDetail {
  return {
    ...apparaat(),
    damageLogs: [],
    loanHistory: [],
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

beforeEach(() => {
  vi.clearAllMocks();
  huidigeRol = 'admin';
  // Bewust een ander type dan het apparaat zelf: anders staat 'Bugel' ook in
  // het filterlijstje en wijst een zoekopdracht op naam naar twee plekken.
  vi.mocked(api.getEquipmentTypes).mockResolvedValue(['Klarinet']);
  vi.mocked(api.getEquipment).mockResolvedValue({ data: [apparaat()], total: 1, page: 1, limit: 20 });
  vi.mocked(api.getEquipmentItem).mockResolvedValue(detail());
  vi.mocked(api.createEquipment).mockResolvedValue({ id: 'apparaat-nieuw' });
  vi.mocked(api.deleteEquipment).mockResolvedValue(undefined);
  vi.mocked(api.createEquipmentLoan).mockResolvedValue({ id: 'lening-nieuw' });
  vi.mocked(api.returnEquipmentLoan).mockResolvedValue(undefined);
  vi.mocked(api.recordEquipmentMaintenance).mockResolvedValue({ nextMaintenanceDate: '2027-03-01' });
  vi.mocked(api.addEquipmentDamageLog).mockResolvedValue({ id: 'schade-nieuw' });
});

describe('apparatuur - het aanmaakvenster', () => {
  it('verstuurt niet zolang het instrumenttype leeg is', async () => {
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
    await gebruiker.type(venster.getByLabelText(/equipment\.instrumentType/), '   ');
    expect(venster.getByRole('button', { name: 'common.create' })).toBeDisabled();

    await gebruiker.clear(venster.getByLabelText(/equipment\.instrumentType/));
    await gebruiker.type(venster.getByLabelText(/equipment\.instrumentType/), 'Hoorn');
    expect(venster.getByRole('button', { name: 'common.create' })).toBeEnabled();
  });

  it('stuurt lege velden weg als undefined en zet getallen om', async () => {
    const gebruiker = userEvent.setup();
    render(<Equipment />, { wrapper: wikkel });

    await gebruiker.click(await screen.findByRole('button', { name: 'equipment.new' }));
    const venster = within(binnensteVenster());

    await gebruiker.type(venster.getByLabelText(/equipment\.instrumentType/), 'Hoorn');
    await gebruiker.type(venster.getByLabelText(/equipment\.yearOfManufacture/), '1998');
    await gebruiker.type(venster.getByLabelText(/equipment\.purchasePrice/), '1250.50');
    await gebruiker.click(venster.getByRole('button', { name: 'common.create' }));

    await waitFor(() => expect(api.createEquipment).toHaveBeenCalled());
    expect(vi.mocked(api.createEquipment).mock.calls[0][0]).toEqual({
      instrumentType: 'Hoorn',
      brandModel: undefined,
      serialNumber: undefined,
      yearOfManufacture: 1998,
      status: 'available',
      purchasePrice: 1250.5,
      currentValue: undefined,
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
    await gebruiker.type(venster.getByLabelText(/equipment\.instrumentType/), 'Hoorn');
    await gebruiker.click(venster.getByRole('button', { name: 'common.create' }));

    await waitFor(() => expect(toast.showError).toHaveBeenCalledWith('equipment.errorCreate'));
    // Het venster staat er nog, met wat er ingevuld was: anders is het werk weg
    // en lijkt het bovendien gelukt.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(within(binnensteVenster()).getByLabelText(/equipment\.instrumentType/)).toHaveValue('Hoorn');
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

describe('apparatuur - het detailvenster', () => {
  it('haalt het gekozen apparaat op en toont de kenmerken', async () => {
    const gebruiker = userEvent.setup();
    render(<Equipment />, { wrapper: wikkel });
    await openDetail(gebruiker);

    expect(api.getEquipmentItem).toHaveBeenCalledWith('apparaat-1');
    const venster = within(binnensteVenster());
    expect(venster.getByText('Yamaha YFH-631')).toBeInTheDocument();
    expect(venster.getByText(/SN-001/)).toBeInTheDocument();
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
        loanHistory: [lening({ returnDate: '2026-04-01', conditionAtReturn: 'gedeukt' })],
        damageLogs: [
          {
            id: 'schade-1',
            date: '2026-04-02',
            description: 'Beker gedeukt bij vervoer',
            repairCost: 120,
            repairedBy: 'De Blaaswinkel',
            status: 'reported',
            createdAt: '2026-04-02',
          },
        ],
      }),
    );
    const gebruiker = userEvent.setup();
    render(<Equipment />, { wrapper: wikkel });
    await openDetail(gebruiker);

    let venster = within(binnensteVenster());
    expect(venster.getByText('Deuk in de beker')).toBeInTheDocument();

    await gebruiker.click(venster.getByRole('button', { name: /equipment\.loanHistory/ }));
    venster = within(binnensteVenster());
    expect(venster.getByText('Wies Bakker')).toBeInTheDocument();

    await gebruiker.click(venster.getByRole('button', { name: /equipment\.damageLogs/ }));
    venster = within(binnensteVenster());
    expect(venster.getByText('Beker gedeukt bij vervoer')).toBeInTheDocument();
    expect(venster.getByText(/De Blaaswinkel/)).toBeInTheDocument();

    await gebruiker.click(venster.getByRole('button', { name: 'equipment.maintenance' }));
    venster = within(binnensteVenster());
    expect(venster.getByText('equipment.never')).toBeInTheDocument();
  });

  it('toont lege tabbladen als zodanig en niet als een lege tabel', async () => {
    const gebruiker = userEvent.setup();
    render(<Equipment />, { wrapper: wikkel });
    await openDetail(gebruiker);

    await gebruiker.click(within(binnensteVenster()).getByRole('button', { name: /equipment\.loanHistory/ }));
    expect(within(binnensteVenster()).getByText('equipment.noLoanHistory')).toBeInTheDocument();

    await gebruiker.click(within(binnensteVenster()).getByRole('button', { name: /equipment\.damageLogs/ }));
    expect(within(binnensteVenster()).getByText('equipment.noDamageLogs')).toBeInTheDocument();
  });

  it('waarschuwt als het onderhoud over de datum is', async () => {
    vi.mocked(api.getEquipmentItem).mockResolvedValue(
      detail({ lastMaintenanceDate: '2020-01-01', nextMaintenanceDate: '2021-01-01' }),
    );
    const gebruiker = userEvent.setup();
    render(<Equipment />, { wrapper: wikkel });
    await openDetail(gebruiker);

    await gebruiker.click(within(binnensteVenster()).getByRole('button', { name: 'equipment.maintenance' }));
    expect(within(binnensteVenster()).getByText('equipment.overdue')).toBeInTheDocument();
  });
});

describe('apparatuur - uitlenen en innemen', () => {
  it('biedt uitlenen niet aan voor een apparaat dat al uitgeleend is', async () => {
    vi.mocked(api.getEquipment).mockResolvedValue({
      data: [apparaat({ status: 'on_loan' })],
      total: 1,
      page: 1,
      limit: 20,
    });
    vi.mocked(api.getEquipmentItem).mockResolvedValue(
      detail({
        status: 'on_loan',
        currentUser: { id: 'lid-2', firstName: 'Wies', lastName: 'Bakker', email: 'wies@example.org' },
        loanHistory: [lening()],
      }),
    );
    const gebruiker = userEvent.setup();
    render(<Equipment />, { wrapper: wikkel });
    await openDetail(gebruiker);

    const venster = within(binnensteVenster());
    // Dit is de kern: twee keer uitlenen kan niet, dus de knop hoort weg te
    // zijn. Innemen is wat er dan overblijft.
    expect(venster.queryByRole('button', { name: 'equipment.assignLoan' })).not.toBeInTheDocument();
    expect(venster.getByRole('button', { name: 'equipment.returnLoan' })).toBeInTheDocument();
    expect(venster.getByText(/equipment\.currentlyWith/)).toBeInTheDocument();
  });

  it('biedt innemen niet aan voor een apparaat dat op de plank ligt', async () => {
    const gebruiker = userEvent.setup();
    render(<Equipment />, { wrapper: wikkel });
    await openDetail(gebruiker);

    const venster = within(binnensteVenster());
    expect(venster.getByRole('button', { name: 'equipment.assignLoan' })).toBeInTheDocument();
    expect(venster.queryByRole('button', { name: 'equipment.returnLoan' })).not.toBeInTheDocument();
  });

  it('leent niet uit zonder lener, en stuurt na invullen de juiste gegevens', async () => {
    const gebruiker = userEvent.setup();
    render(<Equipment />, { wrapper: wikkel });
    await openDetail(gebruiker);

    await gebruiker.click(within(binnensteVenster()).getByRole('button', { name: 'equipment.assignLoan' }));
    let venster = within(binnensteVenster());

    const uitlenen = venster.getAllByRole('button', { name: 'equipment.assignLoan' })[0];
    expect(uitlenen).toBeDisabled();
    await gebruiker.click(uitlenen);
    expect(api.createEquipmentLoan).not.toHaveBeenCalled();

    await gebruiker.type(venster.getByLabelText(/equipment\.borrowerId/), 'lid-2');
    fireEvent.change(venster.getByLabelText(/equipment\.loanDate/), { target: { value: '2026-05-04' } });
    await gebruiker.type(venster.getByLabelText(/equipment\.conditionAtLoan/), 'als nieuw');

    venster = within(binnensteVenster());
    await gebruiker.click(venster.getAllByRole('button', { name: 'equipment.assignLoan' })[0]);

    await waitFor(() => expect(api.createEquipmentLoan).toHaveBeenCalled());
    expect(api.createEquipmentLoan).toHaveBeenCalledWith('apparaat-1', {
      userId: 'lid-2',
      loanDate: '2026-05-04',
      conditionAtLoan: 'als nieuw',
      notes: '',
    });
    expect(toast.showSuccess).toHaveBeenCalledWith('equipment.loanCreated');
  });

  it('meldt een mislukte uitlening en laat het venster staan', async () => {
    vi.mocked(api.createEquipmentLoan).mockRejectedValue(new Error('bezet'));
    const gebruiker = userEvent.setup();
    render(<Equipment />, { wrapper: wikkel });
    await openDetail(gebruiker);

    await gebruiker.click(within(binnensteVenster()).getByRole('button', { name: 'equipment.assignLoan' }));
    await gebruiker.type(within(binnensteVenster()).getByLabelText(/equipment\.borrowerId/), 'lid-2');
    await gebruiker.click(within(binnensteVenster()).getAllByRole('button', { name: 'equipment.assignLoan' })[0]);

    await waitFor(() => expect(toast.showError).toHaveBeenCalledWith('equipment.errorLoan'));
    expect(within(binnensteVenster()).getByLabelText(/equipment\.borrowerId/)).toHaveValue('lid-2');
  });

  it('neemt in met de lopende lening en de opgegeven staat', async () => {
    vi.mocked(api.getEquipmentItem).mockResolvedValue(
      detail({ status: 'on_loan', loanHistory: [lening({ id: 'lening-7' })] }),
    );
    const gebruiker = userEvent.setup();
    render(<Equipment />, { wrapper: wikkel });
    await openDetail(gebruiker);

    await gebruiker.click(within(binnensteVenster()).getByRole('button', { name: 'equipment.returnLoan' }));
    let venster = within(binnensteVenster());
    fireEvent.change(venster.getByLabelText(/equipment\.returnDate/), { target: { value: '2026-06-01' } });
    await gebruiker.type(venster.getByLabelText(/equipment\.conditionAtReturn/), 'kras op klep');

    venster = within(binnensteVenster());
    await gebruiker.click(venster.getAllByRole('button', { name: 'equipment.returnLoan' })[0]);

    await waitFor(() => expect(api.returnEquipmentLoan).toHaveBeenCalled());
    // De lening-id moet die van de lopende lening zijn, niet die van het
    // apparaat: anders wordt de verkeerde regel afgesloten.
    expect(api.returnEquipmentLoan).toHaveBeenCalledWith('apparaat-1', 'lening-7', {
      returnDate: '2026-06-01',
      conditionAtReturn: 'kras op klep',
    });
    expect(toast.showSuccess).toHaveBeenCalledWith('equipment.loanReturned');
  });

  it('meldt een mislukte inname', async () => {
    vi.mocked(api.returnEquipmentLoan).mockRejectedValue(new Error('mis'));
    vi.mocked(api.getEquipmentItem).mockResolvedValue(detail({ status: 'on_loan', loanHistory: [lening()] }));
    const gebruiker = userEvent.setup();
    render(<Equipment />, { wrapper: wikkel });
    await openDetail(gebruiker);

    await gebruiker.click(within(binnensteVenster()).getByRole('button', { name: 'equipment.returnLoan' }));
    await gebruiker.click(within(binnensteVenster()).getAllByRole('button', { name: 'equipment.returnLoan' })[0]);

    await waitFor(() => expect(toast.showError).toHaveBeenCalledWith('equipment.errorReturn'));
  });
});

describe('apparatuur - onderhoud vastleggen', () => {
  it('legt onderhoud vast met datum en notitie', async () => {
    const gebruiker = userEvent.setup();
    render(<Equipment />, { wrapper: wikkel });
    await openDetail(gebruiker);

    await gebruiker.click(within(binnensteVenster()).getByRole('button', { name: 'equipment.recordMaintenance' }));
    let venster = within(binnensteVenster());
    fireEvent.change(venster.getByLabelText(/equipment\.maintenanceDate/), { target: { value: '2026-03-01' } });
    await gebruiker.type(venster.getByLabelText(/common\.notes/), 'kleppen gesmeerd');

    venster = within(binnensteVenster());
    await gebruiker.click(venster.getAllByRole('button', { name: 'equipment.recordMaintenance' })[0]);

    await waitFor(() => expect(api.recordEquipmentMaintenance).toHaveBeenCalled());
    expect(api.recordEquipmentMaintenance).toHaveBeenCalledWith('apparaat-1', {
      date: '2026-03-01',
      notes: 'kleppen gesmeerd',
    });
    expect(toast.showSuccess).toHaveBeenCalledWith('equipment.maintenanceRecorded');
  });

  it('meldt het als het vastleggen mislukt', async () => {
    vi.mocked(api.recordEquipmentMaintenance).mockRejectedValue(new Error('mis'));
    const gebruiker = userEvent.setup();
    render(<Equipment />, { wrapper: wikkel });
    await openDetail(gebruiker);

    await gebruiker.click(within(binnensteVenster()).getByRole('button', { name: 'equipment.recordMaintenance' }));
    await gebruiker.click(
      within(binnensteVenster()).getAllByRole('button', { name: 'equipment.recordMaintenance' })[0],
    );

    await waitFor(() => expect(toast.showError).toHaveBeenCalledWith('equipment.errorMaintenance'));
    expect(within(binnensteVenster()).getByLabelText(/equipment\.maintenanceDate/)).toBeInTheDocument();
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

  it('stuurt de melding met omgezette reparatiekosten', async () => {
    const gebruiker = userEvent.setup();
    render(<Equipment />, { wrapper: wikkel });
    await openDetail(gebruiker);

    await gebruiker.click(within(binnensteVenster()).getByRole('button', { name: 'equipment.reportDamage' }));
    let venster = within(binnensteVenster());
    fireEvent.change(venster.getByLabelText(/common\.date/), { target: { value: '2026-07-07' } });
    await gebruiker.type(venster.getByLabelText(/common\.description/), 'klep klemt');
    await gebruiker.type(venster.getByLabelText(/equipment\.repairCost/), '75.25');
    await gebruiker.selectOptions(venster.getByLabelText(/common\.status/), 'in_repair');

    venster = within(binnensteVenster());
    await gebruiker.click(venster.getAllByRole('button', { name: 'equipment.reportDamage' })[0]);

    await waitFor(() => expect(api.addEquipmentDamageLog).toHaveBeenCalled());
    expect(api.addEquipmentDamageLog).toHaveBeenCalledWith('apparaat-1', {
      date: '2026-07-07',
      description: 'klep klemt',
      repairCost: 75.25,
      status: 'in_repair',
    });
    expect(toast.showSuccess).toHaveBeenCalledWith('equipment.damageReported');
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
