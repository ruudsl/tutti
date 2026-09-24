/**
 * De opstart (initializeDatabase) vult de standaardlijst met genres en
 * instrumenten aan. Hij draait bij elke herstart, dus hij mag niet aankomen
 * aan wat een vereniging zelf heeft toegevoegd: vroeger gooide hij elk genre
 * weg dat niet in de standaardlijst stond, met de koppelingen aan titels.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import { initializeDatabase } from '../../database/init';
import { createTestAssociation } from '../testUtils';

beforeEach(() => {
  process.env.ADMIN_INIT_PASSWORD = 'TestWachtwoord!2026';
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  delete process.env.ADMIN_INIT_PASSWORD;
  vi.restoreAllMocks();
});

describe('de opstart en de eigen genres en instrumenten', () => {
  it('laat eigen genres, hun koppeling aan titels en eigen instrumenten staan', async () => {
    await initializeDatabase();
    const vereniging = createTestAssociation();
    const genre = uuidv4();
    const titel = uuidv4();
    const instrument = uuidv4();
    db.prepare("INSERT INTO genres (id, name, association_id) VALUES (?, 'Carnaval', ?)").run(genre, vereniging.id);
    db.prepare("INSERT INTO music_titles (id, title, association_id) VALUES (?, 'Hofkapel', ?)").run(
      titel,
      vereniging.id,
    );
    db.prepare('INSERT INTO music_title_genres (music_title_id, genre_id) VALUES (?, ?)').run(titel, genre);
    db.prepare("INSERT INTO instruments (id, name, association_id) VALUES (?, 'Alpenhoorn', ?)").run(
      instrument,
      vereniging.id,
    );

    await initializeDatabase();

    expect(db.prepare('SELECT COUNT(*) AS n FROM genres WHERE id = ?').get(genre)).toEqual({ n: 1 });
    expect(db.prepare('SELECT COUNT(*) AS n FROM music_title_genres WHERE genre_id = ?').get(genre)).toEqual({ n: 1 });
    expect(db.prepare('SELECT COUNT(*) AS n FROM instruments WHERE id = ?').get(instrument)).toEqual({ n: 1 });
  });

  it('vult de standaardlijst aan, ook als een vereniging een eigen item met dezelfde naam heeft', async () => {
    await initializeDatabase();
    const vereniging = createTestAssociation();
    const standaard = db.prepare('SELECT id, name FROM genres WHERE association_id IS NULL LIMIT 1').get() as {
      id: string;
      name: string;
    };
    db.prepare('DELETE FROM genres WHERE id = ?').run(standaard.id);
    db.prepare('INSERT INTO genres (id, name, association_id) VALUES (?, ?, ?)').run(
      uuidv4(),
      standaard.name,
      vereniging.id,
    );

    await initializeDatabase();

    expect(
      db.prepare('SELECT COUNT(*) AS n FROM genres WHERE name = ? AND association_id IS NULL').get(standaard.name),
    ).toEqual({ n: 1 });
  });
});
