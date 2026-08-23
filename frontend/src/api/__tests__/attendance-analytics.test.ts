/**
 * Tests voor de opkomstcijfers van repetities.
 *
 * Dit zijn acht leesfuncties zonder eigen logica, en juist daarom is er weinig
 * dat een fout tegenhoudt. Drie dingen kunnen hier echt misgaan.
 *
 * Het pad. Deze functies hangen niet onder /attendance maar onder
 * /analytics/attendance/... - dezelfde router die ook /analytics/activity en
 * /analytics/repertoire bedient. Wie hier /attendance/overview schrijft raakt
 * geen enkele route en krijgt een 404 die in een grafiek als "geen gegevens"
 * oogt.
 *
 * Het aantal. `months` en `limit` gaan als getal mee in de queryreeks. De
 * server leest ze met parseInt en heeft eigen bovengrenzen (voorspellingen
 * maximaal 10, ranglijst maximaal 50, per lid maximaal 200). Een frontend die
 * de naam verkeerd spelt krijgt geen fout maar de serverstandaard, en dus
 * stilzwijgend een andere periode dan de gebruiker koos. Daarom wordt hier op
 * de namen `months` en `limit` getoetst, en niet alleen op "er staat iets in
 * de queryreeks".
 *
 * De orkestfilter. `orchestraId` mag alleen mee als hij gekozen is. Ging hij
 * als lege tekst mee, dan filterde de server op een leeg orkest-id en kwamen
 * er nul repetities terug - een lege grafiek zonder enige melding.
 *
 * De paden zijn vergeleken met backend/src/routes/analytics.ts.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { startNepserver, stopNepserver, antwoordMet, antwoordMetFout, laatsteVerzoek } from './nepserver';
import { serverroutes, serverBiedtAan } from './serverroutes';
import {
  getRehearsalAttendanceOverview,
  getRehearsalAttendanceTrends,
  getRehearsalAttendanceBySection,
  getRehearsalAttendanceByMember,
  getRehearsalAtRiskMembers,
  getRehearsalAttendancePredictions,
  getRehearsalAttendanceByDayOfWeek,
  getRehearsalAttendanceLeaderboard,
} from '../attendance-analytics';

beforeEach(() => startNepserver());
afterEach(() => stopNepserver());

describe('overzicht', () => {
  it('haalt het overzicht op onder /analytics/attendance, niet onder /attendance', async () => {
    antwoordMet({ avgAttendanceRate: 82.4, totalMembers: 41, totalRehearsals: 18, trend: -1.2 });

    const overzicht = await getRehearsalAttendanceOverview();

    expect(laatsteVerzoek().methode).toBe('get');
    expect(laatsteVerzoek().pad).toBe('/analytics/attendance/overview');
    expect(laatsteVerzoek().queryreeks).toBe('');
    expect(overzicht.avgAttendanceRate).toBe(82.4);
    // Een negatieve trend is een geldige uitkomst en mag niet als "leeg"
    // wegvallen: hij betekent dat de opkomst daalt, en dat is juist het cijfer
    // waar het scherm voor bestaat.
    expect(overzicht.trend).toBe(-1.2);
  });

  it('stuurt orchestraId alleen mee als er een orkest gekozen is', async () => {
    antwoordMet({});
    await getRehearsalAttendanceOverview('ork-3');
    expect(laatsteVerzoek().query.get('orchestraId')).toBe('ork-3');

    antwoordMet({});
    await getRehearsalAttendanceOverview();
    expect(laatsteVerzoek().query.has('orchestraId')).toBe(false);
  });

  it('stuurt een lege orkestkeuze niet als lege waarde mee', async () => {
    // Het scherm geeft bij "alle orkesten" een lege tekst door. Zou die als
    // `orchestraId=` in de queryreeks belanden, dan filtert de server erop en
    // is elke grafiek leeg.
    antwoordMet({});

    await getRehearsalAttendanceOverview('');

    expect(laatsteVerzoek().queryreeks).toBe('');
  });
});

describe('reeksen over de tijd', () => {
  it('stuurt het aantal maanden mee onder de naam months', async () => {
    antwoordMet([]);

    await getRehearsalAttendanceTrends(6, 'ork-1');

    expect(laatsteVerzoek().pad).toBe('/analytics/attendance/trends');
    expect(laatsteVerzoek().query.get('months')).toBe('6');
    expect(laatsteVerzoek().query.get('orchestraId')).toBe('ork-1');
  });

  it('stuurt de standaard van twaalf maanden expliciet mee', async () => {
    // De server heeft zelf ook twaalf als standaard, maar die twee mogen niet
    // stilzwijgend uit elkaar lopen: als de frontend hier ooit iets anders
    // toont dan hij vraagt, is dat aan de queryreeks te zien en nergens anders.
    antwoordMet([]);

    await getRehearsalAttendanceTrends();

    expect(laatsteVerzoek().query.get('months')).toBe('12');
  });

  it('geeft de maandreeks door met de velden die de grafiek uitleest', async () => {
    antwoordMet([{ month: '2026-07', attendanceRate: 78.5, uniqueAttendees: 32, totalRehearsals: 4 }]);

    const reeks = await getRehearsalAttendanceTrends();

    expect(reeks[0].month).toBe('2026-07');
    expect(reeks[0].attendanceRate).toBe(78.5);
  });

  it('haalt de verdeling over de dagen van de week op', async () => {
    antwoordMet([{ dayOfWeek: 2, rehearsalCount: 14, attendanceRate: 81 }]);

    const dagen = await getRehearsalAttendanceByDayOfWeek('ork-1');

    expect(laatsteVerzoek().pad).toBe('/analytics/attendance/by-day-of-week');
    expect(dagen[0].dayOfWeek).toBe(2);
  });
});

describe('per sectie en per lid', () => {
  it('haalt de sectiecijfers op met streepje in het pad', async () => {
    antwoordMet([{ instrumentId: 'i1', instrument: 'Klarinet', attendanceRate: 74, memberCount: 8 }]);

    const secties = await getRehearsalAttendanceBySection();

    // /by-section met streepje; een /bySection zou geen route raken.
    expect(laatsteVerzoek().pad).toBe('/analytics/attendance/by-section');
    expect(secties[0].instrument).toBe('Klarinet');
  });

  it('stuurt limiet en sorteervolgorde mee onder limit en sortBy', async () => {
    antwoordMet([]);

    await getRehearsalAttendanceByMember({ limit: 25, sortBy: 'rate_asc', orchestraId: 'ork-2' });

    expect(laatsteVerzoek().pad).toBe('/analytics/attendance/by-member');
    expect(laatsteVerzoek().query.get('limit')).toBe('25');
    // De server vergelijkt letterlijk met 'rate_asc' en 'name'; alles anders
    // valt terug op aflopend. Een sortBy=asc zou dus omgekeerd sorteren zonder
    // dat er iets misgaat.
    expect(laatsteVerzoek().query.get('sortBy')).toBe('rate_asc');
    expect(laatsteVerzoek().query.get('orchestraId')).toBe('ork-2');
  });

  it('stuurt zonder opties een kale queryreeks, zodat de server zijn eigen standaard kiest', async () => {
    antwoordMet([]);

    await getRehearsalAttendanceByMember();

    expect(laatsteVerzoek().queryreeks).toBe('');
  });

  it('haalt de leden op die dreigen af te haken', async () => {
    antwoordMet([{ id: 'g1', firstName: 'Anna', lastName: 'de Groot', recentRate: 40, previousRate: 90, trend: -50 }]);

    const risico = await getRehearsalAtRiskMembers();

    expect(laatsteVerzoek().pad).toBe('/analytics/attendance/at-risk');
    expect(risico[0].trend).toBe(-50);
  });
});

describe('voorspellingen en ranglijst', () => {
  it('vraagt standaard vijf voorspellingen', async () => {
    antwoordMet([]);

    await getRehearsalAttendancePredictions();

    expect(laatsteVerzoek().pad).toBe('/analytics/attendance/predictions');
    expect(laatsteVerzoek().query.get('limit')).toBe('5');
  });

  it('geeft de onderbezette secties per voorspelling door', async () => {
    antwoordMet([
      {
        rehearsalId: 'r1',
        date: '2026-09-02',
        predictedCount: 28,
        predictedRate: 68,
        dayOfWeek: 3,
        understaffedSections: [{ instrument: 'Hoorn', expected: 1, needed: 3 }],
      },
    ]);

    const voorspellingen = await getRehearsalAttendancePredictions(3);

    expect(laatsteVerzoek().query.get('limit')).toBe('3');
    // Dit geneste lijstje is de hele reden dat het scherm bestaat: het zegt
    // welke sectie er komende repetitie te dun bezet is.
    expect(voorspellingen[0].understaffedSections[0].instrument).toBe('Hoorn');
  });

  it('vraagt standaard tien namen voor de ranglijst', async () => {
    antwoordMet([]);

    await getRehearsalAttendanceLeaderboard();

    expect(laatsteVerzoek().pad).toBe('/analytics/attendance/leaderboard');
    expect(laatsteVerzoek().query.get('limit')).toBe('10');
  });

  it('geeft de rangnummers door zoals de server ze bepaalt', async () => {
    // Het rangnummer wordt aan de serverkant toegekend. Zou de frontend het
    // zelf uit de volgorde afleiden, dan klopte het niet meer zodra twee leden
    // hetzelfde percentage hebben.
    antwoordMet([
      { rank: 1, id: 'g1', firstName: 'Anna', lastName: 'de Groot', attendanceRate: 100, presentCount: 18 },
      { rank: 2, id: 'g2', firstName: 'Bram', lastName: 'Jansen', attendanceRate: 100, presentCount: 17 },
    ]);

    const ranglijst = await getRehearsalAttendanceLeaderboard(2);

    expect(ranglijst.map((l) => l.rank)).toEqual([1, 2]);
  });
});

describe('de orkestfilter bereikt elke grafiek', () => {
  // Het scherm heeft één orkestkeuze boven alle grafieken. Zou die filter bij
  // één functie niet meegestuurd worden, dan toont die ene grafiek de cijfers
  // van de hele vereniging terwijl de rest over het gekozen orkest gaat. Dat
  // valt niet op als een fout: de getallen zijn echt, ze horen alleen bij een
  // andere groep. Daarom staan ze hier alle acht bij elkaar.
  const metOrkest: [string, (ork: string) => Promise<unknown>][] = [
    ['overview', (ork) => getRehearsalAttendanceOverview(ork)],
    ['trends', (ork) => getRehearsalAttendanceTrends(12, ork)],
    ['by-section', (ork) => getRehearsalAttendanceBySection(ork)],
    ['by-member', (ork) => getRehearsalAttendanceByMember({ orchestraId: ork })],
    ['at-risk', (ork) => getRehearsalAtRiskMembers(ork)],
    ['predictions', (ork) => getRehearsalAttendancePredictions(5, ork)],
    ['by-day-of-week', (ork) => getRehearsalAttendanceByDayOfWeek(ork)],
    ['leaderboard', (ork) => getRehearsalAttendanceLeaderboard(10, ork)],
  ];

  it.each(metOrkest)('%s stuurt orchestraId mee', async (_naam, aanroep) => {
    antwoordMet([]);

    await aanroep('ork-5');

    expect(laatsteVerzoek().query.get('orchestraId')).toBe('ork-5');
  });

  it.each(metOrkest)('%s laat orchestraId weg bij een lege keuze', async (_naam, aanroep) => {
    antwoordMet([]);

    await aanroep('');

    expect(laatsteVerzoek().query.has('orchestraId')).toBe(false);
  });
});

describe('foutafhandeling', () => {
  it('laat een 403 door als de module opkomst uitstaat', async () => {
    // In index.ts hangt requireModule('attendance') voor deze router. Staat de
    // module uit, dan komt er een 403; die moet zichtbaar blijven en niet als
    // lege grafiek eindigen.
    antwoordMetFout(403, { error: 'Module staat uit.' });

    await expect(getRehearsalAttendanceOverview()).rejects.toMatchObject({ response: { status: 403 } });
  });

  it('laat een 500 door in plaats van hem als lege lijst te verpakken', async () => {
    antwoordMetFout(500, { error: 'Server error' });

    await expect(getRehearsalAttendanceTrends()).rejects.toMatchObject({ response: { status: 500 } });
  });
});

describe('de paden komen overeen met wat de server aanbiedt', () => {
  const routes = serverroutes('analytics.ts');

  const aanroepen: [string, () => Promise<unknown>][] = [
    ['getRehearsalAttendanceOverview', () => getRehearsalAttendanceOverview()],
    ['getRehearsalAttendanceTrends', () => getRehearsalAttendanceTrends()],
    ['getRehearsalAttendanceBySection', () => getRehearsalAttendanceBySection()],
    ['getRehearsalAttendanceByMember', () => getRehearsalAttendanceByMember()],
    ['getRehearsalAtRiskMembers', () => getRehearsalAtRiskMembers()],
    ['getRehearsalAttendancePredictions', () => getRehearsalAttendancePredictions()],
    ['getRehearsalAttendanceByDayOfWeek', () => getRehearsalAttendanceByDayOfWeek()],
    ['getRehearsalAttendanceLeaderboard', () => getRehearsalAttendanceLeaderboard()],
  ];

  it.each(aanroepen)('%s raakt een bestaande route in backend/src/routes/analytics.ts', async (_naam, aanroep) => {
    antwoordMet([]);
    await aanroep().catch(() => undefined);
    const { methode, pad } = laatsteVerzoek();

    expect(serverBiedtAan(routes, '/analytics', methode, pad)).toBe(true);
  });
});
