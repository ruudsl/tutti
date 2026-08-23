/**
 * Eerste vangnet onder de kledingpagina.
 *
 * Uniforms.tsx was nooit getest: 144 statements, nul gedekt. De pagina beheert
 * fysieke spullen die aan leden worden meegegeven - een colbert, een pantalon -
 * en daar hangt een uitgiftehistorie aan. Wie hier iets stukmaakt, ziet dat
 * niet aan een foutmelding maar pas als iemand op de repetitie zonder jasje
 * staat.
 *
 * Deze tests beschrijven wat de pagina doet, niet wat hij zou moeten doen. Ze
 * gaan over de hoofdweg: de lijst toont wat de server stuurt, een lege lijst
 * geeft de lege staat, de drie tabbladen tonen elk hun eigen gegevens, en de
 * knoppen per rij hangen af van de staat van het onderdeel.
 *
 * Twee dingen zijn hier bewust vastgelegd omdat ze stil kapot kunnen gaan:
 *   - `getItemTypeLabel` zet de opgeslagen waarde ('jacket') om naar het label
 *     dat de server bij de soorten meestuurt ('Colbert'). Staat een soort niet
 *     in die lijst, dan hoort de rauwe waarde er te staan en geen leeg vlak.
 *     Anders verdwijnt een onderdeel dat wél bestaat uit beeld.
 *   - De filters gaan als `undefined` mee zolang ze leeg zijn. Wie er lege
 *     strings van maakt, stuurt filters mee die de server als echte filters
 *     leest.
 *
 * Twee herstelde fouten hebben een regressietest in plaats van een
 * karakterisering; die zijn met BEWIJS gemarkeerd. Het gaat om het zoekveld dat
 * onder de cursor vandaan verdween, en om een mislukte aanvraag die er precies
 * zo uitzag als een lege kast.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import Uniforms from '../Uniforms';
import * as api from '../../api';
import type { UniformItem, UniformItemDetail, UniformSet, UniformItemType, UniformSizeAvailability } from '../../types';

vi.mock('../../api');

vi.mock('../../hooks/useDocumentTitle', () => ({ useDocumentTitle: () => {} }));

// `initReactI18next` hoort erbij omdat de pagina via andere modules de echte
// i18n-opzet meetrekt, en die roept het aan tijdens het laden van de module.
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

const SOORTEN: UniformItemType[] = [
  { value: 'jacket', label: 'Colbert' },
  { value: 'trousers', label: 'Pantalon' },
];

function maakOnderdeel(overschrijving: Partial<UniformItem> = {}): UniformItem {
  return {
    id: 'item-1',
    itemType: 'jacket',
    sizeStandard: 'M',
    sizeLength: null,
    sizeWidth: null,
    color: null,
    condition: 'good',
    status: 'available',
    notes: null,
    purchaseDate: null,
    purchasePrice: null,
    currentUser: null,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    ...overschrijving,
  };
}

const ONDERDELEN: UniformItem[] = [
  maakOnderdeel(),
  maakOnderdeel({
    id: 'item-2',
    itemType: 'trousers',
    sizeStandard: '52',
    condition: 'fair',
    status: 'issued',
    currentUser: { id: 'u-1', firstName: 'Jan', lastName: 'Jansen', email: 'jan@example.com' },
  }),
];

const SETS: UniformSet[] = [
  {
    id: 'set-1',
    name: 'Concerttenue',
    description: 'Voor concerten',
    requirements: [
      { id: 'req-1', itemType: 'jacket', quantity: 1 },
      { id: 'req-2', itemType: 'trousers', quantity: 2 },
    ],
    createdAt: '2026-01-01',
  },
];

const BESCHIKBAARHEID: UniformSizeAvailability[] = [
  { itemType: 'jacket', sizeStandard: 'M', count: 3 },
  { itemType: 'trousers', sizeStandard: '52', count: 1 },
];

const GEBRUIKERS = [
  { id: 'u-1', firstName: 'Jan', lastName: 'Jansen', email: 'jan@example.com' },
  { id: 'u-2', firstName: 'Ada', lastName: 'de Vries', email: 'ada@example.com' },
];

function maakDetail(overschrijving: Partial<UniformItemDetail> = {}): UniformItemDetail {
  return {
    ...maakOnderdeel(),
    assignmentHistory: [],
    ...overschrijving,
  };
}

function zetApiKlaar(): void {
  const leeg = vi.fn().mockResolvedValue([]);
  for (const naam of Object.keys(api)) {
    const functie = (api as Record<string, unknown>)[naam];
    if (typeof functie === 'function') {
      vi.mocked(functie as (...args: unknown[]) => unknown).mockImplementation(leeg);
    }
  }
  vi.mocked(api.getUniformItems).mockResolvedValue({ data: ONDERDELEN, total: 2, page: 1, limit: 50 });
  vi.mocked(api.getUniformItemTypes).mockResolvedValue(SOORTEN);
  vi.mocked(api.getUniformSets).mockResolvedValue(SETS);
  vi.mocked(api.getUniformAvailabilityBySize).mockResolvedValue(BESCHIKBAARHEID);
  vi.mocked(api.getUsers).mockResolvedValue(GEBRUIKERS as never);
  vi.mocked(api.getUniformItem).mockResolvedValue(maakDetail());
  vi.mocked(api.createUniformItem).mockResolvedValue({ id: 'nieuw' });
  vi.mocked(api.createUniformItemsBulk).mockResolvedValue({ ids: ['a', 'b'], count: 2 });
  vi.mocked(api.createUniformSet).mockResolvedValue({ id: 'set-nieuw' });
  vi.mocked(api.assignUniformItem).mockResolvedValue({ id: 'toewijzing' });
}

function wikkel({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** Rendert de pagina en wacht tot de lijst er staat in plaats van het skelet. */
async function toonPagina() {
  const gebruiker = userEvent.setup();
  render(<Uniforms />, { wrapper: wikkel });
  await waitFor(() => expect(screen.queryByTestId('skelet-tabel')).not.toBeInTheDocument());
  return gebruiker;
}

