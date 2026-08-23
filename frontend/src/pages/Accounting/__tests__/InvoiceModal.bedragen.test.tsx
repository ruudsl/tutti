/**
 * Het factuurvenster: de bedragen, niet het uiterlijk.
 *
 * Bij de boekhouding is "er staat iets op het scherm" geen bewijs. Een factuur
 * met een verkeerd regeltotaal ziet er precies zo uit als een goede, en de
 * server geeft er net zo vrolijk een 200 op terug. Elke optelling hieronder
 * wordt daarom apart nagerekend, en bij elk verzonden verzoek wordt gekeken
 * wélke bedragen er meegingen - niet alleen dát er iets verstuurd is.
 *
 * Wat hier vastligt:
 *
 *   - het regeltotaal is aantal maal stuksprijs, op twee decimalen
 *   - het subtotaal is de som van de regels, ook na toevoegen en verwijderen
 *   - centen tellen op zonder dat de drijvende komma erdoorheen komt
 *   - een creditregel telt negatief mee
 *   - lege regels gaan niet mee naar de server, maar de bedragen van de
 *     overgebleven regels wel, ongewijzigd
 *   - de rekeningkeuze volgt het factuursoort: opbrengsten bij verkoop,
 *     kosten bij inkoop
 *
 * En de standaarddatums, want die bepalen in welk boekjaar de factuur valt.
 * Zie het bewijs onderaan.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { InvoiceModal } from '../InvoiceModal';
import { createInvoice } from '../../../api/accounting';
import type { Account, AccountingRelation } from '../../../api/accounting';
import { showSuccess, showError } from '../../../utils/toast';

vi.mock('../../../api/accounting', () => ({ createInvoice: vi.fn() }));
vi.mock('../../../utils/toast', () => ({ showSuccess: vi.fn(), showError: vi.fn() }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (sleutel: string) => sleutel, i18n: { language: 'nl' } }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('../../../components/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

const REKENINGEN = [
  { id: 'r-8000', code: '8000', name: 'Contributies', accountType: 'income' },
  { id: 'r-8100', code: '8100', name: 'Donaties', accountType: 'income' },
  { id: 'r-4000', code: '4000', name: 'Bladmuziek', accountType: 'expense' },
  { id: 'r-1000', code: '1000', name: 'Bank', accountType: 'asset' },
] as unknown as Account[];

const RELATIES = [
  { id: 'rel-1', name: 'Gemeente Houten' },
  { id: 'rel-2', name: 'Muziekhandel De Klank' },
] as unknown as AccountingRelation[];

function wikkel({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

let sluiten: ReturnType<typeof vi.fn>;
let bewaren: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  sluiten = vi.fn();
  bewaren = vi.fn();
});

afterEach(() => {
  vi.useRealTimers();
});

function toon() {
  const gebruiker = userEvent.setup();
  render(
    <InvoiceModal accounts={REKENINGEN} relations={RELATIES} costCenters={[]} onClose={sluiten} onSave={bewaren} />,
    { wrapper: wikkel },
  );
  return gebruiker;
}

const venster = () => screen.getByRole('dialog');

/** De regels van de factuur, in schermvolgorde. */
const regels = () => [...venster().querySelectorAll('tbody tr')];

/** De drie invoervelden van een regel: beschrijving, aantal, stuksprijs. */
function velden(regel: Element) {
  const [beschrijving, aantal, stuksprijs] = [...regel.querySelectorAll('input')];
  return { beschrijving, aantal, stuksprijs };
}

/** Het regeltotaal zoals het op het scherm staat. */
const regeltotaal = (regel: Element) => regel.querySelectorAll('td')[4].textContent;

/** Het subtotaal onder de tabel. */
const subtotaal = () => venster().querySelector('tfoot td.font-mono')?.textContent;

/** De keuzelijsten boven de tabel: 0 is het factuursoort, 1 de relatie. */
const kopkeuze = (index: number) => screen.getAllByRole('combobox')[index] as HTMLSelectElement;

/**
 * Vult een regel in.
 *
 * De getalvelden worden in één keer gezet en niet teken voor teken getypt. Ze
 * zijn bestuurd door de staat, en die zet elke invoer meteen om naar een getal:
 * leegmaken van een aantal levert weer 1 op, en wat je daarna typt komt dáár
 * achter te staan. Eén change-gebeurtenis is precies wat plakken ook doet, en
 * het is het bedrag dat hier telt.
 */
