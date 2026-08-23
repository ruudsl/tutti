/**
 * De bestandsnaam die een download meekrijgt, bij bladmuziek met een
 * niet-ASCII teken in de titel.
 *
 * Bij bladmuziek is dat eerder regel dan uitzondering: Fruhlingsstimmen met
 * umlaut, Espanita met tilde, Cafe Chantant met e-accent. De kopregel
 * Content-Disposition werd op deze vier ingangen met de hand samengesteld als
 * `attachment; filename="${naam}"`, en dat ging twee kanten op mis:
 *
 * - Waar de naam ongefilterd doorging (de zip van een muzieklijst) schreef Node
 *   het teken als losse byte weg. De browser kreeg "Caf� Chantant.zip", en
 *   bij een teken boven U+00FF weigerde Node de kopregel helemaal: een
 *   foutmelding 500 in plaats van een download.
 * - Waar de naam eerst werd kaalgeslagen (`[^a-zA-Z0-9\s-]` eruit) klopte de
 *   kopregel wel, maar was de informatie weg: "Frhlingsstimmen.pdf".
 *
 * Deze suite toetst op de daadwerkelijke kopregel, en eist dat de echte naam in
 * `filename*=UTF-8''...` terugkomt. De frontend leest die vorm met voorrang
 * (leesBestandsnaam in frontend/src/api/music.ts), dus daar komt hij aan zoals
 * hij in de database staat.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import app from '../testApp';
import musicListsRoutes from '../../routes/music-lists';
import { errorHandler } from '../../middleware/errorHandler';
import { createTestEnvironment, createTestMusicPiece, createTestOrchestra } from '../testUtils';

// testApp koppelt music-pieces wel, music-lists niet; die krijgt hier een eigen app.
const lijstenApp = express();
lijstenApp.use(express.json());
lijstenApp.use('/api/music-lists', musicListsRoutes);
lijstenApp.use(errorHandler);

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '../../../uploads');

let beheerderToken: string;
let verenigingId: string;
let orkestId: string;
const aangemaakteBestanden: string[] = [];

beforeEach(() => {
  const omgeving = createTestEnvironment();
  beheerderToken = omgeving.adminToken;
  verenigingId = omgeving.association.id;
  orkestId = createTestOrchestra(verenigingId).id;
});

afterEach(() => {
  for (const pad of aangemaakteBestanden.splice(0)) {
    if (fs.existsSync(pad)) fs.unlinkSync(pad);
  }
});

/** Zonder bestand op schijf blijft een zip leeg en geeft de route een 404. */
function legBestandNeer(): string {
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const bestandsnaam = `test-${uuidv4()}.pdf`;
  const pad = path.join(UPLOAD_DIR, bestandsnaam);
  fs.writeFileSync(pad, '%PDF-1.1\ntrailer<</Root 1 0 R>>\n');
  aangemaakteBestanden.push(pad);
  return bestandsnaam;
}

/**
 * De naam uit `filename*=UTF-8''...`, de vorm die het niet-ASCII teken draagt.
 *
 * Geeft undefined als die vorm ontbreekt; dat is precies wat er misging.
 */
function gecodeerdeNaam(kopregel: string | undefined): string | undefined {
  const treffer = kopregel?.match(/filename\*=UTF-8''([^;]+)/i);
  if (!treffer) return undefined;
  return decodeURIComponent(treffer[1].trim());
}

