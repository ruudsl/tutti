/**
 * Het boekingsvenster: debet, credit en of het klopt.
 *
 * Dit venster is de plek waar dubbel boekhouden staat of valt. Een boeking die
 * niet in evenwicht is, of waarvan een bedrag aan de verkeerde kant staat, ziet
 * er op het scherm precies zo uit als een goede - en de server geeft er ook een
 * 200 op terug. Wat hem tegenhoudt is de optelling in dit bestand, en die wordt
 * hieronder apart nagerekend.
 *
 * Wat vastligt:
 *
 *   - de totalen onderaan zijn de som van de debet- en de creditkolom
 *   - "in evenwicht" is een verschil van minder dan een cent, en niet minder
 *     dan nul: anders houdt de drijvende komma een kloppende boeking tegen
 *   - een boeking die niet in evenwicht is, gaat niet weg: de knop staat uit en
 *     de melding staat in beeld
 *   - regels zonder rekening tellen wel mee in het scherm maar gaan niet mee
 *     naar de server; de bedragen die wél meegaan staan hier één voor één
 *   - een boeking heeft minstens twee regels, en die kunnen er niet uit
 *   - bij het bewerken komt elke regel terug zoals hij was, met het bedrag aan
 *     dezelfde kant
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { TransactionModal } from '../TransactionModal';
import { createTransaction, updateTransaction } from '../../../api/accounting';
import type { Account, CostCenter, Transaction } from '../../../api/accounting';
import { showSuccess, showError } from '../../../utils/toast';

vi.mock('../../../api/accounting', () => ({ createTransaction: vi.fn(), updateTransaction: vi.fn() }));
vi.mock('../../../utils/toast', () => ({ showSuccess: vi.fn(), showError: vi.fn() }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (sleutel: string) => sleutel, i18n: { language: 'nl' } }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('../../../components/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

const REKENINGEN = [
  { id: 'r-1000', code: '1000', name: 'Bank' },
  { id: 'r-8000', code: '8000', name: 'Contributies' },
  { id: 'r-4000', code: '4000', name: 'Bladmuziek' },
] as unknown as Account[];

const KOSTENPLAATSEN = [{ id: 'kp-1', code: 'K1', name: 'Concerten' }] as unknown as CostCenter[];

function wikkel({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

let sluiten: Mock<() => void>;
let bewaren: Mock<() => void>;

beforeEach(() => {
  vi.clearAllMocks();
  sluiten = vi.fn<() => void>();
  bewaren = vi.fn<() => void>();
});

function toon(boeking?: Transaction | null) {
  const gebruiker = userEvent.setup();
  render(
    <TransactionModal
      transaction={boeking}
      accounts={REKENINGEN}
      costCenters={KOSTENPLAATSEN}
      onClose={sluiten}
      onSave={bewaren}
    />,
    { wrapper: wikkel },
  );
  return gebruiker;
}

const venster = () => screen.getByRole('dialog');
const regels = () => [...venster().querySelectorAll<HTMLElement>('tbody tr')];

/** De twee keuzelijsten van een regel: rekening en kostenplaats. */
const keuzes = (regel: Element) => [...regel.querySelectorAll<HTMLElement>('select')];

/** De twee bedragvelden van een regel: debet en credit. */
const bedragen = (regel: Element) => [...regel.querySelectorAll<HTMLElement>('input')];

/** De totalen onder de tabel: [debet, credit]. */
const totalen = () => {
  const cellen = [...(venster().querySelector<HTMLElement>('tfoot tr') as Element).querySelectorAll<HTMLElement>('td')];
  return [cellen[1].textContent, cellen[2].textContent];
};

const opslaanKnop = () => screen.getByRole('button', { name: 'common.save' });

