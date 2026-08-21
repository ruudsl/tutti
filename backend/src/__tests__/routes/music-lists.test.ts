/**
 * Muzieklijsten: de mappen waarin een orkest zijn repertoire ordent.
 *
 * Dit bestand stond op nul procent. Een lijst hoort bij een orkest, dus de
 * belangrijkste grens is dat je geen lijst kunt maken bij het orkest van een
 * andere vereniging, en dat een lijst niet zichtbaar wordt buiten de eigen
 * vereniging.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import rateLimit from 'express-rate-limit';
import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import musicListsRoutes from '../../routes/music-lists';
import { errorHandler } from '../../middleware/errorHandler';
import {
  createTestAssociation,
  createTestUser,
  createTestOrchestra,
  createTestInstrument,
  createTestMusicPiece,
  addInstrumentToUser,
  addUserToOrchestra,
  generateTestToken,
  createTestEnvironment,
  TestUser,
} from '../testUtils';

const app = express();
app.use(express.json());
app.use('/api', rateLimit({ windowMs: 60_000, limit: 10_000 }));
app.use('/api/music-lists', musicListsRoutes);
app.use(errorHandler);

let adminToken: string;
let memberToken: string;
let lid: TestUser;
let associationId: string;
let orkestId: string;

beforeEach(() => {
  const omgeving = createTestEnvironment();
  adminToken = omgeving.adminToken;
  memberToken = omgeving.memberToken;
  lid = omgeving.memberUser;
  associationId = omgeving.association.id;
  orkestId = createTestOrchestra(associationId).id;
});

const alsLid = (methode: 'get' | 'post' | 'put' | 'patch' | 'delete', pad: string) =>
  request(app)[methode](`/api/music-lists${pad}`).set('Authorization', `Bearer ${memberToken}`);

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '../../../uploads');
const aangemaakteBestanden: string[] = [];

/** Zet een pdf in de uploadmap; zonder bestand op schijf blijft een zip leeg. */
function legBestandNeer(bestandsnaam: string) {
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const pad = path.join(UPLOAD_DIR, bestandsnaam);
  fs.writeFileSync(pad, '%PDF-1.1\ntrailer<</Root 1 0 R>>\n');
  aangemaakteBestanden.push(pad);
}

afterEach(() => {
  for (const pad of aangemaakteBestanden.splice(0)) {
    if (fs.existsSync(pad)) fs.unlinkSync(pad);
  }
});

const alsAdmin = (methode: 'get' | 'post' | 'put' | 'patch' | 'delete', pad: string) =>
  request(app)[methode](`/api/music-lists${pad}`).set('Authorization', `Bearer ${adminToken}`);

