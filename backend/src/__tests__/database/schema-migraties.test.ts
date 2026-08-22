/**
 * Tests voor src/database/migrations.ts - de genummerde migraties die
 * connection.init() draait zodra het databasebestand al bestond.
 *
 * Dit bestand stond op nul procent dekking: geen enkele test raakte het, want
 * setup.ts vervangt de connectie door testDb.ts, en die bouwt zijn schema op
 * een andere manier op. Toch draait deze code bij elke start van de server op
 * een bestaande database.
 *
 * De echte wrapper komt hier binnen met vi.doUnmock() plus vi.resetModules()
 * in een hook - zie de toelichting in connection-echt.test.ts. runMigrations()
 * krijgt de database als argument mee, dus voor de gevallen waarin we een
 * kale of kapotte database nodig hebben gebruiken we MiniDb: een minimale
 * schil om sql.js met dezelfde methodes als de wrapper.
 */

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const initSqlJs = require('sql.js');

const oorspronkelijkDbPad = process.env.DB_PATH;
let werkmap: string;
let SQL: any;
let migratiemodule: any;

/** Minimale schil om sql.js met de methodes die runMigrations() gebruikt. */
class MiniDb {
  db: any;

  constructor(sqlJs: any) {
    this.db = new sqlJs.Database();
    this.db.run('PRAGMA foreign_keys = ON');
  }

  exec(sql: string): void {
    this.db.run(sql);
  }

  prepare(sql: string) {
    const db = this.db;
    const lees = (params: any[], alles: boolean) => {
      const stmt = db.prepare(sql);
      stmt.bind(params);
      const kolommen = stmt.getColumnNames();
      const rijen: any[] = [];
      while (stmt.step()) {
        const waarden = stmt.get();
        const rij: any = {};
        kolommen.forEach((k: string, i: number) => (rij[k] = waarden[i]));
        rijen.push(rij);
        if (!alles) break;
      }
      stmt.free();
      return alles ? rijen : rijen[0];
    };

    return {
      run: (...params: any[]) => db.run(sql, params),
      get: (...params: any[]) => lees(params, false),
      all: (...params: any[]) => lees(params, true),
    };
  }
}

async function verseDatabase(bestandsnaam: string): Promise<any> {
  process.env.DB_PATH = path.join(werkmap, bestandsnaam);
  vi.doUnmock('../../database/connection');
  vi.resetModules();
  const module = await import('../../database/connection');
  const db = module.default as any;
  await db.init();
  return db;
}

beforeAll(async () => {
  werkmap = fs.mkdtempSync(path.join(os.tmpdir(), 'tutti-schemamigraties-'));
  SQL = await initSqlJs();
  migratiemodule = await vi.importActual('../../database/migrations');
});

afterAll(() => {
  if (oorspronkelijkDbPad === undefined) {
    delete process.env.DB_PATH;
  } else {
    process.env.DB_PATH = oorspronkelijkDbPad;
  }
  fs.rmSync(werkmap, { recursive: true, force: true });
});

describe('genummerde migraties op een database met schema', () => {
  let db: any;

  beforeAll(async () => {
    db = await verseDatabase('genummerd.db');
  });

  const versies = () =>
    db
      .prepare('SELECT version FROM schema_migrations ORDER BY version')
      .all()
      .map((r: any) => r.version);

  it('legt de administratie aan en draait elke migratie', () => {
    migratiemodule.runMigrations(db);

    expect(versies()).toEqual(migratiemodule.migrations.map((m: any) => m.version));
  });

  it('draait ze een tweede keer niet opnieuw', () => {
    const voor = versies();

    migratiemodule.runMigrations(db);

    // Zonder de controle op reeds toegepaste versies zou de INSERT hieronder
    // stuklopen op de primaire sleutel van schema_migrations.
    expect(versies()).toEqual(voor);
  });

  it('slaat bij een verloren administratie de al toegepaste stappen over', () => {
    // Dit is het geval "al deels toegepast": het werk staat er wel, maar de
    // administratie mist. De skip-controles op kolom en tabel moeten dat
    // opvangen, zodat de migratie alsnog netjes wordt vastgelegd.
    const laatste = migratiemodule.migrations[migratiemodule.migrations.length - 1];
    db.prepare('DELETE FROM schema_migrations WHERE version = ?').run(laatste.version);
    expect(versies()).not.toContain(laatste.version);

    migratiemodule.runMigrations(db);

    expect(versies()).toContain(laatste.version);
    // En de kolom die die migratie toevoegt staat er nog steeds precies een keer.
    const kolommen = db
      .prepare('PRAGMA table_info(users)')
      .all()
      .filter((k: any) => k.name === 'password_changed_at');
    expect(kolommen).toHaveLength(1);
  });

  it('voegt een kolom die er al staat geen tweede keer toe', () => {
    // Migratie 9 herhaalt bewust wat migratie 3 doet, voor databases waar 3
    // was overgeslagen. Op een database waar de kolom al bestaat mag dat geen
    // fout geven.
    const aantal = () =>
      db
        .prepare('PRAGMA table_info(workflow_executions)')
        .all()
        .filter((k: any) => k.name === 'status').length;

    db.prepare('DELETE FROM schema_migrations WHERE version IN (3, 9)').run();
    expect(() => migratiemodule.runMigrations(db)).not.toThrow();

    expect(aantal()).toBeLessThanOrEqual(1);
    expect(versies()).toEqual(expect.arrayContaining([3, 9]));
  });
});