beforeEach(() => {
  vi.clearAllMocks();
  zetApiKlaar();
});

describe('kledingpagina - de lijst met onderdelen', () => {
  it('toont het skelet zolang de onderdelen nog laden', async () => {
    let losmaken: (waarde: { data: UniformItem[]; total: number; page: number; limit: number }) => void = () => {};
    vi.mocked(api.getUniformItems).mockReturnValue(
      new Promise((resolve) => {
        losmaken = resolve;
      }),
    );

    render(<Uniforms />, { wrapper: wikkel });

    expect(await screen.findByTestId('skelet-tabel')).toBeInTheDocument();

    losmaken({ data: ONDERDELEN, total: 2, page: 1, limit: 50 });
    await waitFor(() => expect(screen.queryByTestId('skelet-tabel')).not.toBeInTheDocument());
  });

  it('toont de onderdelen die de server stuurt, met het aantal in de kop', async () => {
    await toonPagina();

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('2');
    // De labels staan ook in de soortenkeuze, dus zoeken binnen de tabel.
    const tabel = within(screen.getByRole('table'));
    expect(tabel.getByText('Colbert')).toBeInTheDocument();
    expect(tabel.getByText('Pantalon')).toBeInTheDocument();
    expect(tabel.getByText('M')).toBeInTheDocument();
    // Het lid dat het onderdeel in bruikleen heeft, staat erbij.
    expect(tabel.getByText('Jan Jansen')).toBeInTheDocument();
  });

  it('haalt de onderdelen op zonder ingevulde filters mee te sturen', async () => {
    await toonPagina();

    // Lege filters gaan als `undefined` mee, niet als lege string: die zou de
    // server als een echt filter kunnen lezen.
    expect(api.getUniformItems).toHaveBeenCalledWith({
      search: undefined,
      status: undefined,
      itemType: undefined,
    });
  });

  it('toont de lege staat als er geen onderdelen zijn', async () => {
    vi.mocked(api.getUniformItems).mockResolvedValue({ data: [], total: 0, page: 1, limit: 50 });

    await toonPagina();

    expect(await screen.findByText('uniforms.noItems')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('0');
  });

  it('toont een onbekende soort met zijn eigen waarde in plaats van een leeg vlak', async () => {
    // Een onderdeel van een soort die niet in de soortenlijst zit - bijvoorbeeld
    // omdat de lijst nog niet binnen is, of omdat er een soort is afgevoerd.
    // Het onderdeel bestaat en hoort dus zichtbaar te blijven.
    vi.mocked(api.getUniformItems).mockResolvedValue({
      data: [maakOnderdeel({ id: 'item-9', itemType: 'cape', sizeStandard: null })],
      total: 1,
      page: 1,
      limit: 50,
    });

    await toonPagina();

    const cellen = within(screen.getAllByRole('row')[1]).getAllByRole('cell');
    expect(cellen[0]).toHaveTextContent('cape');
    // Een onderdeel zonder maat toont een streepje, geen lege cel.
    expect(cellen[1]).toHaveTextContent('-');
  });

  it('geeft een uitgegeven onderdeel de terugbrengknop en een beschikbaar onderdeel de uitgifteknop', async () => {
    await toonPagina();

    const rijen = screen.getAllByRole('row');
    const beschikbaar = rijen.find((rij) => within(rij).queryByText('Colbert'))!;
    const uitgegeven = rijen.find((rij) => within(rij).queryByText('Pantalon'))!;

    expect(within(beschikbaar).getByRole('button', { name: 'uniforms.assignItem' })).toBeInTheDocument();
    expect(within(beschikbaar).queryByRole('button', { name: 'uniforms.returnItem' })).not.toBeInTheDocument();

    expect(within(uitgegeven).getByRole('button', { name: 'uniforms.returnItem' })).toBeInTheDocument();
    expect(within(uitgegeven).queryByRole('button', { name: 'uniforms.assignItem' })).not.toBeInTheDocument();
  });
});

describe('kledingpagina - filteren en zoeken', () => {
  /**
   * Ook dit is een regressietest, geen karakterisering.
   *
   * BEWIJS: met `git checkout HEAD -- src/pages/Uniforms.tsx` is deze test
   * rood. Op die versie kwam alleen `search: 'c'` bij de server aan: elke
   * filterwijziging zette de query terug op 'pending', de pagina verving
   * zichzelf door de skeletweergave, en het zoekveld verdween mét de cursor
   * erin. Zoeken op meer dan één letter was onmogelijk.
   */
  it('stuurt de hele zoekterm mee naar de server, letter voor letter', async () => {
    const gebruiker = await toonPagina();

    await gebruiker.type(screen.getByPlaceholderText('uniforms.searchPlaceholder'), 'colb');

    // Er zit geen ontdubbeling op dit veld: elke toetsaanslag is een nieuwe
    // sleutel en dus een nieuw verzoek. Dat is vastgelegd zoals het is; waar
    // het hier om gaat is dat alle vier de letters aankomen.
    await waitFor(() =>
      expect(api.getUniformItems).toHaveBeenLastCalledWith({
        search: 'colb',
        status: undefined,
        itemType: undefined,
      }),
    );
  });

  it('stuurt het gekozen statusfilter mee naar de server', async () => {
    const gebruiker = await toonPagina();

    const statusKeuze = screen.getAllByRole('combobox')[0];
    await gebruiker.selectOptions(statusKeuze, 'issued');

    await waitFor(() =>
      expect(api.getUniformItems).toHaveBeenLastCalledWith({
        search: undefined,
        status: 'issued',
        itemType: undefined,
      }),
    );
  });

  it('vult de soortenkeuze met de soorten van de server', async () => {
    await toonPagina();

    const soortKeuze = screen.getAllByRole('combobox')[1];
    expect(within(soortKeuze).getByRole('option', { name: 'Colbert' })).toBeInTheDocument();
    expect(within(soortKeuze).getByRole('option', { name: 'Pantalon' })).toBeInTheDocument();
  });
});

describe('kledingpagina - de tabbladen', () => {
  it('toont de sets met hun samenstelling', async () => {
    const gebruiker = await toonPagina();

    await gebruiker.click(screen.getByRole('button', { name: 'uniforms.sets' }));

    expect(await screen.findByText('Concerttenue')).toBeInTheDocument();
    expect(screen.getByText('Voor concerten')).toBeInTheDocument();
    // De samenstelling gebruikt dezelfde vertaling van soort naar label.
    expect(screen.getByText('Colbert x1')).toBeInTheDocument();
    expect(screen.getByText('Pantalon x2')).toBeInTheDocument();
  });

  it('toont de lege staat als er geen sets zijn', async () => {
    vi.mocked(api.getUniformSets).mockResolvedValue([]);
    const gebruiker = await toonPagina();

    await gebruiker.click(screen.getByRole('button', { name: 'uniforms.sets' }));

    expect(await screen.findByText('uniforms.noSets')).toBeInTheDocument();
  });

  it('toont per soort en maat hoeveel er beschikbaar is', async () => {
    const gebruiker = await toonPagina();

    await gebruiker.click(screen.getByRole('button', { name: 'uniforms.availableBySize' }));

    const tabel = await screen.findByRole('table');
    expect(within(tabel).getByText('Colbert')).toBeInTheDocument();
    expect(within(tabel).getByText('3')).toBeInTheDocument();
  });

  it('toont de lege staat als er niets beschikbaar is', async () => {
    vi.mocked(api.getUniformAvailabilityBySize).mockResolvedValue([]);
    const gebruiker = await toonPagina();

    await gebruiker.click(screen.getByRole('button', { name: 'uniforms.availableBySize' }));

    expect(await screen.findByText('Geen beschikbare onderdelen.')).toBeInTheDocument();
  });
});

describe('kledingpagina - het detailvenster', () => {
  it('haalt geen detail op zolang er geen onderdeel geopend is', async () => {
    await toonPagina();

    expect(api.getUniformItem).not.toHaveBeenCalled();
  });

  it('toont de uitgiftehistorie van een geopend onderdeel', async () => {
    vi.mocked(api.getUniformItem).mockResolvedValue(
      maakDetail({
        currentUser: { id: 'u-1', firstName: 'Jan', lastName: 'Jansen', email: 'jan@example.com' },
        status: 'issued',
        assignmentHistory: [
          {
            id: 'toewijzing-1',
            user: { id: 'u-1', firstName: 'Jan', lastName: 'Jansen', email: 'jan@example.com' },
            assignedDate: '2026-03-01',
            returnedDate: null,
            conditionAtAssignment: null,
            conditionAtReturn: null,
            notes: null,
          },
        ],
      }),
    );

    const gebruiker = await toonPagina();
    await gebruiker.click(screen.getAllByTestId('icon-eye')[0]);

    await waitFor(() => expect(api.getUniformItem).toHaveBeenCalledWith('item-1'));

    const venster = await screen.findByRole('dialog');
    expect(venster).toHaveTextContent('uniforms.assignmentHistory');
    expect(within(venster).getByText('2026-03-01')).toBeInTheDocument();
    // Een lopende uitgifte heeft geen einddatum en krijgt daarom een merkje.
    expect(within(venster).getByText('Actief')).toBeInTheDocument();
  });

  it('meldt het als een onderdeel nog nooit uitgegeven is', async () => {
    const gebruiker = await toonPagina();
    await gebruiker.click(screen.getAllByTestId('icon-eye')[0]);

    const venster = await screen.findByRole('dialog');
    expect(within(venster).getByText('Geen uitgifte historie.')).toBeInTheDocument();
  });
});

describe('kledingpagina - onderdelen aanmaken, uitgeven en verwijderen', () => {
  it('maakt een onderdeel aan met alleen de ingevulde velden', async () => {
    const gebruiker = await toonPagina();

    await gebruiker.click(screen.getByRole('button', { name: /uniforms.newItem/ }));

    const venster = await screen.findByRole('dialog');
    await gebruiker.selectOptions(within(venster).getByLabelText(/uniforms.itemType/), 'jacket');
    await gebruiker.type(within(venster).getByLabelText('uniforms.sizeStandard'), 'L');
    await gebruiker.click(within(venster).getByRole('button', { name: 'common.save' }));

    // Niet ingevulde velden gaan als `undefined` mee en niet als lege string;
    // anders slaat de server een lege maat op als een echte maat.
    await waitFor(() =>
      expect(api.createUniformItem).toHaveBeenCalledWith(
        {
          itemType: 'jacket',
          sizeStandard: 'L',
          sizeLength: undefined,
          sizeWidth: undefined,
          condition: 'good',
          status: 'available',
          notes: undefined,
          purchaseDate: undefined,
          purchasePrice: undefined,
        },
        // react-query geeft elke mutatiefunctie zijn eigen context mee.
        expect.anything(),
      ),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('maakt in één keer meerdere onderdelen aan', async () => {
    const gebruiker = await toonPagina();

    await gebruiker.click(screen.getByRole('button', { name: /uniforms.bulkAdd/ }));

    const venster = await screen.findByRole('dialog');
    // Een getalveld laat zich in jsdom niet selecteren, en typen zou '5'
    // achter de bestaande 1 plakken. Daarom de waarde in één keer zetten,
    // precies zoals de browser dat bij een spinnerknop doet.
    fireEvent.change(within(venster).getByLabelText(/uniforms.quantity/), { target: { value: '5' } });
    await gebruiker.selectOptions(within(venster).getByLabelText(/uniforms.itemType/), 'trousers');
    await gebruiker.click(within(venster).getByRole('button', { name: 'common.save' }));

    await waitFor(() =>
      expect(api.createUniformItemsBulk).toHaveBeenCalledWith(
        expect.objectContaining({ itemType: 'trousers', count: 5 }),
        expect.anything(),
      ),
    );
  });

  it('geeft een beschikbaar onderdeel uit aan een gekozen lid', async () => {
    const gebruiker = await toonPagina();

    await gebruiker.click(screen.getByRole('button', { name: 'uniforms.assignItem' }));

    const venster = await screen.findByRole('dialog');
    await gebruiker.selectOptions(within(venster).getByLabelText(/uniforms.selectUser/), 'u-2');
    await gebruiker.click(within(venster).getByRole('button', { name: 'common.save' }));

    await waitFor(() =>
      expect(api.assignUniformItem).toHaveBeenCalledWith(
        'item-1',
        expect.objectContaining({ userId: 'u-2', conditionAtAssignment: undefined }),
      ),
    );
  });

  it('brengt een uitgegeven onderdeel terug', async () => {
    const gebruiker = await toonPagina();

    await gebruiker.click(screen.getByRole('button', { name: 'uniforms.returnItem' }));

    const venster = await screen.findByRole('dialog');
    await gebruiker.selectOptions(within(venster).getByLabelText('uniforms.conditionAtReturn'), 'fair');
    await gebruiker.click(within(venster).getByRole('button', { name: 'common.save' }));

    await waitFor(() =>
      expect(api.returnUniformItem).toHaveBeenCalledWith(
        'item-2',
        expect.objectContaining({ conditionAtReturn: 'fair' }),
      ),
    );
  });

  it('vraagt om bevestiging voordat een onderdeel verdwijnt', async () => {
    const gebruiker = await toonPagina();

    await gebruiker.click(screen.getAllByTestId('icon-trash')[0]);

    const vraag = await screen.findByRole('alertdialog');
    expect(vraag).toHaveTextContent('uniforms.deleteConfirm');
    // Zolang er niet bevestigd is, gebeurt er niets.
    expect(api.deleteUniformItem).not.toHaveBeenCalled();

    await gebruiker.click(within(vraag).getByRole('button', { name: 'common.delete' }));
    await waitFor(() => expect(api.deleteUniformItem).toHaveBeenCalledWith('item-1', expect.anything()));
  });

  it('laat het onderdeel staan als de bevestiging wordt afgebroken', async () => {
    const gebruiker = await toonPagina();

    await gebruiker.click(screen.getAllByTestId('icon-trash')[0]);
    const vraag = await screen.findByRole('alertdialog');
    await gebruiker.click(within(vraag).getByRole('button', { name: 'common.cancel' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(api.deleteUniformItem).not.toHaveBeenCalled();
  });

  it('opent het bewerkvenster met de gegevens van het onderdeel erin', async () => {
    const gebruiker = await toonPagina();

    await gebruiker.click(screen.getAllByTestId('icon-pencil')[0]);

    const venster = await screen.findByRole('dialog');
    expect(venster).toHaveTextContent('uniforms.edit');
    expect(within(venster).getByLabelText('uniforms.sizeStandard')).toHaveValue('M');

    await gebruiker.click(within(venster).getByRole('button', { name: 'common.save' }));

    await waitFor(() =>
      expect(api.updateUniformItem).toHaveBeenCalledWith(
        'item-1',
        expect.objectContaining({ itemType: 'jacket', sizeStandard: 'M' }),
      ),
    );
  });

  it('maakt een set aan vanaf het settabblad', async () => {
    const gebruiker = await toonPagina();

    await gebruiker.click(screen.getByRole('button', { name: 'uniforms.sets' }));
    await gebruiker.click(await screen.findByRole('button', { name: /uniforms.newSet/ }));

    const venster = await screen.findByRole('dialog');
    await gebruiker.type(within(venster).getByLabelText(/uniforms.setName/), 'Paradetenue');
    await gebruiker.click(within(venster).getByRole('button', { name: 'common.save' }));

    await waitFor(() =>
      expect(api.createUniformSet).toHaveBeenCalledWith(
        {
          name: 'Paradetenue',
          description: undefined,
          requirements: undefined,
        },
        expect.anything(),
      ),
    );
  });
});

/**
 * Hieronder staat geen karakteriseringstest maar een regressietest: hij legt
 * gedrag vast zoals het hoort te zijn, na het herstellen van een fout.
 *
 * BEWIJS: met `git checkout HEAD -- src/pages/Uniforms.tsx` (de pagina zonder
 * de reparatie) is deze test rood - de pagina toonde dan 'uniforms.noItems',
 * precies dezelfde tekst als bij een geslaagde aanvraag die niets oplevert.
 */
describe('kledingpagina - herstelde fout', () => {
  it('zegt het als het ophalen mislukt in plaats van te doen alsof er niets is', async () => {
    vi.mocked(api.getUniformItems).mockRejectedValue(new Error('geen verbinding'));

    await toonPagina();

    // Een mislukte aanvraag en een lege kast zien er anders uit. Wie 'nog geen
    // onderdelen' leest terwijl de server onbereikbaar is, gaat onderdelen
    // opnieuw invoeren die er al zijn.
    expect(await screen.findByText('errors.generic')).toBeInTheDocument();
    expect(screen.queryByText('uniforms.noItems')).not.toBeInTheDocument();

    // De pagina blijft verder gewoon staan: kop, filters en tabbladen.
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('uniforms.title');
    expect(screen.getByPlaceholderText('uniforms.searchPlaceholder')).toBeInTheDocument();
  });

  it('probeert het opnieuw op verzoek van de gebruiker', async () => {
    vi.mocked(api.getUniformItems).mockRejectedValue(new Error('geen verbinding'));

    const gebruiker = await toonPagina();
    await screen.findByText('errors.generic');

    vi.mocked(api.getUniformItems).mockResolvedValue({ data: ONDERDELEN, total: 2, page: 1, limit: 50 });
    await gebruiker.click(screen.getByRole('button', { name: 'common.retry' }));

    await waitFor(() => expect(within(screen.getByRole('table')).getByText('Colbert')).toBeInTheDocument());
  });
});
