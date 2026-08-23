/**
 * Aanwezigheidsdashboard: de percentages narekenen.
 *
 * Dit scherm is één groot rekenblad: een gemiddelde over alle leden, twee
 * tellingen op een grenswaarde, een badge per lid en per repetitie, en een
 * staafdiagram waarin de hoogte van elke staaf een percentage is. Een test die
 * alleen kijkt of er "iets met een procentteken" staat keurt ook 'NaN%' goed,
 * en juist dat is het klassieke geval: een gemiddelde over nul leden.
 *
 * Daarom rekent dit bestand de getallen na met vooraf uitgerekende
 * verwachtingen (90/60/30 hoort 60 te zijn, niet "ongeveer 60"), en test het
 * de grenzen apart: precies 80 telt als hoog, precies 50 telt niet als laag.
 *
 * Wat hier een *wacht* is en geen bewijs: het lege ledenbestand. De component
 * vangt `members.length === 0` al af voordat er gedeeld wordt, dus deze test
 * is ook op de bestaande code groen. Hij staat er om te voorkomen dat die
 * bewaking sneuvelt bij een volgende verbouwing - dan verschijnt er 'NaN%' in
 * beeld en valt deze test om.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AttendanceDashboard } from '../AttendanceDashboard';
import type { AttendanceMember, RehearsalAttendance, AttendanceTrend } from '../AttendanceDashboard';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (sleutel: string, opties?: Record<string, unknown>) =>
      opties ? `${sleutel} ${Object.values(opties).join(' ')}` : sleutel,
    i18n: { language: 'nl' },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

// De echte hulpfunctie trekt de volledige i18n-opzet mee; alleen de
// landinstelling doet er hier toe, en die moet vast staan omdat er datums in
// titels van staven terechtkomen.
vi.mock('../../utils/locale', () => ({ currentLocale: () => 'nl-NL' }));

vi.mock('../../hooks/useDarkMode', () => ({ useDarkMode: () => ({ isDark: false }) }));

vi.mock('../Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

function lid(id: string, naam: string, percentage: number, extra: Partial<AttendanceMember> = {}): AttendanceMember {
  return {
    id,
    name: naam,
    instrument: 'Fluit',
    presentCount: 0,
    absentCount: 0,
    attendanceRate: percentage,
    ...extra,
  };
}

function repetitie(id: string, datum: string, percentage: number, aanwezig = 0, afwezig = 0): RehearsalAttendance {
  return {
    id,
    date: datum,
    totalMembers: aanwezig + afwezig,
    presentCount: aanwezig,
    absentCount: afwezig,
    attendanceRate: percentage,
  };
}

/** De waarde onder een samenvattingskaart met het gegeven label. */
function kaartwaarde(label: string): string {
  const labelElement = screen.getByText(label);
  const kaart = labelElement.closest('.summary-card') as HTMLElement;
  return within(kaart).getByText((_tekst, element) => element?.className === 'summary-value')!.textContent!;
}

/** De namen in de ledentabel, in de volgorde waarin ze op het scherm staan. */
function namenInTabel(): string[] {
  return screen.getAllByRole('row').slice(1).map((rij) => within(rij).getAllByRole('cell')[0].textContent!.trim());
}

