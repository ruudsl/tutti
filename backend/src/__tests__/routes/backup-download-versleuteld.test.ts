/**
 * De reservekopie als download is versleuteld zodra ENCRYPTION_SECRET er staat.
 *
 * De automatische kopieën op de server waren al versleuteld; de download uit
 * het beheerscherm - de hele installatie: database en uploads van elke
 * vereniging - ging nog als leesbare zip over de lijn en belandde zo op de
 * laptop van de beheerder. Nu is het een `.zip.enc` in hetzelfde formaat als
 * de automatische kopieën (TUTTI-ENC1), zodat `npm run backup:ontsleutel` er
 * ook op werkt, en neemt het terugzetten zowel die als een oude gewone zip aan.
 *
 * Alle paden wijzen naar een tijdelijke map, net als in backup-inhoud.test.ts.
 */

import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import AdmZip from 'adm-zip';
import { v4 as uuidv4 } from 'uuid';
import '../setup';

const tijdelijk = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeFs = require('fs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeOs = require('os');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodePath = require('path');
  const basis = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), 'tutti-backup-versleuteld-'));
  const uploads = nodePath.join(basis, 'uploads');
  const mp3 = nodePath.join(uploads, 'mp3');
  const backups = nodePath.join(basis, 'backups');
  nodeFs.mkdirSync(mp3, { recursive: true });
  nodeFs.mkdirSync(backups, { recursive: true });
  const eerder = {
    UPLOAD_DIR: process.env.UPLOAD_DIR,
    MP3_UPLOAD_DIR: process.env.MP3_UPLOAD_DIR,
    BACKUP_DIR: process.env.BACKUP_DIR,
    ENCRYPTION_SECRET: process.env.ENCRYPTION_SECRET,
  };
  process.env.UPLOAD_DIR = uploads;
  process.env.MP3_UPLOAD_DIR = mp3;
  process.env.BACKUP_DIR = backups;
  return {
    eerder,
    basis: basis as string,
    uploads: uploads as string,
    mp3: mp3 as string,
    backups: backups as string,
    databasePad: nodePath.join(basis, 'harmonie.db') as string,
  };
});

vi.mock('../../config', async (importOriginal) => {
  const echt = (await importOriginal()) as { default: Record<string, unknown>; config: Record<string, unknown> };
  return {
    ...echt,
    default: { ...echt.default, dbPath: tijdelijk.databasePad },
    config: { ...echt.config, dbPath: tijdelijk.databasePad },
  };
});

import db from '../../database/connection';
import backupRoutes from '../../routes/backup';
import { errorHandler } from '../../middleware/errorHandler';
import { isVersleuteldBestand, ontsleutelBuffer, versleutelBuffer } from '../../utils/encryption';
import { ontsleutelBackupbestand } from '../../scripts/ontsleutel-backup';
import { createTestEnvironment, createTestMusicPiece, createTestUser, generateTestToken } from '../testUtils';

const app = express();
app.use(express.json());
app.use('/api/backup', backupRoutes);
app.use(errorHandler);

(db as unknown as Record<string, unknown>).flush = vi.fn();
(db as unknown as Record<string, unknown>).reload = vi.fn().mockResolvedValue(undefined);

const SLEUTEL = 'sleutel-voor-de-reservekopie-in-deze-test-0123456789';
const ANDERE_SLEUTEL = 'een-heel-andere-sleutel-van-een-andere-installatie-987';

const SQLITE_KOP = Buffer.from('SQLite format 3\0', 'latin1');
const nepDatabase = (merk: string) => Buffer.concat([SQLITE_KOP, Buffer.from(merk.padEnd(64, ' '), 'utf-8')]);

function zetSleutel(waarde: string | undefined): void {
  if (waarde === undefined) delete process.env.ENCRYPTION_SECRET;
  else process.env.ENCRYPTION_SECRET = waarde;
}

function leegMap(map: string): void {
  for (const naam of fs.readdirSync(map)) {
    const pad = path.join(map, naam);
    if (pad === tijdelijk.mp3) {
      leegMap(pad);
      continue;
    }
    fs.rmSync(pad, { force: true, recursive: true });
  }
}

/** Een binair antwoord van supertest als Buffer. */
function alsBuffer(res: request.Response, callback: (err: Error | null, body: Buffer) => void): void {
  const delen: Buffer[] = [];
  res.on('data', (deel: Buffer) => delen.push(deel));
  res.on('end', () => callback(null, Buffer.concat(delen)));
}

