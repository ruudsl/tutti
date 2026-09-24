/**
 * Eerste vangnet onder de apparatuurpagina.
 *
 * `Equipment.tsx` was nooit getest: 173 statements, nul gedekt. Deze tests
 * horen bij de reparaties die tijdens die eerste ronde zijn gedaan, en leggen
 * daarnaast de hoofdweg vast.
 *
 * BEWIJS - de knoppen stonden er voor iedereen. De backend laat aanmaken,
 * verwijderen, uitlenen, innemen, onderhoud en schade alleen toe voor `admin`
 * en `equipment_committee`: elf routes in `backend/src/routes/equipment.ts`
 * dragen `requireRole('admin', 'equipment_committee')`. De pagina toonde die
 * knoppen aan iedereen. Een gewoon lid vulde dus het hele formulier in en
 * kreeg pas bij het opslaan een 403 terug - werk voor niets, en een melding
 * die niet uitlegt dat het aan de rol lag.
 *
 * BEWIJS - een mislukte aanroep zag eruit als een leeg magazijn. Bleef
 * `equipmentData` leeg door een fout, dan werd `equipment` een lege lijst en
 * stond er "geen apparatuur gevonden", met de uitnodiging om het eerste
 * apparaat toe te voegen. Dat is onwaar: de inventaris kon alleen niet
 * opgehaald worden.
 *
 * BEWIJS - een gevuld magazijn zag er ook uit als een leeg magazijn.
 * GET /equipment antwoordt met een kale array; de pagina las
 * `equipmentData?.data`, alsof er een pagineringsobject terugkwam. Dat veld
 * bestaat niet, dus de lijst bleef altijd leeg. De mocks hier gaven die
 * verzonnen vorm terug, en daarom zag geen test het. Ze geven nu de vorm die
 * backend/src/routes/equipment.ts echt stuurt.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import Equipment from '../Equipment';
import * as api from '../../api/equipment';
import type { Equipment as EquipmentItem } from '../../types';

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

// De rol komt uit de aanmeldcontext; die zetten we per test.
let huidigeRol = 'member';
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'lid-1', role: huidigeRol } }),
}));

/** Een item in precies de vorm waarin GET /equipment het in de lijst stuurt. */
function apparaat(overschrijving: Partial<EquipmentItem> = {}): EquipmentItem {
  return {
    id: 'apparaat-1',
    name: 'Trompet',
    description: null,
    categoryId: null,
    categoryName: null,
    categoryColor: null,
    inventoryNumber: 'EQ-00001',
    serialNumber: 'SN-001',
    brand: 'Yamaha',
    model: 'YTR-2330',
    equipmentType: 'instrument',
    status: 'available',
    condition: 'good',
    location: null,
    isLoanable: true,
    currentValue: 700,
    activeLoans: 0,
    imagePath: null,
    ...overschrijving,
  };
}

/**
 * Alle knoppen die apparatuur toevoegen. Het zijn er meer dan een - de kop en
 * de lege staat dragen dezelfde tekst - dus tellen we ze in plaats van er een
 * te zoeken.
 */
