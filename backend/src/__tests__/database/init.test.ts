/**
 * De code die bij een verse installatie draait.
 *
 * Dit is het pad dat iemand raakt die Tutti voor het eerst opzet, en het is
 * eerder stukgegaan: de opstart viel om met "no such table: super_admins",
 * omdat die tabel alleen in een migratie stond en niet in het schema. Dat is
 * precies het soort fout dat niemand ziet zolang er alleen op een bestaande
 * database wordt getest.
 *
 * Deze reeks draait de installatie op een lege database en kijkt na dat hij
 * afloopt, dat hij twee keer draaien overleeft, en dat er daadwerkelijk een
 * werkende beheerder overblijft.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import '../setup';
import db from '../../database/connection';
import { initializeDatabase } from '../../database/init';

/** Hoeveel rijen staan er in deze tabel? */
function aantal(tabel: string): number {
  const rij = db.prepare(`SELECT COUNT(*) as n FROM ${tabel}`).get() as { n: number };
  return rij.n;
}

beforeEach(() => {
  // De installatie schrijft het gegenereerde wachtwoord naar een bestand als
  // ADMIN_INIT_PASSWORD ontbreekt. In een test hoort dat niet te gebeuren, dus
  // zetten we hem.
  process.env.ADMIN_INIT_PASSWORD = 'TestWachtwoord!2026';
  // De installatie praat honderduit; dat hoeft niet in de testuitvoer.
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  delete process.env.ADMIN_INIT_PASSWORD;
  vi.restoreAllMocks();
});

describe('Een verse installatie', () => {
  it('loopt af op een lege database', async () => {
    // Zonder deze test blijft een fout als de ontbrekende super_admins-tabel
    // onopgemerkt tot iemand daadwerkelijk opnieuw installeert.
    await expect(initializeDatabase()).resolves.not.toThrow();
  });

  it('maakt een vereniging, een orkest en een beheerder aan', async () => {
    await initializeDatabase();

    expect(aantal('associations')).toBeGreaterThan(0);
    expect(aantal('orchestras')).toBeGreaterThan(0);

    const admin = db.prepare("SELECT * FROM users WHERE email = 'admin@harmonie.nl'").get() as {
      role: string;
      password_hash: string;
      association_id: string;
    };
    expect(admin).toBeTruthy();
    expect(admin.role).toBe('admin');
    expect(admin.association_id).toBeTruthy();
  });

  it('zet de beheerder ook als hoofdbeheerder klaar', async () => {
    // Dit is de tabel waarop de opstart eerder omviel.
    await initializeDatabase();

    const admin = db.prepare("SELECT id FROM users WHERE email = 'admin@harmonie.nl'").get() as { id: string };
    const hoofd = db.prepare('SELECT * FROM super_admins WHERE user_id = ?').get(admin.id);
    expect(hoofd).toBeTruthy();
  });

  it('maakt een wachtwoord dat echt werkt', async () => {
    await initializeDatabase();

    const admin = db.prepare("SELECT password_hash FROM users WHERE email = 'admin@harmonie.nl'").get() as {
      password_hash: string;
    };

    // Niet alleen dat er een hash staat, maar dat je er ook mee binnenkomt.
    expect(bcrypt.compareSync('TestWachtwoord!2026', admin.password_hash)).toBe(true);
    expect(bcrypt.compareSync('iets anders', admin.password_hash)).toBe(false);
  });

  it('vult de instrumenten en de genres', async () => {
    await initializeDatabase();

    expect(aantal('instruments')).toBeGreaterThan(10);
    expect(aantal('genres')).toBeGreaterThan(0);
  });
});

describe('Een tweede keer installeren', () => {
  it('loopt opnieuw af zonder fout', async () => {
    // Bij elke opstart draait deze code. Een tweede ronde moet dus niets
    // stukmaken.
    await initializeDatabase();
    await expect(initializeDatabase()).resolves.not.toThrow();
  });

  it('verdubbelt de instrumenten niet', async () => {
    await initializeDatabase();
    const naEen = aantal('instruments');

    await initializeDatabase();

    expect(aantal('instruments')).toBe(naEen);
  });

  it('maakt geen tweede beheerder aan', async () => {
    await initializeDatabase();
    await initializeDatabase();

    const admins = db.prepare("SELECT COUNT(*) as n FROM users WHERE email = 'admin@harmonie.nl'").get() as {
      n: number;
    };
    expect(admins.n).toBe(1);
  });

  it('maakt geen tweede vereniging aan', async () => {
    await initializeDatabase();
    const naEen = aantal('associations');

    await initializeDatabase();

    expect(aantal('associations')).toBe(naEen);
  });
});
