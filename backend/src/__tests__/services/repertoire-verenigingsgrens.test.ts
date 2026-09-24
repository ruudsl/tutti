/**
 * De lijst met meest gespeelde stukken koppelt een concertprogramma op naam aan
 * de titellijst. Die koppeling keek niet naar de vereniging: stond er bij een
 * andere vereniging een titel met dezelfde naam, dan kwamen diens componist,
 * arrangeur en genres in onze statistiek terecht - en kreeg het stuk diens id.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import testDb from '../testDb';
import { createTestAssociation, createTestEnvironment, TestAssociation } from '../testUtils';
import { getMostPlayedPieces } from '../../services/repertoireStats';

describe('meest gespeelde stukken blijven binnen de vereniging', () => {
  let vereniging: TestAssociation;
  let andere: TestAssociation;

  beforeEach(() => {
    vereniging = createTestEnvironment().association;
    andere = createTestAssociation({ name: 'Andere vereniging' });
  });

  function maakTitel(associationId: string, titel: string, componist: string, arrangeur: string): string {
    const id = uuidv4();
    testDb
      .prepare('INSERT INTO music_titles (id, title, composer, arranger, association_id) VALUES (?, ?, ?, ?, ?)')
      .run(id, titel, componist, arrangeur, associationId);
    return id;
  }

  function speelOpConcert(associationId: string, titel: string, titelId: string | null): void {
    const concert = uuidv4();
    testDb
      .prepare('INSERT INTO concerts (id, association_id, name, date, location) VALUES (?, ?, ?, ?, ?)')
      .run(concert, associationId, 'Voorjaarsconcert', '2026-04-01', 'De Zalen');
    testDb
      .prepare(
        'INSERT INTO concert_program (id, concert_id, music_title_id, title, composer, sort_order) VALUES (?, ?, ?, ?, ?, 1)',
      )
      .run(uuidv4(), concert, titelId, titel, null);
  }

  it('neemt geen componist of id over van een gelijknamige titel elders', () => {
    const hunTitel = maakTitel(andere.id, 'Geheime suite', 'Componist van elders', 'Arrangeur van elders');
    const genre = uuidv4();
    testDb.prepare('INSERT INTO genres (id, name) VALUES (?, ?)').run(genre, 'Genre van elders');
    testDb.prepare('INSERT INTO music_title_genres (music_title_id, genre_id) VALUES (?, ?)').run(hunTitel, genre);

    // Bij ons staat het stuk alleen op naam op het programma.
    speelOpConcert(vereniging.id, 'Geheime suite', null);

    const stukken = getMostPlayedPieces(vereniging.id);

    expect(stukken).toHaveLength(1);
    expect(stukken[0].title).toBe('Geheime suite');
    expect(stukken[0].id).not.toBe(hunTitel);
    expect(stukken[0].composer ?? null).toBeNull();
    expect(stukken[0].arranger ?? null).toBeNull();
    expect(stukken[0].genres).toEqual([]);
  });

  it('koppelt op naam nog wel aan een eigen titel', () => {
    const eigen = maakTitel(vereniging.id, 'Eigen suite', 'Eigen componist', 'Eigen arrangeur');
    maakTitel(andere.id, 'Eigen suite', 'Componist van elders', 'Arrangeur van elders');
    speelOpConcert(vereniging.id, 'Eigen suite', null);

    const stukken = getMostPlayedPieces(vereniging.id);

    expect(stukken).toHaveLength(1);
    expect(stukken[0]).toMatchObject({ id: eigen, composer: 'Eigen componist', performanceCount: 1 });
  });

  it('haalt geen gegevens op van een titel elders waar het programma naar verwijst', () => {
    // concert_program.music_title_id wordt niet door deze statistiek
    // gecontroleerd; wijst het naar een titel van een andere vereniging, dan
    // hoort diens componist hier niet te verschijnen.
    const hunTitel = maakTitel(andere.id, 'Andere naam', 'Componist van elders', 'Arrangeur van elders');
    speelOpConcert(vereniging.id, 'Onze naam', hunTitel);

    const stukken = getMostPlayedPieces(vereniging.id);

    expect(stukken).toHaveLength(1);
    expect(stukken[0].composer ?? null).toBeNull();
  });
});
