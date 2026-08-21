/**
 * Toegang tot bladmuziek: de grenzen rond partijen, lijsten en geluidsbestanden.
 *
 * Bladmuziek is het enige onderdeel van Tutti waar een gewoon lid bestanden
 * ophaalt. GET /music-pieces/:id/download legt de regel vast die overal hoort
 * te gelden: het stuk moet van de eigen vereniging zijn, en een gewoon lid moet
 * het instrument bespelen. De dirigentenpartituur staat in dezelfde tabel als
 * de trompetpartij; alleen dat tweede filter houdt hem uit handen van het lid.
 *
 * Deze suite legt die regel vast op de ingangen die hem misten: de twee
 * batch-exports, het geluidsfragment bij een titel, en de lijst met eigen
 * partijen. Daarnaast staat hier de grens bij het uploaden: een lijst-id uit de
 * body van een verzoek is een verwijzing van de gebruiker en moet net zo
 * gecontroleerd worden als een id in het pad.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import app from '../testApp';
import {
  createTestAssociation,
  createTestEnvironment,
  createTestInstrument,
  createTestMusicPiece,
  createTestOrchestra,
  createTestUser,
  generateTestToken,
  addInstrumentToUser,
  addUserToOrchestra,
  TestAssociation,
  TestInstrument,
  TestOrchestra,
  TestUser,
} from '../testUtils';

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '../../../uploads');
const MP3_UPLOAD_DIR = process.env.MP3_UPLOAD_DIR || path.join(__dirname, '../../../uploads/mp3');

/** Het kleinst mogelijke geldige pdf-bestand; de upload controleert de magic bytes. */
const MINIMALE_PDF = Buffer.from(
  '%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
    '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 99 99]>>endobj\n' +
    'trailer<</Root 1 0 R>>\n',
  'utf-8',
);

