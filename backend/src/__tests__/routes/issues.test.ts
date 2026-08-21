/**
 * Meldingen op een partij: een scheur, een ontbrekende pagina, een
 * onleesbare maat.
 *
 * 326 regels zonder test. De verenigingsgrens zat er overal in, maar op geen
 * van de acht joins naar music_pieces stond `deleted_at IS NULL` - terwijl
 * music-lists.ts en music-pieces.ts daar respectievelijk 21 en 16 keer op
 * filteren, en music-pieces.ts een partij uitsluitend zacht verwijdert.
 *
 * Gevolg: meldingen bleven in het overzicht en in de tellingen staan bij
 * partijen die voor de gebruiker niet meer bestaan, en POST accepteerde een
 * verwijderde partij als onderwerp van een nieuwe melding.
 *
 * De routes die een bestaande melding afhandelen of opruimen zijn bewust
 * ongemoeid gelaten: een melding wegwerken moet ook kunnen als de partij
 * inmiddels weg is.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import issuesRoutes from '../../routes/issues';
import { errorHandler } from '../../middleware/errorHandler';
import {
  createTestEnvironment,
  createTestAssociation,
  createTestMusicPiece,
  createTestUser,
  generateTestToken,
  TestAssociation,
  TestUser,
} from '../testUtils';

const app = express();
app.use(express.json());
app.use('/api/issues', issuesRoutes);
app.use(errorHandler);

describe('meldingen op een partij', () => {
  let vereniging: TestAssociation;
  let beheerder: TestUser;
  let beheerderToken: string;
  let lid: TestUser;
  let lidToken: string;
  let partijId: string;

  let andereVereniging: TestAssociation;
  let andereBeheerderToken: string;

  beforeEach(() => {
    const omgeving = createTestEnvironment();
    vereniging = omgeving.association;
    beheerder = omgeving.adminUser;
    beheerderToken = omgeving.adminToken;
    lid = omgeving.memberUser;
    lidToken = omgeving.memberToken;

    partijId = createTestMusicPiece(vereniging.id, { title: 'Mars der Medici' }).id;

    andereVereniging = createTestAssociation({ name: 'Andere vereniging' });
    const andereBeheerder = createTestUser(andereVereniging.id, { email: 'beheer@elders.nl', role: 'admin' });
    andereBeheerderToken = generateTestToken(andereBeheerder);
  });

  type Methode = 'get' | 'post' | 'patch' | 'delete';
  const als = (token: string, methode: Methode, pad: string) =>
    request(app)[methode](`/api/issues${pad}`).set('Authorization', `Bearer ${token}`);

  const meld = (token: string, musicPieceId: string, description = 'Scheur in de rechterhoek') =>
    als(token, 'post', '/').send({ musicPieceId, issueType: 'damaged', description });

  describe('een melding doen', () => {
    it('lukt voor een lid van de eigen vereniging', async () => {
      const antwoord = await meld(lidToken, partijId);
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(201);
    });

    it('weigert een partij van een andere vereniging', async () => {
      const elders = createTestMusicPiece(andereVereniging.id, { title: 'Van elders' });
      expect((await meld(lidToken, elders.id)).status).toBe(404);
    });

    it('weigert een partij die niet bestaat', async () => {
      expect((await meld(lidToken, uuidv4())).status).toBe(404);
    });

    it('weigert een verwijderde partij', async () => {
      db.prepare('UPDATE music_pieces SET deleted_at = ? WHERE id = ?').run('2026-01-01 12:00:00', partijId);
      expect((await meld(lidToken, partijId)).status).toBe(404);
    });

    it('weigert een verzoek zonder token', async () => {
      const antwoord = await request(app).post('/api/issues').send({ musicPieceId: partijId });
      expect(antwoord.status).toBe(401);
    });
  });

  describe('het overzicht', () => {
    it('toont een melding van de eigen vereniging', async () => {
      await meld(lidToken, partijId);
      const antwoord = await als(beheerderToken, 'get', '/');
      expect(antwoord.status).toBe(200);
      expect(JSON.stringify(antwoord.body)).toContain('Scheur in de rechterhoek');
    });

    it('toont geen melding van een andere vereniging', async () => {
      const elders = createTestMusicPiece(andereVereniging.id, { title: 'Van elders' });
      const eldersLid = createTestUser(andereVereniging.id, { email: 'lid@elders.nl' });
      await meld(generateTestToken(eldersLid), elders.id, 'Melding van elders');

      const antwoord = await als(beheerderToken, 'get', '/');
      expect(JSON.stringify(antwoord.body)).not.toContain('Melding van elders');
    });

    it('laat een melding op een verwijderde partij weg', async () => {
      await meld(lidToken, partijId);
      db.prepare('UPDATE music_pieces SET deleted_at = ? WHERE id = ?').run('2026-01-01 12:00:00', partijId);

      const antwoord = await als(beheerderToken, 'get', '/');
      expect(JSON.stringify(antwoord.body)).not.toContain('Scheur in de rechterhoek');
    });

    it('laat zo n melding ook uit de eigen meldingen weg', async () => {
      await meld(lidToken, partijId);
      db.prepare('UPDATE music_pieces SET deleted_at = ? WHERE id = ?').run('2026-01-01 12:00:00', partijId);

      const antwoord = await als(lidToken, 'get', '/my-issues');
      expect(JSON.stringify(antwoord.body)).not.toContain('Scheur in de rechterhoek');
    });

    it('toont de eigen meldingen van het lid dat ze deed', async () => {
      await meld(lidToken, partijId, 'Van mij');
      await meld(beheerderToken, partijId, 'Van de beheerder');

      const antwoord = await als(lidToken, 'get', '/my-issues');
      expect(JSON.stringify(antwoord.body)).toContain('Van mij');
      expect(JSON.stringify(antwoord.body)).not.toContain('Van de beheerder');
    });
  });

  describe('de tellingen', () => {
    it('telt een openstaande melding mee', async () => {
      await meld(lidToken, partijId);
      const antwoord = await als(beheerderToken, 'get', '/stats');
      expect(antwoord.status).toBe(200);
      expect(JSON.stringify(antwoord.body)).toMatch(/[1-9]/);
    });

    it('telt een melding op een verwijderde partij niet mee', async () => {
      await meld(lidToken, partijId);
      const voor = await als(beheerderToken, 'get', '/stats');

      db.prepare('UPDATE music_pieces SET deleted_at = ? WHERE id = ?').run('2026-01-01 12:00:00', partijId);
      const na = await als(beheerderToken, 'get', '/stats');

      expect(JSON.stringify(na.body)).not.toBe(JSON.stringify(voor.body));
    });

    it('telt niets van een andere vereniging mee', async () => {
      const elders = createTestMusicPiece(andereVereniging.id, { title: 'Van elders' });
      const eldersLid = createTestUser(andereVereniging.id, { email: 'lid@elders.nl' });
      await meld(generateTestToken(eldersLid), elders.id);

      const antwoord = await als(beheerderToken, 'get', '/stats');
      const totalen = Object.values(antwoord.body as Record<string, unknown>).filter((v) => typeof v === 'number');
      expect(totalen.every((v) => v === 0)).toBe(true);
    });
  });

  describe('een melding afhandelen', () => {
    async function meldEnPakId(): Promise<string> {
      await meld(lidToken, partijId);
      const rij = db.prepare('SELECT id FROM piece_issues ORDER BY rowid DESC LIMIT 1').get() as { id: string };
      return rij.id;
    }

    it('zet de status om', async () => {
      const id = await meldEnPakId();
      const antwoord = await als(beheerderToken, 'patch', `/${id}/status`).send({ status: 'resolved' });
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);
    });

    it('doet dat niet voor een melding van een andere vereniging', async () => {
      const elders = createTestMusicPiece(andereVereniging.id, { title: 'Van elders' });
      const eldersLid = createTestUser(andereVereniging.id, { email: 'lid@elders.nl' });
      await meld(generateTestToken(eldersLid), elders.id);
      const rij = db.prepare('SELECT id FROM piece_issues ORDER BY rowid DESC LIMIT 1').get() as { id: string };

      expect((await als(beheerderToken, 'patch', `/${rij.id}/status`).send({ status: 'resolved' })).status).toBe(404);
    });

    it('kan een melding nog afhandelen nadat de partij is verwijderd', async () => {
      // Bewust: een melding wegwerken moet ook kunnen als het stuk weg is.
      const id = await meldEnPakId();
      db.prepare('UPDATE music_pieces SET deleted_at = ? WHERE id = ?').run('2026-01-01 12:00:00', partijId);

      const antwoord = await als(beheerderToken, 'patch', `/${id}/status`).send({ status: 'resolved' });
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);
    });

    it('verwijdert geen melding van een andere vereniging', async () => {
      const elders = createTestMusicPiece(andereVereniging.id, { title: 'Van elders' });
      const eldersLid = createTestUser(andereVereniging.id, { email: 'lid@elders.nl' });
      await meld(generateTestToken(eldersLid), elders.id);
      const rij = db.prepare('SELECT id FROM piece_issues ORDER BY rowid DESC LIMIT 1').get() as { id: string };

      await als(beheerderToken, 'delete', `/${rij.id}`);
      const nog = db.prepare('SELECT COUNT(*) as aantal FROM piece_issues WHERE id = ?').get(rij.id) as {
        aantal: number;
      };
      expect(nog.aantal).toBe(1);
    });
  });
});