function toevoegknoppen() {
  return screen.queryAllByRole('button', { name: /equipment\.new/ });
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

beforeEach(() => {
  vi.clearAllMocks();
  huidigeRol = 'member';
  // Bewust andere namen dan de apparaten hieronder: staat dezelfde tekst in
  // het categoriefilter, dan slaagt een assertie op die naam ook als de lijst
  // leeg blijft.
  vi.mocked(api.getEquipmentCategories).mockResolvedValue([
    {
      id: 'cat-1',
      name: 'Blaasinstrumenten',
      description: null,
      parentId: null,
      parentName: null,
      color: null,
      icon: null,
      sortOrder: 0,
      itemCount: 1,
    },
  ]);
  vi.mocked(api.getEquipment).mockResolvedValue([apparaat()]);
});

describe('apparatuur - de beheerknoppen volgen de rol', () => {
  it('toont een gewoon lid geen knop om apparatuur toe te voegen', async () => {
    huidigeRol = 'member';
    render(<Equipment />, { wrapper: wikkel });

    expect(await screen.findByText('Trompet')).toBeInTheDocument();
    expect(toevoegknoppen()).toHaveLength(0);
  });

  it('toont een beheerder die knop wel', async () => {
    huidigeRol = 'admin';
    render(<Equipment />, { wrapper: wikkel });

    expect(await screen.findByText('Trompet')).toBeInTheDocument();
    expect(toevoegknoppen().length).toBeGreaterThan(0);
  });

  it('toont de materiaalcommissie die knop ook', async () => {
    // De backend noemt naast admin uitsluitend deze rol.
    huidigeRol = 'equipment_committee';
    render(<Equipment />, { wrapper: wikkel });

    expect(await screen.findByText('Trompet')).toBeInTheDocument();
    expect(toevoegknoppen().length).toBeGreaterThan(0);
  });

  it('biedt een gewoon lid in de lege staat geen knop aan die toch niet mag', async () => {
    huidigeRol = 'member';
    vi.mocked(api.getEquipment).mockResolvedValue([]);
    render(<Equipment />, { wrapper: wikkel });

    expect(await screen.findByText('equipment.noEquipment')).toBeInTheDocument();
    expect(toevoegknoppen()).toHaveLength(0);
  });

  it('biedt een beheerder in de lege staat wel die knop', async () => {
    huidigeRol = 'admin';
    vi.mocked(api.getEquipment).mockResolvedValue([]);
    render(<Equipment />, { wrapper: wikkel });

    expect(await screen.findByText('equipment.noEquipment')).toBeInTheDocument();
    expect(toevoegknoppen().length).toBeGreaterThan(0);
  });
});

describe('apparatuur - een storing is geen leeg magazijn', () => {
  it('toont een foutmelding en niet de lege staat als het ophalen mislukt', async () => {
    vi.mocked(api.getEquipment).mockRejectedValue(new Error('netwerk weg'));
    render(<Equipment />, { wrapper: wikkel });

    expect(await screen.findByText('common.error')).toBeInTheDocument();
    // Dit is de kern: zonder de reparatie stond hier "geen apparatuur
    // gevonden", en dat is een andere mededeling dan "het is niet gelukt".
    expect(screen.queryByText('equipment.noEquipment')).not.toBeInTheDocument();
  });

  it('toont de lege staat wel als het magazijn echt leeg is', async () => {
    vi.mocked(api.getEquipment).mockResolvedValue([]);
    render(<Equipment />, { wrapper: wikkel });

    expect(await screen.findByText('equipment.noEquipment')).toBeInTheDocument();
    expect(screen.queryByText('common.error')).not.toBeInTheDocument();
  });
});

describe('apparatuur - de hoofdweg', () => {
  it('toont de lijst in de vorm die de backend stuurt: een kale array', async () => {
    // Dit is de kern van de reparatie: zonder haar las de pagina `.data` van
    // deze array, kreeg undefined, en toonde "geen apparatuur gevonden".
    vi.mocked(api.getEquipment).mockResolvedValue([
      apparaat(),
      apparaat({ id: 'apparaat-2', name: 'Klarinet', status: 'in_use', activeLoans: 1 }),
    ]);
    render(<Equipment />, { wrapper: wikkel });

    expect(await screen.findByRole('heading', { name: 'Trompet' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Klarinet' })).toBeInTheDocument();
    expect(screen.queryByText('equipment.noEquipment')).not.toBeInTheDocument();
    // Merk en model staan in de backend los en worden samen getoond.
    expect(screen.getAllByText(/Yamaha YTR-2330/)).toHaveLength(2);
    // De status komt uit de enum van de backend, niet uit de oude. Dezelfde
    // tekst staat ook als keuze in het statusfilter; het gaat om het label op
    // de kaart.
    const statuslabels = screen.getAllByText('equipment.statuses.in_use').filter((el) => el.tagName === 'SPAN');
    expect(statuslabels).toHaveLength(1);
  });

  it('laat het skelet zien zolang er nog niets binnen is', () => {
    vi.mocked(api.getEquipment).mockReturnValue(new Promise(() => {}) as never);
    render(<Equipment />, { wrapper: wikkel });

    expect(screen.getAllByTestId('skelet-kaart').length).toBeGreaterThan(0);
  });

  it('vraagt de lijst op zonder lege filters mee te sturen', async () => {
    render(<Equipment />, { wrapper: wikkel });

    await waitFor(() => expect(api.getEquipment).toHaveBeenCalled());
    const argumenten = vi.mocked(api.getEquipment).mock.calls[0][0] as Record<string, unknown>;
    expect(argumenten.status).toBeUndefined();
    expect(argumenten.type).toBeUndefined();
    expect(argumenten.categoryId).toBeUndefined();
  });

  it('stuurt soort, status en categorie door onder de namen die de backend kent', async () => {
    const gebruiker = userEvent.setup();
    render(<Equipment />, { wrapper: wikkel });
    await screen.findByRole('heading', { name: 'Trompet' });

    await gebruiker.selectOptions(screen.getByLabelText('equipment.equipmentType'), 'audio');
    await gebruiker.selectOptions(screen.getByLabelText('common.status'), 'repair');
    await gebruiker.selectOptions(screen.getByLabelText('equipment.category'), 'cat-1');

    await waitFor(() =>
      expect(api.getEquipment).toHaveBeenLastCalledWith({ type: 'audio', status: 'repair', categoryId: 'cat-1' }),
    );
  });

  it('zoekt in de lijst zelf, want de backend kent geen zoekterm', async () => {
    vi.mocked(api.getEquipment).mockResolvedValue([
      apparaat(),
      apparaat({ id: 'apparaat-2', name: 'Klarinet', brand: 'Buffet', model: 'E11', serialNumber: 'SN-002' }),
    ]);
    const gebruiker = userEvent.setup();
    render(<Equipment />, { wrapper: wikkel });
    await screen.findByRole('heading', { name: 'Trompet' });

    await gebruiker.type(screen.getByLabelText('common.search'), 'buffet');

    expect(screen.queryByRole('heading', { name: 'Trompet' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Klarinet' })).toBeInTheDocument();
    // Zoeken is geen serververzoek: de lijst is maar één keer opgehaald.
    expect(api.getEquipment).toHaveBeenCalledTimes(1);
  });
});