async function vulRegel(
  gebruiker: ReturnType<typeof userEvent.setup>,
  index: number,
  gegevens: { beschrijving?: string; aantal?: string; stuksprijs?: string },
) {
  const v = velden(regels()[index]);
  if (gegevens.beschrijving !== undefined) {
    await gebruiker.clear(v.beschrijving);
    if (gegevens.beschrijving !== '') await gebruiker.type(v.beschrijving, gegevens.beschrijving);
  }
  if (gegevens.aantal !== undefined) {
    fireEvent.change(v.aantal, { target: { value: gegevens.aantal } });
  }
  if (gegevens.stuksprijs !== undefined) {
    fireEvent.change(v.stuksprijs, { target: { value: gegevens.stuksprijs } });
  }
}

/**
 * Kiest een relatie.
 *
 * Zonder relatie komt het formulier niet langs de browser: het veld is
 * `required`, dus opslaan doet dan helemaal niets. Elke test die tot verzenden
 * komt, moet dus eerst hier langs - net als de gebruiker.
 */
async function kiesRelatie(gebruiker: ReturnType<typeof userEvent.setup>, id = 'rel-1') {
  await gebruiker.selectOptions(kopkeuze(1), id);
}

/** De factuurgegevens waarmee createInvoice is aangeroepen. */
const verstuurd = () => (createInvoice as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];

// ==================== BEDRAGEN ====================

describe('factuurvenster - regeltotaal en subtotaal', () => {
  it('begint met één lege regel op nul', () => {
    toon();

    expect(regels()).toHaveLength(1);
    expect(regeltotaal(regels()[0])).toBe('0.00');
    expect(subtotaal()).toBe('0.00');
  });

  it('rekent het regeltotaal uit als aantal maal stuksprijs', async () => {
    const gebruiker = toon();

    await vulRegel(gebruiker, 0, { beschrijving: 'Bladmuziek', aantal: '3', stuksprijs: '12.50' });

    // 3 x 12,50 = 37,50. Apart nagerekend, niet overgenomen van het scherm.
    expect(regeltotaal(regels()[0])).toBe((3 * 12.5).toFixed(2));
    expect(regeltotaal(regels()[0])).toBe('37.50');
    expect(subtotaal()).toBe('37.50');
  });

  it('houdt centen heel waar de drijvende komma dat niet doet', async () => {
    const gebruiker = toon();

    await vulRegel(gebruiker, 0, { beschrijving: 'Tien cent', aantal: '1', stuksprijs: '0.10' });
    await gebruiker.click(screen.getByRole('button', { name: /accounting.addLine/ }));
    await vulRegel(gebruiker, 1, { beschrijving: 'Twintig cent', aantal: '1', stuksprijs: '0.20' });

    // 0,10 + 0,20 is in drijvende komma 0.30000000000000004. Op het scherm
    // hoort daar 0.30 te staan, en geen 0.30000000000000004.
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(subtotaal()).toBe('0.30');
    expect(subtotaal()).toBe((0.1 + 0.2).toFixed(2));
  });

  it('telt meerdere regels bij elkaar op', async () => {
    const gebruiker = toon();

    await vulRegel(gebruiker, 0, { beschrijving: 'Bladmuziek', aantal: '3', stuksprijs: '12.50' });
    await gebruiker.click(screen.getByRole('button', { name: /accounting.addLine/ }));
    await vulRegel(gebruiker, 1, { beschrijving: 'Verzendkosten', aantal: '1', stuksprijs: '7.25' });

    expect(regels()).toHaveLength(2);
    expect(regeltotaal(regels()[1])).toBe('7.25');
    expect(subtotaal()).toBe((3 * 12.5 + 7.25).toFixed(2));
    expect(subtotaal()).toBe('44.75');
  });

  it('trekt een verwijderde regel er ook echt af', async () => {
    const gebruiker = toon();

    await vulRegel(gebruiker, 0, { beschrijving: 'Bladmuziek', aantal: '3', stuksprijs: '12.50' });
    await gebruiker.click(screen.getByRole('button', { name: /accounting.addLine/ }));
    await vulRegel(gebruiker, 1, { beschrijving: 'Verzendkosten', aantal: '1', stuksprijs: '7.25' });
    expect(subtotaal()).toBe('44.75');

    // De prullenbak van de tweede regel.
    await gebruiker.click(within(regels()[1]).getByRole('button'));

    expect(regels()).toHaveLength(1);
    // Precies het bedrag van de weggehaalde regel eraf, geen cent meer of minder.
    expect(subtotaal()).toBe('37.50');
  });

  it('telt een negatieve stuksprijs negatief mee', async () => {
    const gebruiker = toon();

    await vulRegel(gebruiker, 0, { beschrijving: 'Geleverd', aantal: '2', stuksprijs: '50' });
    await gebruiker.click(screen.getByRole('button', { name: /accounting.addLine/ }));
    await vulRegel(gebruiker, 1, { beschrijving: 'Korting', aantal: '1', stuksprijs: '-15' });

    // Een creditregel hoort van het totaal af te gaan, niet erbij op. Een
    // optelling die de verkeerde kant op gaat levert net zo goed een geldige
    // factuur op.
    expect(regeltotaal(regels()[1])).toBe('-15.00');
    expect(subtotaal()).toBe((2 * 50 - 15).toFixed(2));
    expect(subtotaal()).toBe('85.00');
  });

  it('valt bij een leeggemaakt aantal terug op 1 en bij een lege prijs op 0', async () => {
    const gebruiker = toon();

    await vulRegel(gebruiker, 0, { beschrijving: 'Iets', aantal: '4', stuksprijs: '10' });
    expect(subtotaal()).toBe('40.00');

    await gebruiker.clear(velden(regels()[0]).aantal);
    // Een leeg veld is geen nul stuks maar "nog niets ingevuld"; de code kiest
    // hier 1, en dat is te zien in het totaal.
    expect(subtotaal()).toBe('10.00');

    await gebruiker.clear(velden(regels()[0]).stuksprijs);
    expect(subtotaal()).toBe('0.00');
  });
});