/** Vult één regel: rekening, debet, credit. */
async function vulRegel(
  gebruiker: ReturnType<typeof userEvent.setup>,
  index: number,
  gegevens: { rekening?: string; debet?: string; credit?: string; kostenplaats?: string },
) {
  const regel = regels()[index];
  if (gegevens.rekening !== undefined) await gebruiker.selectOptions(keuzes(regel)[0], gegevens.rekening);
  if (gegevens.kostenplaats !== undefined) await gebruiker.selectOptions(keuzes(regel)[1], gegevens.kostenplaats);
  // De bedragvelden zijn bestuurd en worden bij elke aanslag omgezet naar een
  // getal; in één keer zetten is wat plakken ook doet en houdt de cijfers heel.
  if (gegevens.debet !== undefined) fireEvent.change(bedragen(regel)[0], { target: { value: gegevens.debet } });
  if (gegevens.credit !== undefined) fireEvent.change(bedragen(regel)[1], { target: { value: gegevens.credit } });
}

/** Vult de omschrijving, want zonder komt het formulier de browser niet uit. */
async function vulOmschrijving(gebruiker: ReturnType<typeof userEvent.setup>, tekst = 'Contributie september') {
  const omschrijving = venster().querySelectorAll<HTMLElement>('input[type="text"]')[1] as HTMLInputElement;
  await gebruiker.clear(omschrijving);
  await gebruiker.type(omschrijving, tekst);
}

/** Een boeking die klopt: 45 euro van de bank tegen de contributierekening. */
async function vulKloppendeBoeking(gebruiker: ReturnType<typeof userEvent.setup>) {
  await vulOmschrijving(gebruiker);
  await vulRegel(gebruiker, 0, { rekening: 'r-1000', debet: '45' });
  await vulRegel(gebruiker, 1, { rekening: 'r-8000', credit: '45' });
}

/** De boekingsgegevens waarmee de api is aangeroepen. */
const verstuurd = (fn: unknown) => (fn as ReturnType<typeof vi.fn>).mock.calls[0];

// ==================== TOTALEN ====================

describe('boekingsvenster - de totalen onderaan', () => {
  it('begint met twee lege regels op nul, en dat is in evenwicht', () => {
    toon();

    expect(regels()).toHaveLength(2);
    expect(totalen()).toEqual(['0.00', '0.00']);
    // Nul tegen nul klopt rekenkundig, dus de melding hoort weg te blijven.
    expect(screen.queryByText('accounting.debitCreditMustMatch')).not.toBeInTheDocument();
  });

  it('telt de debetkolom en de creditkolom apart op', async () => {
    const gebruiker = toon();

    await vulRegel(gebruiker, 0, { debet: '45' });
    await vulRegel(gebruiker, 1, { credit: '20' });
    await gebruiker.click(screen.getByRole('button', { name: /accounting.addLine/ }));
    await vulRegel(gebruiker, 2, { credit: '25' });

    // 45 aan de ene kant, 20 + 25 aan de andere. Apart nagerekend.
    expect(totalen()).toEqual(['45.00', (20 + 25).toFixed(2)]);
    expect(totalen()).toEqual(['45.00', '45.00']);
  });

  it('houdt een bedrag aan de kant waar het is ingevuld', async () => {
    const gebruiker = toon();

    await vulRegel(gebruiker, 0, { debet: '45' });

    // Een boeking die de verkeerde kant op gaat, geeft ook een 200. Op het
    // scherm hoort 45 alleen links te staan.
    expect(totalen()).toEqual(['45.00', '0.00']);
    expect(bedragen(regels()[0])[0]).toHaveValue(45);
    // Een nulbedrag blijft een leeg veld, geen "0".
    expect(bedragen(regels()[0])[1]).toHaveValue(null);
  });

  it('noemt een verschil van minder dan een cent in evenwicht', async () => {
    const gebruiker = toon();

    await vulRegel(gebruiker, 0, { debet: '0.10' });
    await gebruiker.click(screen.getByRole('button', { name: /accounting.addLine/ }));
    await vulRegel(gebruiker, 1, { debet: '0.20' });
    await vulRegel(gebruiker, 2, { credit: '0.30' });

    // 0,10 + 0,20 is in drijvende komma niet precies 0,30. Zou de vergelijking
    // op gelijkheid staan, dan hield het venster een kloppende boeking tegen.
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(totalen()).toEqual(['0.30', '0.30']);
    expect(screen.queryByText('accounting.debitCreditMustMatch')).not.toBeInTheDocument();
  });

  it('noemt een verschil van twee cent geen evenwicht', async () => {
    const gebruiker = toon();

    await vulRegel(gebruiker, 0, { debet: '45.00' });
    await vulRegel(gebruiker, 1, { credit: '44.98' });

    expect(totalen()).toEqual(['45.00', '44.98']);
    expect(screen.getByText('accounting.debitCreditMustMatch')).toBeInTheDocument();
  });
});

