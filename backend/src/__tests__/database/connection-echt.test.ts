/**
 * Tests tegen de ECHTE src/database/connection.ts.
 *
 * src/__tests__/setup.ts vervangt '../database/connection' voor elke test door
 * './testDb'. Daardoor draaide de productiewrapper in geen enkele test: hij
 * stond op nul procent dekking terwijl testDb.ts - een met de hand
 * onderhouden kopie - alle beweringen droeg. Die kopie is eerder afgedreven,
 * en de reparatie voor geneste transacties (savepoints in plaats van een
 * tweede BEGIN) is destijds alleen tegen de kopie getest.
 *
 * Dit bestand haalt de echte module binnen met vi.doUnmock() plus
 * vi.resetModules() in een beforeAll. Dat moet in een hook gebeuren en niet op
 * moduleniveau: setup.ts heeft zijn eigen beforeAll die testDb initialiseert,
 * en die leunt erop dat de migratiebestanden dan nog naar de testdatabase
 * wijzen. Een gehoiste vi.unmock() bovenaan dit bestand sloopt die hook.
 *
 * connection.ts leest DB_PATH op moduleniveau, dus elke verse instantie krijgt
 * hier een eigen bestand in een tijdelijke map. Die map gaat na afloop weg en
 * DB_PATH wordt teruggezet, zodat de echte data-map onaangeroerd blijft.
 */

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
// sql.js heeft geen ESM-build die onder vitest werkt; testDb.ts doet dit ook zo.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const initSqlJs = require('sql.js');

// Bewust statisch, boven elke vi.resetModules() uit: dit moet dezelfde
// instantie zijn als die setup.ts heeft geinitialiseerd. Een import na het
// resetten levert een verse, lege kopie op.
import testDb from '../testDb';

const oorspronkelijkDbPad = process.env.DB_PATH;
let werkmap: string;
let SQL: any;

/** Een verse wrapper met een eigen databasebestand. Nog niet geinitialiseerd. */
async function verseDatabase(bestandsnaam: string): Promise<{ db: any; pad: string }> {
  const pad = path.join(werkmap, bestandsnaam);
  process.env.DB_PATH = pad;
  vi.doUnmock('../../database/connection');
  vi.resetModules();
  const module = await import('../../database/connection');
  return { db: module.default as any, pad };
}

/** Leest het bestand op schijf los in, dus buiten de wrapper om. */
function opSchijf(pad: string, sql: string): any[] {
  const bestand = new SQL.Database(fs.readFileSync(pad));
  try {
    const stmt = bestand.prepare(sql);
    const kolommen = stmt.getColumnNames();
    const rijen: any[] = [];
    while (stmt.step()) {
      const waarden = stmt.get();
      const rij: any = {};
      kolommen.forEach((k: string, i: number) => (rij[k] = waarden[i]));
      rijen.push(rij);
    }
    stmt.free();
    return rijen;
  } finally {
    bestand.close();
  }
}

beforeAll(async () => {
  werkmap = fs.mkdtempSync(path.join(os.tmpdir(), 'tutti-connectie-'));
  SQL = await initSqlJs();
});

afterAll(() => {
  if (oorspronkelijkDbPad === undefined) {
    delete process.env.DB_PATH;
  } else {
    process.env.DB_PATH = oorspronkelijkDbPad;
  }
  fs.rmSync(werkmap, { recursive: true, force: true });
});

