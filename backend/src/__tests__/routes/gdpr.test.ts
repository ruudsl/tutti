/**
 * De AVG-export en het recht op verwijdering.
 *
 * Artikel 20 (dataportabiliteit) en artikel 17 (vergetelheid) zijn wettelijk
 * verplicht, en beide liepen stuk op kolommen die niet bestaan: de export
 * vroeg onder meer om i.family, uf.id, pl.started_at, pa.position_x en
 * ar.user_id, en om de tabellen issues en seating_preferences. De
 * anonimisering schreef naar users.updated_at, een kolom die er niet is.
 *
 * Deze tests roepen de routes echt aan, zodat een verkeerde kolomnaam niet
 * opnieuw pas bij een verzoek van een lid aan het licht komt.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import gdprRoutes from '../../routes/gdpr';
import { errorHandler } from '../../middleware/errorHandler';
import { createTestEnvironment, createTestOrchestra, createTestUser, generateTestToken, TestUser } from '../testUtils';

const app = express();
app.use(express.json());
app.use('/api/gdpr', gdprRoutes);
app.use(errorHandler);

let lid: TestUser;
let lidToken: string;
let associationId: string;

beforeEach(() => {
  const omgeving = createTestEnvironment();
  lid = omgeving.memberUser;
  lidToken = omgeving.memberToken;
  associationId = omgeving.association.id;
});

/** Vul voor het lid in elke categorie iets in, zodat de export echt iets ophaalt. */
function vulGegevens(): { titelId: string; instrumentId: string } {
  const instrumentId = uuidv4();
  db.prepare("INSERT INTO instruments (id, name, tuning, clef) VALUES (?, 'Trompet', 'Bb', 'treble')").run(
    instrumentId,
  );
  db.prepare('INSERT INTO user_instruments (user_id, instrument_id) VALUES (?, ?)').run(lid.id, instrumentId);

  const orkest = createTestOrchestra(associationId);
  db.prepare('INSERT INTO user_orchestras (user_id, orchestra_id) VALUES (?, ?)').run(lid.id, orkest.id);

  const titelId = uuidv4();
  db.prepare(
    "INSERT INTO music_titles (id, title, composer, arranger, association_id) VALUES (?, 'Mars', 'Sousa', 'Reed', ?)",
  ).run(titelId, associationId);

  db.prepare('INSERT INTO user_favorites (user_id, music_title_id) VALUES (?, ?)').run(lid.id, titelId);
  db.prepare(
    "INSERT INTO user_recent_views (id, user_id, item_type, item_id, item_title) VALUES (?, ?, 'music_title', ?, 'Mars')",
  ).run(uuidv4(), lid.id, titelId);
  db.prepare(
    "INSERT INTO practice_logs (id, user_id, music_title_id, duration_minutes, notes, practiced_at) VALUES (?, ?, ?, 30, 'Toonladders', '2026-03-01')",
  ).run(uuidv4(), lid.id, titelId);

  const stukId = uuidv4();
  db.prepare(
    "INSERT INTO music_pieces (id, title, association_id, file_path, original_filename) VALUES (?, 'Mars - Trompet 1', ?, '/tmp/mars-trompet.pdf', 'mars-trompet.pdf')",
  ).run(stukId, associationId);
  db.prepare(
    `INSERT INTO pdf_annotations (id, user_id, music_piece_id, page_number, annotation_type, x_position, y_position, content)
     VALUES (?, ?, ?, 2, 'note', 10.5, 20.5, 'Let op de herhaling')`,
  ).run(uuidv4(), lid.id, stukId);

  db.prepare(
    `INSERT INTO audio_recordings (id, association_id, music_title_id, title, duration_seconds, recorded_by, file_path, file_size, mime_type)
     VALUES (?, ?, ?, 'Opname repetitie', 120, ?, '/tmp/opname.mp3', 2048, 'audio/mpeg')`,
  ).run(uuidv4(), associationId, titelId, lid.id);

  db.prepare(
    "INSERT INTO activity_log (id, user_id, action_type, entity_type, entity_id) VALUES (?, ?, 'view', 'music_title', ?)",
  ).run(uuidv4(), lid.id, titelId);

  return { titelId, instrumentId };
}

