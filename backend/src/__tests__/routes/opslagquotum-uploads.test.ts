/**
 * Het opslagquotum bij het uploaden.
 *
 * Een upload die de opslaggrens van de vereniging overschrijdt krijgt 413 en
 * laat niets achter: geen bestand op schijf en geen rij. Waar het kan wordt
 * dat beslist vóór er iets wordt opgeslagen, op de opgegeven lengte van het
 * verzoek of de opgegeven groottes in een zip; wat daar doorheen glipt wordt
 * na multer alsnog geweigerd en opgeruimd. Het gebruik is per vereniging:
 * wat een andere vereniging opslaat telt niet mee.
 *
 * De uploadmappen van de bladmuziek wijzen naar een tijdelijke map. Audio en
 * wiki schrijven naar een vaste map onder de werkmap; daar wordt alleen
 * opgeruimd wat deze tests er zelf neerleggen.
 */

import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import fs from 'fs';
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
  const basis = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), 'tutti-opslagquotum-'));
  const uploads = nodePath.join(basis, 'uploads');
  const mp3 = nodePath.join(basis, 'mp3');
  const musicxml = nodePath.join(basis, 'musicxml');
  for (const map of [uploads, mp3, musicxml]) nodeFs.mkdirSync(map, { recursive: true });
  const eerder = {
    UPLOAD_DIR: process.env.UPLOAD_DIR,
    MP3_UPLOAD_DIR: process.env.MP3_UPLOAD_DIR,
    MUSICXML_UPLOAD_DIR: process.env.MUSICXML_UPLOAD_DIR,
  };
  process.env.UPLOAD_DIR = uploads;
  process.env.MP3_UPLOAD_DIR = mp3;
  process.env.MUSICXML_UPLOAD_DIR = musicxml;
  return { eerder, basis: basis as string, uploads: uploads as string, mp3: mp3 as string };
});

import db from '../../database/connection';
import musicPiecesRoutes from '../../routes/music-pieces';
import audioRecordingsRoutes from '../../routes/audio-recordings';
import wikiRoutes from '../../routes/wiki';
import settingsRoutes from '../../routes/settings';
import multiAssociationRoutes from '../../routes/multi-association';
import { errorHandler } from '../../middleware/errorHandler';
import { opslagLimiet } from '../../services/abonnementLimieten';
import {
  createTestAssociation,
  createTestEnvironment,
  createTestMusicPiece,
  createTestUser,
  generateTestToken,
  TestAssociation,
} from '../testUtils';

