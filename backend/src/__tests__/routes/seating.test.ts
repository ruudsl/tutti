/**
 * De opstelling van het orkest: rijen, zitplaatsen en wie naast wie wil zitten.
 *
 * Dit bestand stond op nul procent. De twee eigenschappen die hier het meest
 * toe doen zijn dat een rijnummer en een zitplaats maar een keer vergeven
 * kunnen worden - anders staan er twee mensen op dezelfde plek - en dat een
 * vereniging niet in de opstelling van een andere kan rommelen.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import seatingRoutes from '../../routes/seating';
import { errorHandler } from '../../middleware/errorHandler';
import {
  createTestAssociation,
  createTestUser,
  createTestOrchestra,
  generateTestToken,
  createTestEnvironment,
} from '../testUtils';

const app = express();
app.use(express.json());
app.use('/api', rateLimit({ windowMs: 60_000, limit: 10_000 }));
app.use('/api/seating', seatingRoutes);
app.use(errorHandler);

let adminToken: string;
let memberToken: string;
let associationId: string;
let orkestId: string;

beforeEach(() => {
  const omgeving = createTestEnvironment();
  adminToken = omgeving.adminToken;
  memberToken = omgeving.memberToken;
  associationId = omgeving.association.id;
  orkestId = createTestOrchestra(associationId).id;
});

const alsAdmin = (methode: 'get' | 'post' | 'put' | 'delete', pad: string) =>
  request(app)[methode](`/api/seating${pad}`).set('Authorization', `Bearer ${adminToken}`);

async function maakRij(overschrijf: Record<string, unknown> = {}) {
  const res = await alsAdmin('post', '/sections').send({
    orchestraId: orkestId,
    name: 'Eerste rij',
    rowNumber: 1,
    ...overschrijf,
  });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

describe('Rijen', () => {
  it('maakt een rij aan en toont hem', async () => {
    const id = await maakRij();

    const res = await alsAdmin('get', `/sections/${orkestId}`);
    expect(res.status).toBe(200);
    expect(res.body.map((r: { id: string }) => r.id)).toContain(id);
  });

  it('geeft hetzelfde rijnummer niet twee keer uit', async () => {
    // Twee rijen met nummer 1 betekent dat niemand meer weet welke rij welke
    // is, en de opstelling per weergave kan verspringen.
    await maakRij();

    const res = await alsAdmin('post', '/sections').send({
      orchestraId: orkestId,
      name: 'Ook eerste rij',
      rowNumber: 1,
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('bestaat al');
  });

  it('weigert een rijnummer van nul', async () => {
    const res = await alsAdmin('post', '/sections').send({
      orchestraId: orkestId,
      name: 'Rij nul',
      rowNumber: 0,
    });
    expect(res.status).toBe(400);
  });

  it('weigert een rij zonder naam', async () => {
    const res = await alsAdmin('post', '/sections').send({
      orchestraId: orkestId,
      name: '',
      rowNumber: 2,
    });
    expect(res.status).toBe(400);
  });

  it('meldt dat een onbekend orkest niet bestaat', async () => {
    const res = await alsAdmin('post', '/sections').send({
      orchestraId: uuidv4(),
      name: 'Rij',
      rowNumber: 1,
    });
    expect(res.status).toBe(404);
  });

  it('werkt een rij bij', async () => {
    const id = await maakRij();

    const res = await alsAdmin('put', `/sections/${id}`).send({ name: 'Hernoemd' });
    expect(res.status).toBe(200);
  });

  it('verwijdert een rij', async () => {
    const id = await maakRij();

    const res = await alsAdmin('delete', `/sections/${id}`);
    expect(res.status).toBe(200);

    const lijst = await alsAdmin('get', `/sections/${orkestId}`);
    expect(lijst.body.map((r: { id: string }) => r.id)).not.toContain(id);
  });
});

describe('Zitplaatsen', () => {
  it('wijst een zitplaats toe', async () => {
    const rijId = await maakRij();
    const lid = createTestUser(associationId, { email: 'speler@test.com', role: 'member' });

    const res = await alsAdmin('post', '/assignments').send({
      orchestraId: orkestId,
      userId: lid.id,
      sectionId: rijId,
      positionInSection: 0,
    });

    expect(res.status).toBe(201);
  });

  it('geeft hetzelfde lid niet twee zitplaatsen in een orkest', async () => {
    // Anders staat iemand op twee plekken tegelijk in dezelfde opstelling.
    const rijId = await maakRij();
    const tweedeRij = await maakRij({ name: 'Tweede rij', rowNumber: 2 });
    const lid = createTestUser(associationId, { email: 'dubbel@test.com', role: 'member' });

    await alsAdmin('post', '/assignments').send({
      orchestraId: orkestId,
      userId: lid.id,
      sectionId: rijId,
      positionInSection: 0,
    });

    const res = await alsAdmin('post', '/assignments').send({
      orchestraId: orkestId,
      userId: lid.id,
      sectionId: tweedeRij,
      positionInSection: 1,
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('al een zitplaats');
  });

  it('toont de opstelling van een orkest', async () => {
    const res = await alsAdmin('get', `/assignments/${orkestId}`);
    expect(res.status).toBe(200);
  });
});

describe('Wie mag de opstelling wijzigen', () => {
  it('vraagt om een token', async () => {
    const res = await request(app).get(`/api/seating/sections/${orkestId}`);
    expect(res.status).toBe(401);
  });

  it('laat een gewoon lid geen rij aanmaken', async () => {
    const res = await request(app)
      .post('/api/seating/sections')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ orchestraId: orkestId, name: 'Mag niet', rowNumber: 9 });

    expect(res.status).toBe(403);
  });
});

describe('Scheiding tussen verenigingen', () => {
  it('laat geen rij aanmaken bij het orkest van een ander', async () => {
    const andere = createTestAssociation();
    const hunOrkest = createTestOrchestra(andere.id);

    const res = await alsAdmin('post', '/sections').send({
      orchestraId: hunOrkest.id,
      name: 'Ingebroken',
      rowNumber: 1,
    });

    expect(res.status).toBe(404);
  });

  it('laat de rij van een ander orkest niet verwijderen', async () => {
    const andere = createTestAssociation();
    const hunOrkest = createTestOrchestra(andere.id);
    const hunAdmin = createTestUser(andere.id, { email: 'admin-seat@test.com', role: 'admin' });

    const gemaakt = await request(app)
      .post('/api/seating/sections')
      .set('Authorization', `Bearer ${generateTestToken(hunAdmin)}`)
      .send({ orchestraId: hunOrkest.id, name: 'Hun rij', rowNumber: 1 });
    expect(gemaakt.status).toBe(201);

    const res = await alsAdmin('delete', `/sections/${gemaakt.body.id}`);
    expect(res.status).toBe(404);

    // En de rij moet er echt nog zijn.
    const rij = db.prepare('SELECT id FROM seating_sections WHERE id = ?').get(gemaakt.body.id);
    expect(rij).toBeTruthy();
  });
});

describe('Geneste verwijzingen blijven binnen de eigen vereniging', () => {
  /**
   * De routes hier controleren netjes het orkest uit het pad of uit de body,
   * maar de id's die daar onder hangen - de rij, het lid, de repetitie - gingen
   * ongezien mee. Dat is meer dan een schoonheidsfout: een opstelling bevat
   * namen, e-mailadressen en instrumenten van leden, en die worden bij het
   * opvragen uit de gekoppelde tabellen gehaald. Wie een vreemd id naar binnen
   * kon schrijven, kreeg die gegevens daarna gewoon terug te lezen.
   */
  let andereVereniging: { id: string };
  let hunOrkest: string;
  let hunLid: ReturnType<typeof createTestUser>;
  let hunRij: string;

  beforeEach(async () => {
    andereVereniging = createTestAssociation({ name: `Buren-${uuidv4()}` });
    hunOrkest = createTestOrchestra(andereVereniging.id, { name: 'Orkest van de buren' }).id;
    hunLid = createTestUser(andereVereniging.id, {
      email: `buur-${uuidv4()}@test.nl`,
      firstName: 'Geheime',
      lastName: 'Buurman',
    });

    const hunAdmin = createTestUser(andereVereniging.id, { email: `buuradmin-${uuidv4()}@test.nl`, role: 'admin' });
    const gemaakt = await request(app)
      .post('/api/seating/sections')
      .set('Authorization', `Bearer ${generateTestToken(hunAdmin)}`)
      .send({ orchestraId: hunOrkest, name: 'Hun rij', rowNumber: 1 });
    expect(gemaakt.status).toBe(201);
    hunRij = gemaakt.body.id;
  });

  it('weigert een zitplaats voor een lid van een andere vereniging', async () => {
    const eigenRij = await maakRij();

    const res = await alsAdmin('post', '/assignments').send({
      orchestraId: orkestId,
      userId: hunLid.id,
      sectionId: eigenRij,
      positionInSection: 0,
    });

    expect(res.status).toBe(404);
    expect(db.prepare('SELECT id FROM seating_assignments WHERE user_id = ?').get(hunLid.id)).toBeUndefined();
  });

  it('lekt de naam van een vreemd lid niet via de opstelling', async () => {
    // Zonder controle kwam de zitplaats er wel in, en gaf GET /assignments de
    // naam en het e-mailadres van dat lid netjes terug.
    const eigenRij = await maakRij();
    await alsAdmin('post', '/assignments').send({
      orchestraId: orkestId,
      userId: hunLid.id,
      sectionId: eigenRij,
      positionInSection: 0,
    });

    const res = await alsAdmin('get', `/assignments/${orkestId}`);
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain('Buurman');
    expect(JSON.stringify(res.body)).not.toContain(hunLid.email);
  });

  it('weigert een zitplaats in een rij van een ander orkest', async () => {
    const eigenLid = createTestUser(associationId, { email: `eigen-${uuidv4()}@test.nl` });

    const res = await alsAdmin('post', '/assignments').send({
      orchestraId: orkestId,
      userId: eigenLid.id,
      sectionId: hunRij,
      positionInSection: 0,
    });

    expect(res.status).toBe(404);
  });

  it('verplaatst een zitplaats niet naar een rij van een ander orkest', async () => {
    const eigenRij = await maakRij();
    const eigenLid = createTestUser(associationId, { email: `eigen2-${uuidv4()}@test.nl` });
    const gemaakt = await alsAdmin('post', '/assignments').send({
      orchestraId: orkestId,
      userId: eigenLid.id,
      sectionId: eigenRij,
      positionInSection: 0,
    });
    expect(gemaakt.status).toBe(201);

    const res = await alsAdmin('put', `/assignments/${gemaakt.body.id}`).send({ sectionId: hunRij });

    expect(res.status).toBe(404);
    const na = db.prepare('SELECT section_id FROM seating_assignments WHERE id = ?').get(gemaakt.body.id) as {
      section_id: string;
    };
    expect(na.section_id).toBe(eigenRij);
  });

  it('weigert een sleepactie met een vreemd lid of een vreemde rij', async () => {
    const eigenRij = await maakRij();

    const metVreemdLid = await alsAdmin('put', `/assignments/bulk/${orkestId}`).send({
      assignments: [{ userId: hunLid.id, sectionId: eigenRij, positionInSection: 0 }],
    });
    expect(metVreemdLid.status).toBe(404);

    const eigenLid = createTestUser(associationId, { email: `eigen3-${uuidv4()}@test.nl` });
    const metVreemdeRij = await alsAdmin('put', `/assignments/bulk/${orkestId}`).send({
      assignments: [{ userId: eigenLid.id, sectionId: hunRij, positionInSection: 0 }],
    });
    expect(metVreemdeRij.status).toBe(404);

    expect(db.prepare('SELECT COUNT(*) as aantal FROM seating_assignments').get()).toMatchObject({ aantal: 0 });
  });

  it('weigert een buurvoorkeur met een lid van een andere vereniging', async () => {
    const eigenLid = createTestUser(associationId, { email: `eigen4-${uuidv4()}@test.nl` });

    const res = await alsAdmin('post', '/neighbors').send({
      orchestraId: orkestId,
      userId: eigenLid.id,
      neighborUserId: hunLid.id,
      preference: 'preferred',
    });

    expect(res.status).toBe(404);
    expect(db.prepare('SELECT COUNT(*) as aantal FROM seating_neighbors').get()).toMatchObject({ aantal: 0 });
  });

  it('toont de opstelling van een repetitie van een andere vereniging niet', async () => {
    // Het orkest in het pad wordt gecontroleerd, de rehearsalId in de
    // queryparameter niet. Die kwam rechtstreeks in de zoekopdracht naar
    // rehearsal_seating terecht, met de ledennamen van die andere vereniging
    // als antwoord.
    const hunRepetitie = uuidv4();
    db.prepare(
      `INSERT INTO rehearsals (id, association_id, date, start_time, end_time, type)
       VALUES (?, ?, '2026-09-09', '19:30', '21:30', 'regular')`,
    ).run(hunRepetitie, andereVereniging.id);
    db.prepare(
      `INSERT INTO rehearsal_seating (id, rehearsal_id, member_name, row_number, position_in_row)
       VALUES (?, ?, 'Geheime Buurman', 1, 0)`,
    ).run(uuidv4(), hunRepetitie);

    const res = await alsAdmin('get', `/chart/${orkestId}?rehearsalId=${hunRepetitie}`);

    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toContain('Buurman');
  });

  it('toont de opstelling van een eigen repetitie wel', async () => {
    const eigenRepetitie = uuidv4();
    db.prepare(
      `INSERT INTO rehearsals (id, association_id, date, start_time, end_time, type)
       VALUES (?, ?, '2026-09-10', '19:30', '21:30', 'regular')`,
    ).run(eigenRepetitie, associationId);
    db.prepare(
      `INSERT INTO rehearsal_seating (id, rehearsal_id, member_name, row_number, position_in_row)
       VALUES (?, ?, 'Eigen Speler', 1, 0)`,
    ).run(uuidv4(), eigenRepetitie);

    const res = await alsAdmin('get', `/chart/${orkestId}?rehearsalId=${eigenRepetitie}`);

    expect(res.status).toBe(200);
    expect(res.body.seats.map((s: { memberName: string }) => s.memberName)).toContain('Eigen Speler');
  });

  it('toont een lid dat later verwijderd is niet meer in de opstelling', async () => {
    // Een zitplaats blijft staan als het lid zacht verwijderd wordt. De
    // overzichten haalden de naam en het e-mailadres daarna nog gewoon uit
    // users op, want deleted_at werd niet gefilterd.
    const eigenRij = await maakRij();
    const lid = createTestUser(associationId, {
      email: `vertrokken-${uuidv4()}@test.nl`,
      firstName: 'Vertrokken',
      lastName: 'Lid',
    });
    const gemaakt = await alsAdmin('post', '/assignments').send({
      orchestraId: orkestId,
      userId: lid.id,
      sectionId: eigenRij,
      positionInSection: 0,
    });
    expect(gemaakt.status).toBe(201);

    db.prepare("UPDATE users SET deleted_at = '2026-02-02T00:00:00.000Z' WHERE id = ?").run(lid.id);

    const lijst = await alsAdmin('get', `/assignments/${orkestId}`);
    expect(JSON.stringify(lijst.body)).not.toContain('Vertrokken');

    const kaart = await alsAdmin('get', `/chart/${orkestId}`);
    expect(JSON.stringify(kaart.body)).not.toContain('Vertrokken');
  });

  it('zet een verwijderd lid niet in de opstelling', async () => {
    // users kent deleted_at; wie weg is hoort niet meer in de opstelling te
    // verschijnen, en al helemaal geen nieuwe zitplaats te krijgen.
    const eigenRij = await maakRij();
    const vertrokken = createTestUser(associationId, { email: `weg-${uuidv4()}@test.nl` });
    db.prepare("UPDATE users SET deleted_at = '2026-01-01T00:00:00.000Z' WHERE id = ?").run(vertrokken.id);

    const res = await alsAdmin('post', '/assignments').send({
      orchestraId: orkestId,
      userId: vertrokken.id,
      sectionId: eigenRij,
      positionInSection: 0,
    });

    expect(res.status).toBe(404);
  });
});