describe('genummerde migraties op een kale database', () => {
  it('slaat een ALTER over zolang de tabel nog niet bestaat, maar stopt bij een echte fout', () => {
    const mini = new MiniDb(SQL);

    // Op een kale database bestaat `posts` niet, dus migratie 1 heeft niets te
    // doen en wordt toch vastgelegd. Migratie 11 legt indexen aan op tabellen
    // die er niet zijn: dat is geen geval dat de skip-controles afvangen, en
    // dan hoort de fout naar buiten te komen in plaats van stilletjes
    // overgeslagen te worden.
    expect(() => migratiemodule.runMigrations(mini)).toThrow('no such table');

    const versies = mini
      .prepare('SELECT version FROM schema_migrations ORDER BY version')
      .all()
      .map((r: any) => r.version);

    expect(versies).toContain(1);
    expect(versies).toContain(10);
    // Alles vanaf de mislukte migratie is niet vastgelegd: de reeks stopt daar
    // en gaat er niet stil overheen.
    expect(versies).not.toContain(11);
    expect(versies).not.toContain(migratiemodule.migrations[migratiemodule.migrations.length - 1].version);
  });

  it('maakt de tabellen aan die er wel bij kunnen', () => {
    const mini = new MiniDb(SQL);
    try {
      migratiemodule.runMigrations(mini);
    } catch {
      // De fout van migratie 11 is hierboven al vastgelegd.
    }

    expect(migratiemodule.tableExists(mini, 'task_templates')).toBe(true);
    expect(migratiemodule.tableExists(mini, 'wiki_attachments')).toBe(true);
    // `posts` bestaat niet: de ALTER daarvoor is overgeslagen, niet uitgevoerd.
    expect(migratiemodule.tableExists(mini, 'posts')).toBe(false);
  });
});

describe('de hulpfuncties columnExists en tableExists', () => {
  let mini: MiniDb;

  beforeAll(() => {
    mini = new MiniDb(SQL);
    mini.exec('CREATE TABLE proef (id TEXT PRIMARY KEY, naam TEXT)');
  });

  it('herkent een bestaande kolom', () => {
    expect(migratiemodule.columnExists(mini, 'proef', 'naam')).toBe(true);
  });

  it('herkent een kolom die er niet is', () => {
    expect(migratiemodule.columnExists(mini, 'proef', 'bestaat_niet')).toBe(false);
  });

  it('geeft false in plaats van een fout bij een tabel die niet bestaat', () => {
    // PRAGMA table_info op een onbekende tabel geeft geen rijen; een tabelnaam
    // die geen geldige SQL is gooit wel. Allebei horen hier false op te leveren,
    // anders zou runMigrations() erop stuklopen voordat de skip-logica iets kan.
    expect(migratiemodule.columnExists(mini, 'bestaat_niet', 'naam')).toBe(false);
    expect(migratiemodule.columnExists(mini, 'geen geldige naam', 'naam')).toBe(false);
  });

  it('herkent een bestaande en een ontbrekende tabel', () => {
    expect(migratiemodule.tableExists(mini, 'proef')).toBe(true);
    expect(migratiemodule.tableExists(mini, 'bestaat_niet')).toBe(false);
  });

  it('geeft false als de database zelf niet meebewerkt', () => {
    const kapot = {
      prepare: () => {
        throw new Error('database is weg');
      },
    };

    expect(migratiemodule.tableExists(kapot, 'proef')).toBe(false);
    expect(migratiemodule.columnExists(kapot, 'proef', 'naam')).toBe(false);
  });
});