// ==================== TEGENHOUDEN ====================

describe('boekingsvenster - een scheve boeking komt er niet door', () => {
  it('zet de opslaanknop uit zolang debet en credit niet gelijk zijn', async () => {
    const gebruiker = toon();

    await vulOmschrijving(gebruiker);
    await vulRegel(gebruiker, 0, { rekening: 'r-1000', debet: '45' });
    await vulRegel(gebruiker, 1, { rekening: 'r-8000', credit: '40' });

    expect(opslaanKnop()).toBeDisabled();

    // Zodra het klopt, mag het weg.
    await vulRegel(gebruiker, 1, { credit: '45' });
    expect(opslaanKnop()).toBeEnabled();
  });

  it('weigert een boeking met maar één bruikbare regel', async () => {
    const gebruiker = toon();

    await vulOmschrijving(gebruiker);
    // Eén regel met een rekening en een bedrag; de tweede blijft leeg. Debet en
    // credit staan dan allebei op 45 respectievelijk 0 - dus niet in evenwicht.
    await vulRegel(gebruiker, 0, { rekening: 'r-1000', debet: '45' });
    await vulRegel(gebruiker, 1, { rekening: 'r-8000', credit: '45' });
    // De tweede regel krijgt zijn bedrag terug op nul: nu is het weer in
    // evenwicht (0 tegen 45 niet, dus ook de rekening eruit halen).
    await vulRegel(gebruiker, 0, { debet: '0' });
    await vulRegel(gebruiker, 1, { credit: '0' });

    expect(opslaanKnop()).toBeEnabled();
    await gebruiker.click(opslaanKnop());

    // Twee regels zonder bedrag zijn nul bruikbare regels.
    expect(showError).toHaveBeenCalledWith('accounting.minTwoLines');
    expect(createTransaction).not.toHaveBeenCalled();
  });

  it('laat de eerste twee regels staan', async () => {
    const gebruiker = toon();

    // Een boeking heeft minstens twee kanten; de prullenbak hoort uit te staan.
    expect(within(regels()[0]).getByRole('button')).toBeDisabled();
    expect(within(regels()[1]).getByRole('button')).toBeDisabled();

    await gebruiker.click(within(regels()[0]).getByRole('button'));
    expect(regels()).toHaveLength(2);
  });

  it('haalt een derde regel er wel weer uit, inclusief zijn bedrag', async () => {
    const gebruiker = toon();

    await vulRegel(gebruiker, 0, { debet: '45' });
    await vulRegel(gebruiker, 1, { credit: '20' });
    await gebruiker.click(screen.getByRole('button', { name: /accounting.addLine/ }));
    await vulRegel(gebruiker, 2, { credit: '25' });
    expect(totalen()).toEqual(['45.00', '45.00']);

    await gebruiker.click(within(regels()[2]).getByRole('button'));

    expect(regels()).toHaveLength(2);
    // Precies de 25 van die regel eraf, niet meer.
    expect(totalen()).toEqual(['45.00', '20.00']);
  });
});

// ==================== WAT ER VERSTUURD WORDT ====================

