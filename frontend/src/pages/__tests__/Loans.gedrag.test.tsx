/**
 * De uitleenpagina: een uitlening aanmaken, terugnemen, weggooien en de
 * geschiedenis van een titel opzoeken.
 *
 * De bestaande test op deze pagina gaat over de labels in het uitleenvenster.
 * Daar zit één ding in dat hier bewust anders is: die test doet `vi.mock` op
 * `../../api` met een handvol functies, zonder `getLoanStats` en
 * `getLoanableTitles`. Die twee zijn dan `undefined`, de bijbehorende
 * bevraging mislukt stilletjes, en dus staan de tellerkaarten en de
 * titelkeuzelijst daar nooit op het scherm. Hier zijn ze er wél, want juist
 * die twee dragen het halve scherm.
 *
 * De tabel met uitleningen wordt met één lopende, één te late en één
 * teruggebrachte uitlening gevuld: alleen zo komt elk van de drie merktekens
 * en het gedrag eromheen aan bod.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import Loans from '../Loans';

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

vi.mock('../../components/LoanReceiptPrinter', () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <div role="dialog" aria-label="uitleenbon">
      <button type="button" onClick={onClose}>
        sluit bon
      </button>
    </div>
  ),
}));

vi.mock('../../utils/toast', () => ({ showSuccess: vi.fn(), showError: vi.fn() }));

const { houder, api, bevestig } = vi.hoisted(() => ({
  houder: {
    uitleningen: [] as unknown[],
    tellers: null as unknown,
    titels: [] as unknown[],
    geschiedenis: null as unknown,
  },
  api: {
    getLoans: vi.fn(),
    getLoanStats: vi.fn(),
    getLoanableTitles: vi.fn(),
    createLoan: vi.fn(),
    returnLoan: vi.fn(),
    deleteLoan: vi.fn(),
    getTitleLoanHistory: vi.fn(),
  },
  bevestig: vi.fn(),
}));

vi.mock('../../api', () => api);
vi.mock('../../hooks/useConfirm', () => ({ useConfirm: () => bevestig }));

import { showSuccess, showError } from '../../utils/toast';

/** Een uitlening zoals de server hem teruggeeft. */
function maakUitlening(overschrijving: Record<string, unknown> = {}) {
  return {
    id: 'uitleen-1',
    music_title_id: 'titel-1',
    title_name: 'Also sprach Zarathustra',
    title_arranger: 'Strauss',
    borrower_name: 'Fanfare Sint Cecilia',
    borrower_email: 'bestuur@cecilia.example',
    borrower_organization: 'Sint Cecilia',
    date_out: '2026-06-01',
    expected_return: '2026-12-31',
    status: 'active',
    ...overschrijving,
  };
}