describe('versleutelde reservekopie als download', () => {
  let superAdminToken: string;
  let verenigingId: string;

  beforeEach(() => {
    const omgeving = createTestEnvironment();
    verenigingId = omgeving.association.id;
    const superAdmin = createTestUser(verenigingId, { email: 'super@test.nl', role: 'admin' });
    superAdminToken = generateTestToken(superAdmin);
    db.prepare('INSERT INTO super_admins (id, user_id) VALUES (?, ?)').run(uuidv4(), superAdmin.id);

    leegMap(tijdelijk.uploads);
    leegMap(tijdelijk.backups);
    fs.rmSync(tijdelijk.databasePad, { force: true });
    zetSleutel(SLEUTEL);
  });

  afterEach(() => {
    zetSleutel(tijdelijk.eerder.ENCRYPTION_SECRET);
  });

  afterAll(() => {
    for (const [sleutel, waarde] of Object.entries(tijdelijk.eerder)) {
      if (waarde === undefined) delete process.env[sleutel];
      else process.env[sleutel] = waarde;
    }
    fs.rmSync(tijdelijk.basis, { force: true, recursive: true });
  });

  const download = () =>
    request(app).get('/api/backup').set('Authorization', `Bearer ${superAdminToken}`).buffer(true).parse(alsBuffer);

  const terugzetten = (inhoud: Buffer, naam: string) =>
    request(app)
      .post('/api/backup/restore')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .attach('backup', inhoud, naam);

  function legInhoudNeer(): void {
    fs.writeFileSync(tijdelijk.databasePad, nepDatabase('geheime ledenlijst van alle verenigingen'));
    createTestMusicPiece(verenigingId, { filePath: 'opgeslagen.pdf', originalFilename: 'Mars der Medici.pdf' });
    fs.writeFileSync(path.join(tijdelijk.uploads, 'opgeslagen.pdf'), 'bladmuziek van de vereniging');
  }

  describe('downloaden', () => {
    it('geeft een versleuteld .zip.enc-bestand dat zich tot de zip laat ontsleutelen', async () => {
      legInhoudNeer();

      const antwoord = await download();

      expect(antwoord.status).toBe(200);
      expect(antwoord.headers['content-disposition']).toMatch(/harmonie-backup-\d{4}-\d{2}-\d{2}T[\d-]+\.zip\.enc"/);
      expect(antwoord.headers['content-type']).toContain('application/octet-stream');

      const inhoud = antwoord.body as Buffer;
      expect(Number(antwoord.headers['content-length'])).toBe(inhoud.length);
      expect(isVersleuteldBestand(inhoud)).toBe(true);
      // Niets leesbaars onderweg: geen zipkop, geen bestandsnamen, geen inhoud.
      expect(inhoud.subarray(0, 2).toString('latin1')).not.toBe('PK');
      expect(inhoud.toString('latin1')).not.toContain('manifest.json');
      expect(inhoud.toString('latin1')).not.toContain('Mars der Medici');

      const zip = new AdmZip(ontsleutelBuffer(inhoud));
      expect(zip.getEntry('database/harmonie.db')!.getData().toString('utf-8')).toContain(
        'geheime ledenlijst van alle verenigingen',
      );
      expect(zip.getEntry('uploads/Mars der Medici.pdf')!.getData().toString('utf-8')).toBe(
        'bladmuziek van de vereniging',
      );
      expect(zip.getEntry('manifest.json')).toBeTruthy();
    });

    it('is met het bestaande ontsleutelcommando tot een zip terug te brengen', async () => {
      legInhoudNeer();
      const antwoord = await download();
      const bron = path.join(tijdelijk.basis, 'harmonie-backup-test.zip.enc');
      fs.writeFileSync(bron, antwoord.body as Buffer);

      const doel = ontsleutelBackupbestand(bron);

      expect(doel).toBe(path.join(tijdelijk.basis, 'harmonie-backup-test.zip'));
      const zip = new AdmZip(fs.readFileSync(doel));
      expect(zip.getEntry('uploads/Mars der Medici.pdf')).toBeTruthy();
      fs.rmSync(bron);
      fs.rmSync(doel);
    });

    it('laat de download zonder eigen sleutel een gewone zip, zoals bij lokaal ontwikkelen', async () => {
      zetSleutel(undefined);
      legInhoudNeer();

      const antwoord = await download();

      expect(antwoord.status).toBe(200);
      expect(antwoord.headers['content-disposition']).toMatch(/\.zip"$/);
      expect(antwoord.headers['content-type']).toContain('application/zip');
      expect(isVersleuteldBestand(antwoord.body as Buffer)).toBe(false);
      expect(new AdmZip(antwoord.body as Buffer).getEntry('manifest.json')).toBeTruthy();
    });

    it('meldt in de omvangsopgave of de download versleuteld is', async () => {
      const met = await request(app).get('/api/backup/info').set('Authorization', `Bearer ${superAdminToken}`);
      expect(met.body.encrypted).toBe(true);

      zetSleutel(undefined);
      const zonder = await request(app).get('/api/backup/info').set('Authorization', `Bearer ${superAdminToken}`);
      expect(zonder.body.encrypted).toBe(false);
    });

    it('laat geen tijdelijk bestand achter', async () => {
      // Alleen de mappen die de route zelf maakt (mkdtemp plakt er zes tekens
      // achter), niet de testmappen van dit en andere bestanden.
      const vanDeRoute = () => fs.readdirSync(os.tmpdir()).filter((n) => /^tutti-backup-[A-Za-z0-9]{6}$/.test(n));
      const voor = vanDeRoute();
      legInhoudNeer();

      await download();

      // Het opruimen gebeurt direct nadat het laatste byte de deur uit is; de
      // client kan het antwoord net iets eerder binnen hebben.
      await vi.waitFor(() => expect(vanDeRoute().sort()).toEqual(voor.sort()));
    });
  });

  describe('terugzetten', () => {
    it('neemt de versleutelde download aan en zet hem terug', async () => {
      legInhoudNeer();
      const versleuteld = (await download()).body as Buffer;
      // Daarna verandert er iets op de installatie; terugzetten brengt de
      // toestand van de download terug.
      fs.writeFileSync(tijdelijk.databasePad, nepDatabase('later gewijzigd'));
      fs.rmSync(path.join(tijdelijk.uploads, 'opgeslagen.pdf'));

      const antwoord = await terugzetten(versleuteld, 'harmonie-backup-2026-09-25T10-00-00.zip.enc');

      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);
      expect(antwoord.body.restored).toEqual({ database: true, pdfFiles: 1, mp3Files: 0 });
      expect(fs.readFileSync(tijdelijk.databasePad).toString('utf-8')).toContain(
        'geheime ledenlijst van alle verenigingen',
      );
      expect(fs.readFileSync(path.join(tijdelijk.uploads, 'opgeslagen.pdf'), 'utf-8')).toBe(
        'bladmuziek van de vereniging',
      );
    });

    it('neemt een oude gewone zip nog steeds aan, ook met een sleutel ingesteld', async () => {
      const zip = new AdmZip();
      zip.addFile('uploads/Partij.pdf', Buffer.from('partij'));

      const antwoord = await terugzetten(zip.toBuffer(), 'harmonie-backup-oud.zip');

      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);
      expect(antwoord.body.restored.pdfFiles).toBe(1);
    });

    it('weigert een versleutelde kopie van een installatie met een andere sleutel, en raakt niets aan', async () => {
      zetSleutel(ANDERE_SLEUTEL);
      const zip = new AdmZip();
      zip.addFile('database/harmonie.db', nepDatabase('van elders'));
      const vanElders = versleutelBuffer(zip.toBuffer());
      zetSleutel(SLEUTEL);
      fs.writeFileSync(tijdelijk.databasePad, nepDatabase('de eigen database'));

      const antwoord = await terugzetten(vanElders, 'elders.zip.enc');

      expect(antwoord.status).toBe(400);
      expect(antwoord.body.error).toContain('ENCRYPTION_SECRET');
      expect(fs.readFileSync(tijdelijk.databasePad).toString('utf-8')).toContain('de eigen database');
      expect(fs.existsSync(path.join(tijdelijk.backups, 'pre-restore'))).toBe(false);
    });

    it('weigert een versleutelde kopie als deze installatie geen eigen sleutel heeft', async () => {
      const versleuteld = versleutelBuffer(new AdmZip().toBuffer());
      zetSleutel(undefined);

      const antwoord = await terugzetten(versleuteld, 'backup.zip.enc');

      expect(antwoord.status).toBe(400);
    });
  });
});
