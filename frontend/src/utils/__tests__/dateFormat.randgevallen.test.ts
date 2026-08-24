/**
 * De randgevallen van de datumopmaak.
 *
 * dateFormat.test.ts legt de gewone gevallen vast: een geldige datum in het
 * midden van een maand, netjes opgemaakt. Wat daar niet in staat is precies wat
 * bij datumcode misgaat - en datumcode verdient argwaan. Aan de serverkant is
 * deze week nog een fout gevonden waarbij een ISO-tekst als tekst met een
 * SQLite-datum werd vergeleken; dat soort fouten toont een scherm zonder te
 * klagen.
 *
 * Hier staan daarom de gevallen waar het scheef gaat:
 *
 *   - een ongeldige datum en een lege waarde
 *   - een ISO-tekst tegenover een Date die hetzelfde moment aanwijst
 *   - de dagovergang om middernacht (isToday, isTomorrow, isYesterday)
 *   - een schrikkeldag
 *   - het verschil tussen verleden en toekomst in formatRelative
 *
 * De verwachte teksten worden waar het om de eenheid gaat apart uitgerekend met
 * Intl.RelativeTimeFormat, niet overgeschreven uit de ICU-tabellen. Het gaat in
 * die tests namelijk niet om de spelling van "overmorgen" maar om de vraag welke
 * eenheid en welk getal de functie kiest - en daar zat de fout.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  formatDate,
  formatDateTime,
  formatDateTimeShort,
  formatTime,
  formatRelative,
  formatDateRange,
  formatDuration,
  formatDurationSeconds,
  getDayName,
  getMonthName,
  isToday,
  isTomorrow,
  isYesterday,
} from '../dateFormat';

// De taal is instelbaar, want het voegwoord tussen datum en tijd hangt ervan af.
const taal = vi.hoisted(() => ({ huidig: 'nl-NL' }));
vi.mock('../locale', () => ({ currentLocale: () => taal.huidig }));

beforeEach(() => {
  taal.huidig = 'nl-NL';
});

afterEach(() => {
  vi.useRealTimers();
});

/** Dezelfde opmaker die formatRelative gebruikt, los nagerekend. */
const relatief = (waarde: number, eenheid: Intl.RelativeTimeFormatUnit) =>
  new Intl.RelativeTimeFormat(taal.huidig, { numeric: 'auto' }).format(waarde, eenheid);

/** Zet de klok op een vast moment, zodat "nu" in elke test hetzelfde is. */
const klokOp = (datum: Date) => {
  vi.useFakeTimers();
  vi.setSystemTime(datum);
};

const SECONDE = 1000;
const MINUUT = 60 * SECONDE;
const UUR = 60 * MINUUT;
const DAG = 24 * UUR;

// ==================== ONGELDIG EN LEEG ====================

describe('datumopmaak - ongeldige en lege waarden', () => {
  it('geeft "-" voor een lege tekst', () => {
    // new Date('') is Invalid Date; dat mag niet als "1 januari 1970" op het
    // scherm belanden.
    expect(formatDate('')).toBe('-');
    expect(formatDateTime('')).toBe('-');
    expect(formatDateTimeShort('')).toBe('-');
    expect(formatTime('')).toBe('-');
    expect(formatRelative('')).toBe('-');
  });

  it('geeft "-" voor onzin en voor NaN', () => {
    expect(formatDate('31-02-2026')).toBe('-');
    expect(formatDateTimeShort(NaN)).toBe('-');
    expect(formatRelative(new Date('geen datum'))).toBe('-');
    expect(getDayName(NaN)).toBe('-');
    expect(getMonthName(NaN)).toBe('-');
  });

  it('noemt een ongeldige datum niet vandaag, morgen of gisteren', () => {
    for (const ongeldig of ['', 'onzin', NaN]) {
      expect(isToday(ongeldig)).toBe(false);
      expect(isTomorrow(ongeldig)).toBe(false);
      expect(isYesterday(ongeldig)).toBe(false);
    }
  });

  it('geeft "-" voor een reeks waarvan één kant ontbreekt', () => {
    expect(formatDateRange('', new Date(2026, 4, 6))).toBe('-');
    expect(formatDateRange(new Date(2026, 4, 4), '')).toBe('-');
  });

  it('geeft "-" voor een duur die geen duur is', () => {
    expect(formatDuration(NaN)).toBe('-');
    expect(formatDurationSeconds(NaN)).toBe('-');
    expect(formatDurationSeconds(-1)).toBe('-');
  });
});

// ==================== ISO-TEKST TEGENOVER DATE ====================