const alsLid = () => request(app).get('/api/gdpr/export').set('Authorization', `Bearer ${lidToken}`);

describe('AVG-export (artikel 20)', () => {
  it('levert een export op zonder te struikelen over het schema', async () => {
    vulGegevens();
    const antwoord = await alsLid();
    expect(antwoord.status).toBe(200);
  });

  it('vereist dat de aanvrager is ingelogd', async () => {
    const antwoord = await request(app).get('/api/gdpr/export');
    expect(antwoord.status).toBe(401);
  });

  it('bevat het profiel van de aanvrager', async () => {
    const antwoord = await alsLid();
    expect(antwoord.body.profile).toMatchObject({ id: lid.id, email: lid.email });
  });

  it('laat wachtwoord en tweefactorgeheim weg', async () => {
    const antwoord = await alsLid();
    expect(antwoord.body.profile).not.toHaveProperty('password_hash');
    expect(antwoord.body.profile).not.toHaveProperty('mfa_secret');
    expect(antwoord.body.profile).not.toHaveProperty('microsoft_id');
    expect(JSON.stringify(antwoord.body)).not.toContain(lid.passwordHash);
  });

  it('geeft elke categorie terug die is ingevuld', async () => {
    vulGegevens();
    const { body } = await alsLid();

    expect(body.instruments).toHaveLength(1);
    expect(body.instruments[0]).toMatchObject({ name: 'Trompet', clef: 'treble' });
    expect(body.orchestras).toHaveLength(1);
    expect(body.favorites).toHaveLength(1);
    expect(body.favorites[0]).toMatchObject({ title: 'Mars', composer: 'Sousa' });
    expect(body.recentViews).toHaveLength(1);
    expect(body.recentViews[0]).toMatchObject({ item_type: 'music_title', item_title: 'Mars' });
    expect(body.practiceHistory).toHaveLength(1);
    expect(body.practiceHistory[0]).toMatchObject({ duration_minutes: 30, music_title: 'Mars' });
    expect(body.annotations).toHaveLength(1);
    expect(body.annotations[0]).toMatchObject({ page_number: 2, x_position: 10.5, y_position: 20.5 });
    expect(body.audioRecordings).toHaveLength(1);
    expect(body.audioRecordings[0]).toMatchObject({ title: 'Opname repetitie' });
    expect(body.activityLog).toHaveLength(1);
  });

  it('geeft lege lijsten voor een lid zonder gegevens', async () => {
    const { body } = await alsLid();
    for (const categorie of [
      'instruments',
      'orchestras',
      'favorites',
      'recentViews',
      'practiceHistory',
      'annotations',
      'audioRecordings',
      'activityLog',
    ]) {
      expect(body[categorie], categorie).toEqual([]);
    }
  });

  it('haalt niets op van een ander lid', async () => {
    vulGegevens();
    const anderLid = createTestUser(associationId, { email: `gdpr-ander-${uuidv4()}@test.nl` });
    const antwoord = await request(app)
      .get('/api/gdpr/export')
      .set('Authorization', `Bearer ${generateTestToken(anderLid)}`);

    expect(antwoord.status).toBe(200);
    expect(antwoord.body.profile.id).toBe(anderLid.id);
    expect(antwoord.body.instruments).toEqual([]);
    expect(antwoord.body.audioRecordings).toEqual([]);
    expect(antwoord.body.practiceHistory).toEqual([]);
  });

  it('vermeldt wanneer de export is gemaakt', async () => {
    const { body } = await alsLid();
    expect(body.exportInfo.userId).toBe(lid.id);
    expect(new Date(body.exportInfo.exportDate).getTime()).not.toBeNaN();
  });

  it('levert desgevraagd een zip-bestand', async () => {
    vulGegevens();
    const antwoord = await request(app).get('/api/gdpr/export?format=zip').set('Authorization', `Bearer ${lidToken}`);

    expect(antwoord.status).toBe(200);
    expect(antwoord.headers['content-type']).toContain('zip');
  });
});
