/**
 * Tests voor src/migrations/runner.ts - de loper achter `npm run migrate:up`,
 * die ook bij elke start van de server draait (`npm start` roept de CLI aan).
 *
 * Van dit bestand was alleen loadMigrationFiles() gedekt, omdat testDb.ts die
 * functie gebruikt om zijn eigen schema op te bouwen. Alles wat met toepassen,
 * vastleggen en terugdraaien te maken heeft werd nooit uitgevoerd.
 *
 * runner.ts importeert de databaseverbinding op moduleniveau, dus hier is
 * vi.doUnmock() plus vi.resetModules() nodig voordat runner.ts geladen wordt:
 * anders krijgt hij de testdatabase uit setup.ts. Dat moet in een hook, niet
 * bovenaan het bestand - zie de toelichting in connection-echt.test.ts.
 */

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

const oorspronkelijkDbPad = process.env.DB_PATH;
let werkmap: string;

/** Verse database plus de runner die daaraan vastzit. */
async function verseLoper(bestandsnaam: string): Promise<{ db: any; runner: any }> {
  process.env.DB_PATH = path.join(werkmap, bestandsnaam);
  vi.doUnmock('../../database/connection');
  vi.resetModules();
  const db = (await import('../../database/connection')).default as any;
  await db.init();
  const runner = await import('../../migrations/runner');
  return { db, runner };
}

beforeAll(() => {
  werkmap = fs.mkdtempSync(path.join(os.tmpdir(), 'tutti-loper-'));
});

afterAll(() => {
  if (oorspronkelijkDbPad === undefined) {
    delete process.env.DB_PATH;
  } else {
    process.env.DB_PATH = oorspronkelijkDbPad;
  }
  fs.rmSync(werkmap, { recursive: true, force: true });
});

describe('de migratieloper op een verse database', () => {
  let db: any;
  let runner: any;
  let aantalBestanden: number;

  beforeAll(async () => {
    ({ db, runner } = await verseLoper('loper.db'));
    aantalBestanden = (await runner.loadMigrationFiles()).length;
  }, 30000);

  it('leest de migratiebestanden op volgorde in, met een versie en een naam', async () => {
    const bestanden = await runner.loadMigrationFiles();

    expect(bestanden.length).toBeGreaterThan(0);
    for (const migratie of bestanden) {
      expect(migratie.version).toMatch(/^\d{14}$/);
      expect(migratie.name).not.toMatch(/\.(ts|js)$/);
      expect(typeof migratie.up).toBe('function');
      expect(typeof migratie.down).toBe('function');
    }
    // Op versie gesorteerd, want de volgorde bepaalt of een migratie kan
    // leunen op wat een eerdere heeft aangelegd.
    const versies = bestanden.map((m: any) => m.version);
    expect(versies).toEqual([...versies].sort());
  });

  it('meldt zonder administratie dat er niets terug te draaien is', async () => {
    // Nog voordat er iets is toegepast: de tabel bestaat wel, maar is leeg.
    runner.initMigrationsTable();

    await expect(runner.rollbackLastMigration()).resolves.toEqual({
      rolledBack: null,
      error: 'No migrations to rollback',
    });
  });

  it('legt de administratietabel aan, en een tweede keer aanroepen mag', () => {
    runner.initMigrationsTable();
    runner.initMigrationsTable();

    expect(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='migrations'").get()).toEqual({
      name: 'migrations',
    });
  });

  it('past alle migraties toe en legt ze vast', async () => {
    const resultaat = await runner.runMigrations();

    expect(resultaat.errors).toEqual([]);
    expect(resultaat.applied).toHaveLength(aantalBestanden);
    expect(runner.getAppliedMigrations()).toHaveLength(aantalBestanden);
  }, 30000);

  it('draait ze niet nog een keer', async () => {
    const resultaat = await runner.runMigrations();

    expect(resultaat.applied).toEqual([]);
    expect(resultaat.errors).toEqual([]);
    expect(runner.getAppliedMigrations()).toHaveLength(aantalBestanden);
    expect(await runner.getPendingMigrations()).toEqual([]);
  }, 30000);

  it('houdt de administratie op versie gesorteerd', () => {
    const toegepast = runner.getAppliedMigrations();
    const versies = toegepast.map((m: any) => m.version);

    expect(versies).toEqual([...versies].sort());
    expect(runner.getLastAppliedMigration().version).toBe(versies[versies.length - 1]);
  });

  it('weet per versie of hij is toegepast', () => {
    const eerste = runner.getAppliedMigrations()[0];

    expect(runner.isMigrationApplied(eerste.version)).toBe(true);
    expect(runner.isMigrationApplied('00000000000000')).toBe(false);
  });

  it('geeft de stand van zaken van alle migraties', async () => {
    const stand = await runner.getMigrationStatus();

    expect(stand).toHaveLength(aantalBestanden);
    expect(stand.every((m: any) => m.applied)).toBe(true);
    expect(stand.every((m: any) => typeof m.applied_at === 'string')).toBe(true);
  }, 30000);

  it('kan een los administratieregeltje toevoegen en weer weghalen', async () => {
    runner.recordMigration('99999999999999', 'verzonnen');
    expect(runner.isMigrationApplied('99999999999999')).toBe(true);

    // Een versie zonder bestand telt niet mee als pending, want pending komt
    // uit de bestanden en niet uit de administratie.
    expect(await runner.getPendingMigrations()).toEqual([]);

    runner.removeMigrationRecord('99999999999999');
    expect(runner.isMigrationApplied('99999999999999')).toBe(false);
  }, 30000);

  it('meldt het als het bestand bij de laatste administratieregel ontbreekt', async () => {
    // 9999... is hoger dan elke echte versie, dus dit is de laatst toegepaste.
    runner.recordMigration('99999999999999', 'verzonnen');

    const resultaat = await runner.rollbackLastMigration();

    expect(resultaat.rolledBack).toBeNull();
    expect(resultaat.error).toContain('not found');
    runner.removeMigrationRecord('99999999999999');
  }, 30000);

  it('draait de laatste migratie terug en kan hem daarna opnieuw toepassen', async () => {
    const laatste = runner.getLastAppliedMigration();

    const terug = await runner.rollbackLastMigration();

    expect(terug.error).toBeNull();
    expect(terug.rolledBack).toBe(`${laatste.version}_${laatste.name}`);
    expect(runner.isMigrationApplied(laatste.version)).toBe(false);
    expect((await runner.getPendingMigrations()).map((m: any) => m.version)).toEqual([laatste.version]);

    const opnieuw = await runner.runMigrations();

    expect(opnieuw.errors).toEqual([]);
    expect(opnieuw.applied).toEqual([`${laatste.version}_${laatste.name}`]);
  }, 30000);

  it('schrijft een nieuw migratiebestand met een tijdstempel en een sjabloon', () => {
    // fs.writeFileSync wordt onderschept: het echte bestand zou anders in
    // src/migrations belanden en daarna in elke testrun meedraaien.
    db.flush();
    const schrijven = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);

    try {
      const bestandspad = runner.createMigrationFile('Voeg Iets Toe!');

      expect(path.basename(bestandspad)).toMatch(/^\d{14}_voeg_iets_toe\.ts$/);
      expect(path.dirname(bestandspad)).toBe(path.resolve(__dirname, '../../migrations'));
      expect(schrijven).toHaveBeenCalledTimes(1);

      const inhoud = String(schrijven.mock.calls[0][1]);
      expect(inhoud).toContain("import db from '../database/connection'");
      expect(inhoud).toContain('export function up(): void');
      expect(inhoud).toContain('export function down(): void');
    } finally {
      schrijven.mockRestore();
    }
  });
});

