/**
 * Het AVG-inzageoverzicht en het echt verwijderen van een lid.
 *
 * De export (artikel 20) is ooit gerepareerd en heeft eigen tests. Twee andere
 * paden in hetzelfde bestand bleven ongetest en verwezen naar kolommen en
 * tabellen die niet bestaan:
 *
 *   - `GET /data-summary` telde `audio_recordings WHERE user_id` en
 *     `FROM issues`. sql.js struikelt al bij prepare(), dus het inzagerecht
 *     gaf altijd een 500.
 *   - Het goedkeuren van een verwijderverzoek deed achttien DELETE's in een
 *     try/catch die elke fout met een logger.warn wegslikte. Vier ervan konden
 *     niet werken, en de beheerder kreeg toch "successfully".
 *
 * De laatste test in dit bestand controleert de eigenschap zelf: elke tabel en
 * kolom in die verwijderlijst moet bestaan. Zonder zo'n controle is de volgende
 * verschrijving weer pas over een jaar zichtbaar.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import gdprRoutes from '../../routes/gdpr';
import { errorHandler } from '../../middleware/errorHandler';
import { createTestEnvironment, createTestOrchestra, createTestUser, TestUser } from '../testUtils';

const app = express();
app.use(express.json());
app.use('/api/gdpr', gdprRoutes);
app.use(errorHandler);

let lid: TestUser;
let lidToken: string;
let adminToken: string;
let associationId: string;

beforeEach(() => {
  const omgeving = createTestEnvironment();
  lid = omgeving.memberUser;
  lidToken = omgeving.memberToken;
  adminToken = omgeving.adminToken;
  associationId = omgeving.association.id;
});

describe('AVG-inzage: het overzicht van opgeslagen gegevens', () => {
  it('geeft een overzicht in plaats van een serverfout', async () => {
    const res = await request(app).get('/api/gdpr/data-summary').set('Authorization', `Bearer ${lidToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.categories)).toBe(true);
    // Categorieen zonder gegevens worden weggelaten, 'profile' blijft altijd.
    expect(res.body.categories.map((c: { name: string }) => c.name)).toContain('profile');
  });

  it('telt de opnamen die het lid zelf maakte', async () => {
    const titelId = uuidv4();
    db.prepare("INSERT INTO music_titles (id, title, association_id) VALUES (?, 'Mars', ?)").run(
      titelId,
      associationId,
    );
    db.prepare(
      `INSERT INTO audio_recordings (id, association_id, music_title_id, title, duration_seconds, recorded_by, file_path, file_size, mime_type)
       VALUES (?, ?, ?, 'Opname', 60, ?, '/tmp/opname.mp3', 1024, 'audio/mpeg')`,
    ).run(uuidv4(), associationId, titelId, lid.id);

    const res = await request(app).get('/api/gdpr/data-summary').set('Authorization', `Bearer ${lidToken}`);

    const opnamen = res.body.categories.find((c: { name: string }) => c.name === 'audioRecordings');
    expect(opnamen.count).toBe(1);
  });

  it('telt de bladmuziekfouten die het lid meldde', async () => {
    const stukId = uuidv4();
    db.prepare(
      "INSERT INTO music_pieces (id, title, association_id, file_path, original_filename) VALUES (?, 'Mars - Trompet', ?, '/tmp/a.pdf', 'a.pdf')",
    ).run(stukId, associationId);
    db.prepare(
      "INSERT INTO piece_issues (id, music_piece_id, reported_by, description) VALUES (?, ?, ?, 'Maat 12 ontbreekt')",
    ).run(uuidv4(), stukId, lid.id);

    const res = await request(app).get('/api/gdpr/data-summary').set('Authorization', `Bearer ${lidToken}`);

    const meldingen = res.body.categories.find((c: { name: string }) => c.name === 'issues');
    expect(meldingen.count).toBe(1);
  });
});

describe('AVG-verwijdering: wat er echt weggaat', () => {
  function maakVerzoek(): string {
    const id = uuidv4();
    db.prepare("INSERT INTO deletion_requests (id, user_id, reason, status) VALUES (?, ?, 'Ik stop', 'pending')").run(
      id,
      lid.id,
    );
    return id;
  }

  const goedkeuren = (verzoekId: string) =>
    request(app)
      .post(`/api/gdpr/deletion-requests/${verzoekId}/process`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'approve' });

  it('verwijdert de opnamen van het lid', async () => {
    const titelId = uuidv4();
    db.prepare("INSERT INTO music_titles (id, title, association_id) VALUES (?, 'Mars', ?)").run(
      titelId,
      associationId,
    );
    db.prepare(
      `INSERT INTO audio_recordings (id, association_id, music_title_id, title, duration_seconds, recorded_by, file_path, file_size, mime_type)
       VALUES (?, ?, ?, 'Opname', 60, ?, '/tmp/opname.mp3', 1024, 'audio/mpeg')`,
    ).run(uuidv4(), associationId, titelId, lid.id);

    const res = await goedkeuren(maakVerzoek());

    expect(res.status).toBe(200);
    const over = db.prepare('SELECT COUNT(*) as n FROM audio_recordings WHERE recorded_by = ?').get(lid.id) as {
      n: number;
    };
    expect(over.n).toBe(0);
  });

  it('verwijdert de gemelde bladmuziekfouten, met hun vrije tekst', async () => {
    const stukId = uuidv4();
    db.prepare(
      "INSERT INTO music_pieces (id, title, association_id, file_path, original_filename) VALUES (?, 'Mars - Trompet', ?, '/tmp/a.pdf', 'a.pdf')",
    ).run(stukId, associationId);
    db.prepare(
      "INSERT INTO piece_issues (id, music_piece_id, reported_by, description) VALUES (?, ?, ?, 'Maat 12 ontbreekt')",
    ).run(uuidv4(), stukId, lid.id);

    await goedkeuren(maakVerzoek());

    const over = db.prepare('SELECT COUNT(*) as n FROM piece_issues WHERE reported_by = ?').get(lid.id) as {
      n: number;
    };
    expect(over.n).toBe(0);
  });

  it('verwijdert zitplaatsvoorkeuren, ook waar het lid de buurman is', async () => {
    // Het tweede geval is het punt: die voorkeur staat bij iemand anders in de
    // rij en verwijst met naam en toenaam naar het vertrokken lid.
    const orkest = createTestOrchestra(associationId);
    const ander = createTestUser(associationId, { email: 'buurman@test.com', role: 'member' });

    db.prepare(
      "INSERT INTO seating_neighbors (id, orchestra_id, user_id, neighbor_user_id, preference) VALUES (?, ?, ?, ?, 'preferred')",
    ).run(uuidv4(), orkest.id, lid.id, ander.id);
    db.prepare(
      "INSERT INTO seating_neighbors (id, orchestra_id, user_id, neighbor_user_id, preference) VALUES (?, ?, ?, ?, 'avoid')",
    ).run(uuidv4(), orkest.id, ander.id, lid.id);

    await goedkeuren(maakVerzoek());

    const over = db
      .prepare('SELECT COUNT(*) as n FROM seating_neighbors WHERE user_id = ? OR neighbor_user_id = ?')
      .get(lid.id, lid.id) as { n: number };
    expect(over.n).toBe(0);
  });

  it('meldt per tabel hoeveel er weg is', async () => {
    const res = await goedkeuren(maakVerzoek());

    expect(res.status).toBe(200);
    // Zonder de reparatie ontbraken deze sleutels simpelweg - niet als 0, maar
    // afwezig, omdat de DELETE stukliep en de catch hem opslokte.
    expect(res.body.deletedCounts).toHaveProperty('audio_recordings');
    expect(res.body.deletedCounts).toHaveProperty('piece_issues');
    expect(res.body.deletedCounts).toHaveProperty('seating_neighbors');
  });
});

describe('De verwijderlijst wijst naar bestaande tabellen en kolommen', () => {
  it('elke DELETE in gdpr.ts is uitvoerbaar', () => {
    // Dit is de controle die de vier verschrijvingen jarenlang had kunnen
    // vangen. We lezen de lijst uit de bron en laten SQLite hem klaarzetten;
    // een onbekende tabel of kolom valt dan meteen op.
    const bron = fs.readFileSync(path.join(__dirname, '../../routes/gdpr.ts'), 'utf-8');
    const statements = [...bron.matchAll(/'(DELETE FROM \w+ WHERE \w+ = \?)'/g)].map((m) => m[1]);

    expect(statements.length).toBeGreaterThan(10);

    const onuitvoerbaar: string[] = [];
    for (const sql of statements) {
      try {
        db.prepare(sql).run('00000000-0000-0000-0000-000000000000');
      } catch (error) {
        onuitvoerbaar.push(`${sql} - ${(error as Error).message}`);
      }
    }

    expect(onuitvoerbaar).toEqual([]);
  });
});