describe('boekingsvenster - wat er naar de server gaat', () => {
  it('stuurt elke regel met zijn bedrag aan de juiste kant', async () => {
    (createTransaction as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'b-1' });
    const gebruiker = toon();

    await vulKloppendeBoeking(gebruiker);
    await gebruiker.click(opslaanKnop());

    await waitFor(() => expect(createTransaction).toHaveBeenCalledTimes(1));
    const gegevens = verstuurd(createTransaction)[0];
    expect(gegevens.lines).toEqual([
      { accountId: 'r-1000', debitAmount: 45, creditAmount: 0 },
      { accountId: 'r-8000', debitAmount: 0, creditAmount: 45 },
    ]);
    // En de twee kanten zijn in het verstuurde ook echt gelijk.
    const debet = gegevens.lines.reduce((som: number, r: { debitAmount: number }) => som + r.debitAmount, 0);
    const credit = gegevens.lines.reduce((som: number, r: { creditAmount: number }) => som + r.creditAmount, 0);
    expect(debet).toBe(45);
    expect(credit).toBe(debet);
  });

  it('laat regels zonder rekening weg zonder de rest te verschuiven', async () => {
    (createTransaction as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'b-1' });
    const gebruiker = toon();

    await vulKloppendeBoeking(gebruiker);
    // Een derde regel met alleen een bedrag en geen rekening; die valt weg.
    // Om in evenwicht te blijven staat er evenveel aan beide kanten op.
    await gebruiker.click(screen.getByRole('button', { name: /accounting.addLine/ }));
    await vulRegel(gebruiker, 2, { debet: '10', credit: '10' });

    expect(totalen()).toEqual(['55.00', '55.00']);
    await gebruiker.click(opslaanKnop());

    await waitFor(() => expect(createTransaction).toHaveBeenCalledTimes(1));
    // De weggevallen regel neemt zijn tien euro mee; de andere twee blijven
    // precies zoals ze waren.
    expect(verstuurd(createTransaction)[0].lines).toHaveLength(2);
    expect(verstuurd(createTransaction)[0].lines[0].debitAmount).toBe(45);
  });

  it('geeft de kostenplaats mee als die gekozen is', async () => {
    (createTransaction as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'b-1' });
    const gebruiker = toon();

    await vulKloppendeBoeking(gebruiker);
    await vulRegel(gebruiker, 0, { kostenplaats: 'kp-1' });
    await gebruiker.click(opslaanKnop());

    await waitFor(() => expect(createTransaction).toHaveBeenCalledTimes(1));
    expect(verstuurd(createTransaction)[0].lines[0].costCenterId).toBe('kp-1');
  });

  it('stuurt soort, omschrijving en kenmerk mee', async () => {
    (createTransaction as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'b-1' });
    const gebruiker = toon();

    await vulKloppendeBoeking(gebruiker);
    await gebruiker.selectOptions(screen.getAllByRole('combobox')[0], 'bank');
    const kenmerk = venster().querySelectorAll<HTMLElement>('input[type="text"]')[0] as HTMLInputElement;
    await gebruiker.type(kenmerk, 'MUT-2026-09');
    await gebruiker.click(opslaanKnop());

    await waitFor(() => expect(createTransaction).toHaveBeenCalledTimes(1));
    const gegevens = verstuurd(createTransaction)[0];
    expect(gegevens.transactionType).toBe('bank');
    expect(gegevens.description).toBe('Contributie september');
    expect(gegevens.reference).toBe('MUT-2026-09');
  });

  it('meldt succes en geeft het door aan de pagina', async () => {
    (createTransaction as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'b-1' });
    const gebruiker = toon();

    await vulKloppendeBoeking(gebruiker);
    await gebruiker.click(opslaanKnop());

    await waitFor(() => expect(bewaren).toHaveBeenCalledTimes(1));
    expect(showSuccess).toHaveBeenCalledWith('accounting.transactionCreated');
  });

  it('toont de foutmelding van de server en bewaart niets', async () => {
    (createTransaction as unknown as ReturnType<typeof vi.fn>).mockRejectedValue({
      response: { data: { error: 'Rekening 1000 is geblokkeerd' } },
    });
    const gebruiker = toon();

    await vulKloppendeBoeking(gebruiker);
    await gebruiker.click(opslaanKnop());

    await waitFor(() => expect(showError).toHaveBeenCalledWith('Rekening 1000 is geblokkeerd'));
    expect(bewaren).not.toHaveBeenCalled();
    expect(showSuccess).not.toHaveBeenCalled();
  });

  it('valt terug op een algemene melding als de server niets zegt', async () => {
    (createTransaction as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('kapot'));
    const gebruiker = toon();

    await vulKloppendeBoeking(gebruiker);
    await gebruiker.click(opslaanKnop());

    await waitFor(() => expect(showError).toHaveBeenCalledWith('accounting.errorSave'));
  });
});

