/**
 * De boekhoudpagina: bedragen, boekjaren en knoppen die iets moeten doen.
 *
 * Accounting.karakterisering.test.tsx legde vast wélke tabbladen er zijn en
 * welke queries per tabblad draaien. Dat vangnet zegt niets over wat er in de
 * cijfers staat: alle api's geven daar een lege lijst terug, dus elke optelling
 * op de pagina komt op nul uit en elke nul ziet er goed uit.
 *
 * Hier staan er wél getallen in. Dat is met opzet: bij de boekhouding is "er
 * staat iets op het scherm" geen bewijs. Aan de serverkant zijn eerder twaalf
 * kapotte functies gevonden en een incasso die als overboeking werd
 * weggeschreven - allemaal dingen die een scherm vrolijk blijft tonen. Elke
 * optelling hieronder wordt daarom apart nagerekend met Intl, los van
 * `formatCurrency`:
 *
 *   - debiteuren: de som van de rekeningen met subsoort `receivable`
 *   - crediteuren: diezelfde som over `payable`, maar als positief bedrag
 *   - per rekeningsoort: het totaal onder de kop in het rekeningschema
 *   - openstaande facturen: het aantal met een status die nog niet afgerond is
 *
 * En één ding dat geen optelling is maar wel over bedragen gaat: welk boekjaar
 * de rapportages ophalen. Zie het bewijs onderaan.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import Accounting from '../Accounting';
import * as boekhoudApi from '../../api/accounting';
import type { Account, FiscalYear, Invoice, Transaction } from '../../api/accounting';
import { showSuccess, showError } from '../../utils/toast';

vi.mock('../../api/accounting');

vi.mock('../../hooks/useDocumentTitle', () => ({ useDocumentTitle: () => {} }));

const bevestig = vi.fn();
vi.mock('../../hooks/useConfirm', () => ({ useConfirm: () => bevestig }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (sleutel: string) => sleutel, i18n: { language: 'nl' } }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('../../components/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

vi.mock('../../components/Skeleton', () => ({
  SkeletonTable: () => <div data-testid="skelet-tabel" />,
  SkeletonCard: () => <div data-testid="skelet-kaart" />,
}));

vi.mock('../../components/InvoicePrinter', () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="factuurprinter">
      <button onClick={onClose}>sluit-printer</button>
    </div>
  ),
}));

vi.mock('../../utils/toast', () => ({ showSuccess: vi.fn(), showError: vi.fn() }));

// De taal staat in een test niet vast - de taaldetectie van i18next komt in
// jsdom op Engels uit, en dan schrijft Intl "€3,000.00" waar de gebruiker
// "€ 3.000,00" ziet. Hier gaat het om het bédrag, niet om de scheidingstekens,
// dus de landinstelling wordt vastgezet en de verwachting hieronder wordt met
// diezelfde instelling apart uitgerekend.
vi.mock('../../utils/locale', () => ({ currentLocale: () => 'nl-NL' }));

/**
 * De zeven vensters worden vervangen door een knopje dat zegt wie het is.
 *
 * Ze hebben elk hun eigen formulier en hun eigen api-aanroepen, en die horen
 * bij hun eigen test. Wat hier telt is of de pagina het juiste venster opent,
 * er het juiste meegeeft, en na opslaan het juiste opnieuw ophaalt.
 */
function nepVenster(naam: string) {
  return function Venster({ onClose, onSave }: { onClose?: () => void; onSave?: (data: unknown) => void }) {
    return (
      <div data-testid={`venster-${naam}`}>
        <button onClick={() => onSave?.({ name: '2027', startDate: '2027-01-01', endDate: '2027-12-31' })}>
          {`bewaar-${naam}`}
        </button>
        <button onClick={() => onClose?.()}>{`sluit-${naam}`}</button>
      </div>
    );
  };
}

vi.mock('../Accounting/AccountModal', () => ({ AccountModal: nepVenster('rekening') }));
vi.mock('../Accounting/InvoiceModal', () => ({ InvoiceModal: nepVenster('factuur') }));
vi.mock('../Accounting/RelationModal', () => ({ RelationModal: nepVenster('relatie') }));
vi.mock('../Accounting/CostCenterModal', () => ({ CostCenterModal: nepVenster('kostenplaats') }));
vi.mock('../Accounting/BudgetModal', () => ({ BudgetModal: nepVenster('budget') }));
vi.mock('../Accounting/FiscalYearModal', () => ({ FiscalYearModal: nepVenster('boekjaar') }));
vi.mock('../Accounting/TransactionModal', () => ({
  TransactionModal: ({ transaction, onClose }: { transaction: Transaction | null; onClose: () => void }) => (
    <div data-testid="venster-boeking">
      <span>{transaction ? transaction.description : 'nieuwe-boeking'}</span>
      <button onClick={onClose}>sluit-boeking</button>
    </div>
  ),
}));

