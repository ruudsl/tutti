/**
 * Voorbeeldafbeeldingen van bladmuziek.
 *
 * 353 regels zonder test, en de controle die er stond dekte het verkeerde af.
 * Path traversal was afgevangen met path.basename, maar daarna werd de
 * bestandsnaam gewoon in de uploadmap opgezocht - en die map is gedeeld door
 * alle verenigingen. Elk ingelogd lid kon zo een voorbeeld opvragen van elke
 * pdf op de installatie.
 *
 * GET /music-pieces/:id/download gaat over dezelfde bestanden en doet twee
 * controles: het stuk moet van de eigen vereniging zijn, en een gewoon lid
 * moet het instrument bespelen. Deze ingang deed geen van beide. Dat de
 * bestandsnamen uit een tijdstempel en een uuid bestaan en dus lastig te raden
 * zijn, is geen toegangscontrole - en een bestandsnaam kan langs andere weg
 * bekend worden, bijvoorbeeld uit een reservekopie of een logregel.
 *
 * De frontend gebruikt deze routes op dit moment niet; die rendert de pdf zelf
 * vanaf de afgeschermde download-url. De routes staan wel gemount.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import fs from 'fs';
import path from 'path';
import os from 'os';
import '../setup';
import thumbnailRoutes from '../../routes/thumbnails';
import { errorHandler } from '../../middleware/errorHandler';
import db from '../../database/connection';
import {
  createTestEnvironment,
  createTestAssociation,
  createTestInstrument,
  createTestMusicPiece,
  createTestUser,
  generateTestToken,
  TestAssociation,
  TestInstrument,
  TestUser,
} from '../testUtils';

const app = express();
app.use(express.json());
app.use('/api/thumbnails', thumbnailRoutes);
app.use(errorHandler);

/** Het kleinst mogelijke geldige pdf-bestand. */
const MINIMALE_PDF = Buffer.from(
  '%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
    '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 99 99]>>endobj\n' +
    'trailer<</Root 1 0 R>>\n',
  'utf-8',
);