async function maakLijst(overschrijf: Record<string, unknown> = {}) {
  const res = await alsAdmin('post', '/').send({
    name: 'Repertoire voorjaar',
    orchestraId: orkestId,
    ...overschrijf,
  });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

describe('Muzieklijsten', () => {
  it('maakt een lijst aan en toont hem', async () => {
    const id = await maakLijst();

    const res = await alsAdmin('get', `/orchestra/${orkestId}`);
    expect(res.status).toBe(200);
    const lijst = Array.isArray(res.body) ? res.body : (res.body.data ?? []);
    expect(lijst.map((l: { id: string }) => l.id)).toContain(id);
  });

  it('weigert een lijst zonder naam', async () => {
    const res = await alsAdmin('post', '/').send({ name: '', orchestraId: orkestId });
    expect(res.status).toBe(400);
  });

  it('weigert een lijst zonder orkest', async () => {
    const res = await alsAdmin('post', '/').send({ name: 'Zwevende lijst' });
    expect(res.status).toBe(400);
  });

  it('weigert een onbekend soort lijst', async () => {
    const res = await alsAdmin('post', '/').send({
      name: 'Fout',
      orchestraId: orkestId,
      listType: 'kerstborrel',
    });
    expect(res.status).toBe(400);
  });

  it('meldt dat een onbekend orkest niet bestaat', async () => {
    const res = await alsAdmin('post', '/').send({ name: 'Lijst', orchestraId: uuidv4() });
    expect(res.status).toBe(404);
  });

  it('toont een lijst op id', async () => {
    const id = await maakLijst();

    const res = await alsAdmin('get', `/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Repertoire voorjaar');
  });

  it('meldt netjes dat een onbekende lijst niet bestaat', async () => {
    const res = await alsAdmin('get', `/${uuidv4()}`);
    expect(res.status).toBe(404);
  });

  it('werkt een lijst bij', async () => {
    const id = await maakLijst();

    const res = await alsAdmin('put', `/${id}`).send({ name: 'Hernoemd' });
    expect(res.status).toBe(200);

    const na = await alsAdmin('get', `/${id}`);
    expect(na.body.name).toBe('Hernoemd');
  });

  it('zet een lijst op inactief en weer terug', async () => {
    const id = await maakLijst();

    // Omzetten gaat met PATCH; het is een wijziging van een enkel veld.
    expect((await alsAdmin('patch', `/${id}/toggle-active`)).status).toBe(200);
    expect((await alsAdmin('patch', `/${id}/toggle-active`)).status).toBe(200);
  });

  it('verwijdert een lijst', async () => {
    const id = await maakLijst();

    expect((await alsAdmin('delete', `/${id}`)).status).toBe(200);
    expect((await alsAdmin('get', `/${id}`)).status).toBe(404);
  });

  it('toont mijn eigen lijsten', async () => {
    const res = await alsAdmin('get', '/my-lists');
    expect(res.status).toBe(200);
  });
});

describe('Wie mag lijsten beheren', () => {
  it('vraagt om een token', async () => {
    const res = await request(app).get(`/api/music-lists/orchestra/${orkestId}`);
    expect(res.status).toBe(401);
  });

  it('laat een gewoon lid geen lijst aanmaken', async () => {
    const res = await request(app)
      .post('/api/music-lists/')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ name: 'Mag niet', orchestraId: orkestId });

    expect(res.status).toBe(403);
  });
});

describe('Scheiding tussen verenigingen', () => {
  it('laat geen lijst maken bij het orkest van een ander', async () => {
    const andere = createTestAssociation();
    const hunOrkest = createTestOrchestra(andere.id);

    const res = await alsAdmin('post', '/').send({ name: 'Ingebroken', orchestraId: hunOrkest.id });
    expect(res.status).toBe(404);
  });

  it('toont de lijst van een andere vereniging niet', async () => {
    const id = await maakLijst();

    const andere = createTestAssociation();
    const andereToken = generateTestToken(createTestUser(andere.id, { email: 'admin-lists@test.com', role: 'admin' }));

    const res = await request(app).get(`/api/music-lists/${id}`).set('Authorization', `Bearer ${andereToken}`);
    expect(res.status).toBe(404);
  });

  it('laat de lijst van een andere vereniging niet verwijderen', async () => {
    const id = await maakLijst();

    const andere = createTestAssociation();
    const andereToken = generateTestToken(createTestUser(andere.id, { email: 'admin-lists2@test.com', role: 'admin' }));

    const res = await request(app).delete(`/api/music-lists/${id}`).set('Authorization', `Bearer ${andereToken}`);
    expect(res.status).toBe(404);

    expect(db.prepare('SELECT id FROM music_lists WHERE id = ?').get(id)).toBeTruthy();
  });
});

describe('Een verborgen lijst', () => {
  /**
   * is_active staat los van verwijderen: een lijst op inactief is voor leden
   * uit beeld, maar de muziekcommissie werkt er nog aan. GET /my-lists hield
   * daar rekening mee, het opvragen op id en het downloaden niet - en met het
   * id in de hand was de lijst gewoon leesbaar.
   */
  async function verborgenLijst() {
    const id = await maakLijst();
    expect((await alsAdmin('patch', `/${id}/toggle-active`)).status).toBe(200);
    return id;
  }

  it('is voor een lid niet op te vragen', async () => {
    const id = await verborgenLijst();

    expect((await alsLid('get', `/${id}`)).status).toBe(404);
  });

  it('is voor een lid niet te downloaden', async () => {
    // Het lid moet wel een partij op de lijst hebben staan die hij mag hebben,
    // anders komt de 404 van "geen partijen gevonden" en zegt de test niets
    // over de verborgen lijst. De tekst maakt het onderscheid: het bestand
    // staat niet op schijf, dus zonder de controle op is_active komt de route
    // helemaal tot "Geen bestanden gevonden".
    const trompet = createTestInstrument({ name: 'Trompet download' });
    addInstrumentToUser(lid.id, trompet.id);
    const id = await maakLijst();
    const partij = createTestMusicPiece(associationId, { title: 'Mars', instrumentId: trompet.id });
    expect((await alsAdmin('post', `/${id}/pieces`).send({ pieceId: partij.id })).status).toBe(201);
    expect((await alsAdmin('patch', `/${id}/toggle-active`)).status).toBe(200);

    const res = await alsLid('get', `/${id}/download-zip`);
    expect(res.status).toBe(404);
    expect(res.body.error).toContain('Muzieklijst niet gevonden');
  });

  it('blijft voor de muziekcommissie gewoon zichtbaar', async () => {
    const id = await verborgenLijst();

    expect((await alsAdmin('get', `/${id}`)).status).toBe(200);
  });
});

describe('Wat een lijst optelt', () => {
  /** Zet een partij met deze titel op de lijst. */
  async function zetOpLijst(lijstId: string, titel: string, extra: Record<string, unknown> = {}) {
    const partij = createTestMusicPiece(associationId, { title: titel, ...extra });
    const res = await alsAdmin('post', `/${lijstId}/pieces`).send({ pieceId: partij.id });
    expect(res.status).toBe(201);
    return partij;
  }

  /** Legt de speelduur van een titel vast bij een vereniging. */
  function maakTitel(vanAssociationId: string, titel: string, seconden: number, verwijderd = false) {
    db.prepare(
      `INSERT INTO music_titles (id, title, arranger, duration_seconds, association_id, deleted_at)
       VALUES (?, ?, NULL, ?, ?, ?)`,
    ).run(uuidv4(), titel, seconden, vanAssociationId, verwijderd ? new Date().toISOString() : null);
  }

  async function lijstUitOverzicht(lijstId: string) {
    const res = await alsAdmin('get', `/orchestra/${orkestId}`);
    expect(res.status).toBe(200);
    const lijst = Array.isArray(res.body) ? res.body : (res.body.data ?? []);
    return lijst.find((l: { id: string }) => l.id === lijstId);
  }

  it('telt de speelduur van een andere vereniging niet mee', async () => {
    // music_titles is uniek per (titel, arrangeur, vereniging). Zonder grens
    // telde dezelfde titel bij elke andere vereniging gewoon mee.
    const id = await maakLijst();
    await zetOpLijst(id, 'Mars der Medici');
    maakTitel(associationId, 'Mars der Medici', 120);
    maakTitel(createTestAssociation({ name: 'Buren' }).id, 'Mars der Medici', 300);

    expect((await lijstUitOverzicht(id)).totalDuration).toBe(120);
  });

  it('telt de speelduur van een verwijderde titel niet mee', async () => {
    const id = await maakLijst();
    await zetOpLijst(id, 'Mars der Medici');
    maakTitel(associationId, 'Mars der Medici', 120, true);

    expect((await lijstUitOverzicht(id)).totalDuration).toBe(0);
  });

  it('telt de speelduur ook in mijn eigen lijsten zuiver op', async () => {
    addUserToOrchestra(lid.id, orkestId);
    const id = await maakLijst();
    await zetOpLijst(id, 'Mars der Medici');
    maakTitel(associationId, 'Mars der Medici', 120);
    maakTitel(createTestAssociation({ name: 'Buren 2' }).id, 'Mars der Medici', 300);

    const res = await alsLid('get', '/my-lists');
    expect(res.status).toBe(200);
    const lijst = (res.body as { id: string; totalDuration: number }[]).find((l) => l.id === id);
    expect(lijst!.totalDuration).toBe(120);
  });

  it('telt een verwijderde partij niet mee', async () => {
    const id = await maakLijst();
    const blijft = await zetOpLijst(id, 'Mars der Medici');
    const weg = await zetOpLijst(id, 'Oude mars');
    db.prepare('UPDATE music_pieces SET deleted_at = ? WHERE id = ?').run(new Date().toISOString(), weg.id);

    const lijst = await lijstUitOverzicht(id);
    expect(lijst.pieceCount).toBe(1);
    expect(lijst.titleCount).toBe(1);
    expect(blijft.id).toBeTruthy();
  });

  it('neemt een verwijderde partij niet meer op in een lijst', async () => {
    const id = await maakLijst();
    const partij = createTestMusicPiece(associationId, {
      title: 'Verwijderd',
      deletedAt: new Date().toISOString(),
    });

    const res = await alsAdmin('post', `/${id}/pieces`).send({ pieceId: partij.id });
    expect(res.status).toBe(404);
  });
});

describe('De volgorde van titels op een lijst', () => {
  /**
   * De muziekcommissie sleept titels in de volgorde van het concert. Die
   * volgorde werd wel opgeslagen in music_list_pieces.position, maar nergens
   * gelezen: elke lijst kwam er alfabetisch uit. Daarmee deed het slepen niets.
   */
  async function lijstMetTweeTitels() {
    const id = await maakLijst();
    for (const titel of ['Alfa mars', 'Bravo mars']) {
      const partij = createTestMusicPiece(associationId, { title: titel });
      expect((await alsAdmin('post', `/${id}/pieces`).send({ pieceId: partij.id })).status).toBe(201);
    }
    return id;
  }

  it('houdt de gesleepte volgorde aan bij het opvragen', async () => {
    const id = await lijstMetTweeTitels();

    const res = await alsAdmin('put', `/${id}/reorder-titles`).send({
      titleOrder: ['Bravo mars', 'Alfa mars'],
    });
    expect(res.status).toBe(200);

    const na = await alsAdmin('get', `/${id}`);
    expect(na.body.pieces.map((p: { title: string }) => p.title)).toEqual(['Bravo mars', 'Alfa mars']);
  });

  it('valt zonder gesleepte volgorde terug op de titel', async () => {
    const id = await lijstMetTweeTitels();

    const na = await alsAdmin('get', `/${id}`);
    expect(na.body.pieces.map((p: { title: string }) => p.title)).toEqual(['Alfa mars', 'Bravo mars']);
  });

  it('houdt de volgorde ook aan in de download', async () => {
    const id = await maakLijst();
    for (const titel of ['Alfa mars', 'Bravo mars']) {
      const bestandsnaam = `test-${uuidv4()}.pdf`;
      legBestandNeer(bestandsnaam);
      const partij = createTestMusicPiece(associationId, {
        title: titel,
        filePath: bestandsnaam,
        originalFilename: `${titel}.pdf`,
      });
      expect((await alsAdmin('post', `/${id}/pieces`).send({ pieceId: partij.id })).status).toBe(201);
    }
    await alsAdmin('put', `/${id}/reorder-titles`).send({ titleOrder: ['Bravo mars', 'Alfa mars'] });

    const res = await alsAdmin('get', `/${id}/download-zip`).responseType('blob');
    expect(res.status).toBe(200);
    const namen = new AdmZip(res.body).getEntries().map((e) => e.entryName);
    expect(namen).toEqual(['Bravo mars.pdf', 'Alfa mars.pdf']);
  });

  it('levert het programma-pdf ook na het slepen', async () => {
    const id = await lijstMetTweeTitels();
    await alsAdmin('put', `/${id}/reorder-titles`).send({ titleOrder: ['Bravo mars', 'Alfa mars'] });

    // De inhoud van een pdf is in een test niet na te lezen; deze test bewaakt
    // dat de gewijzigde groepering geen fout in de query oplevert.
    const res = await alsAdmin('get', `/${id}/program-pdf`).responseType('blob');
    expect(res.status).toBe(200);
  });
});

describe('Een lid en de instrumenten die hij bespeelt', () => {
  it('ziet op een lijst alleen zijn eigen partijen', async () => {
    const trompet = createTestInstrument({ name: 'Trompet lijsten' });
    const dirigent = createTestInstrument({ name: 'Dirigent lijsten' });
    addInstrumentToUser(lid.id, trompet.id);

    const id = await maakLijst();
    for (const instrumentId of [trompet.id, dirigent.id]) {
      const partij = createTestMusicPiece(associationId, { title: 'Mars der Medici', instrumentId });
      expect((await alsAdmin('post', `/${id}/pieces`).send({ pieceId: partij.id })).status).toBe(201);
    }

    const res = await alsLid('get', `/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.pieces).toHaveLength(1);
    expect(res.body.pieces[0].instrumentName).toBe('Trompet lijsten');
  });
});