/**
 * Zelfde opmaak als de pagina, maar apart uitgerekend - anders test je niets.
 *
 * De vaste spatie tussen het euroteken en het getal (U+00A0) wordt een gewone
 * spatie: testing-library haalt die uit de tekst van het element voordat hij
 * vergelijkt, maar laat de zoekterm ongemoeid. Zonder deze omzetting vindt geen
 * enkel bedrag zichzelf terug.
 */
function euro(bedrag: number): string {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(bedrag).replace(/\u00a0/g, ' ');
}

function rekening(overschrijf: Partial<Account> = {}): Account {
  return {
    id: 'r-1',
    code: '1000',
    name: 'Kas',
    accountType: 'asset',
    isSystem: false,
    isActive: true,
    sortOrder: 0,
    openingBalance: 0,
    currentBalance: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overschrijf,
  };
}

function boeking(overschrijf: Partial<Transaction> = {}): Transaction {
  return {
    id: 'b-1',
    transactionNumber: 'BK-0001',
    transactionType: 'journal',
    transactionDate: '2026-04-01',
    description: 'Contributie april',
    totalAmount: 100,
    isPosted: false,
    lines: [],
    createdAt: '2026-04-01T00:00:00.000Z',
    ...overschrijf,
  } as unknown as Transaction;
}

function factuur(overschrijf: Partial<Invoice> = {}): Invoice {
  return {
    id: 'f-1',
    invoiceNumber: 'F-2026-001',
    invoiceType: 'sales',
    relationId: 'rel-1',
    relationName: 'Gemeente',
    status: 'draft',
    invoiceDate: '2026-04-01',
    dueDate: '2026-05-01',
    subtotal: 100,
    vatAmount: 21,
    total: 121,
    amountPaid: 0,
    amountDue: 121,
    ...overschrijf,
  } as unknown as Invoice;
}

function boekjaar(overschrijf: Partial<FiscalYear> = {}): FiscalYear {
  return {
    id: 'bj-2026',
    name: '2026',
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    status: 'open',
    isCurrent: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overschrijf,
  };
}

function zetApiKlaar(): void {
  for (const naam of Object.keys(boekhoudApi)) {
    const functie = (boekhoudApi as Record<string, unknown>)[naam];
    if (typeof functie === 'function') {
      vi.mocked(functie as (...args: unknown[]) => unknown).mockResolvedValue(undefined);
    }
  }
  vi.mocked(boekhoudApi.getFiscalYears).mockResolvedValue([]);
  vi.mocked(boekhoudApi.getAccounts).mockResolvedValue([]);
  vi.mocked(boekhoudApi.getInvoices).mockResolvedValue([]);
  vi.mocked(boekhoudApi.getTransactions).mockResolvedValue([]);
  vi.mocked(boekhoudApi.getRelations).mockResolvedValue([]);
  vi.mocked(boekhoudApi.getCostCenters).mockResolvedValue([]);
  vi.mocked(boekhoudApi.getBudgets).mockResolvedValue([]);
}