describe('de echte databasewrapper: opstarten', () => {
  it('legt het databasebestand aan op het pad uit DB_PATH', async () => {
    const { db, pad } = await verseDatabase('opstart.db');
    expect(fs.existsSync(pad)).toBe(false);

    await db.init();

    expect(fs.existsSync(pad)).toBe(true);
    // Het schema is toegepast, niet alleen een leeg bestand.
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").get()).toBeDefined();
  });

  it('geeft een bruikbare fout als er nog niet geinitialiseerd is', async () => {
    const { db } = await verseDatabase('zonder-init.db');

    expect(() => db.prepare('SELECT 1 AS een').get()).toThrow('Database not initialized');
    expect(() => db.exec('CREATE TABLE proef (id TEXT)')).toThrow('Database not initialized');
  });

  it('schrijft niets weg zolang er geen database is', async () => {
    const { db, pad } = await verseDatabase('nooit-geopend.db');

    db.save();

    expect(fs.existsSync(pad)).toBe(false);
  });

  it('doet een tweede init() niet nog eens over', async () => {
    const { db } = await verseDatabase('dubbel-init.db');
    await db.init();
    db.exec("INSERT INTO associations (id, name) VALUES ('v1', 'Blijft staan')");

    await db.init();

    expect(db.prepare('SELECT name FROM associations WHERE id = ?').get('v1')).toEqual({ name: 'Blijft staan' });
  });

  it('deelt een init() die tegelijk twee keer wordt aangevraagd', async () => {
    const { db } = await verseDatabase('gelijktijdige-init.db');

    // Twee aanroepen zonder await ertussen: zonder de gedeelde initPromise
    // zouden er twee schema-runs tegelijk lopen op dezelfde database.
    await Promise.all([db.init(), db.init(), db.init()]);

    expect(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").get()).toBeDefined();
  });

  it('draait bij een bestaande database eerst de schemamigraties', async () => {
    const eerste = await verseDatabase('bestaand.db');
    await eerste.db.init();
    eerste.db.flush();

    // Opnieuw openen van hetzelfde bestand: nu is isExistingDb waar, en dan
    // draait database/migrations.ts mee. Op een verse database gebeurt dat
    // niet - het schema is dan per definitie al bij.
    const opnieuw = await verseDatabase('bestaand.db');
    await opnieuw.db.init();

    const versies = opnieuw.db.prepare('SELECT version FROM schema_migrations ORDER BY version').all();
    expect(versies.length).toBeGreaterThan(0);
    expect(versies[0]).toEqual({ version: 1 });
  });
});

describe('de echte databasewrapper: parameters normaliseren', () => {
  let db: any;

  beforeAll(async () => {
    ({ db } = await verseDatabase('params.db'));
    await db.init();
    db.exec('CREATE TABLE IF NOT EXISTS proef_params (id TEXT PRIMARY KEY, a TEXT, b TEXT)');
  });

  it('maakt van undefined een NULL', async () => {
    // Routes die een gedeeltelijke wijziging doen geven undefined mee voor elk
    // veld dat de aanvraag niet noemt. In SQL is dat NULL.
    db.prepare('INSERT INTO proef_params (id, a, b) VALUES (?, ?, ?)').run('p1', 'x', undefined);

    const rij = db.prepare('SELECT a, b FROM proef_params WHERE id = ?').get('p1');
    expect(rij).toEqual({ a: 'x', b: null });
  });

  it('sql.js zelf weigert een undefined binding - daarom is die normalisatie er', () => {
    // runStatement() is de kale doorgeefluik zonder normalisatie; prepare()
    // normaliseert wel. Dit legt vast waar de fout vandaan kwam.
    let gevangen: unknown;
    try {
      db.runStatement('INSERT INTO proef_params (id, a, b) VALUES (?, ?, ?)', ['p2', 'x', undefined]);
    } catch (fout) {
      gevangen = fout;
    }

    // sql.js gooit hier een kale string, geen Error: err.message is undefined.
    expect(String(gevangen)).toContain('tried to bind a value of an unknown type');
  });

  it('zoekt met undefined naar de NULL-rijen (NULL = NULL is nooit waar, dus IS)', () => {
    db.prepare('INSERT INTO proef_params (id, a, b) VALUES (?, ?, ?)').run('p3', 'y', null);

    const gevonden = db.prepare('SELECT id FROM proef_params WHERE b IS ? ORDER BY id').all(undefined);

    expect(gevonden.map((r: any) => r.id)).toEqual(['p1', 'p3']);
  });

  it('laat een rij parameters zonder undefined ongemoeid', () => {
    db.prepare('INSERT INTO proef_params (id, a, b) VALUES (?, ?, ?)').run('p4', 'a', 'b');

    expect(db.prepare('SELECT a, b FROM proef_params WHERE id = ?').get('p4')).toEqual({ a: 'a', b: 'b' });
  });

  it('meldt hoeveel rijen er veranderden en welk rijnummer erbij kwam', () => {
    const resultaat = db.prepare('INSERT INTO proef_params (id, a, b) VALUES (?, ?, ?)').run('p5', 'c', undefined);

    expect(resultaat.changes).toBe(1);
    expect(resultaat.lastInsertRowid).toBeGreaterThan(0);

    // p2 is er nooit gekomen: die insert liep stuk op de undefined-binding.
    const bijwerken = db.prepare('UPDATE proef_params SET a = ? WHERE id IS NOT NULL').run('zelfde');
    expect(bijwerken.changes).toBe(4);
  });

  it('geeft undefined terug als er niets te halen valt, en een lege lijst bij all()', () => {
    expect(db.prepare('SELECT a FROM proef_params WHERE id = ?').get('bestaat-niet')).toBeUndefined();
    expect(db.prepare('SELECT a FROM proef_params WHERE id = ?').all('bestaat-niet')).toEqual([]);
  });
});

describe('de echte databasewrapper: transacties', () => {
  let db: any;

  beforeAll(async () => {
    ({ db } = await verseDatabase('transacties.db'));
    await db.init();
    db.exec('CREATE TABLE IF NOT EXISTS proef_tx (id TEXT PRIMARY KEY)');
  });

  const namen = () =>
    db
      .prepare('SELECT id FROM proef_tx ORDER BY id')
      .all()
      .map((r: any) => r.id);
  const leegmaken = () => db.exec('DELETE FROM proef_tx');
  const voegToe = (id: string) => db.prepare('INSERT INTO proef_tx (id) VALUES (?)').run(id);

  it('legt het werk van een geslaagde transactie vast', () => {
    leegmaken();

    db.transaction(() => {
      voegToe('een');
      voegToe('twee');
    })();

    expect(namen()).toEqual(['een', 'twee']);
  });

  it('laat na een fout niets in de database achter', () => {
    leegmaken();

    expect(() =>
      db.transaction(() => {
        voegToe('een');
        voegToe('twee');
        throw new Error('iets gaat mis');
      })(),
    ).toThrow('iets gaat mis');

    expect(namen()).toEqual([]);
  });

  it('geeft de waarde van de functie terug', () => {
    leegmaken();
    expect(db.transaction(() => 42)()).toBe(42);
  });

  it('draait bij een fout binnenin alleen de binnenste transactie terug', () => {
    leegmaken();

    db.transaction(() => {
      voegToe('buiten');

      try {
        db.transaction(() => {
          voegToe('binnen');
          throw new Error('binnenste mislukt');
        })();
      } catch {
        // De buitenste transactie loopt door - dat is precies wat er eerder
        // niet gebeurde: de binnenste ROLLBACK draaide de buitenste terug.
      }

      voegToe('na-de-fout');
    })();

    expect(namen()).toEqual(['buiten', 'na-de-fout']);
  });

  it('neemt bij een fout in de buitenste transactie ook het binnenste werk mee', () => {
    leegmaken();

    expect(() =>
      db.transaction(() => {
        voegToe('buiten');
        db.transaction(() => voegToe('binnen'))();
        throw new Error('buitenste mislukt');
      })(),
    ).toThrow('buitenste mislukt');

    expect(namen()).toEqual([]);
  });

  it('kan meer dan een niveau diep, met een eigen savepoint per niveau', () => {
    leegmaken();

    db.transaction(() => {
      voegToe('n1');
      db.transaction(() => {
        voegToe('n2');
        db.transaction(() => voegToe('n3'))();
      })();
      // Twee geneste transacties achter elkaar mogen elkaars savepoint niet
      // hergebruiken; de teller loopt daarom door.
      db.transaction(() => voegToe('n4'))();
    })();

    expect(namen()).toEqual(['n1', 'n2', 'n3', 'n4']);
  });

  it('werkt na een mislukte transactie gewoon verder', () => {
    leegmaken();
    voegToe('bestaat');

    expect(() => db.transaction(() => voegToe('bestaat'))()).toThrow();

    // De vlag inTransaction moet weer uit staan, anders zou deze transactie
    // een savepoint zetten zonder omhullende transactie.
    db.transaction(() => voegToe('daarna'))();

    expect(namen()).toEqual(['bestaat', 'daarna']);
  });

  it('houdt na een mislukte ROLLBACK niet voor eeuwig een transactie open', async () => {
    // SQLite draait een transactie bij sommige fouten zelf al terug. De
    // ROLLBACK van de wrapper loopt dan stuk op "cannot rollback - no
    // transaction is active". Bleef inTransaction daarna op true staan, dan
    // sloeg elke volgende schrijfactie het opslaan naar schijf over: stil, en
    // voor de rest van het proces. Hier bootsen we die situatie na door de
    // transactie van binnenuit al terug te draaien.
    const eigen = await verseDatabase('vastgelopen-vlag.db');
    await eigen.db.init();
    eigen.db.exec('CREATE TABLE IF NOT EXISTS proef_vlag (id TEXT PRIMARY KEY)');
    eigen.db.flush();

    expect(() =>
      eigen.db.transaction(() => {
        eigen.db.exec('ROLLBACK');
        throw new Error('de echte fout');
      })(),
    ).toThrow('de echte fout');

    eigen.db.prepare('INSERT INTO proef_vlag (id) VALUES (?)').run('na-de-fout');
    eigen.db.flush();

    expect(opSchijf(eigen.pad, 'SELECT id FROM proef_vlag')).toEqual([{ id: 'na-de-fout' }]);
  });
});

describe('de echte databasewrapper: opslaan naar schijf', () => {
  let db: any;
  let pad: string;

  beforeAll(async () => {
    ({ db, pad } = await verseDatabase('opslaan.db'));
    await db.init();
    db.exec('CREATE TABLE IF NOT EXISTS proef_opslag (id TEXT PRIMARY KEY)');
    db.flush();
  });

  it('schrijft atomair: eerst een tijdelijk bestand, dan hernoemen', () => {
    const schrijven = vi.spyOn(fs, 'writeFileSync');
    const hernoemen = vi.spyOn(fs, 'renameSync');

    try {
      db.save();

      // Halverwege een schrijfactie crashen mag nooit een half databasebestand
      // achterlaten; daarom gaat de inhoud eerst naar <pad>.tmp.
      expect(schrijven).toHaveBeenCalledTimes(1);
      expect(schrijven.mock.calls[0][0]).toBe(`${pad}.tmp`);
      expect(hernoemen).toHaveBeenCalledWith(`${pad}.tmp`, pad);
    } finally {
      schrijven.mockRestore();
      hernoemen.mockRestore();
    }

    expect(fs.existsSync(`${pad}.tmp`)).toBe(false);
  });

  it('houdt een schrijfactie eerst vast en schrijft na de debounce vanzelf weg', () => {
    vi.useFakeTimers();
    try {
      db.prepare('INSERT INTO proef_opslag (id) VALUES (?)').run('uitgesteld');

      // Nog niet op schijf: elke losse INSERT meteen wegschrijven zou de
      // event loop blokkeren met een export per statement.
      expect(opSchijf(pad, 'SELECT id FROM proef_opslag')).toEqual([]);

      vi.advanceTimersByTime(499);
      expect(opSchijf(pad, 'SELECT id FROM proef_opslag')).toEqual([]);

      vi.advanceTimersByTime(1);
      expect(opSchijf(pad, 'SELECT id FROM proef_opslag')).toEqual([{ id: 'uitgesteld' }]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('voegt meerdere schrijfacties binnen het venster samen tot een schrijfbeurt', () => {
    vi.useFakeTimers();
    const schrijven = vi.spyOn(fs, 'writeFileSync');
    try {
      db.prepare('INSERT INTO proef_opslag (id) VALUES (?)').run('a');
      db.prepare('INSERT INTO proef_opslag (id) VALUES (?)').run('b');
      db.exec("INSERT INTO proef_opslag (id) VALUES ('c')");

      vi.advanceTimersByTime(500);

      expect(schrijven).toHaveBeenCalledTimes(1);
    } finally {
      schrijven.mockRestore();
      vi.useRealTimers();
    }
  });

  it('haalt met een directe save() de geplande schrijfactie weg', () => {
    vi.useFakeTimers();
    try {
      db.prepare('INSERT INTO proef_opslag (id) VALUES (?)').run('direct');
      db.save();

      const schrijven = vi.spyOn(fs, 'writeFileSync');
      vi.advanceTimersByTime(1000);

      expect(schrijven).not.toHaveBeenCalled();
      schrijven.mockRestore();
      expect(opSchijf(pad, "SELECT id FROM proef_opslag WHERE id = 'direct'")).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('doet met flush() niets als er niets veranderd is', () => {
    db.flush();
    const schrijven = vi.spyOn(fs, 'writeFileSync');

    try {
      db.flush();
      expect(schrijven).not.toHaveBeenCalled();
    } finally {
      schrijven.mockRestore();
    }
  });

  it('saveNow() doet hetzelfde als flush()', () => {
    db.prepare('INSERT INTO proef_opslag (id) VALUES (?)').run('nu');

    db.saveNow();

    expect(opSchijf(pad, "SELECT id FROM proef_opslag WHERE id = 'nu'")).toHaveLength(1);
  });

  it('schrijft binnen een transactie pas na de commit', () => {
    vi.useFakeTimers();
    try {
      db.transaction(() => {
        db.prepare('INSERT INTO proef_opslag (id) VALUES (?)').run('tx1');
        db.prepare('INSERT INTO proef_opslag (id) VALUES (?)').run('tx2');
        // Midden in de transactie is er nog niets ingepland: dat zou een
        // half afgemaakte transactie op schijf kunnen zetten.
        vi.advanceTimersByTime(1000);
        expect(opSchijf(pad, "SELECT id FROM proef_opslag WHERE id LIKE 'tx%'")).toEqual([]);
      })();

      vi.advanceTimersByTime(500);
      expect(opSchijf(pad, "SELECT id FROM proef_opslag WHERE id LIKE 'tx%'")).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('de echte databasewrapper: reload na een herstel', () => {
  it('pikt de teruggezette gegevens op in plaats van ze te overschrijven', async () => {
    const { db, pad } = await verseDatabase('herstel.db');
    await db.init();
    db.exec('CREATE TABLE IF NOT EXISTS proef_herstel (id TEXT PRIMARY KEY)');
    db.prepare('INSERT INTO proef_herstel (id) VALUES (?)').run('van-voor-het-herstel');
    db.flush();

    // Nog een wijziging die alleen in het geheugen staat. Die hoort bij de
    // situatie van voor het terugzetten en moet dus verdwijnen.
    db.prepare('INSERT INTO proef_herstel (id) VALUES (?)').run('alleen-in-geheugen');

    // Het terugzetten zelf: een ander bestand komt op de plaats van de database.
    const reservekopie = new SQL.Database(fs.readFileSync(pad));
    reservekopie.run("DELETE FROM proef_herstel WHERE id = 'van-voor-het-herstel'");
    reservekopie.run("INSERT INTO proef_herstel (id) VALUES ('uit-de-reservekopie')");
    fs.writeFileSync(pad, Buffer.from(reservekopie.export()));
    reservekopie.close();

    await db.reload();

    expect(db.prepare('SELECT id FROM proef_herstel ORDER BY id').all()).toEqual([{ id: 'uit-de-reservekopie' }]);

    // En het proces mag de teruggezette gegevens daarna niet alsnog
    // overschrijven met wat er nog in het geheugen zat.
    db.save();
    expect(opSchijf(pad, 'SELECT id FROM proef_herstel ORDER BY id')).toEqual([{ id: 'uit-de-reservekopie' }]);
  });

  it('laat een geplande schrijfactie van voor het herstel vervallen', async () => {
    const { db, pad } = await verseDatabase('herstel-debounce.db');
    await db.init();
    db.exec('CREATE TABLE IF NOT EXISTS proef_herstel (id TEXT PRIMARY KEY)');
    db.flush();

    vi.useFakeTimers();
    try {
      db.prepare('INSERT INTO proef_herstel (id) VALUES (?)').run('mag-weg');

      const kopie = new SQL.Database(fs.readFileSync(pad));
      kopie.run("INSERT INTO proef_herstel (id) VALUES ('teruggezet')");
      fs.writeFileSync(pad, Buffer.from(kopie.export()));
      kopie.close();

      await db.reload();
      vi.advanceTimersByTime(1000);

      expect(opSchijf(pad, 'SELECT id FROM proef_herstel ORDER BY id')).toEqual([{ id: 'teruggezet' }]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('kan ook herladen als deze wrapper zelf nog nooit geopend is', async () => {
    // Het herstel-eindpunt zet het bestand terug en roept daarna reload() aan.
    // Gebeurt dat op een wrapper die zijn eigen init() nog niet had gedaan,
    // dan is er ook nog geen sql.js geladen; reload() haalt die dan alsnog op.
    const eerste = await verseDatabase('herstel-zonder-init.db');
    await eerste.db.init();
    eerste.db.exec('CREATE TABLE IF NOT EXISTS proef_herstel (id TEXT PRIMARY KEY)');
    eerste.db.prepare('INSERT INTO proef_herstel (id) VALUES (?)').run('uit-het-bestand');
    eerste.db.flush();

    const ongeopend = await verseDatabase('herstel-zonder-init.db');
    await ongeopend.db.reload();

    expect(ongeopend.db.prepare('SELECT id FROM proef_herstel').all()).toEqual([{ id: 'uit-het-bestand' }]);
  });

  it('weigert te herladen als het bestand er niet meer is', async () => {
    const { db, pad } = await verseDatabase('herstel-weg.db');
    await db.init();
    fs.unlinkSync(pad);

    await expect(db.reload()).rejects.toThrow('Cannot reload database: file not found');
  });
});

describe('gelijkloop tussen connection.ts en testDb.ts', () => {
  /**
   * testDb.ts is een met de hand onderhouden kopie van de wrapper. Wat de
   * tests over transacties en parameters bewijzen, bewijzen ze normaal
   * gesproken over die kopie. Hier draait hetzelfde scenario over allebei en
   * moeten de uitkomsten gelijk zijn - drift valt zo op.
   *
   * Wat de kopie NIET heeft (save naar schijf, flush(), saveNow(), reload(),
   * de debounce) staat hier bewust niet in: dat is geen gedrag dat je kunt
   * vergelijken, dat ontbreekt gewoon.
   */
  async function scenario(wrapper: any): Promise<any> {
    wrapper.exec('CREATE TABLE IF NOT EXISTS proef_gelijk (id TEXT PRIMARY KEY, a TEXT)');
    wrapper.exec('DELETE FROM proef_gelijk');

    const invoegen = (id: string, a: any) =>
      wrapper.prepare('INSERT INTO proef_gelijk (id, a) VALUES (?, ?)').run(id, a);

    const resultaat: any = {};
    resultaat.undefinedWordtNull = invoegen('u', undefined).changes;
    resultaat.naUndefined = wrapper.prepare('SELECT a FROM proef_gelijk WHERE id = ?').get('u');

    wrapper.transaction(() => {
      invoegen('buiten', 'x');
      try {
        wrapper.transaction(() => {
          invoegen('binnen', 'x');
          throw new Error('mislukt');
        })();
      } catch {
        // binnenste rolt terug, buitenste loopt door
      }
    })();
    resultaat.naGenesteFout = wrapper.prepare('SELECT id FROM proef_gelijk ORDER BY id').all();

    try {
      wrapper.transaction(() => {
        invoegen('losse', 'x');
        throw new Error('mislukt');
      })();
    } catch {
      // hoort terug te rollen
    }
    resultaat.naLosseFout = wrapper.prepare('SELECT id FROM proef_gelijk ORDER BY id').all();
    resultaat.leegResultaat = wrapper.prepare('SELECT a FROM proef_gelijk WHERE id = ?').get('bestaat-niet');

    return resultaat;
  }

  it('geeft voor transacties en parameters dezelfde uitkomsten', async () => {
    const { db } = await verseDatabase('gelijkloop.db');
    await db.init();

    const echt = await scenario(db);
    const kopie = await scenario(testDb);

    expect(kopie).toEqual(echt);
    // Vangnet: als het scenario stilletjes niets zou doen, is gelijkheid ook waar.
    expect(echt.naGenesteFout).toEqual([{ id: 'buiten' }, { id: 'u' }]);
  });
});