function wikkel({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

async function openPagina() {
  const gebruiker = userEvent.setup();
  render(<Loans />, { wrapper: wikkel });
  // De kop staat er ook tijdens het laden; de knop "nieuwe uitlening" niet.
  // Daarop wachten betekent wachten tot de lijst binnen is.
  await screen.findByRole('button', { name: /loans\.newLoan/ });
  return gebruiker;
}

beforeEach(() => {
  vi.clearAllMocks();
  houder.uitleningen = [];
  houder.tellers = { active: 3, overdue: 1, returned: 12, total: 16 };
  houder.titels = [];
  houder.geschiedenis = null;
  bevestig.mockResolvedValue(true);
  api.getLoans.mockImplementation(async () => houder.uitleningen);
  api.getLoanStats.mockImplementation(async () => houder.tellers);
  api.getLoanableTitles.mockImplementation(async () => houder.titels);
  api.createLoan.mockResolvedValue({ id: 'nieuw' });
  api.returnLoan.mockResolvedValue({});
  api.deleteLoan.mockResolvedValue({});
  api.getTitleLoanHistory.mockImplementation(async () => houder.geschiedenis);
});

describe('uitleenpagina - het overzicht', () => {
  it('toont de tellers boven de lijst', async () => {
    await openPagina();

    expect(await screen.findByText('3')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('16')).toBeInTheDocument();
  });

  it('meldt het als er nog niets uitgeleend is', async () => {
    await openPagina();

    expect(await screen.findByText('loans.noLoans')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('zet elke uitlening met haar gegevens in de tabel', async () => {
    houder.uitleningen = [maakUitlening()];
    await openPagina();

    const rij = within(await screen.findByRole('table')).getByRole('row', { name: /Also sprach Zarathustra/ });
    expect(within(rij).getByText('Fanfare Sint Cecilia')).toBeInTheDocument();
    expect(within(rij).getByText('bestuur@cecilia.example')).toBeInTheDocument();
    expect(within(rij).getByText('Sint Cecilia')).toBeInTheDocument();
    expect(within(rij).getByText('loans.status.active')).toBeInTheDocument();
  });

  it('geeft een teruggebrachte uitlening geen terugneemknop meer', async () => {
    houder.uitleningen = [
      maakUitlening(),
      maakUitlening({ id: 'uitleen-2', title_name: 'Bolero', status: 'returned', expected_return: null }),
    ];
    await openPagina();

    const tabel = await screen.findByRole('table');
    const lopend = within(tabel).getByRole('row', { name: /Also sprach Zarathustra/ });
    const terug = within(tabel).getByRole('row', { name: /Bolero/ });

    expect(within(lopend).getByRole('button', { name: 'loans.return' })).toBeInTheDocument();
    expect(within(terug).queryByRole('button', { name: 'loans.return' })).not.toBeInTheDocument();
    // Zonder verwachte datum staat er een streepje in plaats van een datum.
    expect(within(terug).getAllByText('-').length).toBeGreaterThan(0);
  });

  it('vraagt de lijst opnieuw op met het gekozen filter', async () => {
    const gebruiker = await openPagina();

    await gebruiker.selectOptions(screen.getByRole('combobox'), 'overdue');

    await waitFor(() => expect(api.getLoans).toHaveBeenCalledWith({ status: 'overdue' }));
  });
});

describe('uitleenpagina - terugnemen en weggooien', () => {
  beforeEach(() => {
    houder.uitleningen = [maakUitlening()];
  });

  it('neemt een uitlening terug na bevestiging', async () => {
    const gebruiker = await openPagina();

    await gebruiker.click(await screen.findByRole('button', { name: 'loans.return' }));

    // Vanaf TanStack Query 5 krijgt een mutatiefunctie een tweede argument met
    // de context erin; alleen het eerste is van deze pagina.
    await waitFor(() => expect(api.returnLoan).toHaveBeenCalled());
    expect(api.returnLoan.mock.calls[0][0]).toBe('uitleen-1');
    await waitFor(() => expect(showSuccess).toHaveBeenCalledWith('loans.loanReturned'));
  });

  it('neemt niets terug als de bevestiging afgewezen wordt', async () => {
    bevestig.mockResolvedValue(false);
    const gebruiker = await openPagina();

    await gebruiker.click(await screen.findByRole('button', { name: 'loans.return' }));

    expect(api.returnLoan).not.toHaveBeenCalled();
  });

  it('meldt een mislukte terugname', async () => {
    api.returnLoan.mockRejectedValue({ response: { data: { error: 'staat al terug' } } });
    const gebruiker = await openPagina();

    await gebruiker.click(await screen.findByRole('button', { name: 'loans.return' }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('staat al terug'));
  });

  it('gooit een uitlening weg na bevestiging', async () => {
    const gebruiker = await openPagina();

    await gebruiker.click(await screen.findByRole('button', { name: 'X' }));

    await waitFor(() => expect(api.deleteLoan).toHaveBeenCalled());
    expect(api.deleteLoan.mock.calls[0][0]).toBe('uitleen-1');
    await waitFor(() => expect(showSuccess).toHaveBeenCalledWith('loans.loanDeleted'));
  });

  it('gooit niets weg als de bevestiging afgewezen wordt', async () => {
    bevestig.mockResolvedValue(false);
    const gebruiker = await openPagina();

    await gebruiker.click(await screen.findByRole('button', { name: 'X' }));

    expect(api.deleteLoan).not.toHaveBeenCalled();
  });

  it('opent en sluit de uitleenbon', async () => {
    const gebruiker = await openPagina();

    await gebruiker.click(await screen.findByRole('button', { name: 'printTemplates.loanReceipt.printButton' }));
    expect(screen.getByRole('dialog', { name: 'uitleenbon' })).toBeInTheDocument();

    await gebruiker.click(screen.getByRole('button', { name: 'sluit bon' }));
    expect(screen.queryByRole('dialog', { name: 'uitleenbon' })).not.toBeInTheDocument();
  });
});

describe('uitleenpagina - een nieuwe uitlening', () => {
  beforeEach(() => {
    houder.titels = [
      { id: 'titel-1', title: 'Also sprach Zarathustra', arranger: 'Strauss', active_loans: 2 },
      { id: 'titel-2', title: 'Bolero', arranger: null, active_loans: 0 },
    ];
  });

  async function openVenster() {
    const gebruiker = await openPagina();
    await gebruiker.click(screen.getByRole('button', { name: /loans\.newLoan/ }));
    return gebruiker;
  }

  it('toont de keuzelijst met titels en hoe vaak elke titel uit staat', async () => {
    await openVenster();

    expect(await screen.findByText('Also sprach Zarathustra')).toBeInTheDocument();
    expect(screen.getByText('loans.timesLoaned')).toBeInTheDocument();
  });

  it('vraagt de titels opnieuw op met wat er getypt wordt', async () => {
    const gebruiker = await openVenster();

    await gebruiker.type(await screen.findByLabelText(/loans\.musicPiece/), 'bol');

    await waitFor(() => expect(api.getLoanableTitles).toHaveBeenCalledWith('bol'));
  });

  it('vervangt het zoekveld door de gekozen titel, met een knop om te wisselen', async () => {
    const gebruiker = await openVenster();

    await gebruiker.click(await screen.findByText('Also sprach Zarathustra'));

    // Het zoekveld is weg; het label staat nu boven de gekozen titel.
    expect(screen.queryByPlaceholderText('loans.searchTitle')).not.toBeInTheDocument();

    await gebruiker.click(screen.getByRole('button', { name: 'loans.change' }));
    expect(screen.getByPlaceholderText('loans.searchTitle')).toBeInTheDocument();
  });

  it('weigert te versturen zonder titel', async () => {
    const gebruiker = await openVenster();

    await gebruiker.type(await screen.findByLabelText(/loans\.borrowerName/), 'Fanfare');
    await gebruiker.click(screen.getByRole('button', { name: 'loans.createLoan' }));

    expect(api.createLoan).not.toHaveBeenCalled();
    expect(showError).toHaveBeenCalledWith('loans.selectTitleAndBorrower');
  });

  it('stuurt de ingevulde uitlening op en sluit het venster', async () => {
    const gebruiker = await openVenster();

    await gebruiker.click(await screen.findByText('Bolero'));
    await gebruiker.type(screen.getByLabelText(/loans\.borrowerName/), '  Fanfare Sint Cecilia  ');
    await gebruiker.type(screen.getByLabelText('loans.borrowerEmail'), 'bestuur@cecilia.example');
    await gebruiker.type(screen.getByLabelText('loans.borrowerOrganization'), 'Sint Cecilia');
    await gebruiker.type(screen.getByLabelText('loans.notes'), 'Alle partijen mee');
    await gebruiker.click(screen.getByRole('button', { name: 'loans.createLoan' }));

    await waitFor(() => expect(api.createLoan).toHaveBeenCalled());
    // De spaties om de naam gaan eraf; lege velden gaan niet mee.
    expect(api.createLoan.mock.calls[0][0]).toEqual({
      musicTitleId: 'titel-2',
      borrowerName: 'Fanfare Sint Cecilia',
      borrowerEmail: 'bestuur@cecilia.example',
      borrowerOrganization: 'Sint Cecilia',
      notes: 'Alle partijen mee',
      expectedReturn: undefined,
    });

    await waitFor(() => expect(showSuccess).toHaveBeenCalledWith('loans.loanCreated'));
    expect(screen.queryByRole('button', { name: 'loans.createLoan' })).not.toBeInTheDocument();
  });

  it('meldt een mislukte aanmaak en houdt het venster open', async () => {
    api.createLoan.mockRejectedValue({ response: { data: { error: 'titel staat al uit' } } });
    const gebruiker = await openVenster();

    await gebruiker.click(await screen.findByText('Bolero'));
    await gebruiker.type(screen.getByLabelText(/loans\.borrowerName/), 'Fanfare');
    await gebruiker.click(screen.getByRole('button', { name: 'loans.createLoan' }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('titel staat al uit'));
    expect(screen.getByRole('button', { name: 'loans.createLoan' })).toBeInTheDocument();
  });

  it('maakt het formulier leeg bij het afbreken', async () => {
    const gebruiker = await openVenster();

    await gebruiker.type(await screen.findByLabelText(/loans\.borrowerName/), 'Fanfare');
    await gebruiker.click(screen.getByRole('button', { name: 'common.cancel' }));

    await gebruiker.click(screen.getByRole('button', { name: /loans\.newLoan/ }));
    expect(await screen.findByLabelText(/loans\.borrowerName/)).toHaveValue('');
  });
});

describe('uitleenpagina - de geschiedenis van een titel', () => {
  beforeEach(() => {
    houder.uitleningen = [maakUitlening()];
    houder.geschiedenis = {
      title: { title: 'Also sprach Zarathustra', arranger: 'Strauss' },
      statistics: { totalLoans: 4, activeLoans: 1, avgLoanDurationDays: 42 },
      loans: [
        {
          id: 'g-1',
          borrowerName: 'Fanfare Sint Cecilia',
          borrowerOrganization: 'Sint Cecilia',
          dateOut: '2026-01-05',
          dateReturned: '2026-03-01',
          status: 'returned',
        },
        {
          id: 'g-2',
          borrowerName: 'Harmonie Concordia',
          borrowerOrganization: null,
          dateOut: '2026-06-01',
          dateReturned: null,
          status: 'active',
        },
      ],
    };
  });

  it('haalt de geschiedenis op en toont de tellers en de regels', async () => {
    const gebruiker = await openPagina();

    await gebruiker.click(await screen.findByRole('button', { name: 'loans.viewHistory' }));

    await waitFor(() => expect(api.getTitleLoanHistory).toHaveBeenCalledWith('titel-1'));
    const venster = await screen.findByRole('dialog');
    expect(within(venster).getByText('4')).toBeInTheDocument();
    expect(within(venster).getByText(/42/)).toBeInTheDocument();
    expect(within(venster).getByText('Fanfare Sint Cecilia')).toBeInTheDocument();
    expect(within(venster).getByText('Harmonie Concordia')).toBeInTheDocument();
    // De lopende uitlening heeft geen terugbrengdatum.
    expect(within(venster).getAllByText('-').length).toBeGreaterThan(0);
  });

  it('meldt het als een titel nog nooit uit is geweest', async () => {
    houder.geschiedenis = {
      title: { title: 'Also sprach Zarathustra', arranger: null },
      statistics: { totalLoans: 0, activeLoans: 0, avgLoanDurationDays: 0 },
      loans: [],
    };
    const gebruiker = await openPagina();

    await gebruiker.click(await screen.findByRole('button', { name: 'loans.viewHistory' }));

    expect(await screen.findByText('loans.history.noHistory')).toBeInTheDocument();
  });

  it('meldt een mislukte ophaalpoging', async () => {
    api.getTitleLoanHistory.mockRejectedValue({ response: { data: { error: 'titel onbekend' } } });
    const gebruiker = await openPagina();

    await gebruiker.click(await screen.findByRole('button', { name: 'loans.viewHistory' }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('titel onbekend'));
  });

  it('sluit de geschiedenis weer', async () => {
    const gebruiker = await openPagina();
    await gebruiker.click(await screen.findByRole('button', { name: 'loans.viewHistory' }));
    const venster = await screen.findByRole('dialog');

    await gebruiker.click(within(venster).getByRole('button', { name: 'accessibility.closeModal' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