function wikkel({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/**
 * Zoekt een knop op zijn tekst, buiten de tabbladenbalk om.
 *
 * Vier labels staan zowel op een tabblad als in het exportmenu
 * ("grootboekrekeningen", "boekingen", "facturen", "relaties"). Zonder dit
 * filter klikt een test op het tabblad terwijl hij dacht te exporteren.
 */
function knopBuitenTabs(tekst: string): HTMLElement {
  const gevonden = screen
    .getAllByRole('button')
    .filter((knop) => !knop.className.includes('tab') && knop.textContent?.trim() === tekst);
  expect(gevonden).toHaveLength(1);
  return gevonden[0];
}

/**
 * De telkaart met dit kopje op het overzicht.
 *
 * Vier van deze kopjes staan ook op een tabblad en in het exportmenu. De kaart
 * is te herkennen aan de klasse van het kopje zelf; zonder dat onderscheid
 * vindt `getByText` er drie en klapt hij eruit.
 */
function telkaart(kop: string): HTMLElement {
  const label = screen.getAllByText(kop).find((element) => element.className.includes('text-base-content/60'));
  expect(label).toBeDefined();
  return label!.parentElement!;
}

function tabblad(label: string): HTMLElement {
  return screen
    .getAllByRole('button')
    .find((knop) => knop.className.includes('tab') && knop.textContent?.trim() === label)!;
}

async function toonPagina() {
  const gebruiker = userEvent.setup();
  render(<Accounting />, { wrapper: wikkel });
  await waitFor(() => expect(boekhoudApi.getFiscalYears).toHaveBeenCalled());
  return gebruiker;
}

beforeEach(() => {
  vi.clearAllMocks();
  zetApiKlaar();
  bevestig.mockResolvedValue(true);
  vi.stubGlobal('confirm', () => true);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('boekhouding - het overzicht rekent op', () => {
  const rekeningen = [
    rekening({ id: 'r-bank', code: '1010', name: 'Bankrekening', accountSubtype: 'bank', currentBalance: 1234.56 }),
    rekening({ id: 'r-spaar', code: '1020', name: 'Spaarrekening', accountSubtype: 'bank', currentBalance: -75.4 }),
    rekening({ id: 'r-deb1', code: '1300', name: 'Debiteuren', accountSubtype: 'receivable', currentBalance: 2500.5 }),
    rekening({
      id: 'r-deb2',
      code: '1310',
      name: 'Nog te ontvangen',
      accountSubtype: 'receivable',
      currentBalance: 499.5,
    }),
    rekening({
      id: 'r-cred1',
      code: '1600',
      name: 'Crediteuren',
      accountType: 'liability',
      accountSubtype: 'payable',
      currentBalance: -1200.25,
    }),
    rekening({
      id: 'r-cred2',
      code: '1610',
      name: 'Nog te betalen',
      accountType: 'liability',
      accountSubtype: 'payable',
      currentBalance: -800.75,
    }),
  ];

  beforeEach(() => {
    vi.mocked(boekhoudApi.getAccounts).mockResolvedValue(rekeningen);
  });

  it('telt de debiteuren op tot het werkelijke openstaande bedrag', async () => {
    await toonPagina();

    // 2500,50 + 499,50 = 3000,00. Niet het saldo van de eerste rekening, en
    // niet het totaal van alle activa.
    const kaart = (await screen.findByText('accounting.debtors')).parentElement!;
    expect(within(kaart).getByText(euro(3000))).toBeInTheDocument();
  });

  it('toont de crediteuren als positief bedrag, niet als min', async () => {
    await toonPagina();

    // -1200,25 + -800,75 = -2001,00, en dat staat er als 2001,00: een schuld
    // hoort niet met een minteken onder het kopje "crediteuren".
    const kaart = (await screen.findByText('accounting.creditors')).parentElement!;
    expect(within(kaart).getByText(euro(2001))).toBeInTheDocument();
    expect(within(kaart).queryByText(euro(-2001))).not.toBeInTheDocument();
  });

  it('zet elke bankrekening met haar eigen saldo op het overzicht', async () => {
    await toonPagina();

    const kaart = (await screen.findByText('accounting.bankAccounts')).parentElement!;
    expect(within(kaart).getByText(euro(1234.56))).toBeInTheDocument();
    expect(within(kaart).getByText(euro(-75.4))).toBeInTheDocument();
    // Alleen de bankrekeningen: debiteuren horen hier niet tussen.
    expect(within(kaart).queryByText('Debiteuren')).not.toBeInTheDocument();
  });

  it('laat het bankblok weg als er geen bankrekening is', async () => {
    vi.mocked(boekhoudApi.getAccounts).mockResolvedValue([rekening({ accountSubtype: 'cash' })]);
    await toonPagina();

    await screen.findByText('accounting.debtors');
    expect(screen.queryByText('accounting.bankAccounts')).not.toBeInTheDocument();
  });

  it('telt alleen de nog niet afgeronde facturen als openstaand', async () => {
    vi.mocked(boekhoudApi.getInvoices).mockResolvedValue([
      factuur({ id: 'f-1', status: 'draft' }),
      factuur({ id: 'f-2', status: 'sent' }),
      factuur({ id: 'f-3', status: 'partial' }),
      factuur({ id: 'f-4', status: 'overdue' }),
      factuur({ id: 'f-5', status: 'paid' }),
      factuur({ id: 'f-6', status: 'cancelled' }),
      factuur({ id: 'f-7', status: 'written_off' }),
    ]);
    await toonPagina();

    // Zeven facturen, vier openstaand.
    await screen.findByText('accounting.recentTransactions');
    expect(within(telkaart('accounting.openInvoices')).getByText('4')).toBeInTheDocument();
  });

  it('zet in de telkaarten de aantallen van elk onderdeel', async () => {
    vi.mocked(boekhoudApi.getTransactions).mockResolvedValue([boeking({ id: 'b-1' }), boeking({ id: 'b-2' })]);
    vi.mocked(boekhoudApi.getRelations).mockResolvedValue([{ id: 'rel-1' }, { id: 'rel-2' }, { id: 'rel-3' }] as never);
    vi.mocked(boekhoudApi.getCostCenters).mockResolvedValue([{ id: 'kp-1' }] as never);
    vi.mocked(boekhoudApi.getBudgets).mockResolvedValue([]);
    await toonPagina();

    await screen.findByText('accounting.recentTransactions');
    expect(within(telkaart('accounting.chartOfAccounts')).getByText('6')).toBeInTheDocument();
    expect(within(telkaart('accounting.journalEntries')).getByText('2')).toBeInTheDocument();
    expect(within(telkaart('accounting.relations')).getByText('3')).toBeInTheDocument();
    expect(within(telkaart('accounting.costCenters')).getByText('1')).toBeInTheDocument();
    expect(within(telkaart('accounting.budgets')).getByText('0')).toBeInTheDocument();
  });

  it('toont hoogstens vijf recente boekingen, met hun bedrag', async () => {
    vi.mocked(boekhoudApi.getTransactions).mockResolvedValue(
      Array.from({ length: 7 }, (_, i) =>
        boeking({ id: `b-${i}`, transactionNumber: `BK-000${i}`, totalAmount: (i + 1) * 10.5 }),
      ),
    );
    await toonPagina();

    await screen.findByText('accounting.recentTransactions');
    expect(screen.getByText('BK-0000')).toBeInTheDocument();
    expect(screen.getByText('BK-0004')).toBeInTheDocument();
    expect(screen.queryByText('BK-0005')).not.toBeInTheDocument();
    expect(screen.getByText(euro(10.5))).toBeInTheDocument();
    expect(screen.getByText(euro(52.5))).toBeInTheDocument();
  });

  it('meldt het als er nog geen boekingen zijn', async () => {
    await toonPagina();

    expect(await screen.findByText('accounting.noTransactions')).toBeInTheDocument();
  });

  it('springt vanuit een telkaart naar het bijbehorende tabblad', async () => {
    const gebruiker = await toonPagina();

    await screen.findByText('accounting.recentTransactions');
    await gebruiker.click(telkaart('accounting.costCenters'));

    await waitFor(() => expect(tabblad('accounting.costCenters').className).toContain('tab-active'));
  });
});

describe('boekhouding - het rekeningschema', () => {
  it('telt per rekeningsoort het saldo van die soort op', async () => {
    vi.mocked(boekhoudApi.getAccounts).mockResolvedValue([
      rekening({ id: 'a-1', code: '1000', name: 'Kas', accountType: 'asset', currentBalance: 300.25 }),
      rekening({ id: 'a-2', code: '1010', name: 'Bank', accountType: 'asset', currentBalance: 1699.75 }),
      rekening({ id: 'l-1', code: '1600', name: 'Crediteuren', accountType: 'liability', currentBalance: -450 }),
    ]);
    const gebruiker = await toonPagina();

    await gebruiker.click(tabblad('accounting.chartOfAccounts'));

    const activa = (await screen.findByText('accounting.accountTypes.asset')).closest<HTMLElement>('.page-header')!;
    // 300,25 + 1699,75 = 2000,00.
    expect(within(activa).getByText(euro(2000))).toBeInTheDocument();

    const schulden = screen.getByText('accounting.accountTypes.liability').closest<HTMLElement>('.page-header')!;
    expect(within(schulden).getByText(euro(-450))).toBeInTheDocument();
  });

  it('zet de rekeningen binnen een soort op rekeningnummer', async () => {
    vi.mocked(boekhoudApi.getAccounts).mockResolvedValue([
      rekening({ id: 'a-3', code: '1030', name: 'Derde' }),
      rekening({ id: 'a-1', code: '1010', name: 'Eerste' }),
      rekening({ id: 'a-2', code: '1020', name: 'Tweede' }),
    ]);
    const gebruiker = await toonPagina();

    await gebruiker.click(tabblad('accounting.chartOfAccounts'));

    await screen.findByText('Eerste');
    const namen = screen
      .getAllByRole<HTMLTableRowElement>('row')
      .slice(1)
      .map((rij) => rij.cells[1].textContent);
    expect(namen).toEqual(['Eerste', 'Tweede', 'Derde']);
  });

  it('biedt bij een leeg schema aan het standaardschema aan te maken', async () => {
    vi.mocked(boekhoudApi.initializeAccounts).mockResolvedValue({ message: '42 rekeningen aangemaakt', count: 42 });
    const gebruiker = await toonPagina();

    await gebruiker.click(tabblad('accounting.chartOfAccounts'));
    await gebruiker.click((await screen.findAllByText('accounting.initializeAccounts'))[0]);

    await waitFor(() => expect(boekhoudApi.initializeAccounts).toHaveBeenCalled());
    // De melding van de server komt terug bij de gebruiker, niet een eigen tekst.
    expect(showSuccess).toHaveBeenCalledWith('42 rekeningen aangemaakt');
  });

  it('meldt het als het standaardschema niet aangemaakt kan worden', async () => {
    vi.mocked(boekhoudApi.initializeAccounts).mockRejectedValue({
      response: { data: { error: 'schema bestaat al' } },
    });
    const gebruiker = await toonPagina();

    await gebruiker.click(tabblad('accounting.chartOfAccounts'));
    await gebruiker.click((await screen.findAllByText('accounting.initializeAccounts'))[0]);

    await waitFor(() => expect(showError).toHaveBeenCalledWith('schema bestaat al'));
  });

  it('verwijdert een rekening pas na bevestiging', async () => {
    vi.mocked(boekhoudApi.getAccounts).mockResolvedValue([rekening({ id: 'r-9', name: 'Losse rekening' })]);
    bevestig.mockResolvedValue(false);
    const gebruiker = await toonPagina();

    await gebruiker.click(tabblad('accounting.chartOfAccounts'));
    await gebruiker.click(await screen.findByTestId('icon-trash'));

    await waitFor(() => expect(bevestig).toHaveBeenCalledWith('accounting.confirmDeleteAccount'));
    expect(boekhoudApi.deleteAccount).not.toHaveBeenCalled();

    bevestig.mockResolvedValue(true);
    await gebruiker.click(screen.getByTestId('icon-trash'));

    // `deleteAccount` is rechtstreeks de mutationFn, dus react-query geeft er
    // zijn eigen context als tweede argument bij mee.
    await waitFor(() => expect(boekhoudApi.deleteAccount).toHaveBeenCalledWith('r-9', expect.anything()));
    expect(showSuccess).toHaveBeenCalledWith('accounting.accountDeleted');
  });

  it('laat een systeemrekening niet verwijderen', async () => {
    vi.mocked(boekhoudApi.getAccounts).mockResolvedValue([rekening({ id: 'r-sys', name: 'Kapitaal', isSystem: true })]);
    const gebruiker = await toonPagina();

    await gebruiker.click(tabblad('accounting.chartOfAccounts'));

    expect(await screen.findByText('accounting.system')).toBeInTheDocument();
    expect(screen.queryByTestId('icon-trash')).not.toBeInTheDocument();
  });

  it('opent het rekeningvenster voor bewerken en haalt na opslaan opnieuw op', async () => {
    vi.mocked(boekhoudApi.getAccounts).mockResolvedValue([rekening({ id: 'r-9', name: 'Losse rekening' })]);
    const gebruiker = await toonPagina();

    await gebruiker.click(tabblad('accounting.chartOfAccounts'));
    await gebruiker.click(await screen.findByTestId('icon-pencil'));

    expect(await screen.findByTestId('venster-rekening')).toBeInTheDocument();

    await gebruiker.click(screen.getByRole('button', { name: 'bewaar-rekening' }));

    await waitFor(() => expect(screen.queryByTestId('venster-rekening')).not.toBeInTheDocument());
  });
});

describe('boekhouding - boekingen en facturen afhandelen', () => {
  it('boekt een concept en meldt dat het geboekt is', async () => {
    vi.mocked(boekhoudApi.getTransactions).mockResolvedValue([boeking({ id: 'b-7' })]);
    const gebruiker = await toonPagina();

    await gebruiker.click(tabblad('accounting.journalEntries'));
    await gebruiker.click(await screen.findByTitle('accounting.postTransaction'));

    await waitFor(() => expect(boekhoudApi.postTransaction).toHaveBeenCalledWith('b-7'));
    expect(showSuccess).toHaveBeenCalledWith('accounting.transactionPosted');
  });

  it('meldt het als boeken mislukt', async () => {
    vi.mocked(boekhoudApi.getTransactions).mockResolvedValue([boeking({ id: 'b-7' })]);
    vi.mocked(boekhoudApi.postTransaction).mockRejectedValue({
      response: { data: { error: 'boeking is niet in balans' } },
    });
    const gebruiker = await toonPagina();

    await gebruiker.click(tabblad('accounting.journalEntries'));
    await gebruiker.click(await screen.findByTitle('accounting.postTransaction'));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('boeking is niet in balans'));
  });

  it('verwijdert een concept na bevestiging', async () => {
    vi.mocked(boekhoudApi.getTransactions).mockResolvedValue([boeking({ id: 'b-7' })]);
    const gebruiker = await toonPagina();

    await gebruiker.click(tabblad('accounting.journalEntries'));
    await gebruiker.click(await screen.findByTitle('common.delete'));

    await waitFor(() => expect(boekhoudApi.deleteTransaction).toHaveBeenCalledWith('b-7'));
    expect(showSuccess).toHaveBeenCalledWith('accounting.transactionDeleted');
  });

  it('haalt de regels van een boeking op voordat het bewerkvenster opengaat', async () => {
    vi.mocked(boekhoudApi.getTransactions).mockResolvedValue([boeking({ id: 'b-7' })]);
    vi.mocked(boekhoudApi.getTransaction).mockResolvedValue(
      boeking({ id: 'b-7', description: 'Volledige boeking met regels' }),
    );
    const gebruiker = await toonPagina();

    await gebruiker.click(tabblad('accounting.journalEntries'));
    await gebruiker.click(await screen.findByTitle('common.edit'));

    // Het overzicht kent de regels niet, dus die moeten er eerst bij gehaald
    // worden; het venster hoort de opgehaalde boeking te krijgen, niet de rij.
    await waitFor(() => expect(boekhoudApi.getTransaction).toHaveBeenCalledWith('b-7'));
    expect(await screen.findByText('Volledige boeking met regels')).toBeInTheDocument();
  });

  it('meldt het als de regels van een boeking niet op te halen zijn', async () => {
    vi.mocked(boekhoudApi.getTransactions).mockResolvedValue([boeking({ id: 'b-7' })]);
    vi.mocked(boekhoudApi.getTransaction).mockRejectedValue({ response: { data: { error: 'boeking is weg' } } });
    const gebruiker = await toonPagina();

    await gebruiker.click(tabblad('accounting.journalEntries'));
    await gebruiker.click(await screen.findByTitle('common.edit'));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('boeking is weg'));
    expect(screen.queryByTestId('venster-boeking')).not.toBeInTheDocument();
  });

  it('opent een leeg boekingsvenster voor een nieuwe boeking', async () => {
    const gebruiker = await toonPagina();

    await gebruiker.click(tabblad('accounting.journalEntries'));
    await gebruiker.click(await screen.findByText('accounting.newEntry'));

    expect(await screen.findByText('nieuwe-boeking')).toBeInTheDocument();
  });

  it('verstuurt een conceptfactuur', async () => {
    vi.mocked(boekhoudApi.getInvoices).mockResolvedValue([factuur({ id: 'f-3', status: 'draft' })]);
    const gebruiker = await toonPagina();

    await gebruiker.click(tabblad('accounting.invoices'));
    await gebruiker.click(await screen.findByTitle('accounting.sendInvoice'));

    await waitFor(() => expect(boekhoudApi.sendInvoice).toHaveBeenCalledWith('f-3'));
    expect(showSuccess).toHaveBeenCalledWith('accounting.invoiceSent');
  });

  it('meldt een verstuurde factuur betaald, en biedt dat niet aan bij een concept', async () => {
    vi.mocked(boekhoudApi.getInvoices).mockResolvedValue([factuur({ id: 'f-4', status: 'sent' })]);
    const gebruiker = await toonPagina();

    await gebruiker.click(tabblad('accounting.invoices'));
    await gebruiker.click(await screen.findByTitle('accounting.markPaid'));

    await waitFor(() => expect(boekhoudApi.markInvoicePaid).toHaveBeenCalledWith('f-4'));
    expect(showSuccess).toHaveBeenCalledWith('accounting.invoiceMarkedPaid');
    expect(screen.queryByTitle('accounting.sendInvoice')).not.toBeInTheDocument();
  });

  it('verwijdert een conceptfactuur na bevestiging', async () => {
    vi.mocked(boekhoudApi.getInvoices).mockResolvedValue([factuur({ id: 'f-5', status: 'draft' })]);
    const gebruiker = await toonPagina();

    await gebruiker.click(tabblad('accounting.invoices'));
    await gebruiker.click(await screen.findByTitle('common.delete'));

    await waitFor(() => expect(boekhoudApi.deleteInvoice).toHaveBeenCalledWith('f-5'));
    expect(showSuccess).toHaveBeenCalledWith('accounting.invoiceDeleted');
  });

  it('meldt het als een factuur niet verstuurd kan worden', async () => {
    vi.mocked(boekhoudApi.getInvoices).mockResolvedValue([factuur({ id: 'f-6', status: 'draft' })]);
    vi.mocked(boekhoudApi.sendInvoice).mockRejectedValue({ response: { data: { error: 'geen e-mailadres' } } });
    const gebruiker = await toonPagina();

    await gebruiker.click(tabblad('accounting.invoices'));
    await gebruiker.click(await screen.findByTitle('accounting.sendInvoice'));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('geen e-mailadres'));
  });

  it('toont het factuurbedrag zoals de server het gaf', async () => {
    vi.mocked(boekhoudApi.getInvoices).mockResolvedValue([
      factuur({ id: 'f-8', subtotal: 1000, vatAmount: 210, total: 1210 }),
    ]);
    const gebruiker = await toonPagina();

    await gebruiker.click(tabblad('accounting.invoices'));

    // Het totaal met btw, niet het bedrag zonder.
    expect(await screen.findByText(euro(1210))).toBeInTheDocument();
    expect(screen.queryByText(euro(1000))).not.toBeInTheDocument();
  });

  it('opent en sluit de afdrukweergave van een factuur', async () => {
    vi.mocked(boekhoudApi.getInvoices).mockResolvedValue([factuur({ id: 'f-9' })]);
    const gebruiker = await toonPagina();

    await gebruiker.click(tabblad('accounting.invoices'));
    await gebruiker.click(await screen.findByTitle('printTemplates.invoice.printButton'));

    expect(await screen.findByTestId('factuurprinter')).toBeInTheDocument();

    await gebruiker.click(screen.getByRole('button', { name: 'sluit-printer' }));
    expect(screen.queryByTestId('factuurprinter')).not.toBeInTheDocument();
  });
});

describe('boekhouding - boekjaren', () => {
  it('biedt zonder boekjaar meteen aan er een aan te maken', async () => {
    const gebruiker = await toonPagina();

    await gebruiker.click(knopBuitenTabs('accounting.newFiscalYear'));
    await gebruiker.click(await screen.findByRole('button', { name: 'bewaar-boekjaar' }));

    await waitFor(() =>
      expect(boekhoudApi.createFiscalYear).toHaveBeenCalledWith(
        { name: '2027', startDate: '2027-01-01', endDate: '2027-12-31' },
        expect.anything(),
      ),
    );
    expect(showSuccess).toHaveBeenCalledWith('accounting.fiscalYearCreated');
    await waitFor(() => expect(screen.queryByTestId('venster-boekjaar')).not.toBeInTheDocument());
  });

  it('meldt het als een boekjaar niet aangemaakt kan worden en houdt het venster open', async () => {
    vi.mocked(boekhoudApi.createFiscalYear).mockRejectedValue({
      response: { data: { error: 'boekjaar overlapt' } },
    });
    const gebruiker = await toonPagina();

    await gebruiker.click(knopBuitenTabs('accounting.newFiscalYear'));
    await gebruiker.click(await screen.findByRole('button', { name: 'bewaar-boekjaar' }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('boekjaar overlapt'));
    expect(screen.getByTestId('venster-boekjaar')).toBeInTheDocument();
  });

  it('merkt het lopende boekjaar in de keuzelijst', async () => {
    vi.mocked(boekhoudApi.getFiscalYears).mockResolvedValue([
      boekjaar({ id: 'bj-2025', name: '2025', isCurrent: false }),
      boekjaar({ id: 'bj-2026', name: '2026', isCurrent: true }),
    ]);
    await toonPagina();

    const keuze = await screen.findByRole('combobox');
    expect(keuze).toHaveValue('bj-2026');
    expect(within(keuze).getByText('2026 (accounting.current)')).toBeInTheDocument();
    expect(within(keuze).getByText('2025')).toBeInTheDocument();
  });

  it('haalt de boekingen en budgetten van het gekozen boekjaar op', async () => {
    vi.mocked(boekhoudApi.getFiscalYears).mockResolvedValue([
      boekjaar({ id: 'bj-2025', name: '2025', isCurrent: false }),
      boekjaar({ id: 'bj-2026', name: '2026', isCurrent: true }),
    ]);
    const gebruiker = await toonPagina();

    await gebruiker.selectOptions(await screen.findByRole('combobox'), 'bj-2025');

    await waitFor(() => expect(boekhoudApi.getTransactions).toHaveBeenCalledWith({ fiscalYearId: 'bj-2025' }));
    await waitFor(() => expect(boekhoudApi.getBudgets).toHaveBeenCalledWith({ fiscalYearId: 'bj-2025' }));
  });
});

describe('boekhouding - uitvoeren', () => {
  beforeEach(() => {
    vi.mocked(boekhoudApi.getFiscalYears).mockResolvedValue([boekjaar()]);
  });

  it.each([
    ['accounting.journalEntries', 'exportTransactions'],
    ['accounting.chartOfAccounts', 'exportAccounts'],
    ['accounting.invoices', 'exportInvoices'],
    ['accounting.balanceSheet', 'exportBalanceSheet'],
    ['accounting.profitLoss', 'exportProfitLoss'],
  ])('voert %s uit over het gekozen boekjaar', async (label, functie) => {
    const gebruiker = await toonPagina();

    await gebruiker.click(knopBuitenTabs(label));

    await waitFor(() => expect(boekhoudApi[functie as 'exportTransactions']).toHaveBeenCalledWith('bj-2026'));
    expect(showSuccess).toHaveBeenCalledWith('accounting.exportSuccess');
  });

  it('voert relaties uit zonder boekjaar, want die hangen er niet aan', async () => {
    const gebruiker = await toonPagina();

    await gebruiker.click(knopBuitenTabs('accounting.relations'));

    await waitFor(() => expect(boekhoudApi.exportRelations).toHaveBeenCalledWith());
  });

  it('weigert een balans zonder boekjaar in plaats van er een lege op te vragen', async () => {
    vi.mocked(boekhoudApi.getFiscalYears).mockResolvedValue([]);
    const gebruiker = await toonPagina();

    await gebruiker.click(knopBuitenTabs('accounting.balanceSheet'));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('accounting.selectFiscalYearFirst'));
    expect(boekhoudApi.exportBalanceSheet).not.toHaveBeenCalled();
    expect(showSuccess).not.toHaveBeenCalled();
  });

  it('weigert een winst-en-verliesrekening zonder boekjaar', async () => {
    vi.mocked(boekhoudApi.getFiscalYears).mockResolvedValue([]);
    const gebruiker = await toonPagina();

    await gebruiker.click(knopBuitenTabs('accounting.profitLoss'));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('accounting.selectFiscalYearFirst'));
    expect(boekhoudApi.exportProfitLoss).not.toHaveBeenCalled();
  });

  it('meldt een mislukte uitvoer en zet de knop weer aan', async () => {
    vi.mocked(boekhoudApi.exportTransactions).mockRejectedValue({
      response: { data: { error: 'uitvoer mislukt' } },
    });
    const gebruiker = await toonPagina();

    await gebruiker.click(knopBuitenTabs('accounting.journalEntries'));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('uitvoer mislukt'));
    // De knop mag niet blijven hangen op "bezig", anders kan er nooit meer
    // uitgevoerd worden zonder de pagina te herladen.
    await waitFor(() => expect(knopBuitenTabs('accounting.export')).toBeEnabled());
  });
});

