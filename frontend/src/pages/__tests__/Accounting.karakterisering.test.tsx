/**
 * Vangnet voor het opknippen van de boekhoudpagina.
 *
 * Accounting.tsx is 2680 regels: acht tabbladen en zeven modals in één bestand.
 * Dat wordt opgeknipt, en bij het verplaatsen van code is de vraag niet of het
 * er mooier uitziet maar of het scherm daarna nog precies hetzelfde doet.
 *
 * Deze tests keuren niets goed. Ze leggen vast wat de pagina op dit moment
 * doet - welke tabbladen er zijn, welke gegevens per tabblad opgehaald worden,
 * en wat er in beeld komt - zodat een verschuiving tijdens het opknippen
 * meteen opvalt in plaats van pas als iemand de pagina opent. Zo'n test heet
 * een karakteriseringstest: hij beschrijft het bestaande gedrag, ook waar dat
 * gedrag misschien niet ideaal is.
 *
 * Twee dingen zijn hier bewust vastgelegd omdat ze makkelijk sneuvelen bij een
 * verhuizing:
 *   - `enabled` per query. De pagina haalt per tabblad alleen op wat dat
 *     tabblad nodig heeft, plus alles voor het overzicht. Raakt die voorwaarde
 *     zoek, dan doet de pagina bij het openen acht verzoeken in plaats van
 *     twee, en dat merk je niet aan het scherm.
 *   - De volgorde van de tabbladen. Die staat in één array; een verhuizing die
 *     hem herschikt verandert wat de gebruiker als eerste ziet.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import Accounting from '../Accounting';
import * as boekhoudApi from '../../api/accounting';

vi.mock('../../api/accounting');

vi.mock('../../hooks/useDocumentTitle', () => ({ useDocumentTitle: () => {} }));
vi.mock('../../hooks/useConfirm', () => ({
  useConfirm: () => ({ confirm: vi.fn().mockResolvedValue(true), dialog: null }),
}));
vi.mock('../../hooks/useUnsavedChanges', () => ({ useUnsavedChanges: () => {} }));

// `initReactI18next` hoort erbij omdat de pagina via utils/locale.ts de echte
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
  SkeletonCard: () => <div data-testid="skelet-kaart" />,
}));

vi.mock('../../components/InvoicePrinter', () => ({
  default: () => <div data-testid="factuurprinter" />,
}));

vi.mock('../../utils/toast', () => ({ showSuccess: vi.fn(), showError: vi.fn() }));

/**
 * De pagina roept ruim dertig api-functies aan. Ze geven hier allemaal een lege
 * lijst terug, zodat elk tabblad zijn "nog niets"-toestand toont. Dat is voor
 * een vangnet genoeg: het gaat om wélke aanroepen gebeuren en welke onderdelen
 * verschijnen, niet om de inhoud van de rijen.
 */
