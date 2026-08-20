/**
 * Opkomstcijfers: hoeveel leden komen er, wie valt op, en hoe verhoudt de
 * ene periode zich tot de andere.
 *
 * De aanwezigheid komt uit rehearsal_attendance, waar een rij een user_id kan
 * hebben maar ook alleen een naam (leden die via Spond binnenkomen en nog niet
 * gekoppeld zijn). Beide wegen horen mee te tellen, en dat is waar deze tests
 * op letten.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import testDb from '../testDb';
import {
  createTestAssociation,
  createTestEnvironment,
  createTestOrchestra,
  TestAssociation,
  TestUser,
} from '../testUtils';
import {
  getAttendanceOverview,
  getMemberAttendance,
  getOrchestraAttendance,
  exportAttendanceToCSV,
  comparePeriods,
} from '../../services/attendanceAnalytics';

function datumGeleden(dagen: number): string {
  const d = new Date();
  d.setDate(d.getDate() - dagen);
  return d.toISOString().split('T')[0];
}

describe('attendanceAnalytics', () => {
  let vereniging: TestAssociation;
  let orkestId: string;
  let lid: TestUser;

  function maakRepetitie(datum: string, opties: { orchestraId?: string | null; type?: string } = {}): string {
    const id = uuidv4();
    testDb
      .prepare(
        `INSERT INTO rehearsals (id, association_id, orchestra_id, date, start_time, end_time, location, type)
         VALUES (?, ?, ?, ?, '20:00', '22:00', 'Muziekgebouw', ?)`,
      )
      .run(
        id,
        vereniging.id,
        opties.orchestraId === undefined ? orkestId : opties.orchestraId,
        datum,
        opties.type ?? 'regular',
      );
    return id;
  }

  function noteerAanwezigheid(
    rehearsalId: string,
    naam: string,
    status: 'accepted' | 'declined' | 'waiting' | 'unknown',
    userId: string | null = null,
  ): void {
    testDb
      .prepare(
        'INSERT INTO rehearsal_attendance (id, rehearsal_id, user_id, member_name, status) VALUES (?, ?, ?, ?, ?)',
      )
      .run(uuidv4(), rehearsalId, userId, naam, status);
  }

  function maakConcert(datum: string): string {
    const id = uuidv4();
    testDb
      .prepare("INSERT INTO concerts (id, association_id, name, date, location) VALUES (?, ?, 'Concert', ?, 'Zaal')")
      .run(id, vereniging.id, datum);
    return id;
  }

  beforeEach(() => {
    const omgeving = createTestEnvironment();
    vereniging = omgeving.association;
    lid = omgeving.memberUser;
    orkestId = createTestOrchestra(vereniging.id).id;
  });

  describe('getAttendanceOverview', () => {
    it('geeft nullen terug zonder repetities', () => {
      const overzicht = getAttendanceOverview(vereniging.id);
      expect(overzicht.totalRehearsals).toBe(0);
      expect(overzicht.overallAttendanceRate).toBe(0);
      expect(overzicht.trend).toBe('stable');
    });

    it('telt de repetities in de periode', () => {
      maakRepetitie(datumGeleden(10));
      maakRepetitie(datumGeleden(20));
      expect(getAttendanceOverview(vereniging.id).totalRehearsals).toBe(2);
    });

    it('laat afgelaste repetities buiten beschouwing', () => {
      maakRepetitie(datumGeleden(10));
      maakRepetitie(datumGeleden(11), { type: 'cancelled' });
      expect(getAttendanceOverview(vereniging.id).totalRehearsals).toBe(1);
    });

    it('rekent het opkomstpercentage uit', () => {
      const repetitie = maakRepetitie(datumGeleden(10));
      noteerAanwezigheid(repetitie, 'Aanwezig', 'accepted');
      noteerAanwezigheid(repetitie, 'Afwezig', 'declined');
      expect(getAttendanceOverview(vereniging.id).overallAttendanceRate).toBe(50);
    });

    it('telt de concerten in de periode', () => {
      maakConcert(datumGeleden(10));
      expect(getAttendanceOverview(vereniging.id).totalConcerts).toBe(1);
    });

    it('blijft binnen het gevraagde bereik', () => {
      maakRepetitie(datumGeleden(5));
      maakRepetitie(datumGeleden(300));
      const overzicht = getAttendanceOverview(vereniging.id, undefined, {
        startDate: datumGeleden(30),
        endDate: datumGeleden(0),
      });
      expect(overzicht.totalRehearsals).toBe(1);
    });

    it('vergelijkt met de vorige periode', () => {
      const overzicht = getAttendanceOverview(vereniging.id, undefined, {
        startDate: datumGeleden(30),
        endDate: datumGeleden(0),
      });
      expect(overzicht.periodComparison.currentPeriod.startDate).toBe(datumGeleden(30));
      expect(new Date(overzicht.periodComparison.previousPeriod.endDate).getTime()).toBeLessThan(
        new Date(overzicht.periodComparison.currentPeriod.startDate).getTime(),
      );
    });

    it('blijft van de cijfers van een andere vereniging af', () => {
      const andere = createTestAssociation();
      testDb
        .prepare(
          `INSERT INTO rehearsals (id, association_id, date, start_time, end_time, type)
           VALUES (?, ?, ?, '20:00', '22:00', 'regular')`,
        )
        .run(uuidv4(), andere.id, datumGeleden(10));
      expect(getAttendanceOverview(vereniging.id).totalRehearsals).toBe(0);
    });

    it('kan op orkest filteren', () => {
      const anderOrkest = createTestOrchestra(vereniging.id, { name: 'Opleidingsorkest' });
      maakRepetitie(datumGeleden(10));
      maakRepetitie(datumGeleden(11), { orchestraId: anderOrkest.id });

      expect(getAttendanceOverview(vereniging.id, orkestId).totalRehearsals).toBe(1);
    });
  });

  describe('getMemberAttendance', () => {
    it('telt per lid de aanwezigheid en afmeldingen', () => {
      const eerste = maakRepetitie(datumGeleden(20));
      const tweede = maakRepetitie(datumGeleden(10));
      noteerAanwezigheid(eerste, 'Jan Jansen', 'accepted', lid.id);
      noteerAanwezigheid(tweede, 'Jan Jansen', 'declined', lid.id);

      const leden = getMemberAttendance(vereniging.id);
      expect(leden).toHaveLength(1);
      expect(leden[0]).toMatchObject({ memberName: 'Jan Jansen', totalEvents: 2, attended: 1, declined: 1 });
    });

    it('telt ook leden mee die alleen een naam hebben', () => {
      // Spond levert aanwezigheid soms zonder gekoppeld account.
      const repetitie = maakRepetitie(datumGeleden(10));
      noteerAanwezigheid(repetitie, 'Ongekoppeld Lid', 'accepted', null);

      expect(getMemberAttendance(vereniging.id).map((m) => m.memberName)).toContain('Ongekoppeld Lid');
    });

    it('houdt twee leden uit elkaar', () => {
      const repetitie = maakRepetitie(datumGeleden(10));
      noteerAanwezigheid(repetitie, 'Jan', 'accepted');
      noteerAanwezigheid(repetitie, 'Piet', 'declined');

      expect(getMemberAttendance(vereniging.id)).toHaveLength(2);
    });

    it('zet het meest aanwezige lid bovenaan', () => {
      const eerste = maakRepetitie(datumGeleden(20));
      const tweede = maakRepetitie(datumGeleden(10));
      noteerAanwezigheid(eerste, 'Trouw', 'accepted');
      noteerAanwezigheid(tweede, 'Trouw', 'accepted');
      noteerAanwezigheid(tweede, 'Soms', 'accepted');

      expect(getMemberAttendance(vereniging.id)[0].memberName).toBe('Trouw');
    });

    it('geeft een lege lijst zonder aanwezigheidsgegevens', () => {
      maakRepetitie(datumGeleden(10));
      expect(getMemberAttendance(vereniging.id)).toEqual([]);
    });

    it('rekent een opkomstpercentage per lid uit', () => {
      const eerste = maakRepetitie(datumGeleden(20));
      const tweede = maakRepetitie(datumGeleden(10));
      noteerAanwezigheid(eerste, 'Jan', 'accepted');
      noteerAanwezigheid(tweede, 'Jan', 'declined');

      expect(getMemberAttendance(vereniging.id)[0].attendanceRate).toBe(50);
    });
  });

  describe('getOrchestraAttendance', () => {
    it('geeft per orkest een regel', () => {
      const repetitie = maakRepetitie(datumGeleden(10));
      noteerAanwezigheid(repetitie, 'Jan', 'accepted');

      const orkesten = getOrchestraAttendance(vereniging.id);
      expect(orkesten.length).toBeGreaterThan(0);
      expect(orkesten[0]).toHaveProperty('orchestraName');
    });

    it('noemt een orkest zonder repetities met nul in plaats van het weg te laten', () => {
      const orkesten = getOrchestraAttendance(vereniging.id);
      expect(orkesten).toHaveLength(1);
      expect(orkesten[0]).toMatchObject({ totalEvents: 0, averageAttendanceRate: 0, trend: 'stable' });
    });

    it('telt de repetities van het orkest', () => {
      maakRepetitie(datumGeleden(10));
      maakRepetitie(datumGeleden(20));
      expect(getOrchestraAttendance(vereniging.id)[0].totalEvents).toBe(2);
    });
  });

  describe('exportAttendanceToCSV', () => {
    it('zet elk lid op een eigen regel', () => {
      const repetitie = maakRepetitie(datumGeleden(10));
      noteerAanwezigheid(repetitie, 'Jan Jansen', 'accepted');
      noteerAanwezigheid(repetitie, 'Piet Pieters', 'declined');

      const csv = exportAttendanceToCSV(vereniging.id);
      expect(csv).toContain('Jan Jansen');
      expect(csv).toContain('Piet Pieters');
    });

    it('noemt de datum van de repetitie', () => {
      const datum = datumGeleden(10);
      const repetitie = maakRepetitie(datum);
      noteerAanwezigheid(repetitie, 'Jan', 'accepted');

      expect(exportAttendanceToCSV(vereniging.id)).toContain(datum);
    });

    it('levert ook zonder gegevens iets bruikbaars op', () => {
      const csv = exportAttendanceToCSV(vereniging.id);
      expect(typeof csv).toBe('string');
    });
  });

  describe('comparePeriods', () => {
    it('vergelijkt twee perioden en noemt het verschil', () => {
      const resultaat = comparePeriods(vereniging.id, 'month');
      expect(resultaat).toHaveProperty('currentPeriod');
      expect(resultaat).toHaveProperty('previousPeriod');
      expect(resultaat).toHaveProperty('change');
      expect(['improving', 'declining', 'stable']).toContain(resultaat.trend);
    });

    it('werkt voor elke periodesoort', () => {
      for (const periode of ['week', 'month', 'quarter', 'year'] as const) {
        expect(() => comparePeriods(vereniging.id, periode)).not.toThrow();
      }
    });

    it('legt de vorige periode vóór de huidige', () => {
      const resultaat = comparePeriods(vereniging.id, 'month');
      expect(new Date(resultaat.previousPeriod.startDate).getTime()).toBeLessThan(
        new Date(resultaat.currentPeriod.startDate).getTime(),
      );
    });
  });
});
