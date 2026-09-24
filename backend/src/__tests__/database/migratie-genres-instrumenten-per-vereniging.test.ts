/**
 * Migratie 20260924200000: genres en instrumenten per vereniging.
 *
 * De migratie bouwt genres en instruments opnieuw op. Twaalf tabellen
 * verwijzen naar instruments, veelal met ON DELETE CASCADE. Met de foreign
 * keys aan zou het weggooien van de oude tabel die rijen meenemen: de
 * instrumenten van leden, de koppeling van titels aan genres. Daarom draait
 * hij via voerUit met zonderForeignKeys, zoals de runner dat doet. Deze test
 * zet er eerst gegevens in; tegen een lege database valt zoiets niet op.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import * as migratie from '../../migrations/20260924200000_genres_en_instrumenten_per_vereniging';
import { voerUit, type Migration } from '../../migrations/runner';
import { createTestEnvironment, createTestAssociation, TestAssociation, TestUser } from '../testUtils';

const alsMigratie: Migration = {
  version: '20260924200000',
  name: 'genres_en_instrumenten_per_vereniging',
  up: migratie.up,
  down: migratie.down,
  zonderForeignKeys: migratie.zonderForeignKeys,
};

const omhoog = () => voerUit(alsMigratie, migratie.up);
const omlaag = () => voerUit(alsMigratie, migratie.down);

let vereniging: TestAssociation;
let lid: TestUser;
let trompet: string;
let mars: string;
let titel: string;

const kolommen = (tabel: string) =>
  (db.prepare(`PRAGMA table_info(${tabel})`).all() as { name: string }[]).map((k) => k.name);

beforeEach(() => {
  const omgeving = createTestEnvironment();
  vereniging = omgeving.association;
  lid = omgeving.memberUser;
  trompet = uuidv4();
  mars = uuidv4();
  titel = uuidv4();
  db.prepare("INSERT INTO instruments (id, name, tuning) VALUES (?, 'Trompet-test', 'Bb')").run(trompet);
  db.prepare('INSERT INTO user_instruments (user_id, instrument_id) VALUES (?, ?)').run(lid.id, trompet);
  db.prepare("INSERT INTO instrument_aliases (id, instrument_id, alias) VALUES (?, ?, 'trp-test')").run(
    uuidv4(),
    trompet,
  );
  db.prepare("INSERT INTO genres (id, name) VALUES (?, 'Mars-test')").run(mars);
  db.prepare("INSERT INTO music_titles (id, title, association_id) VALUES (?, 'Florentiner', ?)").run(
    titel,
    vereniging.id,
  );
  db.prepare('INSERT INTO music_title_genres (music_title_id, genre_id) VALUES (?, ?)').run(titel, mars);
});

describe('migratie genres en instrumenten per vereniging', () => {
  it('bewaart bij de herbouw alles wat naar een instrument of genre verwijst', () => {
    omlaag();
    expect(kolommen('instruments')).not.toContain('association_id');

    omhoog();

    expect(kolommen('instruments')).toContain('association_id');
    expect(kolommen('genres')).toContain('association_id');
    expect(db.prepare('SELECT association_id FROM instruments WHERE id = ?').get(trompet)).toEqual({
      association_id: null,
    });
    expect(db.prepare('SELECT COUNT(*) AS n FROM user_instruments WHERE instrument_id = ?').get(trompet)).toEqual({
      n: 1,
    });
    expect(db.prepare('SELECT COUNT(*) AS n FROM instrument_aliases WHERE instrument_id = ?').get(trompet)).toEqual({
      n: 1,
    });
    expect(db.prepare('SELECT COUNT(*) AS n FROM music_title_genres WHERE genre_id = ?').get(mars)).toEqual({ n: 1 });
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });

  it('laat twee verenigingen elk een eigen genre met dezelfde naam hebben, maar niet twee keer binnen één', () => {
    const andere = createTestAssociation({ name: 'Andere vereniging' });
    const voeg = (associationId: string | null) =>
      db
        .prepare("INSERT INTO genres (id, name, association_id) VALUES (?, 'Pop-rock', ?)")
        .run(uuidv4(), associationId);

    voeg(vereniging.id);
    voeg(andere.id);
    voeg(null);
    expect(() => voeg(vereniging.id)).toThrow(/UNIQUE/);
    expect(() => voeg(null)).toThrow(/UNIQUE/);
  });

  it('draait terug zonder de standaardlijst aan te tasten, en wist eigen items met wat eraan hangt', () => {
    const eigen = uuidv4();
    db.prepare("INSERT INTO instruments (id, name, association_id) VALUES (?, 'Alpenhoorn', ?)").run(
      eigen,
      vereniging.id,
    );
    db.prepare('INSERT INTO user_instruments (user_id, instrument_id) VALUES (?, ?)').run(lid.id, eigen);

    omlaag();

    expect(db.prepare('SELECT COUNT(*) AS n FROM instruments WHERE id = ?').get(eigen)).toEqual({ n: 0 });
    expect(
      db.prepare('SELECT instrument_id FROM user_instruments WHERE user_id = ? ORDER BY instrument_id').all(lid.id),
    ).toEqual([{ instrument_id: trompet }]);
    // De oude unieke naam over de hele installatie is terug.
    expect(() => db.prepare("INSERT INTO genres (id, name) VALUES (?, 'Mars-test')").run(uuidv4())).toThrow(/UNIQUE/);

    omhoog();
  });

  it('doet niets als de tabellen al per vereniging zijn', () => {
    omhoog();
    expect(kolommen('genres').filter((k) => k === 'association_id')).toHaveLength(1);
  });
});
