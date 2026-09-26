/**
 * Een download-token voor één bron, in plaats van het sessietoken in de URL.
 *
 * <audio src> kan geen Authorization-kopregel meesturen. De frontend zette
 * daarom het volledige sessietoken in `?token=` van het mp3-adres, en de
 * middleware nam dat bij GET aan. Zo'n adres belandt in logboeken,
 * browsergeschiedenis en Referer-kopregels.
 *
 * Nu vraagt de frontend per bestand een token aan (POST
 * /api/download-token/bron). Dat token geldt vijf minuten, alleen voor die
 * soort en dat id, alleen op de bijbehorende downloadroute, en alleen zolang
 * de sessie waarmee het is aangevraagd bestaat. Een sessietoken in de URL
 * wordt nergens meer aangenomen.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express, { Response } from 'express';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import downloadTokenRoutes from '../../routes/download-token';
import musicPiecesRoutes from '../../routes/music-pieces';
import { authenticateToken, AuthRequest } from '../../middleware/auth';
import { errorHandler } from '../../middleware/errorHandler';
import { registerSession, hashToken, revokeUserSessions } from '../../utils/sessionStore';
import { generateDownloadToken, maakBronToken, BRON_TOKEN_GELDIG_SECONDEN } from '../../utils/downloadToken';
import {
  createTestAssociation,
  createTestEnvironment,
  createTestUser,
  generateTestToken,
  TestUser,
} from '../testUtils';

const MP3_UPLOAD_DIR = process.env.MP3_UPLOAD_DIR || path.join(__dirname, '../../../uploads/mp3');

const app = express();
app.use(express.json());
app.use('/api/download-token', downloadTokenRoutes);
app.use('/api/music-pieces', musicPiecesRoutes);
app.get('/api/elders', authenticateToken, (req: AuthRequest, res: Response) => res.json(req.user));
app.use(errorHandler);

const neergelegd: string[] = [];

/** Een titel met een mp3 in deze vereniging, met het bestand op schijf. */
function maakMp3(associationId: string): string {
  const bestandsnaam = `bron-${uuidv4()}.mp3`;
  fs.mkdirSync(MP3_UPLOAD_DIR, { recursive: true });
  const pad = path.join(MP3_UPLOAD_DIR, bestandsnaam);
  fs.writeFileSync(pad, Buffer.from('ID3-bron'));
  neergelegd.push(pad);
  db.prepare(
    `INSERT INTO music_titles (id, title, arranger, mp3_file_path, association_id)
     VALUES (?, ?, NULL, ?, ?)`,
  ).run(uuidv4(), 'Mars', bestandsnaam, associationId);
  return bestandsnaam;
}

