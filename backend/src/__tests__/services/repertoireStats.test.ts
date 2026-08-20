/**
 * Statistieken over het repertoire: hoe vaak een stuk is gespeeld, wat er
 * lang blijft liggen, en de verdeling over genres en componisten.
 *
 * De koppeling tussen wat er gespeeld is en de titellijst loopt op twee
 * manieren: een concertprogramma verwijst met music_title_id óf op naam, en
 * een repetitie kent alleen een titel als tekst. Die twee wegen door elkaar
 * zijn precies waar het mis kan gaan, dus daar zitten de tests op.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import testDb from '../testDb';
import { createTestAssociation, createTestEnvironment, createTestOrchestra, TestAssociation } from '../testUtils';
import {
  getRepertoireOverview,
  getMostPlayedPieces,
  getNotPlayedPieces,
  getStatsByGenre,
  getStatsByComposer,
  getPerformanceTimeline,
  updateTitlePerformanceStats,
} from '../../services/repertoireStats';

function datumGeleden(dagen: number): string {
  const d = new Date();
  d.setDate(d.getDate() - dagen);
  return d.toISOString().split('T')[0];
}

describe('repertoireStats', () => {
  let vereniging: TestAssociation;
  let orkestId: string;

  function maakTitel(titel: string, componist: string | null = 'Sousa'): string {
    const id = uuidv4();
    testDb
      .prepare('INSERT INTO music_titles (id, title, composer, arranger, association_id) VALUES (?, ?, ?, ?, ?)')
      .run(id, titel, componist, 'Reed', vereniging.id);
    return id;
  }

  function maakConcert(datum: string, naam = 'Concert'): string {
    const id = uuidv4();
    testDb
      .prepare('INSERT INTO concerts (id, association_id, name, date, location) VALUES (?, ?, ?, ?, ?)')
      .run(id, vereniging.id, naam, datum, 'De Zalen');
    return id;
  }

  function zetOpProgramma(concertId: string, titel: string, titelId: string | null, componist = 'Sousa'): void {
    testDb
      .prepare(
        'INSERT INTO concert_program (id, concert_id, music_title_id, title, composer, sort_order) VALUES (?, ?, ?, ?, ?, 1)',
      )
      .run(uuidv4(), concertId, titelId, titel, componist);
  }

  function maakRepetitie(datum: string): string {
    const id = uuidv4();
    testDb
      .prepare(
        `INSERT INTO rehearsals (id, association_id, orchestra_id, date, start_time, end_time)
         VALUES (?, ?, ?, ?, '20:00', '22:00')`,
      )
      .run(id, vereniging.id, orkestId, datum);
    return id;
  }

  function zetOpRepetitie(rehearsalId: string, titel: string): void {
    testDb
      .prepare('INSERT INTO rehearsal_pieces (id, rehearsal_id, title, sort_order) VALUES (?, ?, ?, 1)')
      .run(uuidv4(), rehearsalId, titel);
  }

  function maakGenre(naam: string, titelId: string): string {
    const id = uuidv4();
    testDb.prepare('INSERT INTO genres (id, name) VALUES (?, ?)').run(id, naam);
    testDb.prepare('INSERT INTO music_title_genres (music_title_id, genre_id) VALUES (?, ?)').run(titelId, id);
    return id;
  }

  beforeEach(() => {
    vereniging = createTestEnvironment().association;
    orkestId = createTestOrchestra(vereniging.id).id;
  });

  describe('getRepertoireOverview', () => {
    it('telt de titels van de vereniging', () => {
      maakTitel('Mars');
      maakTitel('Wals');
      expect(getRepertoireOverview(vereniging.id).totalTitles).toBe(2);
    });

    it('telt geen titels van een andere vereniging', () => {
      maakTitel('Mars');
      const andere = createTestAssociation();
      testDb
        .prepare("INSERT INTO music_titles (id, title, association_id) VALUES (?, 'Van de buren', ?)")
        .run(uuidv4(), andere.id);
      expect(getRepertoireOverview(vereniging.id).totalTitles).toBe(1);
    });

    it('geeft nullen terug voor een vereniging zonder repertoire', () => {
      expect(getRepertoireOverview(vereniging.id)).toEqual({
        totalTitles: 0,
        playedThisYear: 0,
        notPlayedOver6Months: 0,
        totalPerformances: 0,
        averagePerformancesPerTitle: 0,
      });
    });

    it('telt uitvoeringen uit concerten en repetities bij elkaar op', () => {
      const titelId = maakTitel('Mars');
      zetOpProgramma(maakConcert(datumGeleden(30)), 'Mars', titelId);
      zetOpRepetitie(maakRepetitie(datumGeleden(20)), 'Mars');
      zetOpRepetitie(maakRepetitie(datumGeleden(10)), 'Mars');

      expect(getRepertoireOverview(vereniging.id).totalPerformances).toBe(3);
    });

    it('rekent het gemiddelde per titel uit', () => {
      const mars = maakTitel('Mars');
      maakTitel('Wals');
      zetOpProgramma(maakConcert(datumGeleden(30)), 'Mars', mars);
      zetOpRepetitie(maakRepetitie(datumGeleden(20)), 'Mars');

      // Twee uitvoeringen verdeeld over twee titels.
      expect(getRepertoireOverview(vereniging.id).averagePerformancesPerTitle).toBe(1);
    });

    it('telt wat er dit jaar is gespeeld', () => {
      const titelId = maakTitel('Mars');
      zetOpProgramma(maakConcert(datumGeleden(30)), 'Mars', titelId);
      zetOpProgramma(maakConcert(datumGeleden(500)), 'Oude Mars', maakTitel('Oude Mars'));

      expect(getRepertoireOverview(vereniging.id).playedThisYear).toBe(1);
    });

    it('telt de titels die een half jaar niet zijn gespeeld', () => {
      const recent = maakTitel('Recent');
      maakTitel('Al lang niet');
      zetOpProgramma(maakConcert(datumGeleden(30)), 'Recent', recent);

      expect(getRepertoireOverview(vereniging.id).notPlayedOver6Months).toBe(1);
    });
  });

  describe('getMostPlayedPieces', () => {
    it('zet het vaakst gespeelde stuk bovenaan', () => {
      const mars = maakTitel('Mars');
      const wals = maakTitel('Wals');
      zetOpProgramma(maakConcert(datumGeleden(60)), 'Mars', mars);
      zetOpProgramma(maakConcert(datumGeleden(30)), 'Mars', mars);
      zetOpProgramma(maakConcert(datumGeleden(20)), 'Wals', wals);

      const lijst = getMostPlayedPieces(vereniging.id);
      expect(lijst[0].title).toBe('Mars');
      expect(lijst[0].performanceCount).toBe(2);
    });

    it('vermeldt wanneer een stuk voor het laatst klonk', () => {
      const mars = maakTitel('Mars');
      zetOpProgramma(maakConcert(datumGeleden(60)), 'Mars', mars);
      const laatste = datumGeleden(30);
      zetOpProgramma(maakConcert(laatste), 'Mars', mars);

      expect(getMostPlayedPieces(vereniging.id)[0].lastPerformed).toBe(laatste);
    });

    it('houdt zich aan het gevraagde aantal', () => {
      for (const naam of ['A', 'B', 'C']) {
        zetOpProgramma(maakConcert(datumGeleden(30)), naam, maakTitel(naam));
      }
      expect(getMostPlayedPieces(vereniging.id, 2)).toHaveLength(2);
    });

    it('geeft de genres van een stuk mee', () => {
      const mars = maakTitel('Mars');
      maakGenre('Marsen', mars);
      zetOpProgramma(maakConcert(datumGeleden(30)), 'Mars', mars);

      expect(getMostPlayedPieces(vereniging.id)[0].genres).toEqual(['Marsen']);
    });

    it('geeft een lege lijst wanneer er niets is gespeeld', () => {
      maakTitel('Nooit gespeeld');
      expect(getMostPlayedPieces(vereniging.id)).toEqual([]);
    });

    it('blijft van het repertoire van een andere vereniging af', () => {
      const andere = createTestAssociation();
      const concertId = uuidv4();
      testDb
        .prepare("INSERT INTO concerts (id, association_id, name, date) VALUES (?, ?, 'Elders', ?)")
        .run(concertId, andere.id, datumGeleden(30));
      testDb
        .prepare("INSERT INTO concert_program (id, concert_id, title, sort_order) VALUES (?, ?, 'Van de buren', 1)")
        .run(uuidv4(), concertId);

      expect(getMostPlayedPieces(vereniging.id)).toEqual([]);
    });
  });

  describe('getNotPlayedPieces', () => {
    it('noemt een titel die nooit is gespeeld', () => {
      maakTitel('Nooit gespeeld');
      const lijst = getNotPlayedPieces(vereniging.id);
      expect(lijst.map((p) => p.title)).toContain('Nooit gespeeld');
      expect(lijst[0].lastPerformed).toBeNull();
    });

    it('laat een recent gespeelde titel weg', () => {
      const mars = maakTitel('Mars');
      zetOpProgramma(maakConcert(datumGeleden(10)), 'Mars', mars);
      expect(getNotPlayedPieces(vereniging.id).map((p) => p.title)).not.toContain('Mars');
    });

    it('neemt een titel weer op zodra de grens ver genoeg terug ligt', () => {
      const mars = maakTitel('Mars');
      zetOpProgramma(maakConcert(datumGeleden(200)), 'Mars', mars);

      expect(getNotPlayedPieces(vereniging.id, 6).map((p) => p.title)).toContain('Mars');
      expect(getNotPlayedPieces(vereniging.id, 12).map((p) => p.title)).not.toContain('Mars');
    });

    it('herkent ook een repetitie als spelen', () => {
      maakTitel('Mars');
      zetOpRepetitie(maakRepetitie(datumGeleden(10)), 'Mars');
      expect(getNotPlayedPieces(vereniging.id).map((p) => p.title)).not.toContain('Mars');
    });
  });

  describe('getStatsByGenre', () => {
    it('telt per genre hoeveel titels er zijn', () => {
      const mars = maakTitel('Mars');
      const andereMars = maakTitel('Nog een mars');
      const genreId = maakGenre('Marsen', mars);
      testDb
        .prepare('INSERT INTO music_title_genres (music_title_id, genre_id) VALUES (?, ?)')
        .run(andereMars, genreId);

      const stats = getStatsByGenre(vereniging.id);
      expect(stats).toHaveLength(1);
      expect(stats[0]).toMatchObject({ genreName: 'Marsen', titleCount: 2 });
    });

    it('telt de uitvoeringen per genre', () => {
      const mars = maakTitel('Mars');
      maakGenre('Marsen', mars);
      zetOpProgramma(maakConcert(datumGeleden(30)), 'Mars', mars);
      zetOpRepetitie(maakRepetitie(datumGeleden(20)), 'Mars');

      expect(getStatsByGenre(vereniging.id)[0].totalPerformances).toBe(2);
    });

    it('geeft een lege lijst zonder genres', () => {
      maakTitel('Zonder genre');
      expect(getStatsByGenre(vereniging.id)).toEqual([]);
    });
  });

  describe('getStatsByComposer', () => {
    it('groepeert titels per componist', () => {
      maakTitel('Mars', 'Sousa');
      maakTitel('Wals', 'Sousa');
      maakTitel('Ouverture', 'Reed');

      const stats = getStatsByComposer(vereniging.id);
      const sousa = stats.find((s) => s.composer === 'Sousa');
      expect(sousa?.titleCount).toBe(2);
      expect(stats.find((s) => s.composer === 'Reed')?.titleCount).toBe(1);
    });

    it('slaat titels zonder componist over', () => {
      maakTitel('Naamloos', null);
      maakTitel('Leeg', '');
      expect(getStatsByComposer(vereniging.id)).toEqual([]);
    });

    it('noemt wanneer een componist voor het laatst klonk', () => {
      const mars = maakTitel('Mars', 'Sousa');
      const laatste = datumGeleden(30);
      zetOpProgramma(maakConcert(laatste), 'Mars', mars);

      expect(getStatsByComposer(vereniging.id)[0].lastPerformed).toBe(laatste);
    });

    it('houdt zich aan het gevraagde aantal', () => {
      for (const componist of ['A', 'B', 'C']) {
        maakTitel(`Stuk van ${componist}`, componist);
      }
      expect(getStatsByComposer(vereniging.id, 2)).toHaveLength(2);
    });
  });

  describe('getPerformanceTimeline', () => {
    it('zet concerten en repetities in één overzicht, nieuwste eerst', () => {
      zetOpProgramma(maakConcert(datumGeleden(60), 'Winterconcert'), 'Mars', maakTitel('Mars'));
      zetOpRepetitie(maakRepetitie(datumGeleden(20)), 'Wals');

      const tijdlijn = getPerformanceTimeline(vereniging.id);
      expect(tijdlijn).toHaveLength(2);
      expect(tijdlijn[0].eventType).toBe('rehearsal');
      expect(tijdlijn[1]).toMatchObject({ eventType: 'concert', eventName: 'Winterconcert', title: 'Mars' });
    });

    it('blijft binnen het gevraagde bereik', () => {
      zetOpProgramma(maakConcert(datumGeleden(400)), 'Oud', maakTitel('Oud'));
      zetOpProgramma(maakConcert(datumGeleden(10)), 'Recent', maakTitel('Recent'));

      const tijdlijn = getPerformanceTimeline(vereniging.id, datumGeleden(30), datumGeleden(0));
      expect(tijdlijn.map((e) => e.title)).toEqual(['Recent']);
    });

    it('houdt zich aan het gevraagde aantal', () => {
      for (let i = 1; i <= 4; i++) {
        zetOpProgramma(maakConcert(datumGeleden(i * 10)), `Stuk ${i}`, maakTitel(`Stuk ${i}`));
      }
      expect(getPerformanceTimeline(vereniging.id, undefined, undefined, undefined, 2)).toHaveLength(2);
    });
  });

  describe('updateTitlePerformanceStats', () => {
    it('schrijft het aantal uitvoeringen en de laatste datum weg', () => {
      const mars = maakTitel('Mars');
      zetOpProgramma(maakConcert(datumGeleden(60)), 'Mars', mars);
      const laatste = datumGeleden(30);
      zetOpProgramma(maakConcert(laatste), 'Mars', mars);

      updateTitlePerformanceStats(mars);

      const rij = testDb
        .prepare('SELECT performance_count, last_performed FROM music_titles WHERE id = ?')
        .get(mars) as { performance_count: number; last_performed: string };
      expect(rij).toEqual({ performance_count: 2, last_performed: laatste });
    });

    it('zet een nooit gespeelde titel op nul', () => {
      const titelId = maakTitel('Nooit');
      updateTitlePerformanceStats(titelId);

      const rij = testDb
        .prepare('SELECT performance_count, last_performed FROM music_titles WHERE id = ?')
        .get(titelId) as { performance_count: number; last_performed: string | null };
      expect(rij).toEqual({ performance_count: 0, last_performed: null });
    });

    it('gaat niet stuk op een titel die niet bestaat', () => {
      expect(() => updateTitlePerformanceStats(uuidv4())).not.toThrow();
    });
  });
});