function zetApiKlaar(): void {
  const leeg = vi.fn().mockResolvedValue([]);
  for (const naam of Object.keys(boekhoudApi)) {
    const functie = (boekhoudApi as Record<string, unknown>)[naam];
    if (typeof functie === 'function') {
      vi.mocked(functie as (...args: unknown[]) => unknown).mockImplementation(leeg);
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
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  zetApiKlaar();
});

describe('boekhoudpagina - vastgelegd gedrag vóór het opknippen', () => {
  it('toont acht tabbladen, in deze volgorde', async () => {
    render(<Accounting />, { wrapper: wikkel });

    await waitFor(() => expect(boekhoudApi.getFiscalYears).toHaveBeenCalled());

    const knoppen = screen.getAllByRole('button').filter((knop) => knop.className.includes('tab'));
    const labels = knoppen.map((knop) => knop.textContent?.trim());

    expect(labels).toEqual([
      'accounting.overview',
      'accounting.chartOfAccounts',
      'accounting.journalEntries',
      'accounting.invoices',
      'accounting.relations',
      'accounting.costCenters',
      'accounting.budgets',
      'accounting.reports',
    ]);
  });

  it('begint op het overzicht', async () => {
    render(<Accounting />, { wrapper: wikkel });

    await waitFor(() => expect(boekhoudApi.getFiscalYears).toHaveBeenCalled());

    const overzicht = screen.getAllByRole('button').find((knop) => knop.textContent?.trim() === 'accounting.overview');
    expect(overzicht?.className).toContain('tab-active');
  });

  // Het overzicht laat cijfers uit alle onderdelen zien, dus daar draaien alle
  // queries. Verdwijnt die eigenschap bij het opknippen, dan is het overzicht
  // leeg zonder dat er een foutmelding komt.
  it('haalt op het overzicht alle onderdelen op', async () => {
    render(<Accounting />, { wrapper: wikkel });

    await waitFor(() => {
      expect(boekhoudApi.getInvoices).toHaveBeenCalled();
      expect(boekhoudApi.getTransactions).toHaveBeenCalled();
      expect(boekhoudApi.getRelations).toHaveBeenCalled();
      expect(boekhoudApi.getCostCenters).toHaveBeenCalled();
      expect(boekhoudApi.getBudgets).toHaveBeenCalled();
    });
  });

  // De rapportages hangen aan een boekjaar. Zonder boekjaar horen ze niet
  // opgehaald te worden - anders vraagt de pagina een balans op over niets.
  it('haalt geen rapportages op zolang er geen boekjaar is', async () => {
    render(<Accounting />, { wrapper: wikkel });

    await waitFor(() => expect(boekhoudApi.getFiscalYears).toHaveBeenCalled());

    expect(boekhoudApi.getBalanceReport).not.toHaveBeenCalled();
    expect(boekhoudApi.getProfitLossReport).not.toHaveBeenCalled();
  });

  it.each([
    ['accounting.chartOfAccounts', 'chart'],
    ['accounting.journalEntries', 'transactions'],
    ['accounting.invoices', 'invoices'],
    ['accounting.relations', 'relations'],
    ['accounting.costCenters', 'costcenters'],
    ['accounting.budgets', 'budgets'],
    ['accounting.reports', 'reports'],
  ])('schakelt naar %s', async (label) => {
    const gebruiker = userEvent.setup();
    render(<Accounting />, { wrapper: wikkel });

    await waitFor(() => expect(boekhoudApi.getFiscalYears).toHaveBeenCalled());

    // Twee dingen om op te letten bij het opzoeken van een tabblad.
    //
    // Op klasse `tab` filteren is nodig, niet netter: vier van deze labels
    // staan óók in het exportmenu ("grootboekrekeningen", "boekingen",
    // "facturen", "relaties"). Zonder dat filter vindt de test daar de
    // exportknop en klikt hij op iets heel anders dan een tabblad.
    //
    // En de knop wordt na de klik opnieuw opgezocht in plaats van de
    // referentie van vóór de klik vast te houden: React vervangt het element
    // bij een hertekening, en dan draagt de oude referentie de nieuwe klasse
    // nooit.
    const zoekTabblad = () =>
      screen
        .getAllByRole('button')
        .find((knop) => knop.className.includes('tab') && knop.textContent?.trim() === label);

    expect(zoekTabblad()).toBeDefined();
    await gebruiker.click(zoekTabblad()!);

    await waitFor(() => expect(zoekTabblad()!.className).toContain('tab-active'));
  });

  // Een pagina die bij een mislukte aanroep helemaal niets toont is niet van
  // een kapotte pagina te onderscheiden. Dat de tabbladen blijven staan is dus
  // gedrag dat het opknippen moet overleven.
  it('houdt de tabbladen staan als het ophalen mislukt', async () => {
    vi.mocked(boekhoudApi.getFiscalYears).mockRejectedValue(new Error('geen verbinding'));
    vi.mocked(boekhoudApi.getAccounts).mockRejectedValue(new Error('geen verbinding'));

    render(<Accounting />, { wrapper: wikkel });

    await waitFor(() => expect(boekhoudApi.getFiscalYears).toHaveBeenCalled());

    const knoppen = screen.getAllByRole('button').filter((knop) => knop.className.includes('tab'));
    expect(knoppen).toHaveLength(8);
  });
});