describe('AttendanceDashboard - de rekensom achter de percentages', () => {
  it('het gemiddelde is de som van de percentages gedeeld door het aantal leden', () => {
    render(
      <AttendanceDashboard
        members={[lid('1', 'Anna', 90), lid('2', 'Bram', 60), lid('3', 'Chris', 30)]}
        rehearsals={[]}
        trends={[]}
      />,
    );

    // (90 + 60 + 30) / 3 = 60, geen afronding nodig.
    expect(kaartwaarde('attendanceDashboard.averageAttendance')).toBe('60%');
    expect(kaartwaarde('attendanceDashboard.totalMembers')).toBe('3');
  });

  it('een gemiddelde met een staart wordt afgerond, niet afgekapt', () => {
    render(
      <AttendanceDashboard
        members={[lid('1', 'Anna', 66), lid('2', 'Bram', 67), lid('3', 'Chris', 67)]}
        rehearsals={[]}
        trends={[]}
      />,
    );

    // 200 / 3 = 66,666..., dat hoort 67 te worden.
    expect(kaartwaarde('attendanceDashboard.averageAttendance')).toBe('67%');
  });

  it('nul leden geeft 0 procent en niet NaN', () => {
    // Wacht, geen bewijs: de deling wordt al overgeslagen bij een leeg
    // ledenbestand. Deze test bewaakt dat dat zo blijft.
    render(<AttendanceDashboard members={[]} rehearsals={[]} trends={[]} />);

    expect(kaartwaarde('attendanceDashboard.averageAttendance')).toBe('0%');
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
  });

  it('precies 80 procent telt als hoge opkomst, precies 50 procent niet als lage', () => {
    render(<AttendanceDashboard members={[lid('1', 'Anna', 80), lid('2', 'Bram', 50)]} rehearsals={[]} trends={[]} />);

    expect(kaartwaarde('attendanceDashboard.highAttendance')).toBe('1');
    expect(kaartwaarde('attendanceDashboard.lowAttendance')).toBe('0');
    expect(kaartwaarde('attendanceDashboard.averageAttendance')).toBe('65%');
  });

  it('net onder de grenzen kantelt de telling wel', () => {
    render(
      <AttendanceDashboard
        members={[lid('1', 'Anna', 79.9), lid('2', 'Bram', 49.9)]}
        rehearsals={[]}
        trends={[]}
      />,
    );

    expect(kaartwaarde('attendanceDashboard.highAttendance')).toBe('0');
    expect(kaartwaarde('attendanceDashboard.lowAttendance')).toBe('1');
  });

  it('de badge kleurt groen, oranje of rood volgens hetzelfde percentage', () => {
    render(
      <AttendanceDashboard
        members={[lid('1', 'Anna', 80), lid('2', 'Bram', 50), lid('3', 'Chris', 49)]}
        rehearsals={[]}
        trends={[]}
      />,
    );

    expect(screen.getByText('80%')).toHaveStyle({ color: '#16a34a' });
    expect(screen.getByText('50%')).toHaveStyle({ color: '#ca8a04' });
    expect(screen.getByText('49%')).toHaveStyle({ color: '#dc2626' });
  });
});