describe('datumopmaak - een ISO-tekst tegenover een Date', () => {
  it('leest een ISO-tekst zonder tijdzone als lokale tijd', () => {
    // '2026-05-04T14:30:00' zonder achtervoegsel is lokale tijd. Wie hem als
    // UTC zou lezen, schuift de klok - en dat is precies het soort fout dat
    // niemand ziet zolang de tijdzone toevallig UTC is.
    expect(formatDateTime('2026-05-04T14:30:00')).toBe(formatDateTime(new Date(2026, 4, 4, 14, 30)));
    expect(formatTime('2026-05-04T14:30:00')).toBe('14:30');
  });

  it('leest een ISO-tekst met Z als UTC en rekent hem om naar lokale tijd', () => {
    const moment = new Date(Date.UTC(2026, 4, 4, 14, 30));
    // Apart nagerekend: dezelfde tijdstip-omzetting, maar buiten dateFormat om.
    const verwacht = new Intl.DateTimeFormat('nl-NL', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(moment);

    expect(formatTime('2026-05-04T14:30:00Z')).toBe(verwacht);
    // Dezelfde tekst en hetzelfde Date-object horen hetzelfde op te leveren.
    expect(formatTime('2026-05-04T14:30:00Z')).toBe(formatTime(moment));
  });

  it('behandelt een tijdstempel gelijk aan het Date-object ervan', () => {
    const moment = new Date(2026, 4, 4, 14, 30);
    expect(formatDateTime(moment.getTime())).toBe(formatDateTime(moment));
  });
});

// ==================== MIDDERNACHT ====================

describe('datumopmaak - de dagovergang om middernacht', () => {
  it('rekent een minuut voor en een minuut na middernacht tot verschillende dagen', () => {
    const netVoor = new Date(2026, 4, 4, 23, 59);
    const netNa = new Date(2026, 4, 5, 0, 1);
    klokOp(netVoor);

    expect(isToday(netVoor)).toBe(true);
    expect(isTomorrow(netNa)).toBe(true);
    expect(isToday(netNa)).toBe(false);

    // En één tik later is alles opgeschoven.
    klokOp(netNa);
    expect(isToday(netNa)).toBe(true);
    expect(isYesterday(netVoor)).toBe(true);
    expect(isToday(netVoor)).toBe(false);
  });

  it('houdt de jaarwisseling uit elkaar', () => {
    // 31 december en 1 januari hebben allebei een andere maand én een ander
    // jaar; wie alleen de dag van de maand vergelijkt, haalt 1 januari en
    // 1 december door elkaar.
    klokOp(new Date(2026, 11, 31, 12, 0));

    expect(isToday(new Date(2026, 11, 31, 23, 59))).toBe(true);
    expect(isTomorrow(new Date(2027, 0, 1, 0, 1))).toBe(true);
    expect(isYesterday(new Date(2026, 11, 30, 8, 0))).toBe(true);
    expect(isToday(new Date(2025, 11, 31, 12, 0))).toBe(false);
    expect(isToday(new Date(2026, 0, 31, 12, 0))).toBe(false);
  });

  it('toont middernacht als 00:00 en niet als 24:00 of 12:00', () => {
    expect(formatTime(new Date(2026, 4, 4, 0, 0))).toBe('00:00');
    expect(formatTime(new Date(2026, 4, 4, 12, 0))).toBe('12:00');
  });
});

// ==================== SCHRIKKELDAG ====================

describe('datumopmaak - schrikkeldagen', () => {
  it('maakt 29 februari 2024 gewoon op', () => {
    const schrikkeldag = new Date(2024, 1, 29);
    expect(formatDate(schrikkeldag)).toBe('29 februari 2024');
    // 29 februari 2024 was een donderdag.
    expect(getDayName(schrikkeldag)).toBe('donderdag');
  });

  it('bestaat niet in 2026 en rolt door naar 1 maart', () => {
    // Dit is geen wens maar de werking van Date: '2026-02-29' bestaat niet en
    // wordt 1 maart. Wie dat niet weet, denkt dat de opmaak iets verzint.
    expect(formatDate('2026-02-29T12:00:00')).toBe('1 maart 2026');
  });

  it('houdt een reeks binnen februari van een schrikkeljaar bij elkaar', () => {
    expect(formatDateRange(new Date(2024, 1, 28), new Date(2024, 1, 29))).toBe('28 - 29 februari 2024');
  });
});

// ==================== KORTE OPMAAK EN VOEGWOORD ====================

describe('formatDateTimeShort', () => {
  it('laat het jaar weg en kort de maand af', () => {
    expect(formatDateTimeShort(new Date(2026, 4, 4, 14, 30))).toBe('4 mei 14:30');
  });

  it('vult het uur aan tot twee cijfers', () => {
    expect(formatDateTimeShort(new Date(2026, 0, 9, 9, 5))).toBe('9 jan 09:05');
  });
});

describe('formatDateTime - het voegwoord volgt de taal', () => {
  it.each([
    ['nl-NL', 'om'],
    ['en-GB', 'at'],
    ['de-DE', 'um'],
  ])('gebruikt in %s het woord "%s"', (locale, woord) => {
    taal.huidig = locale;
    const datumTijd = formatDateTime(new Date(2026, 4, 4, 14, 30));
    expect(datumTijd).toContain(` ${woord} `);
    expect(datumTijd).toMatch(/14[:.]30$/);
  });

  it('valt terug op "om" bij een taal die niet in de lijst staat', () => {
    taal.huidig = 'fr-FR';
    expect(formatDateTime(new Date(2026, 4, 4, 14, 30))).toContain(' om ');
  });
});

// ==================== RELATIEVE TIJD, VERLEDEN ====================

describe('formatRelative - het verleden', () => {
  const nu = new Date(2026, 4, 4, 12, 0, 0);

  beforeEach(() => klokOp(nu));

  it.each([
    ['dertig seconden', 30 * SECONDE, () => relatief(0, 'second')],
    ['vijf minuten', 5 * MINUUT, () => relatief(-5, 'minute')],
    ['drie uur', 3 * UUR, () => relatief(-3, 'hour')],
    ['gisteren', 1 * DAG, () => relatief(-1, 'day')],
    ['vorige week', 8 * DAG, () => relatief(-1, 'week')],
    ['twee maanden', 60 * DAG, () => relatief(-2, 'month')],
  ])('%s geleden', (_naam, verschil, verwacht) => {
    expect(formatRelative(new Date(nu.getTime() - verschil))).toBe(verwacht());
  });

  it('toont een volledige datum als het langer dan een jaar geleden is', () => {
    const oud = new Date(2024, 0, 15);
    expect(formatRelative(oud)).toBe('15 januari 2024');
  });
});

// ==================== RELATIEVE TIJD, TOEKOMST ====================

/**
 * BEWIJS - hier zat een echte fout, en deze vier tests zijn rood op de oude code.
 *
 * De toekomsttak rekende met `Math.abs()` over waarden die met `Math.floor()`
 * uit een negatief verschil waren gehaald. Math.floor rondt naar beneden, dus
 * bij een negatief getal van nul áf: floor(-25/24) is -2. Gevolg:
 *
 *   - 25 uur vooruit las als "overmorgen" in plaats van "morgen"
 *   - 8 dagen vooruit als "over 2 weken" in plaats van "volgende week"
 *   - 90 seconden vooruit als "over 2 minuten" in plaats van "over 1 minuut"
 *   - "nu" was onbereikbaar: elk negatief verschil, ook van één milliseconde,
 *     kwam op minstens 1 minuut uit
 *
 * Het verleden had die fout niet - daar is het verschil positief en rondt
 * Math.floor naar nul toe. De reparatie rekent de toekomsteenheden opnieuw uit
 * vanuit het absolute verschil, waarmee beide takken hetzelfde doen.
 *
 * Op de oude code faalt elk van de vier gevallen hieronder met een eenheid of
 * een getal te hoog.
 */
describe('formatRelative - de toekomst', () => {
  const nu = new Date(2026, 4, 4, 12, 0, 0);

  beforeEach(() => klokOp(nu));

  const straks = (verschil: number) => formatRelative(new Date(nu.getTime() + verschil));

  it('noemt iets binnen de minuut "nu"', () => {
    expect(straks(1)).toBe(relatief(0, 'second'));
    expect(straks(59 * SECONDE)).toBe(relatief(0, 'second'));
  });

  it('rondt de minuten naar beneden af, niet omhoog', () => {
    expect(straks(90 * SECONDE)).toBe(relatief(1, 'minute'));
    expect(straks(5 * MINUUT)).toBe(relatief(5, 'minute'));
  });

  it('noemt 25 uur vooruit "morgen" en niet "overmorgen"', () => {
    expect(straks(25 * UUR)).toBe(relatief(1, 'day'));
    expect(straks(2 * DAG + 3 * UUR)).toBe(relatief(2, 'day'));
  });

  it('noemt 8 dagen vooruit "volgende week" en niet "over 2 weken"', () => {
    expect(straks(8 * DAG)).toBe(relatief(1, 'week'));
    expect(straks(15 * DAG)).toBe(relatief(2, 'week'));
  });

  it('gebruikt uren zolang het binnen de dag blijft', () => {
    expect(straks(3 * UUR)).toBe(relatief(3, 'hour'));
    expect(straks(23 * UUR)).toBe(relatief(23, 'hour'));
  });

  it('toont een volledige datum als het meer dan vier weken vooruit is', () => {
    expect(straks(40 * DAG)).toBe('13 juni 2026');
  });
});

// ==================== DUUR ====================

describe('formatDuration - randgevallen', () => {
  it('rondt een gebroken aantal minuten af op hele minuten', () => {
    // Een halve minuut aan seconden hoort niet als "0.5 min" op het scherm.
    expect(formatDurationSeconds(90)).toBe('2 min');
    expect(formatDurationSeconds(30)).toBe('1 min');
  });

  it('houdt uren en minuten uit elkaar op het uurpunt', () => {
    expect(formatDuration(59)).toBe('59 min');
    expect(formatDuration(61)).toBe('1 uur 1 min');
    expect(formatDuration(1440)).toBe('24 uur');
  });
});
