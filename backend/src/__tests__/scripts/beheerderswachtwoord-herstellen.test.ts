/**
 * scripts/reset-admin-password.js - het noodscript voor als niemand meer kan
 * inloggen.
 *
 * Het zette zonder argument het wachtwoord `admin123`. Wie het argument
 * vergat, of het script uit een handleiding overnam, liet de beheerder van
 * een draaiende installatie achter met een wachtwoord dat in de broncode
 * staat. Nu maakt het zonder argument een willekeurig wachtwoord, weigert het
 * een te kort wachtwoord, en moet de gebruiker het bij het volgende inloggen
 * zelf wijzigen.
 *
 * Het script draait als los proces tegen een eigen databasebestand in een
 * tijdelijke map; de testdatabase van de andere tests raakt het niet.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import bcrypt from 'bcryptjs';
import initSqlJs from 'sql.js';

const SCRIPT = path.resolve(__dirname, '../../../scripts/reset-admin-password.js');

let map: string;
let dbPad: string;

async function maakDatabase() {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run(`CREATE TABLE users (
    id TEXT PRIMARY KEY, email TEXT, password_hash TEXT, moet_wachtwoord_wijzigen INTEGER DEFAULT 0
  )`);
  db.run(`INSERT INTO users VALUES ('a', 'admin@harmonie.nl', 'oud', 0), ('b', 'Bestuur@Voorbeeld.nl', 'oud', 0)`);
  fs.writeFileSync(dbPad, Buffer.from(db.export()));
  db.close();
}

async function lees(email: string) {
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(dbPad));
  const rij = db.exec('SELECT password_hash, moet_wachtwoord_wijzigen FROM users WHERE email = ?', [email])[0]
    .values[0] as [string, number];
  db.close();
  return { hash: rij[0], moetWijzigen: rij[1] };
}

function draai(...argumenten: string[]) {
  return spawnSync(process.execPath, [SCRIPT, ...argumenten], {
    env: { ...process.env, DB_PATH: dbPad },
    encoding: 'utf8',
  });
}

beforeEach(async () => {
  map = fs.mkdtempSync(path.join(os.tmpdir(), 'tutti-herstel-'));
  dbPad = path.join(map, 'tutti.db');
  await maakDatabase();
});

afterEach(() => {
  fs.rmSync(map, { recursive: true, force: true });
});

describe('beheerderswachtwoord herstellen', () => {
  it('zet zonder argument een willekeurig wachtwoord, nooit admin123', async () => {
    const uitvoer = draai();

    expect(uitvoer.status).toBe(0);
    const getoond = /Nieuw wachtwoord: (\S+)/.exec(uitvoer.stdout)?.[1];
    expect(getoond).toBeDefined();
    expect(getoond!.length).toBeGreaterThanOrEqual(16);
    const { hash, moetWijzigen } = await lees('admin@harmonie.nl');
    expect(bcrypt.compareSync(getoond!, hash)).toBe(true);
    expect(bcrypt.compareSync('admin123', hash)).toBe(false);
    expect(moetWijzigen).toBe(1);
  });

  it('zet een opgegeven wachtwoord en toont het niet nog eens', async () => {
    const uitvoer = draai('een-lang-genoeg-wachtwoord');

    expect(uitvoer.status).toBe(0);
    expect(uitvoer.stdout).not.toContain('een-lang-genoeg-wachtwoord');
    expect(bcrypt.compareSync('een-lang-genoeg-wachtwoord', (await lees('admin@harmonie.nl')).hash)).toBe(true);
  });

  it('weigert een wachtwoord dat korter is dan de app toestaat', async () => {
    const uitvoer = draai('kort');

    expect(uitvoer.status).not.toBe(0);
    expect((await lees('admin@harmonie.nl')).hash).toBe('oud');
  });

  it('herstelt een ander account op e-mailadres, ongeacht hoofdletters', async () => {
    const uitvoer = draai('een-lang-genoeg-wachtwoord', 'bestuur@voorbeeld.nl');

    expect(uitvoer.status).toBe(0);
    expect(bcrypt.compareSync('een-lang-genoeg-wachtwoord', (await lees('Bestuur@Voorbeeld.nl')).hash)).toBe(true);
    expect((await lees('admin@harmonie.nl')).hash).toBe('oud');
  });

  it('meldt een ontbrekend databasebestand als fout en maakt er geen aan', () => {
    fs.rmSync(dbPad);

    const uitvoer = draai('een-lang-genoeg-wachtwoord');

    expect(uitvoer.status).not.toBe(0);
    expect(uitvoer.stderr).toContain('Database niet te lezen');
    expect(fs.existsSync(dbPad)).toBe(false);
  });

  it('meldt een onbekend e-mailadres als fout en verandert niets', async () => {
    const uitvoer = draai('een-lang-genoeg-wachtwoord', 'niemand@voorbeeld.nl');

    expect(uitvoer.status).not.toBe(0);
    expect((await lees('admin@harmonie.nl')).hash).toBe('oud');
  });
});