describe('voorbeeldafbeeldingen', () => {
  let vereniging: TestAssociation;
  let beheerder: TestUser;
  let beheerderToken: string;
  let lid: TestUser;
  let lidToken: string;
  let trompet: TestInstrument;
  let hoorn: TestInstrument;

  let andereVereniging: TestAssociation;
  let andereLid: TestUser;
  let andereLidToken: string;

  const aangemaakteBestanden: string[] = [];

  beforeEach(() => {
    const omgeving = createTestEnvironment();
    vereniging = omgeving.association;
    beheerder = omgeving.adminUser;
    beheerderToken = omgeving.adminToken;
    lid = omgeving.memberUser;
    lidToken = omgeving.memberToken;

    trompet = createTestInstrument({ name: 'Trompet' });
    hoorn = createTestInstrument({ name: 'Hoorn' });

    andereVereniging = createTestAssociation({ name: 'Andere vereniging' });
    andereLid = createTestUser(andereVereniging.id, { email: 'elders@test.nl', role: 'admin' });
    andereLidToken = generateTestToken(andereLid);
  });

  afterEach(() => {
    for (const pad of aangemaakteBestanden.splice(0)) {
      if (fs.existsSync(pad)) fs.unlinkSync(pad);
    }
  });

  const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '../../../uploads');

  /** Legt een pdf in de uploadmap en registreert hem als partij. */
  function legPartijNeer(associationId: string, instrumentId: string | null): string {
    const bestandsnaam = `test-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`;
    if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    const pad = path.join(UPLOAD_DIR, bestandsnaam);
    fs.writeFileSync(pad, MINIMALE_PDF);
    aangemaakteBestanden.push(pad);

    createTestMusicPiece(associationId, { filePath: bestandsnaam, instrumentId });
    return bestandsnaam;
  }

  const als = (token: string, pad: string) =>
    request(app).get(`/api/thumbnails${pad}`).set('Authorization', `Bearer ${token}`);

  describe('de verenigingsgrens', () => {
    it('geeft geen voorbeeld van een partij van een andere vereniging', async () => {
      const bestand = legPartijNeer(andereVereniging.id, null);
      const antwoord = await als(beheerderToken, `/${bestand}`);
      expect(antwoord.status).toBe(404);
    });

    it('geeft ook geen paginagegevens van een partij van een andere vereniging', async () => {
      const bestand = legPartijNeer(andereVereniging.id, null);
      const antwoord = await als(beheerderToken, `/${bestand}/info`);
      expect(antwoord.status).toBe(404);
    });

    it('werkt wel voor een partij van de eigen vereniging', async () => {
      const bestand = legPartijNeer(vereniging.id, null);
      const antwoord = await als(beheerderToken, `/${bestand}/info`);
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);
      expect(antwoord.body.pageCount).toBe(1);
    });

    it('houdt twee verenigingen elk bij hun eigen partij', async () => {
      const onze = legPartijNeer(vereniging.id, null);
      const hunne = legPartijNeer(andereVereniging.id, null);

      expect((await als(beheerderToken, `/${onze}/info`)).status).toBe(200);
      expect((await als(beheerderToken, `/${hunne}/info`)).status).toBe(404);
      expect((await als(andereLidToken, `/${hunne}/info`)).status).toBe(200);
      expect((await als(andereLidToken, `/${onze}/info`)).status).toBe(404);
    });
  });

  describe('het instrument van het lid', () => {
    it('geeft een gewoon lid geen partij van een instrument dat het niet speelt', async () => {
      db.prepare('INSERT INTO user_instruments (user_id, instrument_id) VALUES (?, ?)').run(lid.id, hoorn.id);
      const bestand = legPartijNeer(vereniging.id, trompet.id);

      expect((await als(lidToken, `/${bestand}/info`)).status).toBe(404);
    });

    it('geeft een gewoon lid wel de partij van zijn eigen instrument', async () => {
      db.prepare('INSERT INTO user_instruments (user_id, instrument_id) VALUES (?, ?)').run(lid.id, trompet.id);
      const bestand = legPartijNeer(vereniging.id, trompet.id);

      expect((await als(lidToken, `/${bestand}/info`)).status).toBe(200);
    });

    it('geeft een gewoon lid een partij zonder instrument gewoon', async () => {
      const bestand = legPartijNeer(vereniging.id, null);
      expect((await als(lidToken, `/${bestand}/info`)).status).toBe(200);
    });

    it('laat een beheerder elke partij van de eigen vereniging zien', async () => {
      const bestand = legPartijNeer(vereniging.id, trompet.id);
      expect((await als(beheerderToken, `/${bestand}/info`)).status).toBe(200);
    });
  });

  describe('overige gevallen', () => {
    it('geeft 404 voor een bestand dat niet bestaat', async () => {
      expect((await als(beheerderToken, '/bestaat-niet.pdf/info')).status).toBe(404);
    });

    it('geeft 404 voor een verwijderde partij', async () => {
      const bestand = legPartijNeer(vereniging.id, null);
      db.prepare('UPDATE music_pieces SET deleted_at = ? WHERE file_path = ?').run('2026-01-01 12:00:00', bestand);

      expect((await als(beheerderToken, `/${bestand}/info`)).status).toBe(404);
    });

    it('geeft geen voorbeeld van een bestand dat in de map staat maar geen partij is', async () => {
      // Een los bestand in de uploadmap hoort bij geen enkele vereniging.
      const bestandsnaam = `los-${Date.now()}.pdf`;
      const pad = path.join(UPLOAD_DIR, bestandsnaam);
      if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
      fs.writeFileSync(pad, MINIMALE_PDF);
      aangemaakteBestanden.push(pad);

      expect((await als(beheerderToken, `/${bestandsnaam}/info`)).status).toBe(404);
    });

    it('laat zich niet uit de uploadmap sturen', async () => {
      const antwoord = await als(beheerderToken, `/${encodeURIComponent('../../etc/passwd')}/info`);
      expect(antwoord.status).toBe(404);
    });

    it('weigert een verzoek zonder token', async () => {
      expect((await request(app).get('/api/thumbnails/iets.pdf/info')).status).toBe(401);
    });

    it('weigert een onbekende maat', async () => {
      const bestand = legPartijNeer(vereniging.id, null);
      const antwoord = await als(beheerderToken, `/${bestand}?size=enorm`);
      expect(antwoord.status).toBe(400);
    });
  });

  describe('opruimen', () => {
    it('is niet voor een gewoon lid', async () => {
      const antwoord = await request(app).post('/api/thumbnails/cleanup').set('Authorization', `Bearer ${lidToken}`);
      expect(antwoord.status).toBe(403);
    });

    it('mag wel door een beheerder', async () => {
      const antwoord = await request(app)
        .post('/api/thumbnails/cleanup')
        .set('Authorization', `Bearer ${beheerderToken}`);
      expect(antwoord.status).toBe(200);
    });
  });
});