describe('AttendanceDashboard - de ledentabel', () => {
  const leden = [
    lid('1', 'Chris', 30, { presentCount: 3, absentCount: 7, instrument: 'Hoorn', section: 'Koper' }),
    lid('2', 'Anna', 90, { presentCount: 9, absentCount: 1, instrument: 'Fluit', section: 'Hout' }),
    lid('3', 'Bram', 60, { presentCount: 6, absentCount: 4, instrument: 'Klarinet', section: 'Hout' }),
  ];

  it('staat standaard op naam oplopend', () => {
    render(<AttendanceDashboard members={leden} rehearsals={[]} trends={[]} />);

    expect(namenInTabel()).toEqual(['Anna', 'Bram', 'Chris']);
    expect(screen.getByText('attendanceDashboard.memberList (3)')).toBeInTheDocument();
  });

  it('sorteert op percentage, en keert om bij aflopend', async () => {
    const gebruiker = userEvent.setup();
    render(<AttendanceDashboard members={leden} rehearsals={[]} trends={[]} />);

    await gebruiker.selectOptions(screen.getByLabelText('attendanceDashboard.sortBy'), 'rate');
    expect(namenInTabel()).toEqual(['Chris', 'Bram', 'Anna']);

    await gebruiker.selectOptions(screen.getByLabelText('attendanceDashboard.sortOrder'), 'desc');
    expect(namenInTabel()).toEqual(['Anna', 'Bram', 'Chris']);
  });

  it('sorteert ook op aanwezig en op afwezig', async () => {
    const gebruiker = userEvent.setup();
    render(<AttendanceDashboard members={leden} rehearsals={[]} trends={[]} />);

    await gebruiker.selectOptions(screen.getByLabelText('attendanceDashboard.sortBy'), 'present');
    expect(namenInTabel()).toEqual(['Chris', 'Bram', 'Anna']);

    await gebruiker.selectOptions(screen.getByLabelText('attendanceDashboard.sortBy'), 'absent');
    expect(namenInTabel()).toEqual(['Anna', 'Bram', 'Chris']);
  });

  it('het sectiefilter beperkt de tabel, maar de samenvatting blijft over alle leden gaan', async () => {
    // Karakterisering: de samenvattingskaarten staan bóven het filter en
    // rekenen bewust over het hele ledenbestand. Wie dat verandert, verandert
    // ook wat de vier kaarten betekenen - dan hoort deze test om te vallen.
    const gebruiker = userEvent.setup();
    render(<AttendanceDashboard members={leden} rehearsals={[]} trends={[]} sections={['Hout', 'Koper']} />);

    await gebruiker.selectOptions(screen.getByLabelText('attendanceDashboard.section'), 'Hout');

    expect(namenInTabel()).toEqual(['Anna', 'Bram']);
    expect(screen.getByText('attendanceDashboard.memberList (2)')).toBeInTheDocument();
    expect(kaartwaarde('attendanceDashboard.totalMembers')).toBe('3');
    expect(kaartwaarde('attendanceDashboard.averageAttendance')).toBe('60%');
  });

  it('het filter kijkt ook naar het instrument als er geen sectie is', async () => {
    const gebruiker = userEvent.setup();
    render(<AttendanceDashboard members={leden} rehearsals={[]} trends={[]} sections={['Fluit']} />);

    await gebruiker.selectOptions(screen.getByLabelText('attendanceDashboard.section'), 'Fluit');

    expect(namenInTabel()).toEqual(['Anna']);
  });

  it('meldt het als het filter niemand overhoudt', async () => {
    const gebruiker = userEvent.setup();
    render(<AttendanceDashboard members={leden} rehearsals={[]} trends={[]} sections={['Slagwerk']} />);

    await gebruiker.selectOptions(screen.getByLabelText('attendanceDashboard.section'), 'Slagwerk');

    expect(screen.getByText('attendanceDashboard.noMembersFound')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('toont het e-mailadres alleen bij leden die er een hebben', () => {
    render(
      <AttendanceDashboard
        members={[lid('1', 'Anna', 90, { email: 'anna@orkest.nl' }), lid('2', 'Bram', 60)]}
        rehearsals={[]}
        trends={[]}
      />,
    );

    expect(screen.getByText('anna@orkest.nl')).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(3);
  });

  it('laat tijdens het laden de tabel weg', () => {
    render(<AttendanceDashboard members={leden} rehearsals={[]} trends={[]} isLoading />);

    expect(screen.getByText('common.loading')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});

describe('AttendanceDashboard - filters en export', () => {
  it('geeft elke filterwijziging door aan de omgeving', async () => {
    const gebruiker = userEvent.setup();
    const bijFilter = vi.fn();
    render(
      <AttendanceDashboard
        members={[lid('1', 'Anna', 90)]}
        rehearsals={[]}
        trends={[]}
        sections={['Hout']}
        onFilterChange={bijFilter}
      />,
    );

    await gebruiker.selectOptions(screen.getByLabelText('attendanceDashboard.section'), 'Hout');

    expect(bijFilter).toHaveBeenCalledWith(expect.objectContaining({ section: 'Hout', sortBy: 'name' }));
  });

  it('geeft ook een nieuwe begin- en einddatum door', async () => {
    const gebruiker = userEvent.setup();
    const bijFilter = vi.fn();
    render(
      <AttendanceDashboard members={[]} rehearsals={[]} trends={[]} onFilterChange={bijFilter} />,
    );

    const van = screen.getByLabelText('attendanceDashboard.from');
    const tot = screen.getByLabelText('attendanceDashboard.to');
    await gebruiker.clear(van);
    await gebruiker.type(van, '2026-01-01');
    await gebruiker.clear(tot);
    await gebruiker.type(tot, '2026-06-30');

    expect(van).toHaveValue('2026-01-01');
    expect(tot).toHaveValue('2026-06-30');
    expect(bijFilter).toHaveBeenLastCalledWith(
      expect.objectContaining({ dateFrom: '2026-01-01', dateTo: '2026-06-30' }),
    );
  });

  it('zet Reset de filters terug op de standaard', async () => {
    const gebruiker = userEvent.setup();
    const bijFilter = vi.fn();
    render(
      <AttendanceDashboard
        members={[lid('1', 'Anna', 90, { section: 'Hout' }), lid('2', 'Bram', 60, { section: 'Koper' })]}
        rehearsals={[]}
        trends={[]}
        sections={['Hout']}
        onFilterChange={bijFilter}
      />,
    );

    const sectie = screen.getByLabelText('attendanceDashboard.section') as HTMLSelectElement;
    await gebruiker.selectOptions(sectie, 'Hout');
    await gebruiker.selectOptions(screen.getByLabelText('attendanceDashboard.sortOrder'), 'desc');
    expect(namenInTabel()).toEqual(['Anna']);

    await gebruiker.click(screen.getByRole('button', { name: /Reset/ }));

    expect(sectie.value).toBe('');
    expect(namenInTabel()).toEqual(['Anna', 'Bram']);
    expect(bijFilter).toHaveBeenLastCalledWith(expect.objectContaining({ section: '', sortOrder: 'asc' }));
  });

  it('opent het exportmenu en meldt de gekozen vorm, waarna het menu dicht gaat', async () => {
    const gebruiker = userEvent.setup();
    const bijExport = vi.fn();
    render(<AttendanceDashboard members={[]} rehearsals={[]} trends={[]} onExport={bijExport} />);

    expect(screen.queryByRole('button', { name: 'CSV' })).not.toBeInTheDocument();

    await gebruiker.click(screen.getByRole('button', { name: /common.export/ }));
    await gebruiker.click(screen.getByRole('button', { name: 'CSV' }));

    expect(bijExport).toHaveBeenCalledWith('csv');
    expect(screen.queryByRole('button', { name: 'CSV' })).not.toBeInTheDocument();
  });

  it('kan ook een pdf laten maken', async () => {
    const gebruiker = userEvent.setup();
    const bijExport = vi.fn();
    render(<AttendanceDashboard members={[]} rehearsals={[]} trends={[]} onExport={bijExport} />);

    await gebruiker.click(screen.getByRole('button', { name: /common.export/ }));
    await gebruiker.click(screen.getByRole('button', { name: 'PDF' }));

    expect(bijExport).toHaveBeenCalledWith('pdf');
  });

  it('valt niet om als er niemand naar de export luistert', async () => {
    const gebruiker = userEvent.setup();
    render(<AttendanceDashboard members={[]} rehearsals={[]} trends={[]} />);

    await gebruiker.click(screen.getByRole('button', { name: /common.export/ }));
    await gebruiker.click(screen.getByRole('button', { name: 'CSV' }));

    expect(screen.queryByRole('button', { name: 'CSV' })).not.toBeInTheDocument();
  });
});

describe('AttendanceDashboard - de grafiek en de repetities', () => {
  const trend = (datum: string, percentage: number, aanwezig: number, totaal: number): AttendanceTrend => ({
    date: datum,
    attendanceRate: percentage,
    presentCount: aanwezig,
    totalMembers: totaal,
  });

  it('meldt het als er niets te tekenen valt', () => {
    render(<AttendanceDashboard members={[]} rehearsals={[]} trends={[]} />);

    expect(screen.getByText('attendanceDashboard.noDataAvailable')).toBeInTheDocument();
  });

  it('zet percentage en verhouding in de titel van elke staaf', () => {
    render(
      <AttendanceDashboard
        members={[]}
        rehearsals={[]}
        trends={[trend('2026-03-02', 75.4, 15, 20), trend('2026-03-09', 100, 20, 20)]}
      />,
    );

    // 75,4 procent hoort als 75 in de titel te staan, met de telling erachter.
    expect(screen.getByTitle(/75% \(15\/20\)/)).toBeInTheDocument();
    expect(screen.getByTitle(/100% \(20\/20\)/)).toBeInTheDocument();
  });

  it('schrijft bij twaalf punten of minder elke datum onder de grafiek', () => {
    render(
      <AttendanceDashboard
        members={[]}
        rehearsals={[]}
        trends={[trend('2026-03-02', 80, 8, 10), trend('2026-03-09', 60, 6, 10)]}
      />,
    );

    expect(screen.getByText('02 mrt')).toBeInTheDocument();
    expect(screen.getByText('09 mrt')).toBeInTheDocument();
  });

  it('houdt het bij meer dan twaalf punten op de eerste en de laatste datum', () => {
    const punten = Array.from({ length: 13 }, (_, i) =>
      trend(`2026-03-${String(i + 1).padStart(2, '0')}`, 50 + i, i, 20),
    );
    render(<AttendanceDashboard members={[]} rehearsals={[]} trends={punten} />);

    expect(screen.getByText('01 mrt')).toBeInTheDocument();
    expect(screen.getByText('13 mrt')).toBeInTheDocument();
    expect(screen.queryByText('07 mrt')).not.toBeInTheDocument();
  });

  it('toont per repetitie de tellingen en het percentage', () => {
    render(
      <AttendanceDashboard
        members={[]}
        rehearsals={[repetitie('r1', '2026-03-02', 62.5, 25, 15)]}
        trends={[]}
      />,
    );

    expect(screen.getByText('attendanceDashboard.rehearsals (1)')).toBeInTheDocument();
    expect(screen.getByText('25')).toBeInTheDocument();
    expect(screen.getByText('15')).toBeInTheDocument();
    // 25 van de 40 is 62,5 procent, afgerond 63.
    expect(screen.getByText('63%')).toBeInTheDocument();
  });

  it('toont hoogstens tien repetities, maar telt ze allemaal in de kop', () => {
    const repetities = Array.from({ length: 12 }, (_, i) =>
      repetitie(`r${i}`, `2026-03-${String(i + 1).padStart(2, '0')}`, 50, 5, 5),
    );
    render(<AttendanceDashboard members={[]} rehearsals={repetities} trends={[]} />);

    expect(screen.getByText('attendanceDashboard.rehearsals (12)')).toBeInTheDocument();
    expect(document.querySelectorAll('.rehearsal-item')).toHaveLength(10);
  });

  it('meldt het als er geen repetities zijn', () => {
    render(<AttendanceDashboard members={[]} rehearsals={[]} trends={[]} />);

    expect(screen.getByText('attendanceDashboard.noRehearsalsFound')).toBeInTheDocument();
  });
});
