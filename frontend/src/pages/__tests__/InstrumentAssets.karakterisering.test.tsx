/**
 * Eerste vangnet onder de instrumentenpagina.
 *
 * `InstrumentAssets.tsx` was nooit getest: 100 statements, nul gedekt. Het is
 * de inventaris van wat het orkest bezit, met aankoopprijs, huidige waarde en
 * vervangingswaarde erin - de getallen waarmee de verzekering wordt geregeld.
 * Wie hier stil iets stukmaakt, merkt dat pas als er een claim ligt.
 *
 * De tests volgen wat een gebruiker doet: de lijst bekijken en filteren, een
 * instrument toevoegen, er een wijzigen, er een verwijderen na bevestiging, en
 * het tabblad met achterstallig onderhoud openen.
 *
 * BEWIJS - een mislukte aanroep zag eruit als een lege inventaris. De pagina
 * keek alleen naar `isLoading` en daarna naar `assets.length === 0`, en
 * `assetsData?.data || []` maakt van een mislukte aanroep een lege lijst. Er
 * stond dan "geen instrumenten", terwijl er alleen niets opgehaald was. De test
 * 'toont een foutmelding en niet de lege staat' is rood op de oude code.
 *
 * BEWIJS - de formulierlabels hoorden bij niets. Alle zestien labels in het
 * toevoeg- en wijzigformulier stonden los naast hun veld, zonder `htmlFor` en
 * zonder `id`. Een schermlezer kondigde "bewerkbaar veld" aan zonder te zeggen
 * wat erin moest, en klikken op het label zette de aanwijzer nergens. De zes
 * tests die `getByLabelText` gebruiken zijn daarom rood op de oude code; zoeken
 * via de omhullende `div` zou ook op de kapotte code slagen en bewijst niets.
 *
 * WACHT - een mislukte opslag liet een onafgevangen belofte achter.
 * `handleCreate`, `handleUpdate` en `handleDelete` deden `await
 * mutateAsync(...)` zonder `catch`. De melding kwam er wel (die hangt aan de
 * hook), dus de verwachtingen van 'meldt het als verwijderen niet mag' kloppen
 * ook op de oude code - het is daar geen rode test maar een rode *aanroep*:
 * vitest meldt dan "Unhandled Rejection" en de hele draai valt om. In de
 * browser is dat een `unhandledrejection` op window. Dit is dus een wacht op
 * assertieniveau en een bewijs op draainiveau; de reparatie zit in de drie
 * `try`-blokken.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import InstrumentAssets from '../InstrumentAssets';
import * as api from '../../api/instrument-assets';
import * as toast from '../../utils/toast';
import type { InstrumentAsset, InstrumentAssetSummary } from '../../types';

vi.mock('../../api/instrument-assets');
vi.mock('../../hooks/useDocumentTitle', () => ({ useDocumentTitle: () => {} }));

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

vi.mock('../../utils/toast', () => ({ showSuccess: vi.fn(), showError: vi.fn() }));

function instrument(overschrijving: Partial<InstrumentAsset> = {}): InstrumentAsset {
  return {
    id: 'inst-1',
    name: 'Bugel nr. 3',
    instrumentType: 'Bugel',
    category: 'brass',
    brand: 'Yamaha',
    model: 'YFH-631',
    serialNumber: 'SN-77',
    yearManufactured: 2019,
    purchasePrice: 1200,
    currentValue: 950,
    replacementValue: 1500,
    status: 'available',
    condition: 'good',
    maintenanceIntervalMonths: 12,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    ...overschrijving,
  };
}

function samenvatting(overschrijving: Partial<InstrumentAssetSummary> = {}): InstrumentAssetSummary {
  return {
    total: 12,
    available: 7,
    onLoan: 3,
    inRepair: 2,
    inStorage: 0,
    totalValue: 18500,
    totalReplacementValue: 24000,
    byCategory: [],
    maintenanceDueCount: 2,
    overdueLoansCount: 0,
    ...overschrijving,
  };
}

function wikkel({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function venster() {
  return within(screen.getByRole('dialog'));
}

async function openToevoegen(gebruiker: ReturnType<typeof userEvent.setup>) {
  await gebruiker.click(await screen.findByRole('button', { name: /Instrument toevoegen/ }));
  await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getInstrumentAssets).mockResolvedValue({ data: [instrument()], total: 1, page: 1, limit: 20 });
  vi.mocked(api.getInstrumentAssetsSummary).mockResolvedValue(samenvatting());
  vi.mocked(api.getMaintenanceDueAssets).mockResolvedValue([]);
  vi.mocked(api.getAssetCategories).mockResolvedValue(['brass', 'woodwind']);
  vi.mocked(api.getAssetStatuses).mockResolvedValue(['available', 'on_loan']);
  vi.mocked(api.getAssetConditions).mockResolvedValue(['good', 'damaged']);
  vi.mocked(api.createInstrumentAsset).mockResolvedValue(instrument({ id: 'inst-nieuw' }));
  // Wijzigen en verwijderen geven niets terug (Promise<void>).
  vi.mocked(api.updateInstrumentAsset).mockResolvedValue();
  vi.mocked(api.deleteInstrumentAsset).mockResolvedValue();
});

describe('instrumenten - de lijst', () => {
  it('toont wat de server stuurt, met de Nederlandse labels erbij', async () => {
    vi.mocked(api.getInstrumentAssets).mockResolvedValue({
      data: [
        instrument(),
        instrument({
          id: 'inst-2',
          name: 'Klarinet nr. 1',
          instrumentType: 'Klarinet',
          brand: 'Buffet',
          model: 'E11',
          serialNumber: 'SN-78',
          category: 'woodwind',
          status: 'on_loan',
          condition: 'damaged',
          assignedUser: { id: 'lid-2', firstName: 'Wies', lastName: 'Bakker' },
        }),
      ],
      total: 2,
      page: 1,
      limit: 20,
    });
    render(<InstrumentAssets />, { wrapper: wikkel });

    expect(await screen.findByText('Bugel nr. 3')).toBeInTheDocument();
    // Alleen in de tabel kijken: dezelfde labels staan ook in de filterlijstjes
    // erboven, en dan bewijst een treffer niets over de rij.
    const tabel = within(screen.getByRole('table'));
    expect(tabel.getByText('Yamaha YFH-631')).toBeInTheDocument();
    expect(tabel.getByText('S/N: SN-77')).toBeInTheDocument();
    // De opgeslagen waarden ('brass', 'on_loan') horen als tekst leesbaar te
    // zijn, anders staat er jargon in de kolom.
    expect(tabel.getByText('Koperblazers')).toBeInTheDocument();
    expect(tabel.getByText('Uitgeleend')).toBeInTheDocument();
    expect(tabel.getByText('Beschadigd')).toBeInTheDocument();
    expect(tabel.getByText('Wies Bakker')).toBeInTheDocument();
    expect(tabel.getAllByText('€950.00')).toHaveLength(2);
  });

  it('laat het skelet zien zolang er nog niets binnen is', () => {
    vi.mocked(api.getInstrumentAssets).mockReturnValue(new Promise(() => {}) as never);
    render(<InstrumentAssets />, { wrapper: wikkel });

    expect(screen.getByTestId('skelet-tabel')).toBeInTheDocument();
  });

  it('toont de lege staat als de inventaris echt leeg is', async () => {
    vi.mocked(api.getInstrumentAssets).mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 });
    render(<InstrumentAssets />, { wrapper: wikkel });

    expect(await screen.findByText('instruments.noInstruments')).toBeInTheDocument();
  });

  it('toont een foutmelding en niet de lege staat als het ophalen mislukt', async () => {
    // BEWIJS: op de oude code stond hier 'instruments.noInstruments', alsof het
    // orkest geen instrumenten bezit.
    vi.mocked(api.getInstrumentAssets).mockRejectedValue(new Error('netwerk weg'));
    render(<InstrumentAssets />, { wrapper: wikkel });

    expect(await screen.findByText('errors.generic')).toBeInTheDocument();
    expect(screen.queryByText('instruments.noInstruments')).not.toBeInTheDocument();
  });

  it('toont de samenvatting boven de lijst', async () => {
    render(<InstrumentAssets />, { wrapper: wikkel });

    expect(await screen.findByText('Totaal instrumenten')).toBeInTheDocument();
    // De cijfers komen uit een eigen aanroep en staan er dus een tel later dan
    // de kaarten zelf.
    expect(await screen.findByText('12')).toBeInTheDocument();
    expect(screen.getByText('€18,500.00')).toBeInTheDocument();
  });

  it('stuurt lege filters niet mee en gevulde wel', async () => {
    const gebruiker = userEvent.setup();
    render(<InstrumentAssets />, { wrapper: wikkel });
    await screen.findByText('Bugel nr. 3');

    expect(vi.mocked(api.getInstrumentAssets).mock.calls[0][0]).toEqual({
      search: undefined,
      status: undefined,
      category: undefined,
      condition: undefined,
    });

    const laatsteFilters = () => {
      const aanroepen = vi.mocked(api.getInstrumentAssets).mock.calls;
      return aanroepen[aanroepen.length - 1][0];
    };

    await gebruiker.selectOptions(screen.getByDisplayValue('Alle statussen'), 'on_loan');
    await waitFor(() => expect(laatsteFilters()?.status).toBe('on_loan'));

    await gebruiker.type(screen.getByPlaceholderText('Zoeken...'), 'bugel');
    await waitFor(() => expect(laatsteFilters()?.search).toBe('bugel'));
  });
});

describe('instrumenten - het onderhoudstabblad', () => {
  it('meldt het als er niets te doen is', async () => {
    const gebruiker = userEvent.setup();
    render(<InstrumentAssets />, { wrapper: wikkel });

    await gebruiker.click(await screen.findByRole('button', { name: /Onderhoud/ }));
    expect(screen.getByText('instruments.noMaintenanceDue')).toBeInTheDocument();
  });

  it('zet achterstallig onderhoud apart van gepland onderhoud', async () => {
    vi.mocked(api.getMaintenanceDueAssets).mockResolvedValue([
      instrument({ id: 'inst-3', name: 'Trombone', isOverdue: true, nextMaintenanceDue: '2026-01-09' }),
      instrument({ id: 'inst-4', name: 'Pauk', isOverdue: false, nextMaintenanceDue: '2026-09-01' }),
    ]);
    const gebruiker = userEvent.setup();
    render(<InstrumentAssets />, { wrapper: wikkel });

    await gebruiker.click(await screen.findByRole('button', { name: /Onderhoud/ }));
    expect(screen.getByText('Achterstallig')).toBeInTheDocument();
    expect(screen.getByText('Gepland')).toBeInTheDocument();
    expect(screen.getByText('2026-01-09')).toBeInTheDocument();
  });

  it('toont de lijst weer als je terug gaat naar het instrumententabblad', async () => {
    const gebruiker = userEvent.setup();
    render(<InstrumentAssets />, { wrapper: wikkel });

    await gebruiker.click(await screen.findByRole('button', { name: /Onderhoud/ }));
    expect(screen.queryByText('Bugel nr. 3')).not.toBeInTheDocument();

    await gebruiker.click(screen.getByRole('button', { name: /Instrumenten/ }));
    expect(screen.getByText('Bugel nr. 3')).toBeInTheDocument();
  });
});

describe('instrumenten - toevoegen', () => {
  it('verstuurt niet met een lege naam', async () => {
    const gebruiker = userEvent.setup();
    render(<InstrumentAssets />, { wrapper: wikkel });
    await openToevoegen(gebruiker);

    await gebruiker.click(venster().getByRole('button', { name: 'Toevoegen' }));

    expect(api.createInstrumentAsset).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('stuurt de ingevulde velden mee en laat de lege weg', async () => {
    const gebruiker = userEvent.setup();
    render(<InstrumentAssets />, { wrapper: wikkel });
    await openToevoegen(gebruiker);

    await gebruiker.type(venster().getByLabelText(/^Naam/), 'Sousafoon nr. 1');
    await gebruiker.type(venster().getByLabelText(/^Instrumenttype/), 'Sousafoon');
    await gebruiker.selectOptions(venster().getByLabelText(/^Categorie/), 'brass');
    await gebruiker.type(venster().getByLabelText(/^Aankoopprijs/), '2500.50');
    await gebruiker.click(venster().getByRole('button', { name: 'Toevoegen' }));

    await waitFor(() => expect(api.createInstrumentAsset).toHaveBeenCalled());
    const gegevens = vi.mocked(api.createInstrumentAsset).mock.calls[0][0];
    expect(gegevens.name).toBe('Sousafoon nr. 1');
    expect(gegevens.instrumentType).toBe('Sousafoon');
    expect(gegevens.category).toBe('brass');
    expect(gegevens.purchasePrice).toBe(2500.5);
    expect(gegevens.brand).toBeUndefined();
    expect(gegevens.notes).toBeUndefined();
    // De standaarden van het formulier gaan gewoon mee.
    expect(gegevens.status).toBe('available');
    expect(gegevens.condition).toBe('good');
    expect(gegevens.maintenanceIntervalMonths).toBe(12);
    expect(toast.showSuccess).toHaveBeenCalledWith('Instrument toegevoegd');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('meldt een mislukte toevoeging en houdt het formulier vast', async () => {
    // Deze test is op de oude code rood door de losse labels; de onafgevangen
    // belofte van `handleCreate` (mutateAsync zonder catch) kwam er als
    // "Unhandled Rejection" bovenop. Zie de kop van dit bestand.
    vi.mocked(api.createInstrumentAsset).mockRejectedValue(new Error('Serienummer bestaat al'));
    const gebruiker = userEvent.setup();
    render(<InstrumentAssets />, { wrapper: wikkel });
    await openToevoegen(gebruiker);

    await gebruiker.type(venster().getByLabelText(/^Naam/), 'Sousafoon nr. 1');
    await gebruiker.type(venster().getByLabelText(/^Instrumenttype/), 'Sousafoon');
    await gebruiker.click(venster().getByRole('button', { name: 'Toevoegen' }));

    await waitFor(() => expect(toast.showError).toHaveBeenCalledWith('Serienummer bestaat al'));
    // Het venster blijft staan met wat er ingevuld was, anders is het werk weg.
    expect(venster().getByLabelText(/^Naam/)).toHaveValue('Sousafoon nr. 1');
  });

  it('zet elk ingevuld veld op de juiste plek in de aanvraag', async () => {
    // Een veld dat naar de verkeerde sleutel gaat, valt nergens op: het scherm
    // blijft er hetzelfde uitzien en de server slaat gewoon iets anders op. Dit
    // is de enige plek waar die koppeling gecontroleerd wordt.
    const gebruiker = userEvent.setup();
    render(<InstrumentAssets />, { wrapper: wikkel });
    await openToevoegen(gebruiker);

    const v = venster();
    await gebruiker.type(v.getByLabelText(/^Naam/), 'Sousafoon nr. 1');
    await gebruiker.type(v.getByLabelText(/^Instrumenttype/), 'Sousafoon');
    await gebruiker.selectOptions(v.getByLabelText(/^Categorie/), 'brass');
    await gebruiker.selectOptions(v.getByLabelText(/^Status/), 'in_storage');
    await gebruiker.type(v.getByLabelText(/^Merk/), 'Besson');
    await gebruiker.type(v.getByLabelText(/^Model/), 'BE994');
    await gebruiker.type(v.getByLabelText(/^Serienummer/), 'SN-99');
    await gebruiker.type(v.getByLabelText(/^Bouwjaar/), '2014');
    await gebruiker.selectOptions(v.getByLabelText(/^Conditie/), 'fair');
    await gebruiker.clear(v.getByLabelText(/^Onderhoudsinterval/));
    await gebruiker.type(v.getByLabelText(/^Onderhoudsinterval/), '6');
    await gebruiker.type(v.getByLabelText(/^Aankoopprijs/), '4200');
    await gebruiker.type(v.getByLabelText(/^Huidige waarde/), '3100.75');
    await gebruiker.type(v.getByLabelText(/^Vervangingswaarde/), '5000');
    await gebruiker.type(v.getByLabelText(/^Locatie/), 'Repetitielokaal');
    await gebruiker.type(v.getByLabelText(/^Opslaglocatie/), 'Kast A, plank 3');
    await gebruiker.type(v.getByLabelText(/^Notities/), 'koffer ontbreekt');
    await gebruiker.click(v.getByRole('button', { name: 'Toevoegen' }));

    await waitFor(() => expect(api.createInstrumentAsset).toHaveBeenCalled());
    expect(vi.mocked(api.createInstrumentAsset).mock.calls[0][0]).toEqual({
      name: 'Sousafoon nr. 1',
      instrumentType: 'Sousafoon',
      category: 'brass',
      brand: 'Besson',
      model: 'BE994',
      serialNumber: 'SN-99',
      yearManufactured: 2014,
      status: 'in_storage',
      condition: 'fair',
      maintenanceIntervalMonths: 6,
      purchasePrice: 4200,
      currentValue: 3100.75,
      replacementValue: 5000,
      location: 'Repetitielokaal',
      storageLocation: 'Kast A, plank 3',
      notes: 'koffer ontbreekt',
      // Het formulier biedt deze vier niet aan, al kent de aanvraag ze wel.
      // Bewust vastgelegd: als er ooit velden voor komen, hoort deze test mee
      // te veranderen.
      barcode: undefined,
      countryOfOrigin: undefined,
      color: undefined,
      material: undefined,
      purchaseDate: undefined,
      purchaseVendor: undefined,
    });
  });

  it('gooit het ingevulde weg bij annuleren', async () => {
    const gebruiker = userEvent.setup();
    render(<InstrumentAssets />, { wrapper: wikkel });
    await openToevoegen(gebruiker);

    await gebruiker.type(venster().getByLabelText(/^Naam/), 'Weg hiermee');
    await gebruiker.click(venster().getByRole('button', { name: 'common.cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await openToevoegen(gebruiker);
    expect(venster().getByLabelText(/^Naam/)).toHaveValue('');
    expect(api.createInstrumentAsset).not.toHaveBeenCalled();
  });
});

describe('instrumenten - wijzigen', () => {
  it('opent het wijzigvenster met de bestaande gegevens erin', async () => {
    const gebruiker = userEvent.setup();
    render(<InstrumentAssets />, { wrapper: wikkel });

    await gebruiker.click(await screen.findByRole('button', { name: 'Bewerken' }));
    expect(venster().getByLabelText(/^Naam/)).toHaveValue('Bugel nr. 3');
    expect(venster().getByLabelText(/^Serienummer/)).toHaveValue('SN-77');
    expect(venster().getByLabelText(/^Huidige waarde/)).toHaveValue(950);
  });

  it('slaat de wijziging op onder het juiste instrument', async () => {
    const gebruiker = userEvent.setup();
    render(<InstrumentAssets />, { wrapper: wikkel });

    await gebruiker.click(await screen.findByRole('button', { name: 'Bewerken' }));
    const naam = venster().getByLabelText(/^Naam/);
    await gebruiker.clear(naam);
    await gebruiker.type(naam, 'Bugel nr. 4');
    await gebruiker.click(venster().getByRole('button', { name: 'Opslaan' }));

    await waitFor(() => expect(api.updateInstrumentAsset).toHaveBeenCalled());
    const [id, gegevens] = vi.mocked(api.updateInstrumentAsset).mock.calls[0];
    expect(id).toBe('inst-1');
    expect(gegevens.name).toBe('Bugel nr. 4');
    expect(toast.showSuccess).toHaveBeenCalledWith('Instrument bijgewerkt');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('meldt een mislukte wijziging en laat het venster staan', async () => {
    // Zelfde verhaal als bij toevoegen, nu in `handleUpdate`.
    vi.mocked(api.updateInstrumentAsset).mockRejectedValue(new Error('Geen toegang'));
    const gebruiker = userEvent.setup();
    render(<InstrumentAssets />, { wrapper: wikkel });

    await gebruiker.click(await screen.findByRole('button', { name: 'Bewerken' }));
    await gebruiker.click(venster().getByRole('button', { name: 'Opslaan' }));

    await waitFor(() => expect(toast.showError).toHaveBeenCalledWith('Geen toegang'));
    expect(venster().getByLabelText(/^Naam/)).toHaveValue('Bugel nr. 3');
  });
});

describe('instrumenten - verwijderen', () => {
  it('vraagt eerst om bevestiging en noemt daarbij het instrument', async () => {
    const gebruiker = userEvent.setup();
    render(<InstrumentAssets />, { wrapper: wikkel });

    await gebruiker.click(await screen.findByRole('button', { name: 'Verwijderen' }));
    const vraag = await screen.findByRole('alertdialog');
    expect(within(vraag).getByText(/Bugel nr\. 3/)).toBeInTheDocument();

    await gebruiker.click(within(vraag).getByRole('button', { name: 'common.cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(api.deleteInstrumentAsset).not.toHaveBeenCalled();
  });

  it('verwijdert pas na bevestigen', async () => {
    const gebruiker = userEvent.setup();
    render(<InstrumentAssets />, { wrapper: wikkel });

    await gebruiker.click(await screen.findByRole('button', { name: 'Verwijderen' }));
    await gebruiker.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Verwijderen' }));

    await waitFor(() => expect(api.deleteInstrumentAsset).toHaveBeenCalled());
    expect(vi.mocked(api.deleteInstrumentAsset).mock.calls[0][0]).toBe('inst-1');
    expect(toast.showSuccess).toHaveBeenCalledWith('Instrument verwijderd');
  });

  it('meldt het als verwijderen niet mag en houdt de vraag open', async () => {
    // WACHT: deze verwachtingen kloppen ook op de oude code. Wat daar omvalt is
    // de draai zelf, door de onafgevangen afwijzing in `handleDelete`.
    vi.mocked(api.deleteInstrumentAsset).mockRejectedValue(new Error('Instrument is uitgeleend'));
    const gebruiker = userEvent.setup();
    render(<InstrumentAssets />, { wrapper: wikkel });

    await gebruiker.click(await screen.findByRole('button', { name: 'Verwijderen' }));
    await gebruiker.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Verwijderen' }));

    await waitFor(() => expect(toast.showError).toHaveBeenCalledWith('Instrument is uitgeleend'));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });
});