describe('boekhouding - de rapportages horen bij het gekozen boekjaar', () => {
  const tweeBoekjaren = [
    boekjaar({ id: 'bj-2025', name: '2025', isCurrent: false }),
    boekjaar({ id: 'bj-2026', name: '2026', isCurrent: true }),
  ];

  const balans2025 = {
    assets: [{ code: '1000', name: 'Kas', currentBalance: 5000 }],
    liabilities: [],
    equity: [],
    totals: { assets: 5000, liabilities: 0, equity: 0, liabilitiesAndEquity: 5000 },
  };
  const balans2026 = {
    assets: [{ code: '1000', name: 'Kas', currentBalance: 9999 }],
    liabilities: [],
    equity: [],
    totals: { assets: 9999, liabilities: 0, equity: 0, liabilitiesAndEquity: 9999 },
  };

  beforeEach(() => {
    vi.mocked(boekhoudApi.getFiscalYears).mockResolvedValue(tweeBoekjaren);
    vi.mocked(boekhoudApi.getBalanceReport).mockImplementation(
      async (id?: string) => (id === 'bj-2025' ? balans2025 : balans2026) as never,
    );
    vi.mocked(boekhoudApi.getProfitLossReport).mockResolvedValue({
      income: [],
      expenses: [],
      totals: { income: 0, expenses: 0, netResult: 0 },
    } as never);
  });

  it('haalt zonder eigen keuze de rapportage van het lopende boekjaar op', async () => {
    const gebruiker = await toonPagina();

    await gebruiker.click(tabblad('accounting.reports'));

    await waitFor(() => expect(boekhoudApi.getBalanceReport).toHaveBeenCalledWith('bj-2026'));
    // Het bedrag staat drie keer op de balans (de rekening zelf, het totaal aan
    // activa, en het totaal aan passiva), dus de regel met het totaal wordt
    // apart opgezocht.
    const totaal = (await screen.findByText('accounting.totalAssets')).parentElement!;
    expect(within(totaal).getByText(euro(9999))).toBeInTheDocument();
  });

  /**
   * BEWIJS. Vóór de reparatie in Accounting/index.tsx faalt deze test.
   *
   * De keuzelijst bovenaan zet `selectedFiscalYear`. De boekingen, de budgetten
   * en de uitvoer luisterden daarnaar, maar de balans en de winst-en-
   * verliesrekening niet: die bleven vragen naar het boekjaar met `isCurrent`.
   *
   * Wie 2025 koos zag dus de balans van 2026, met 2025 in de keuzelijst
   * ernaast. Erger nog: de knop "balans uitvoeren" in hetzelfde scherm gaf wél
   * 2025 mee, dus het bestand en het scherm gaven verschillende bedragen voor
   * hetzelfde jaar. Bij een boekhouding is dat geen schoonheidsfoutje - je kunt
   * er geen jaarrekening op bouwen als je niet weet welk jaar je voor je hebt.
   */
  it('haalt na het kiezen van een ander boekjaar de rapportage van dát jaar op', async () => {
    const gebruiker = await toonPagina();

    await gebruiker.selectOptions(await screen.findByRole('combobox'), 'bj-2025');
    await gebruiker.click(tabblad('accounting.reports'));

    await waitFor(() => expect(boekhoudApi.getBalanceReport).toHaveBeenCalledWith('bj-2025'));
    await waitFor(() => expect(boekhoudApi.getProfitLossReport).toHaveBeenCalledWith('bj-2025'));

    // En het bedrag op het scherm hoort bij 2025, niet bij 2026.
    const totaal = (await screen.findByText('accounting.totalAssets')).parentElement!;
    expect(within(totaal).getByText(euro(5000))).toBeInTheDocument();
    expect(screen.queryAllByText(euro(9999))).toHaveLength(0);
  });

  it('vraagt zonder enig boekjaar geen rapportage op en zegt dat ook', async () => {
    vi.mocked(boekhoudApi.getFiscalYears).mockResolvedValue([]);
    const gebruiker = await toonPagina();

    await gebruiker.click(tabblad('accounting.reports'));

    expect(await screen.findByText('accounting.noFiscalYearForReports')).toBeInTheDocument();
    expect(boekhoudApi.getBalanceReport).not.toHaveBeenCalled();
    expect(boekhoudApi.getProfitLossReport).not.toHaveBeenCalled();
  });
});

describe('boekhouding - de overige vensters', () => {
  it.each([
    ['accounting.relations', 'accounting.newRelation', 'relatie'],
    ['accounting.costCenters', 'accounting.newCostCenter', 'kostenplaats'],
    ['accounting.budgets', 'accounting.newBudget', 'budget'],
    ['accounting.invoices', 'accounting.newInvoice', 'factuur'],
  ])('opent vanaf %s het venster om er een aan te maken', async (tab, knop, venster) => {
    const gebruiker = await toonPagina();

    await gebruiker.click(tabblad(tab));
    await gebruiker.click(await screen.findByText(knop));

    expect(await screen.findByTestId(`venster-${venster}`)).toBeInTheDocument();

    await gebruiker.click(screen.getByRole('button', { name: `sluit-${venster}` }));
    expect(screen.queryByTestId(`venster-${venster}`)).not.toBeInTheDocument();
  });
});
