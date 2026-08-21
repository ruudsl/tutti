/**
 * Links naar Spotify, Apple Music en YouTube Music bij een titel.
 *
 * De vijf adresvelden gingen rechtstreeks uit req.body de database in, en het
 * scherm zet ze ongefilterd in een href. Een `javascript:`-adres voert dan
 * code uit in de context van de pagina zodra een lid op het icoontje klikt.
 * React waarschuwt daar wel over in de console, maar blokkeert het niet.
 *
 * Het vraagt al muziekcommissie of beheerder en blijft binnen de eigen
 * vereniging - het is dus rechtenescalatie van commissielid naar beheerder, en
 * geen aanval van buitenaf. Dat maakt het niet minder een gat.
 *
 * Alleen http en https. Verder geen hostcontrole: welke dienst iemand
 * aanwijst is zijn eigen keuze.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import streamingRoutes from '../../routes/streamingLinks';
import { errorHandler } from '../../middleware/errorHandler';
import {
  createTestEnvironment,
  createTestAssociation,
  createTestUser,
  generateTestToken,
  TestAssociation,
  TestUser,
} from '../testUtils';

const app = express();
app.use(express.json());
app.use('/api/streaming', streamingRoutes);
app.use(errorHandler);

describe('streaminglinks', () => {
  let vereniging: TestAssociation;
  let commissieToken: string;
  let lidToken: string;
  let titelId: string;

  let andereVereniging: TestAssociation;
  let andereCommissieToken: string;

  beforeEach(() => {
    const omgeving = createTestEnvironment();
    vereniging = omgeving.association;
    commissieToken = omgeving.musicCommitteeToken;
    lidToken = omgeving.memberToken;

    titelId = uuidv4();
    db.prepare('INSERT INTO music_titles (id, title, association_id) VALUES (?, ?, ?)').run(
      titelId,
      'Mars der Medici',
      vereniging.id,
    );

    andereVereniging = createTestAssociation({ name: 'Andere vereniging' });
    const andereCommissie = createTestUser(andereVereniging.id, {
      email: 'commissie@elders.nl',
      role: 'music_committee',
    });
    andereCommissieToken = generateTestToken(andereCommissie);
  });

  const zetLinks = (token: string, body: Record<string, unknown>) =>
    request(app)
      .post(`/api/streaming/music-titles/${titelId}/links`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  describe('welke adressen erin mogen', () => {
    it('accepteert een gewoon https-adres', async () => {
      const antwoord = await zetLinks(commissieToken, { spotify_url: 'https://open.spotify.com/track/abc' });
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);
    });

    it('accepteert http', async () => {
      expect((await zetLinks(commissieToken, { spotify_url: 'http://voorbeeld.nl/x' })).status).toBe(200);
    });

    it('weigert javascript:', async () => {
      const antwoord = await zetLinks(commissieToken, { spotify_url: "javascript:alert('x')" });
      expect(antwoord.status).toBe(400);
    });

    it('weigert data:', async () => {
      const antwoord = await zetLinks(commissieToken, {
        apple_music_url: 'data:text/html,<script>alert(1)</script>',
      });
      expect(antwoord.status).toBe(400);
    });

    it('weigert tekst die geen adres is', async () => {
      expect((await zetLinks(commissieToken, { youtube_music_url: 'zomaar wat' })).status).toBe(400);
    });

    it('weigert het ook op de voorbeeldvelden', async () => {
      expect((await zetLinks(commissieToken, { spotify_preview_url: 'javascript:alert(1)' })).status).toBe(400);
      expect((await zetLinks(commissieToken, { apple_music_preview_url: 'javascript:alert(1)' })).status).toBe(400);
    });

    it('slaat een geweigerd adres niet op', async () => {
      await zetLinks(commissieToken, { spotify_url: "javascript:alert('x')" });
      const rij = db.prepare('SELECT streaming_links FROM music_titles WHERE id = ?').get(titelId) as {
        streaming_links: string | null;
      };
      expect(rij.streaming_links ?? '').not.toContain('javascript:');
    });

    it('laat leeg maken gewoon toe', async () => {
      await zetLinks(commissieToken, { spotify_url: 'https://open.spotify.com/track/abc' });
      expect((await zetLinks(commissieToken, { spotify_url: '' })).status).toBe(200);
    });
  });

  describe('wie het mag', () => {
    it('is niet voor een gewoon lid', async () => {
      expect((await zetLinks(lidToken, { spotify_url: 'https://open.spotify.com/track/abc' })).status).toBe(403);
    });

    it('is niet voor een andere vereniging', async () => {
      const antwoord = await zetLinks(andereCommissieToken, { spotify_url: 'https://open.spotify.com/track/abc' });
      expect(antwoord.status).toBe(403);
    });

    it('weigert een verzoek zonder token', async () => {
      const antwoord = await request(app)
        .post(`/api/streaming/music-titles/${titelId}/links`)
        .send({ spotify_url: 'https://open.spotify.com/track/abc' });
      expect(antwoord.status).toBe(401);
    });
  });
});