describe('download-token per bron', () => {
  let lid: TestUser;
  let lidToken: string;
  let eigenMp3: string;
  let andereMp3: string;
  let mp3VanDeBuren: string;

  beforeEach(() => {
    const omgeving = createTestEnvironment();
    lid = omgeving.memberUser;
    lidToken = omgeving.memberToken;
    registerSession(lid.id, lidToken, '127.0.0.1', 'test');

    eigenMp3 = maakMp3(omgeving.association.id);
    andereMp3 = maakMp3(omgeving.association.id);
    mp3VanDeBuren = maakMp3(createTestAssociation({ name: 'De buren' }).id);
  });

  afterEach(() => {
    vi.useRealTimers();
    while (neergelegd.length) fs.rmSync(neergelegd.pop()!, { force: true });
  });

  async function vraagBronToken(bestand: string, sessietoken = lidToken) {
    return request(app)
      .post('/api/download-token/bron')
      .set('Authorization', `Bearer ${sessietoken}`)
      .send({ soort: 'mp3', id: bestand });
  }

  async function bronToken(bestand: string): Promise<string> {
    const antwoord = await vraagBronToken(bestand);
    expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);
    expect(antwoord.body.expiresIn).toBe(BRON_TOKEN_GELDIG_SECONDEN);
    return antwoord.body.token;
  }

  const haalMp3 = (bestand: string, token: string) =>
    request(app).get(`/api/music-pieces/mp3/${bestand}`).query({ token });

  describe('uitgeven', () => {
    it('vraagt een aangemeld lid', async () => {
      const antwoord = await request(app).post('/api/download-token/bron').send({ soort: 'mp3', id: eigenMp3 });
      expect(antwoord.status).toBe(401);
    });

    it('weigert een onbekende soort', async () => {
      const antwoord = await request(app)
        .post('/api/download-token/bron')
        .set('Authorization', `Bearer ${lidToken}`)
        .send({ soort: 'alles', id: eigenMp3 });
      expect(antwoord.status).toBe(400);
    });

    it('geeft geen token voor een bestand van een andere vereniging', async () => {
      expect((await vraagBronToken(mp3VanDeBuren)).status).toBe(404);
    });

    it('geeft geen token op basis van een algemeen download-token', async () => {
      const kort = generateDownloadToken(lid.id, lid.associationId, lid.role, lid.email);
      expect((await vraagBronToken(eigenMp3, kort)).status).toBe(401);
    });
  });

  describe('gebruiken', () => {
    it('geeft met het token het eigen bestand', async () => {
      const antwoord = await haalMp3(eigenMp3, await bronToken(eigenMp3));
      expect(antwoord.status).toBe(200);
      expect(antwoord.headers['content-type']).toBe('audio/mpeg');
    });

    it('geeft met het token geen ander bestand, ook niet van de eigen vereniging', async () => {
      const token = await bronToken(eigenMp3);
      expect((await haalMp3(andereMp3, token)).status).toBe(401);
      expect((await haalMp3(mp3VanDeBuren, token)).status).toBe(401);
    });

    it('geldt niet op een andere route', async () => {
      const token = await bronToken(eigenMp3);
      expect((await request(app).get('/api/elders').query({ token })).status).toBe(401);
      expect((await request(app).get('/api/elders').set('Authorization', `Bearer ${token}`)).status).toBe(401);
    });

    it('verloopt na vijf minuten', async () => {
      const token = await bronToken(eigenMp3);
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(Date.now() + (BRON_TOKEN_GELDIG_SECONDEN + 1) * 1000);

      expect((await haalMp3(eigenMp3, token)).status).toBe(401);
    });

    it('vervalt als de sessie waarmee het is aangevraagd wordt beëindigd', async () => {
      const token = await bronToken(eigenMp3);
      revokeUserSessions(lid.id);

      expect((await haalMp3(eigenMp3, token)).status).toBe(401);
    });

    it('geldt niet voor een andere gebruiker dan die van de sessie', async () => {
      const ander = createTestUser(lid.associationId, { email: 'ander@test.com' });
      const token = maakBronToken({
        soort: 'mp3',
        bronId: eigenMp3,
        userId: ander.id,
        associationId: lid.associationId,
        rol: 'member',
        sessieHash: hashToken(lidToken),
      });

      expect((await haalMp3(eigenMp3, token)).status).toBe(401);
    });

    it('geeft binnen een andere vereniging niets', async () => {
      // Een token met de vereniging van de buren, voor een eigen bestand: de
      // route zoekt het bestand in de vereniging uit het token.
      const buur = createTestUser(createTestAssociation({ name: 'Nog een buur' }).id, { email: 'buur@test.com' });
      const buurToken = generateTestToken(buur);
      registerSession(buur.id, buurToken, '127.0.0.1', 'test');
      const token = maakBronToken({
        soort: 'mp3',
        bronId: eigenMp3,
        userId: buur.id,
        associationId: buur.associationId,
        rol: 'member',
        sessieHash: hashToken(buurToken),
      });

      expect((await haalMp3(eigenMp3, token)).status).toBe(404);
    });
  });

  describe('het sessietoken in de URL', () => {
    it('wordt op het mp3-adres geweigerd', async () => {
      expect((await haalMp3(eigenMp3, lidToken)).status).toBe(401);
    });

    it('wordt op elke andere route geweigerd', async () => {
      expect((await request(app).get('/api/elders').query({ token: lidToken })).status).toBe(401);
    });

    it('een algemeen download-token geldt niet op het mp3-adres', async () => {
      const kort = generateDownloadToken(lid.id, lid.associationId, lid.role, lid.email);
      expect((await haalMp3(eigenMp3, kort)).status).toBe(401);
    });

    it('het mp3-adres werkt nog gewoon met de kopregel', async () => {
      const antwoord = await request(app)
        .get(`/api/music-pieces/mp3/${eigenMp3}`)
        .set('Authorization', `Bearer ${lidToken}`);
      expect(antwoord.status).toBe(200);
    });
  });
});