// ==================== WAT ER VERSTUURD WORDT ====================

describe('factuurvenster - wat er naar de server gaat', () => {
  it('stuurt de bedragen als getallen, precies zoals ze op het scherm staan', async () => {
    (createInvoice as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'f-1' });
    const gebruiker = toon();

    await kiesRelatie(gebruiker);
    await vulRegel(gebruiker, 0, { beschrijving: 'Bladmuziek', aantal: '3', stuksprijs: '12.50' });
    await gebruiker.click(screen.getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(createInvoice).toHaveBeenCalledTimes(1));
    expect(verstuurd().lines).toEqual([{ description: 'Bladmuziek', quantity: 3, unitPrice: 12.5 }]);
    // Getallen, geen teksten: "12.50" is aan de serverkant geen bedrag.
    expect(typeof verstuurd().lines[0].unitPrice).toBe('number');
    expect(typeof verstuurd().lines[0].quantity).toBe('number');
  });

  it('laat lege regels weg maar houdt de ingevulde ongewijzigd', async () => {
    (createInvoice as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'f-1' });
    const gebruiker = toon();

    await kiesRelatie(gebruiker);
    await vulRegel(gebruiker, 0, { beschrijving: 'Bladmuziek', aantal: '3', stuksprijs: '12.50' });
    await gebruiker.click(screen.getByRole('button', { name: /accounting.addLine/ }));
    // De tweede regel krijgt wel een bedrag maar geen omschrijving.
    await vulRegel(gebruiker, 1, { stuksprijs: '99' });
    await gebruiker.click(screen.getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(createInvoice).toHaveBeenCalledTimes(1));
    // De regel zonder omschrijving valt weg - en daarmee ook zijn 99 euro.
    expect(verstuurd().lines).toHaveLength(1);
    expect(verstuurd().lines[0]).toEqual({ description: 'Bladmuziek', quantity: 3, unitPrice: 12.5 });
  });

  it('weigert een factuur zonder bruikbare regel', async () => {
    const gebruiker = toon();

    await kiesRelatie(gebruiker);
    await gebruiker.click(screen.getByRole('button', { name: 'common.save' }));

    expect(showError).toHaveBeenCalledWith('accounting.minOneLine');
    expect(createInvoice).not.toHaveBeenCalled();
  });

  it('weigert een factuur waarvan de enige regel geen omschrijving heeft', async () => {
    const gebruiker = toon();

    await kiesRelatie(gebruiker);
    // Wel een bedrag, geen omschrijving: er valt niets te factureren.
    await vulRegel(gebruiker, 0, { aantal: '2', stuksprijs: '12.50' });
    await gebruiker.click(screen.getByRole('button', { name: 'common.save' }));

    expect(showError).toHaveBeenCalledWith('accounting.minOneLine');
    expect(createInvoice).not.toHaveBeenCalled();
  });

  it('maakt van een aantal van nul een aantal van één', async () => {
    (createInvoice as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'f-1' });
    const gebruiker = toon();

    await kiesRelatie(gebruiker);
    await vulRegel(gebruiker, 0, { beschrijving: 'Bladmuziek', aantal: '0', stuksprijs: '12.50' });

    // `parseInt('0') || 1` levert 1 op, want nul is onwaar. Nul stuks is met de
    // hand dus niet in te voeren, en de controle `quantity > 0` bij het opslaan
    // komt daardoor nooit aan de beurt. Het veld staat ook op min="1", dus het
    // botst niet met wat de gebruiker mag - maar het staat hier zwart op wit,
    // want wie de terugval van 1 naar 0 verandert, laat regels van nul stuks door.
    expect(subtotaal()).toBe('12.50');

    await gebruiker.click(screen.getByRole('button', { name: 'common.save' }));
    await waitFor(() => expect(createInvoice).toHaveBeenCalledTimes(1));
    expect(verstuurd().lines[0].quantity).toBe(1);
  });

  it('stuurt de kop van de factuur mee', async () => {
    (createInvoice as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'f-1' });
    const gebruiker = toon();

    await gebruiker.selectOptions(kopkeuze(0), 'purchase');
    await kiesRelatie(gebruiker);
    await vulRegel(gebruiker, 0, { beschrijving: 'Bladmuziek', aantal: '1', stuksprijs: '10' });
    await gebruiker.click(screen.getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(createInvoice).toHaveBeenCalledTimes(1));
    expect(verstuurd().invoiceType).toBe('purchase');
  });

  it('meldt succes en sluit het venster via onSave', async () => {
    (createInvoice as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'f-1' });
    const gebruiker = toon();

    await kiesRelatie(gebruiker);
    await vulRegel(gebruiker, 0, { beschrijving: 'Bladmuziek', aantal: '1', stuksprijs: '10' });
    await gebruiker.click(screen.getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(bewaren).toHaveBeenCalledTimes(1));
    expect(showSuccess).toHaveBeenCalledWith('accounting.invoiceCreated');
  });

  it('toont de foutmelding van de server en bewaart niets', async () => {
    (createInvoice as unknown as ReturnType<typeof vi.fn>).mockRejectedValue({
      response: { data: { error: 'Boekjaar is afgesloten' } },
    });
    const gebruiker = toon();

    await kiesRelatie(gebruiker);
    await vulRegel(gebruiker, 0, { beschrijving: 'Bladmuziek', aantal: '1', stuksprijs: '10' });
    await gebruiker.click(screen.getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('Boekjaar is afgesloten'));
    expect(bewaren).not.toHaveBeenCalled();
    expect(showSuccess).not.toHaveBeenCalled();
  });

  it('valt terug op een algemene melding als de server niets zegt', async () => {
    (createInvoice as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('kapot'));
    const gebruiker = toon();

    await kiesRelatie(gebruiker);
    await vulRegel(gebruiker, 0, { beschrijving: 'Bladmuziek', aantal: '1', stuksprijs: '10' });
    await gebruiker.click(screen.getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('accounting.errorSave'));
  });
});