describe('toegang tot bladmuziek', () => {
  let vereniging: TestAssociation;
  let beheerderToken: string;
  let lid: TestUser;
  let lidToken: string;
  let trompet: TestInstrument;
  let dirigent: TestInstrument;
  let orkest: TestOrchestra;

  let andere: TestAssociation;
  let andereBeheerderToken: string;

  const aangemaakteBestanden: string[] = [];

  beforeEach(() => {
    const omgeving = createTestEnvironment();
    vereniging = omgeving.association;
    beheerderToken = omgeving.adminToken;
    lid = omgeving.memberUser;
    lidToken = omgeving.memberToken;

    trompet = createTestInstrument({ name: 'Trompet' });
    dirigent = createTestInstrument({ name: 'Dirigent' });
    addInstrumentToUser(lid.id, trompet.id);

    orkest = createTestOrchestra(vereniging.id);
    addUserToOrchestra(lid.id, orkest.id);

    andere = createTestAssociation({ name: 'Andere vereniging' });
    andereBeheerderToken = generateTestToken(
      createTestUser(andere.id, { email: `elders-${uuidv4()}@test.nl`, role: 'admin' }),
    );
  });

  afterEach(() => {
    for (const pad of aangemaakteBestanden.splice(0)) {
      if (fs.existsSync(pad)) fs.unlinkSync(pad);
    }
  });

  /** Legt een echt bestand in de uploadmap; zonder bestand blijft een zip leeg. */
  function legBestandNeer(map: string, bestandsnaam: string, inhoud: Buffer): string {
    if (!fs.existsSync(map)) fs.mkdirSync(map, { recursive: true });
    const pad = path.join(map, bestandsnaam);
    fs.writeFileSync(pad, inhoud);
    aangemaakteBestanden.push(pad);
    return pad;
  }

  /** Maakt een partij met een echt pdf-bestand erachter. */
  function maakPartij(associationId: string, titel: string, instrumentId: string | null) {
    const bestandsnaam = `test-${uuidv4()}.pdf`;
    legBestandNeer(UPLOAD_DIR, bestandsnaam, MINIMALE_PDF);
    return createTestMusicPiece(associationId, {
      title: titel,
      instrumentId,
      filePath: bestandsnaam,
      originalFilename: bestandsnaam,
    });
  }

  const als = (token: string, methode: 'get' | 'post' | 'put', pad: string) =>
    request(app)[methode](`/api/music-pieces${pad}`).set('Authorization', `Bearer ${token}`);

  /** De titels in een geexporteerde zip, gelezen uit metadata.json. */
  function geexporteerdeTitels(body: Buffer): string[] {
    const zip = new AdmZip(body);
    const meta = zip.getEntry('metadata.json');
    if (!meta) return [];
    return (JSON.parse(meta.getData().toString('utf8')) as { title: string }[]).map((m) => m.title);
  }

  describe('batch-export', () => {
    it('geeft een lid alleen de partijen van zijn eigen instrument', async () => {
      const mijn = maakPartij(vereniging.id, 'Mars der Medici', trompet.id);
      const partituur = maakPartij(vereniging.id, 'Partituur', dirigent.id);

      const antwoord = await als(lidToken, 'post', '/batch-export')
        .responseType('blob')
        .send({ pieceIds: [mijn.id, partituur.id] });

      expect(antwoord.status).toBe(200);
      expect(geexporteerdeTitels(antwoord.body)).toEqual(['Mars der Medici']);
    });

    it('geeft een lid de dirigentenpartituur niet', async () => {
      const partituur = maakPartij(vereniging.id, 'Partituur', dirigent.id);

      const antwoord = await als(lidToken, 'post', '/batch-export').send({ pieceIds: [partituur.id] });

      expect(antwoord.status).toBe(404);
    });

    it('geeft de muziekcommissie wel alles', async () => {
      const mijn = maakPartij(vereniging.id, 'Mars der Medici', trompet.id);
      const partituur = maakPartij(vereniging.id, 'Partituur', dirigent.id);

      const antwoord = await als(beheerderToken, 'post', '/batch-export')
        .responseType('blob')
        .send({ pieceIds: [mijn.id, partituur.id] });

      expect(antwoord.status).toBe(200);
      expect(geexporteerdeTitels(antwoord.body).sort()).toEqual(['Mars der Medici', 'Partituur']);
    });

    it('exporteert niets van een andere vereniging', async () => {
      const hun = maakPartij(andere.id, 'Van de buren', trompet.id);

      const antwoord = await als(beheerderToken, 'post', '/batch-export').send({ pieceIds: [hun.id] });

      expect(antwoord.status).toBe(404);
    });
  });

  describe('batch-export-by-title', () => {
    it('geeft een lid alleen de partijen van zijn eigen instrument', async () => {
      maakPartij(vereniging.id, 'Mars der Medici', trompet.id);
      maakPartij(vereniging.id, 'Mars der Medici', dirigent.id);

      const antwoord = await als(lidToken, 'post', '/batch-export-by-title')
        .responseType('blob')
        .send({ title: 'Mars der Medici' });

      expect(antwoord.status).toBe(200);
      // Beide partijen dragen dezelfde titel; alleen het aantal verraadt of de
      // partituur is meegegaan.
      expect(geexporteerdeTitels(antwoord.body)).toHaveLength(1);
    });

    it('geeft een lid niets als hij geen enkele partij van de titel speelt', async () => {
      maakPartij(vereniging.id, 'Partituur', dirigent.id);

      const antwoord = await als(lidToken, 'post', '/batch-export-by-title').send({ title: 'Partituur' });

      expect(antwoord.status).toBe(404);
    });

    it('geeft de muziekcommissie alle partijen van de titel', async () => {
      maakPartij(vereniging.id, 'Mars der Medici', trompet.id);
      maakPartij(vereniging.id, 'Mars der Medici', dirigent.id);

      const antwoord = await als(beheerderToken, 'post', '/batch-export-by-title')
        .responseType('blob')
        .send({ title: 'Mars der Medici' });

      expect(antwoord.status).toBe(200);
      expect(geexporteerdeTitels(antwoord.body)).toHaveLength(2);
    });
  });

  describe('het geluidsfragment bij een titel', () => {
    /** Zet een titel met een mp3 neer en legt het bestand op schijf. */
    function maakTitelMetMp3(associationId: string, titel: string): string {
      const bestandsnaam = `test-${uuidv4()}.mp3`;
      legBestandNeer(MP3_UPLOAD_DIR, bestandsnaam, Buffer.from('ID3-test'));
      db.prepare(
        `INSERT INTO music_titles (id, title, arranger, mp3_file_path, association_id)
         VALUES (?, ?, NULL, ?, ?)`,
      ).run(uuidv4(), titel, bestandsnaam, associationId);
      return bestandsnaam;
    }

    it('geeft het fragment van de eigen vereniging', async () => {
      const bestand = maakTitelMetMp3(vereniging.id, 'Mars der Medici');

      const antwoord = await als(lidToken, 'get', `/mp3/${bestand}`);

      expect(antwoord.status).toBe(200);
    });

    it('geeft het fragment van een andere vereniging niet', async () => {
      const bestand = maakTitelMetMp3(andere.id, 'Van de buren');

      const antwoord = await als(lidToken, 'get', `/mp3/${bestand}`);

      expect(antwoord.status).toBe(404);
    });

    it('geeft een bestand dat bij geen enkele titel hoort niet', async () => {
      const bestandsnaam = `zwerver-${uuidv4()}.mp3`;
      legBestandNeer(MP3_UPLOAD_DIR, bestandsnaam, Buffer.from('ID3-test'));

      const antwoord = await als(lidToken, 'get', `/mp3/${bestandsnaam}`);

      expect(antwoord.status).toBe(404);
    });
  });

  describe('een lijst-id uit de body van een upload', () => {
    /** Ruimt de pdf's op die multer tijdens een upload heeft weggeschreven. */
    function ruimGeuploadeBestandenOp() {
      const rijen = db.prepare('SELECT file_path FROM music_pieces').all() as { file_path: string }[];
      for (const rij of rijen) {
        const pad = path.join(UPLOAD_DIR, rij.file_path);
        if (fs.existsSync(pad) && !aangemaakteBestanden.includes(pad)) fs.unlinkSync(pad);
      }
    }

    afterEach(() => ruimGeuploadeBestandenOp());

    /** Een muzieklijst bij het orkest van een vereniging. */
    function maakLijst(associationId: string): string {
      const orkestId =
        associationId === vereniging.id ? orkest.id : createTestOrchestra(associationId, { name: 'Hun orkest' }).id;
      const lijstId = uuidv4();
      db.prepare('INSERT INTO music_lists (id, name, orchestra_id) VALUES (?, ?, ?)').run(
        lijstId,
        'Repertoire',
        orkestId,
      );
      return lijstId;
    }

    function lijstKoppelingen(lijstId: string): number {
      return (
        db.prepare('SELECT COUNT(*) AS aantal FROM music_list_pieces WHERE music_list_id = ?').get(lijstId) as {
          aantal: number;
        }
      ).aantal;
    }

    it('zet een geuploade partij op de eigen lijst', async () => {
      const lijstId = maakLijst(vereniging.id);

      const antwoord = await als(beheerderToken, 'post', '/upload')
        .field('listId', lijstId)
        .attach('files', MINIMALE_PDF, 'Mars der Medici - Trompet 1.pdf');

      expect(antwoord.status).toBe(201);
      expect(lijstKoppelingen(lijstId)).toBe(1);
    });

    it('zet een geuploade partij niet op de lijst van een andere vereniging', async () => {
      const hunLijst = maakLijst(andere.id);

      const antwoord = await als(beheerderToken, 'post', '/upload')
        .field('listId', hunLijst)
        .attach('files', MINIMALE_PDF, 'Mars der Medici - Trompet 1.pdf');

      expect(antwoord.status).toBe(404);
      expect(lijstKoppelingen(hunLijst)).toBe(0);
    });

    it('zet een partij uit een zip niet op de lijst van een andere vereniging', async () => {
      const hunLijst = maakLijst(andere.id);
      const zip = new AdmZip();
      zip.addFile('Mars der Medici - Trompet 1.pdf', MINIMALE_PDF);

      const antwoord = await als(beheerderToken, 'post', '/upload-zip')
        .field('listId', hunLijst)
        .attach('file', zip.toBuffer(), 'partijen.zip');

      expect(antwoord.status).toBe(404);
      expect(lijstKoppelingen(hunLijst)).toBe(0);
    });

    it('zet partijen uit een zip wel op de eigen lijst', async () => {
      const lijstId = maakLijst(vereniging.id);
      const zip = new AdmZip();
      zip.addFile('Mars der Medici - Trompet 1.pdf', MINIMALE_PDF);

      const antwoord = await als(beheerderToken, 'post', '/upload-zip')
        .field('listId', lijstId)
        .attach('file', zip.toBuffer(), 'partijen.zip');

      expect(antwoord.status).toBe(201);
      expect(lijstKoppelingen(lijstId)).toBe(1);
    });
  });

  describe('mijn eigen partijen', () => {
    /** Zet een partij op een lijst, ook als die van een andere vereniging is. */
    function zetOpLijst(lijstId: string, pieceId: string) {
      db.prepare('INSERT OR IGNORE INTO music_list_pieces (music_list_id, music_piece_id) VALUES (?, ?)').run(
        lijstId,
        pieceId,
      );
    }

    function maakLijstBijOrkest(overschrijf: { isActive?: boolean; deletedAt?: string | null } = {}): string {
      const lijstId = uuidv4();
      db.prepare('INSERT INTO music_lists (id, name, orchestra_id, is_active, deleted_at) VALUES (?, ?, ?, ?, ?)').run(
        lijstId,
        'Repertoire',
        orkest.id,
        overschrijf.isActive === false ? 0 : 1,
        overschrijf.deletedAt ?? null,
      );
      return lijstId;
    }

    async function mijnPartijen(): Promise<string[]> {
      const antwoord = await als(lidToken, 'get', '/my-pieces');
      expect(antwoord.status).toBe(200);
      return (antwoord.body as { title: string }[]).map((p) => p.title);
    }

    it('toont de partijen op een actieve lijst van het eigen orkest', async () => {
      const lijstId = maakLijstBijOrkest();
      zetOpLijst(lijstId, maakPartij(vereniging.id, 'Mars der Medici', trompet.id).id);

      expect(await mijnPartijen()).toEqual(['Mars der Medici']);
    });

    it('toont geen partij van een andere vereniging', async () => {
      const lijstId = maakLijstBijOrkest();
      zetOpLijst(lijstId, maakPartij(andere.id, 'Van de buren', trompet.id).id);

      expect(await mijnPartijen()).toEqual([]);
    });

    it('toont geen partijen van een verwijderde lijst', async () => {
      const lijstId = maakLijstBijOrkest({ deletedAt: new Date().toISOString() });
      zetOpLijst(lijstId, maakPartij(vereniging.id, 'Mars der Medici', trompet.id).id);

      expect(await mijnPartijen()).toEqual([]);
    });

    it('toont een lid geen partijen van een verborgen lijst', async () => {
      const lijstId = maakLijstBijOrkest({ isActive: false });
      zetOpLijst(lijstId, maakPartij(vereniging.id, 'Mars der Medici', trompet.id).id);

      expect(await mijnPartijen()).toEqual([]);
    });
  });

  describe('titelgegevens opvragen', () => {
    it('gaat om met een titel die een procentteken bevat', async () => {
      // Express decodeert het pad al; nog een keer decoderen liet "100%" als
      // begin van een escape-reeks lezen en gaf een serverfout.
      const antwoord = await als(beheerderToken, 'get', `/title-meta/${encodeURIComponent('100% Trombone')}`);

      expect(antwoord.status).toBe(200);
      expect(antwoord.body.title).toBe('100% Trombone');
    });

    it('gaat om met een arrangeur die een procentteken bevat', async () => {
      const antwoord = await als(beheerderToken, 'get', '/title-meta/Mars').query({ arranger: '100% Jansen' });

      expect(antwoord.status).toBe(200);
      expect(antwoord.body.arranger).toBe('100% Jansen');
    });

    it('vindt de opgeslagen gegevens van een titel met een procentteken', async () => {
      const opslaan = await als(beheerderToken, 'put', '/title-meta').send({
        title: '100% Trombone',
        durationSeconds: 210,
      });
      expect(opslaan.status).toBe(200);

      const antwoord = await als(beheerderToken, 'get', `/title-meta/${encodeURIComponent('100% Trombone')}`);

      expect(antwoord.status).toBe(200);
      expect(antwoord.body.durationSeconds).toBe(210);
    });
  });

  describe('titelgegevens bijwerken', () => {
    it('werkt een verwijderde titel niet stilzwijgend bij maar zet hem terug', async () => {
      // music_titles heeft UNIQUE(title, arranger, association_id): een zacht
      // verwijderde rij blokkeert een nieuwe. Bijwerken moet de rij dus weer
      // levend maken, anders verdwijnt de invoer in een onzichtbare rij.
      const titelId = uuidv4();
      db.prepare(
        `INSERT INTO music_titles (id, title, arranger, duration_seconds, association_id, deleted_at)
         VALUES (?, ?, NULL, ?, ?, ?)`,
      ).run(titelId, 'Mars der Medici', 100, vereniging.id, new Date().toISOString());

      const antwoord = await als(beheerderToken, 'put', '/title-meta').send({
        title: 'Mars der Medici',
        durationSeconds: 240,
      });
      expect(antwoord.status).toBe(200);

      const rij = db.prepare('SELECT duration_seconds, deleted_at FROM music_titles WHERE id = ?').get(titelId) as {
        duration_seconds: number;
        deleted_at: string | null;
      };
      expect(rij.duration_seconds).toBe(240);
      expect(rij.deleted_at).toBeNull();
    });
  });
});