describe('de migratieloper als er iets misgaat', () => {
  it('stopt bij de eerste fout, meldt hem, en legt niets vast', async () => {
    const { db, runner } = await verseLoper('loper-kapot.db');
    const alles = await runner.loadMigrationFiles();

    // De administratietabel krijgt een kolom die nergens gevuld wordt. Het
    // toepassen zelf lukt dan wel, maar het vastleggen niet - en dat moet als
    // fout naar buiten komen in plaats van als "toegepast" te tellen.
    // initMigrationsTable() gebruikt IF NOT EXISTS, dus deze vorm blijft staan.
    db.exec('DROP TABLE IF EXISTS migrations');
    db.exec(`CREATE TABLE migrations (
      id TEXT PRIMARY KEY,
      version TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      verplicht TEXT NOT NULL
    )`);

    const resultaat = await runner.runMigrations();

    expect(resultaat.applied).toEqual([]);
    expect(resultaat.errors).toHaveLength(1);
    expect(resultaat.errors[0]).toContain(alles[0].version);
    expect(resultaat.errors[0]).toContain('NOT NULL constraint failed');
    // Alleen de eerste is geprobeerd: er wordt niet stil doorgelopen over de rest.
    expect(db.prepare('SELECT COUNT(*) AS aantal FROM migrations').get()).toEqual({ aantal: 0 });
  }, 60000);

  it('draait de mislukte migratie helemaal terug', async () => {
    const { db, runner } = await verseLoper('loper-terug.db');

    // Dezelfde opzet, maar nu kijken we naar wat de migratie zelf achterliet.
    // up() en het vastleggen zitten samen in een transactie, dus het werk van
    // een migratie die niet vastgelegd kon worden hoort ook weg te zijn.
    db.exec('DROP TABLE IF EXISTS migrations');
    db.exec(`CREATE TABLE migrations (
      id TEXT PRIMARY KEY,
      version TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      verplicht TEXT NOT NULL
    )`);
    db.exec('DROP TABLE IF EXISTS association_link_codes');

    const resultaat = await runner.runMigrations();

    expect(resultaat.errors).toHaveLength(1);
    // association_link_codes wordt door een latere migratie aangelegd; die is
    // door de stop nooit aan de beurt gekomen.
    expect(
      db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='association_link_codes'").get(),
    ).toBeUndefined();
  }, 60000);

  it('loopt bij een verloren administratie vast op de eerste migratie die zich niet laat herhalen', async () => {
    const { db, runner } = await verseLoper('loper-administratie-kwijt.db');
    const alles = await runner.loadMigrationFiles();
    await runner.runMigrations();

    // Een database waar alles al gedraaid heeft, maar waar de administratie
    // weg is - bijvoorbeeld na een herstel van een oudere reservekopie van
    // alleen die tabel. Alles wordt dan opnieuw als pending gezien.
    db.prepare('DELETE FROM migrations').run();

    const resultaat = await runner.runMigrations();

    // Niet elke migratie is herhaalbaar: er is er minstens een die op een
    // reeds toegepaste wijziging stukloopt. De loper meldt dat en stopt daar,
    // in plaats van de rest stil over te slaan.
    expect(resultaat.errors).toHaveLength(1);
    expect(resultaat.applied.length).toBeGreaterThan(0);
    expect(resultaat.applied.length).toBeLessThan(alles.length);

    // Wat wel is toegepast staat ook in de administratie, en de rest niet:
    // een tweede poging begint dus bij de migratie die stukliep.
    expect(runner.getAppliedMigrations()).toHaveLength(resultaat.applied.length);
    const volgende = await runner.getPendingMigrations();
    expect(resultaat.errors[0]).toContain(volgende[0].version);
  }, 60000);
});