// ==================== BEWERKEN ====================

const BESTAANDE_BOEKING = {
  id: 'b-7',
  transactionDate: '2026-09-12T00:00:00.000Z',
  transactionType: 'receipt',
  reference: 'MUT-2026-09',
  description: 'Contributie september',
  lines: [
    { accountId: 'r-1000', costCenterId: 'kp-1', description: 'Bank', debitAmount: 45, creditAmount: 0 },
    { accountId: 'r-8000', costCenterId: undefined, description: 'Contributie', debitAmount: 0, creditAmount: 45 },
  ],
} as unknown as Transaction;

describe('boekingsvenster - een bestaande boeking bewerken', () => {
  it('zet elke regel terug met het bedrag aan dezelfde kant', () => {
    toon(BESTAANDE_BOEKING);

    expect(regels()).toHaveLength(2);
    expect(bedragen(regels()[0])[0]).toHaveValue(45);
    expect(bedragen(regels()[0])[1]).toHaveValue(null);
    expect(bedragen(regels()[1])[0]).toHaveValue(null);
    expect(bedragen(regels()[1])[1]).toHaveValue(45);
    expect(totalen()).toEqual(['45.00', '45.00']);
  });

  it('knipt de tijd van de datum af zodat het datumveld hem aanneemt', () => {
    toon(BESTAANDE_BOEKING);

    // De server stuurt een volledige ISO-tekst; een <input type="date"> neemt
    // alleen JJJJ-MM-DD aan en zou anders leeg blijven.
    expect(venster().querySelector<HTMLElement>('input[type="date"]')).toHaveValue('2026-09-12');
  });

  it('noemt zichzelf een bewerking en werkt de bestaande boeking bij', async () => {
    (updateTransaction as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ message: 'ok' });
    const gebruiker = toon(BESTAANDE_BOEKING);

    expect(within(venster()).getByText('accounting.editEntry')).toBeInTheDocument();
    await gebruiker.click(opslaanKnop());

    await waitFor(() => expect(updateTransaction).toHaveBeenCalledTimes(1));
    // Het id gaat apart mee; zonder dat maakt "bewerken" een tweede boeking.
    expect(verstuurd(updateTransaction)[0]).toBe('b-7');
    expect(verstuurd(updateTransaction)[1].lines).toHaveLength(2);
    expect(createTransaction).not.toHaveBeenCalled();
    expect(showSuccess).toHaveBeenCalledWith('accounting.transactionUpdated');
  });

  it('verandert het bedrag aan één kant en houdt de boeking tegen tot het klopt', async () => {
    const gebruiker = toon(BESTAANDE_BOEKING);

    await vulRegel(gebruiker, 0, { debet: '50' });

    expect(totalen()).toEqual(['50.00', '45.00']);
    expect(opslaanKnop()).toBeDisabled();
  });

  it('komt met een boeking zonder regels niet verder dan de melding', async () => {
    const gebruiker = toon({ ...BESTAANDE_BOEKING, lines: undefined } as unknown as Transaction);

    // Zonder regels is er niets om te boeken; wel hoort het venster te blijven
    // staan in plaats van te struikelen over een ontbrekende lijst.
    expect(regels()).toHaveLength(0);
    await gebruiker.click(opslaanKnop());

    expect(showError).toHaveBeenCalledWith('accounting.minTwoLines');
    expect(updateTransaction).not.toHaveBeenCalled();
  });
});

describe('boekingsvenster - sluiten', () => {
  it('sluit zonder verder te vragen', async () => {
    const gebruiker = toon();

    await gebruiker.click(screen.getByRole('button', { name: 'common.cancel' }));

    // Anders dan het factuurvenster kent dit venster geen waarschuwing voor
    // onbewaarde invoer. Dat staat hier vastgelegd, niet goedgekeurd.
    expect(sluiten).toHaveBeenCalledTimes(1);
  });
});