// ==================== REGELS EN REKENINGEN ====================

describe('factuurvenster - regels en rekeningen', () => {
  it('houdt minstens één regel over', async () => {
    const gebruiker = toon();

    const prullenbak = within(regels()[0]).getByRole('button');
    // Zonder regels valt er niets te factureren; de knop hoort uit te staan.
    expect(prullenbak).toBeDisabled();

    await gebruiker.click(prullenbak);
    expect(regels()).toHaveLength(1);
  });

  it('biedt bij een verkoopfactuur alleen opbrengstrekeningen aan', () => {
    toon();

    const rekeningkeuze = regels()[0].querySelector('select') as HTMLSelectElement;
    const opties = [...rekeningkeuze.options].map((o) => o.textContent);
    // Bank (bezitting) en Bladmuziek (kosten) horen hier niet tussen: een
    // verkoopfactuur boekt op een opbrengstrekening.
    expect(opties).toEqual(['-', '8000 - Contributies', '8100 - Donaties']);
  });

  it('wisselt naar kostenrekeningen zodra het een inkoopfactuur wordt', async () => {
    const gebruiker = toon();

    await gebruiker.selectOptions(kopkeuze(0), 'purchase');

    const opties = [...(regels()[0].querySelector('select') as HTMLSelectElement).options].map((o) => o.textContent);
    expect(opties).toEqual(['-', '4000 - Bladmuziek']);
  });

  it('geeft de gekozen rekening mee aan de regel', async () => {
    (createInvoice as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'f-1' });
    const gebruiker = toon();

    await kiesRelatie(gebruiker);
    await vulRegel(gebruiker, 0, { beschrijving: 'Contributie', aantal: '1', stuksprijs: '45' });
    await gebruiker.selectOptions(regels()[0].querySelector('select') as HTMLSelectElement, 'r-8000');
    await gebruiker.click(screen.getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(createInvoice).toHaveBeenCalledTimes(1));
    expect(verstuurd().lines[0].accountId).toBe('r-8000');
  });
});