async function maakLijst(naam: string): Promise<string> {
  const res = await request(lijstenApp)
    .post('/api/music-lists/')
    .set('Authorization', `Bearer ${beheerderToken}`)
    .send({ name: naam, orchestraId: orkestId });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

async function zetStukInLijst(lijstId: string, titel: string) {
  const partij = createTestMusicPiece(verenigingId, {
    title: titel,
    filePath: legBestandNeer(),
    originalFilename: `${titel}.pdf`,
  });
  const res = await request(lijstenApp)
    .post(`/api/music-lists/${lijstId}/pieces`)
    .set('Authorization', `Bearer ${beheerderToken}`)
    .send({ pieceId: partij.id });
  expect(res.status).toBe(201);
  return partij;
}

describe('de zip van een muzieklijst', () => {
  it('houdt de umlaut in de naam van de lijst', async () => {
    const lijstId = await maakLijst('Frühlingsstimmen');
    await zetStukInLijst(lijstId, 'Alfa mars');

    const res = await request(lijstenApp)
      .get(`/api/music-lists/${lijstId}/download-zip`)
      .set('Authorization', `Bearer ${beheerderToken}`)
      .responseType('blob');

    expect(res.status).toBe(200);
    expect(gecodeerdeNaam(res.headers['content-disposition'])).toBe('Frühlingsstimmen.zip');
  });

  it('levert de zip ook bij een teken boven U+00FF, in plaats van een foutmelding', async () => {
    // Node weigert zo'n teken in een kopregel met ERR_INVALID_CHAR; ongefilterd
    // werd deze download daardoor een 500.
    const lijstId = await maakLijst('Dvořák');
    await zetStukInLijst(lijstId, 'Alfa mars');

    const res = await request(lijstenApp)
      .get(`/api/music-lists/${lijstId}/download-zip`)
      .set('Authorization', `Bearer ${beheerderToken}`)
      .responseType('blob');

    expect(res.status).toBe(200);
    expect(gecodeerdeNaam(res.headers['content-disposition'])).toBe('Dvořák.zip');
  });
});

describe('het programma-pdf van een muzieklijst', () => {
  it('houdt de tilde in de naam van de lijst', async () => {
    const lijstId = await maakLijst('Españita');
    await zetStukInLijst(lijstId, 'Alfa mars');

    const res = await request(lijstenApp)
      .get(`/api/music-lists/${lijstId}/program-pdf`)
      .set('Authorization', `Bearer ${beheerderToken}`)
      .responseType('blob');

    expect(res.status).toBe(200);
    expect(gecodeerdeNaam(res.headers['content-disposition'])).toBe('Españita.pdf');
  });
});

describe('het musicxml-bestand bij een titel', () => {
  /** Een titel met opgeslagen MusicXML; alleen dan geeft de route een bestand. */
  function maakTitelMetMusicxml(titel: string): string {
    const titelId = uuidv4();
    db.prepare('INSERT INTO music_titles (id, title, association_id) VALUES (?, ?, ?)').run(
      titelId,
      titel,
      verenigingId,
    );
    db.prepare('INSERT INTO music_metadata (id, music_title_id, musicxml_raw) VALUES (?, ?, ?)').run(
      uuidv4(),
      titelId,
      '<score-partwise version="4.0"></score-partwise>',
    );
    return titelId;
  }

  it('houdt de umlaut in de titel', async () => {
    const titelId = maakTitelMetMusicxml('Frühlingsstimmen');

    const res = await request(app)
      .get(`/api/music-pieces/title-musicxml/${titelId}`)
      .set('Authorization', `Bearer ${beheerderToken}`);

    expect(res.status).toBe(200);
    expect(gecodeerdeNaam(res.headers['content-disposition'])).toBe('Frühlingsstimmen.musicxml');
  });

  it('houdt een titel over die alleen uit niet-ASCII tekens bestaat', async () => {
    // Kaalslaan liet hier niets over: de gebruiker kreeg ".musicxml" aangeboden.
    const titelId = maakTitelMetMusicxml('Дунайские волны');

    const res = await request(app)
      .get(`/api/music-pieces/title-musicxml/${titelId}`)
      .set('Authorization', `Bearer ${beheerderToken}`);

    expect(res.status).toBe(200);
    expect(gecodeerdeNaam(res.headers['content-disposition'])).toBe('Дунайские волны.musicxml');
  });
});

describe('de zip-export op titel', () => {
  it('houdt de umlaut en de spaties in de titel', async () => {
    const titel = 'Frühlingsstimmen Walzer';
    createTestMusicPiece(verenigingId, { title: titel, filePath: legBestandNeer() });

    const res = await request(app)
      .post('/api/music-pieces/batch-export-by-title')
      .set('Authorization', `Bearer ${beheerderToken}`)
      .send({ title: titel })
      .responseType('blob');

    expect(res.status).toBe(200);
    const naam = gecodeerdeNaam(res.headers['content-disposition']);
    expect(naam).toMatch(/^Frühlingsstimmen Walzer-\d{4}-\d{2}-\d{2}\.zip$/);
  });

  // Deze slaagde ook op de oude code - daar hield `[^a-zA-Z0-9]` eruit strippen
  // de regelovergang tegen - en blijft staan als wacht bij de nieuwe: title komt
  // hier rechtstreeks uit req.body, en zonder filter smokkelt een titel met een
  // regelovergang erin een eigen kopregel in het antwoord.
  it('weert een regelovergang uit de titel, want die komt uit de body van het verzoek', async () => {
    const titel = 'Mars\r\nX-Gekaapt: ja';
    createTestMusicPiece(verenigingId, { title: titel, filePath: legBestandNeer() });

    const res = await request(app)
      .post('/api/music-pieces/batch-export-by-title')
      .set('Authorization', `Bearer ${beheerderToken}`)
      .send({ title: titel })
      .responseType('blob');

    expect(res.status).toBe(200);
    expect(res.headers['x-gekaapt']).toBeUndefined();
  });
});
