/**
 * Het databasebestand is alleen leesbaar voor het serverproces (0600).
 *
 * save() schreef met writeFileSync zonder modus: 0644 na de gebruikelijke
 * umask, en dus leesbaar voor elke gebruiker op de machine. In dat ene bestand
 * staat de hele installatie: leden, wachtwoordhashes, versleutelde geheimen
 * van koppelingen.
 *
 * Zelfde aanpak als connection-echt.test.ts: de echte module, met een eigen
 * bestand in een tijdelijke map.
 */

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

const oorspronkelijkDbPad = process.env.DB_PATH;
let werkmap: string;

async function verseDatabase(bestandsnaam: string): Promise<{ db: any; pad: string }> {
  const pad = path.join(werkmap, bestandsnaam);
  process.env.DB_PATH = pad;
  vi.doUnmock('../../database/connection');
  vi.resetModules();
  const module = await import('../../database/connection');
  return { db: module.default as any, pad };
}

const modus = (pad: string) => fs.statSync(pad).mode & 0o777;

beforeAll(() => {
  werkmap = fs.mkdtempSync(path.join(os.tmpdir(), 'tutti-databasebestand-'));
});

afterAll(() => {
  if (oorspronkelijkDbPad === undefined) {
    delete process.env.DB_PATH;
  } else {
    process.env.DB_PATH = oorspronkelijkDbPad;
  }
  fs.rmSync(werkmap, { recursive: true, force: true });
});

describe('het databasebestand op schijf', () => {
  it('is na het aanmaken alleen leesbaar voor de server', async () => {
    const { db, pad } = await verseDatabase('nieuw.db');
    await db.init();

    expect(modus(pad)).toBe(0o600);
  });

  it('wordt bij het opslaan rechtgezet als het eerder 0644 was', async () => {
    const { db: eerste, pad } = await verseDatabase('bestaand.db');
    await eerste.init();
    fs.chmodSync(pad, 0o644);

    const { db } = await verseDatabase('bestaand.db');
    await db.init();
    db.prepare('CREATE TABLE IF NOT EXISTS proef (id TEXT)').run();
    db.flush();

    expect(modus(pad)).toBe(0o600);
  });
});