const app = express();
app.use(express.json());
app.use('/api/music-pieces', musicPiecesRoutes);
app.use('/api/audio-recordings', audioRecordingsRoutes);
app.use('/api/wiki', wikiRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/multi-association', multiAssociationRoutes);
app.use(errorHandler);

const opnameMap = path.join(process.cwd(), 'uploads', 'recordings');
const wikiMap = path.join(process.cwd(), 'uploads', 'wiki');

/** Een pdf van precies `bytes` bytes, met een echte pdf-kop. */
function pdf(bytes: number): Buffer {
  const kop = Buffer.from('%PDF-1.4\n', 'latin1');
  return Buffer.concat([kop, Buffer.alloc(Math.max(0, bytes - kop.length), 0x20)]);
}

/** Wat er nu in een map staat (alleen bestanden). */
function inhoud(map: string): string[] {
  if (!fs.existsSync(map)) return [];
  return fs.readdirSync(map).filter((naam) => fs.statSync(path.join(map, naam)).isFile());
}

function leegMap(map: string): void {
  for (const naam of inhoud(map)) fs.rmSync(path.join(map, naam), { force: true });
}

const eerderGrens = process.env.STORAGE_QUOTA_BYTES;
function zetGrens(bytes: number | undefined): void {
  if (bytes === undefined) delete process.env.STORAGE_QUOTA_BYTES;
  else process.env.STORAGE_QUOTA_BYTES = String(bytes);
}

/** Een stuk dat al opgeslagen staat, met alleen de grootte in de database. */
function bestaandStuk(associationId: string, bytes: number): void {
  const stuk = createTestMusicPiece(associationId);
  db.prepare('UPDATE music_pieces SET file_size = ? WHERE id = ?').run(bytes, stuk.id);
}

const stukkenVan = (associationId: string) =>
  db.prepare('SELECT file_path, file_size FROM music_pieces WHERE association_id = ?').all(associationId) as {
    file_path: string;
    file_size: number | null;
  }[];

describe('opslagquotum bij het uploaden', () => {
  let vereniging: TestAssociation;
  let andere: TestAssociation;
  let beheerderToken: string;
  let lidToken: string;
  let beheerderId: string;
  let andereBeheerderToken: string;
  let opnamesVooraf: Set<string>;
  let wikiVooraf: Set<string>;

  beforeEach(() => {
    const omgeving = createTestEnvironment();
    vereniging = omgeving.association;
    beheerderToken = omgeving.adminToken;
    beheerderId = omgeving.adminUser.id;
    lidToken = omgeving.memberToken;
    andere = createTestAssociation({ name: 'Fanfare elders' });
    andereBeheerderToken = generateTestToken(createTestUser(andere.id, { email: 'beheer@elders.nl', role: 'admin' }));
    leegMap(tijdelijk.uploads);
    leegMap(tijdelijk.mp3);
    opnamesVooraf = new Set(inhoud(opnameMap));
    wikiVooraf = new Set(inhoud(wikiMap));
    zetGrens(undefined);
  });

  afterEach(() => {
    zetGrens(eerderGrens);
    for (const [map, vooraf] of [
      [opnameMap, opnamesVooraf],
      [wikiMap, wikiVooraf],
    ] as const) {
      for (const naam of inhoud(map)) if (!vooraf.has(naam)) fs.rmSync(path.join(map, naam), { force: true });
    }
  });

  afterAll(() => {
    for (const [sleutel, waarde] of Object.entries(tijdelijk.eerder)) {
      if (waarde === undefined) delete process.env[sleutel];
      else process.env[sleutel] = waarde;
    }
    fs.rmSync(tijdelijk.basis, { force: true, recursive: true });
  });

  const uploadPdf = (inhoudBestand: Buffer, token = beheerderToken) =>
    request(app)
      .post('/api/music-pieces/upload')
      .set('Authorization', `Bearer ${token}`)
      .attach('files', inhoudBestand, { filename: 'Mars_Arr_Trompet.pdf', contentType: 'application/pdf' });

  describe('bladmuziek', () => {
    it('weigert vooraf met 413 als de opgegeven lengte al niet past, en slaat niets op', async () => {
      zetGrens(1000);

      const antwoord = await uploadPdf(pdf(200 * 1024));

      expect(antwoord.status).toBe(413);
      expect(antwoord.body.code).toBe('OPSLAGLIMIET_BEREIKT');
      expect(antwoord.body.error).toContain('opslaglimiet');
      expect(inhoud(tijdelijk.uploads)).toEqual([]);
      expect(stukkenVan(vereniging.id)).toEqual([]);
    });

    it('weigert ook wat vooraf nog leek te passen, en haalt het bestand weer van schijf', async () => {
      // De opgegeven lengte valt binnen de marge voor de multipart-omhulling;
      // pas de werkelijke grootte uit multer laat zien dat het niet past.
      zetGrens(5000);
      bestaandStuk(vereniging.id, 3000);

      const antwoord = await uploadPdf(pdf(2500));

      expect(antwoord.status).toBe(413);
      expect(antwoord.body.code).toBe('OPSLAGLIMIET_BEREIKT');
      expect(inhoud(tijdelijk.uploads)).toEqual([]);
      expect(stukkenVan(vereniging.id)).toHaveLength(1);
    });

    it('slaat op wat onder de grens blijft, met de grootte erbij', async () => {
      zetGrens(1024 * 1024);

      const antwoord = await uploadPdf(pdf(2000));

      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(201);
      const [stuk] = stukkenVan(vereniging.id);
      expect(stuk.file_size).toBe(2000);
      expect(fs.statSync(path.join(tijdelijk.uploads, stuk.file_path)).size).toBe(2000);
    });

    it('telt wat een andere vereniging opslaat niet mee', async () => {
      zetGrens(10_000);
      bestaandStuk(andere.id, 9_999_999);

      const antwoord = await uploadPdf(pdf(2000));

      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(201);
    });

    it('weigert de ene vereniging terwijl de andere nog ruimte heeft', async () => {
      zetGrens(10_000);
      bestaandStuk(vereniging.id, 9_000);

      expect((await uploadPdf(pdf(2000))).status).toBe(413);
      expect((await uploadPdf(pdf(2000), andereBeheerderToken)).status).toBe(201);
    });

    it('werkt zonder grens zoals altijd', async () => {
      bestaandStuk(vereniging.id, 50 * 1024 ** 3);

      const antwoord = await uploadPdf(pdf(2000));

      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(201);
    });

    it('volgt een onbeperkte eigen grens van de super-admin, ook met een standaardgrens', async () => {
      zetGrens(1000);
      db.prepare('UPDATE associations SET opslag_limiet_bytes = 0 WHERE id = ?').run(vereniging.id);

      expect((await uploadPdf(pdf(2000))).status).toBe(201);
    });
  });

  describe('bladmuziek uit een zip', () => {
    const importeer = (zip: AdmZip) =>
      request(app)
        .post('/api/music-pieces/upload-zip')
        .set('Authorization', `Bearer ${beheerderToken}`)
        .attach('file', zip.toBuffer(), 'partijen.zip');

    it('weigert op de opgegeven groottes in de zip, vóór het uitpakken', async () => {
      zetGrens(5000);
      const zip = new AdmZip();
      zip.addFile('Mars - Trompet 1.pdf', pdf(3000));
      zip.addFile('Mars - Trompet 2.pdf', pdf(3000));

      const antwoord = await importeer(zip);

      expect(antwoord.status).toBe(413);
      expect(antwoord.body.code).toBe('OPSLAGLIMIET_BEREIKT');
      // Geen partijen, en de tijdelijke zip is ook weer weg.
      expect(inhoud(tijdelijk.uploads)).toEqual([]);
      expect(stukkenVan(vereniging.id)).toEqual([]);
    });

    it('slaat de partijen op met hun grootte als het past', async () => {
      zetGrens(10_000);
      const zip = new AdmZip();
      zip.addFile('Mars - Trompet 1.pdf', pdf(3000));

      const antwoord = await importeer(zip);

      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(201);
      expect(stukkenVan(vereniging.id).map((s) => s.file_size)).toEqual([3000]);
    });
  });

  describe('mp3 bij een titel', () => {
    let titelId: string;

    beforeEach(() => {
      titelId = uuidv4();
      db.prepare('INSERT INTO music_titles (id, title, association_id) VALUES (?, ?, ?)').run(
        titelId,
        'Mars der Medici',
        vereniging.id,
      );
    });

    const uploadMp3 = (bytes: number) =>
      request(app)
        .post(`/api/music-pieces/title-mp3/${titelId}`)
        .set('Authorization', `Bearer ${beheerderToken}`)
        .attach('mp3', Buffer.alloc(bytes, 0x11), { filename: 'mars.mp3', contentType: 'audio/mpeg' });

    it('bewaart de grootte en weigert een tweede die er niet meer bij past', async () => {
      zetGrens(5000);
      bestaandStuk(vereniging.id, 3000);

      expect((await uploadMp3(1500)).status).toBe(200);
      expect(db.prepare('SELECT mp3_file_size FROM music_titles WHERE id = ?').get(titelId)).toEqual({
        mp3_file_size: 1500,
      });

      // Een andere titel: die vervangt niets, dus 3000 + 1500 + 1500 past niet.
      const andereTitel = uuidv4();
      db.prepare('INSERT INTO music_titles (id, title, association_id) VALUES (?, ?, ?)').run(
        andereTitel,
        'Florentiner',
        vereniging.id,
      );
      const antwoord = await request(app)
        .post(`/api/music-pieces/title-mp3/${andereTitel}`)
        .set('Authorization', `Bearer ${beheerderToken}`)
        .attach('mp3', Buffer.alloc(1500, 0x11), { filename: 'florentiner.mp3', contentType: 'audio/mpeg' });
      expect(antwoord.status).toBe(413);
      expect(inhoud(tijdelijk.mp3)).toHaveLength(1);
    });

    it('rekent bij vervangen met de ruimte die de oude mp3 vrijmaakt', async () => {
      zetGrens(5000);
      bestaandStuk(vereniging.id, 1000);
      expect((await uploadMp3(3500)).status).toBe(200);

      // 1000 + 3500 staat er; een nieuwe van 3800 past alleen omdat de oude weggaat.
      const antwoord = await uploadMp3(3800);

      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);
      expect(inhoud(tijdelijk.mp3)).toHaveLength(1);
      expect(db.prepare('SELECT mp3_file_size FROM music_titles WHERE id = ?').get(titelId)).toEqual({
        mp3_file_size: 3800,
      });
    });

    it('vergeet de grootte als de mp3 wordt verwijderd', async () => {
      await uploadMp3(1500);

      await request(app)
        .delete(`/api/music-pieces/title-mp3/${titelId}`)
        .set('Authorization', `Bearer ${beheerderToken}`);

      expect(db.prepare('SELECT mp3_file_size FROM music_titles WHERE id = ?').get(titelId)).toEqual({
        mp3_file_size: null,
      });
    });
  });

  describe('audio-opnames en wiki-bijlagen', () => {
    /** WebM/Matroska EBML-kop; isAudio() herkent dit als audio. */
    const webm = (bytes: number) =>
      Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(bytes - 4, 0x11)]);

    it('weigert een opname die er niet meer bij past, zonder bestand of rij achter te laten', async () => {
      zetGrens(5000);
      bestaandStuk(vereniging.id, 4000);

      const antwoord = await request(app)
        .post('/api/audio-recordings')
        .set('Authorization', `Bearer ${lidToken}`)
        .field('title', 'Repetitie')
        .attach('audio', webm(2000), { filename: 'repetitie.webm', contentType: 'audio/webm' });

      expect(antwoord.status).toBe(413);
      expect(inhoud(opnameMap).filter((naam) => !opnamesVooraf.has(naam))).toEqual([]);
      expect(db.prepare('SELECT COUNT(*) AS n FROM audio_recordings').get()).toEqual({ n: 0 });
    });

    it('slaat een opname op die past', async () => {
      zetGrens(5000);

      const antwoord = await request(app)
        .post('/api/audio-recordings')
        .set('Authorization', `Bearer ${lidToken}`)
        .field('title', 'Repetitie')
        .attach('audio', webm(2000), { filename: 'repetitie.webm', contentType: 'audio/webm' });

      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(201);
    });

    it('weigert een wiki-bijlage die er niet meer bij past', async () => {
      zetGrens(5000);
      bestaandStuk(vereniging.id, 4000);
      db.prepare(
        'INSERT INTO wiki_pages (id, association_id, slug, title, content, created_by) VALUES (?, ?, ?, ?, ?, ?)',
      ).run(uuidv4(), vereniging.id, 'huisregels', 'Huisregels', '', beheerderId);

      const antwoord = await request(app)
        .post('/api/wiki/huisregels/attachments')
        .set('Authorization', `Bearer ${beheerderToken}`)
        .attach('file', Buffer.alloc(2000, 0x41), { filename: 'regels.txt', contentType: 'text/plain' });

      expect(antwoord.status).toBe(413);
      expect(inhoud(wikiMap).filter((naam) => !wikiVooraf.has(naam))).toEqual([]);
      expect(db.prepare('SELECT COUNT(*) AS n FROM wiki_attachments').get()).toEqual({ n: 0 });
    });
  });

  describe('het beheerscherm', () => {
    const opslag = (token: string) => request(app).get('/api/settings/opslag').set('Authorization', `Bearer ${token}`);

    it('geeft de beheerder het gebruik van de eigen vereniging tegenover de grens', async () => {
      zetGrens(10_000);
      bestaandStuk(vereniging.id, 2500);
      bestaandStuk(andere.id, 7777);

      const antwoord = await opslag(beheerderToken);

      expect(antwoord.status).toBe(200);
      expect(antwoord.body.limiet).toBe(10_000);
      expect(antwoord.body.gebruik.totaal).toBe(2500);
      expect(antwoord.body.gebruik.bladmuziek).toBe(2500);
    });

    it('meldt geen grens als er geen is', async () => {
      const antwoord = await opslag(beheerderToken);
      expect(antwoord.body.limiet).toBeNull();
    });

    it('is niet voor een gewoon lid', async () => {
      expect((await opslag(lidToken)).status).toBe(403);
    });
  });

  describe('de eigen grens van de super-admin', () => {
    let superToken: string;

    beforeEach(() => {
      const superAdmin = createTestUser(vereniging.id, { email: 'super@test.nl', role: 'admin' });
      db.prepare('INSERT INTO super_admins (id, user_id) VALUES (?, ?)').run(uuidv4(), superAdmin.id);
      superToken = generateTestToken(superAdmin);
    });

    const zet = (body: Record<string, unknown>, token = superToken) =>
      request(app)
        .put(`/api/multi-association/super-admin/associations/${andere.id}/subscription`)
        .set('Authorization', `Bearer ${token}`)
        .send(body);

    it('zet de grens per vereniging, en haalt hem met null weer weg', async () => {
      zetGrens(1000);

      expect((await zet({ opslagLimietBytes: 5_000_000 })).status).toBe(200);
      expect(opslagLimiet(andere.id)).toBe(5_000_000);
      expect(opslagLimiet(vereniging.id)).toBe(1000);

      // Zonder het veld blijft hij staan.
      expect((await zet({ subscriptionTier: 'pro' })).status).toBe(200);
      expect(opslagLimiet(andere.id)).toBe(5_000_000);

      expect((await zet({ opslagLimietBytes: null })).status).toBe(200);
      expect(opslagLimiet(andere.id)).toBe(1000);
    });

    it('weigert een negatieve grens', async () => {
      expect((await zet({ opslagLimietBytes: -1 })).status).toBe(400);
    });

    it('is niet voor de beheerder van een vereniging', async () => {
      expect((await zet({ opslagLimietBytes: 0 }, beheerderToken)).status).toBe(403);
    });
  });
});
