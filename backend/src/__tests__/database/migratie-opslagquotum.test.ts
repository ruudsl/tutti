/**
 * Migratie 20260925200000: opslagquotum.
 *
 * Voegt de grootte toe bij bladmuziek en mp3's, en vult die voor bestaande
 * rijen vanaf schijf. Een bestand dat er niet meer is mag de migratie niet
 * tegenhouden: de grootte blijft dan leeg. Daarnaast de kolom voor de eigen
 * opslaggrens van een vereniging. `down` haalt alle drie weer weg.
 */

import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import '../setup';

const tijdelijk = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeFs = require('fs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeOs = require('os');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodePath = require('path');
  const basis = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), 'tutti-migratie-opslag-'));
  const uploads = nodePath.join(basis, 'uploads');
  const mp3 = nodePath.join(basis, 'mp3');
  nodeFs.mkdirSync(uploads, { recursive: true });
  nodeFs.mkdirSync(mp3, { recursive: true });
  const eerder = { UPLOAD_DIR: process.env.UPLOAD_DIR, MP3_UPLOAD_DIR: process.env.MP3_UPLOAD_DIR };
  process.env.UPLOAD_DIR = uploads;
  process.env.MP3_UPLOAD_DIR = mp3;
  return { eerder, basis: basis as string, uploads: uploads as string, mp3: mp3 as string };
});

import db from '../../database/connection';
import * as migratie from '../../migrations/20260925200000_opslagquotum';
import { createTestAssociation, createTestMusicPiece, TestAssociation } from '../testUtils';

const kolommen = (tabel: string) =>
  (db.prepare(`PRAGMA table_info(${tabel})`).all() as { name: string }[]).map((k) => k.name);

let vereniging: TestAssociation;

beforeEach(() => {
  vereniging = createTestAssociation();
  for (const map of [tijdelijk.uploads, tijdelijk.mp3]) {
    for (const naam of fs.readdirSync(map)) fs.rmSync(path.join(map, naam));
  }
});

afterAll(() => {
  for (const [sleutel, waarde] of Object.entries(tijdelijk.eerder)) {
    if (waarde === undefined) delete process.env[sleutel];
    else process.env[sleutel] = waarde;
  }
  fs.rmSync(tijdelijk.basis, { recursive: true, force: true });
});

describe('migratie opslagquotum', () => {
  it('haalt de kolommen met down weg en zet ze met up terug', () => {
    migratie.down();
    expect(kolommen('music_pieces')).not.toContain('file_size');
    expect(kolommen('music_titles')).not.toContain('mp3_file_size');
    expect(kolommen('associations')).not.toContain('opslag_limiet_bytes');

    migratie.up();
    expect(kolommen('music_pieces')).toContain('file_size');
    expect(kolommen('music_titles')).toContain('mp3_file_size');
    expect(kolommen('associations')).toContain('opslag_limiet_bytes');
  });

  it('vult de grootte vanaf schijf en laat hem leeg als het bestand er niet meer is', () => {
    migratie.down();
    const aanwezig = createTestMusicPiece(vereniging.id, { filePath: 'aanwezig.pdf' });
    const verdwenen = createTestMusicPiece(vereniging.id, { filePath: 'verdwenen.pdf' });
    const ontsnapt = createTestMusicPiece(vereniging.id, { filePath: '../buiten.pdf' });
    fs.writeFileSync(path.join(tijdelijk.uploads, 'aanwezig.pdf'), Buffer.alloc(1234));
    fs.writeFileSync(path.join(tijdelijk.basis, 'buiten.pdf'), Buffer.alloc(99));
    const titel = uuidv4();
    db.prepare('INSERT INTO music_titles (id, title, association_id, mp3_file_path) VALUES (?, ?, ?, ?)').run(
      titel,
      'Mars',
      vereniging.id,
      'mars.mp3',
    );
    fs.writeFileSync(path.join(tijdelijk.mp3, 'mars.mp3'), Buffer.alloc(4321));

    migratie.up();

    const grootte = (id: string) =>
      (db.prepare('SELECT file_size FROM music_pieces WHERE id = ?').get(id) as { file_size: number | null }).file_size;
    expect(grootte(aanwezig.id)).toBe(1234);
    expect(grootte(verdwenen.id)).toBeNull();
    // Een opgeslagen naam die een pad is wordt niet buiten de uploadmap opgezocht.
    expect(grootte(ontsnapt.id)).toBeNull();
    expect(db.prepare('SELECT mp3_file_size FROM music_titles WHERE id = ?').get(titel)).toEqual({
      mp3_file_size: 4321,
    });
    expect(db.prepare('SELECT opslag_limiet_bytes FROM associations WHERE id = ?').get(vereniging.id)).toEqual({
      opslag_limiet_bytes: null,
    });
  });

  it('laat de rijen zelf staan bij heen, terug en weer heen', () => {
    const stuk = createTestMusicPiece(vereniging.id, { filePath: 'partij.pdf' });
    fs.writeFileSync(path.join(tijdelijk.uploads, 'partij.pdf'), Buffer.alloc(10));

    migratie.down();
    migratie.up();
    migratie.down();
    migratie.up();

    expect(db.prepare('SELECT file_path, file_size FROM music_pieces WHERE id = ?').get(stuk.id)).toEqual({
      file_path: 'partij.pdf',
      file_size: 10,
    });
  });

  it('kan twee keer omhoog zonder fout, en overschrijft een bekende grootte niet', () => {
    const stuk = createTestMusicPiece(vereniging.id, { filePath: 'partij.pdf' });
    fs.writeFileSync(path.join(tijdelijk.uploads, 'partij.pdf'), Buffer.alloc(10));
    db.prepare('UPDATE music_pieces SET file_size = 77 WHERE id = ?').run(stuk.id);

    expect(() => migratie.up()).not.toThrow();
    expect(db.prepare('SELECT file_size FROM music_pieces WHERE id = ?').get(stuk.id)).toEqual({ file_size: 77 });
  });
});