// ==================== SLUITEN MET ONBEWAARDE INVOER ====================

describe('factuurvenster - sluiten', () => {
  it('sluit meteen als er niets is ingevuld', async () => {
    const gebruiker = toon();

    await gebruiker.click(screen.getByRole('button', { name: 'common.cancel' }));

    expect(sluiten).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('vraagt eerst om bevestiging als er wél iets is ingevuld', async () => {
    const gebruiker = toon();

    await vulRegel(gebruiker, 0, { beschrijving: 'Bladmuziek' });
    await gebruiker.click(screen.getByRole('button', { name: 'common.cancel' }));

    // Een half ingevulde factuur mag niet zonder waarschuwing verdwijnen.
    expect(sluiten).not.toHaveBeenCalled();
    const waarschuwing = screen.getByRole('alertdialog');
    expect(within(waarschuwing).getByText('common.unsavedChanges.message')).toBeInTheDocument();

    await gebruiker.click(within(waarschuwing).getByRole('button', { name: 'common.unsavedChanges.discard' }));
    expect(sluiten).toHaveBeenCalledTimes(1);
  });

  it('laat het venster staan als de invoer bewaard moet blijven', async () => {
    const gebruiker = toon();

    await vulRegel(gebruiker, 0, { beschrijving: 'Bladmuziek' });
    await gebruiker.click(screen.getByRole('button', { name: 'common.cancel' }));
    await gebruiker.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'common.unsavedChanges.keepEditing' }),
    );

    expect(sluiten).not.toHaveBeenCalled();
    expect(velden(regels()[0]).beschrijving).toHaveValue('Bladmuziek');
  });
});

// ==================== DATUMS ====================

/**
 * BEWIJS - hier zat een echte fout, maar hij is alleen zichtbaar buiten UTC.
 *
 * De standaarddatums kwamen uit `new Date().toISOString().split('T')[0]`, en
 * `toISOString()` rekent in UTC. In Nederland loopt de klok een uur voor
 * (zomertijd twee), dus tussen middernacht en 01:00 stond daar de dag ervóór.
 * Een factuur die op 1 januari om half een wordt aangemaakt, kreeg 31 december
 * als factuurdatum: een ander jaar, en daarmee een ander boekjaar.
 *
 * De vervaldatum had er nog een: dertig keer 24 uur optellen is niet hetzelfde
 * als dertig kalenderdagen. Over de overgang van zomertijd komt dat een uur
 * naast de kalender uit, en dan valt de vervaldatum een dag te vroeg.
 *
 * Deze twee tests rekenen de verwachting uit met de lokale kalender. Draait de
 * testomgeving zelf in UTC, dan zijn UTC en lokale tijd hetzelfde en blijven ze
 * ook op de oude code groen - dan zijn het wachten, geen bewijzen. Met de
 * tijdzone van de gebruiker erbij zijn ze rood op de oude code:
 *
 *   TZ=Europe/Amsterdam npx vitest run src/pages/Accounting/__tests__/InvoiceModal.bedragen.test.tsx
 *
 * Dat is de tijdzone waarin deze vereniging haar boekhouding voert, dus dat is
 * de tijdzone waarin het moet kloppen.
 */
describe('factuurvenster - de standaarddatums', () => {
  /** JJJJ-MM-DD zoals de gebruiker het op zijn eigen klok ziet. */
  const lokaleDatum = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const datumvelden = () => [...venster().querySelectorAll('input[type="date"]')] as HTMLInputElement[];

  it('stelt de dag van de gebruiker voor als factuurdatum, ook vlak na middernacht', () => {
    // 1 januari, half een 's nachts: in UTC is het dan nog 31 december.
    const nieuwjaarsnacht = new Date(2027, 0, 1, 0, 30);
    vi.useFakeTimers();
    vi.setSystemTime(nieuwjaarsnacht);

    toon();

    expect(datumvelden()[0]).toHaveValue('2027-01-01');
    expect(datumvelden()[0]).toHaveValue(lokaleDatum(nieuwjaarsnacht));
  });

  it('zet de vervaldatum dertig kalenderdagen later', () => {
    // Eind oktober valt de zomertijd; dertig keer 24 uur komt dan een uur
    // naast de kalender uit.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 1, 0, 30));

    toon();

    expect(datumvelden()[0]).toHaveValue('2026-10-01');
    // 1 oktober plus dertig dagen is 31 oktober.
    expect(datumvelden()[1]).toHaveValue('2026-10-31');
  });
});
