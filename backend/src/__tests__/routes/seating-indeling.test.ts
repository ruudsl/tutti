/**
 * De opstelling: standaardindeling, stoelen, buren en de opstelling per
 * repetitie.
 *
 * seating.test.ts dekt de scheiding tussen verenigingen af. Dit bestand gaat
 * over de indeling zelf: kan een stoel twee keer vergeven worden, wat gebeurt
 * er met een lid zonder instrument, en wat doet een verwijzing naar een stoel
 * die niet bestaat.
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
  createTestInstrument,
  createTestRehearsal,
  addUserToOrchestra,
  addInstrumentToUser,
  generateTestToken,
  createTestEnvironment,
  TestUser,
} from '../testUtils';

const app = express();
app.use(express.json());
app.use('/api', rateLimit({ windowMs: 60_000, limit: 10_000 }));
app.use('/api/seating', seatingRoutes);
app.use(errorHandler);

let adminToken: string;
let memberToken: string;
let adminGebruiker: TestUser;
let associationId: string;
let orkestId: string;

beforeEach(() => {
  const omgeving = createTestEnvironment();
  adminToken = omgeving.adminToken;
  memberToken = omgeving.memberToken;
  adminGebruiker = omgeving.adminUser;
  associationId = omgeving.association.id;
  orkestId = createTestOrchestra(associationId).id;
});

const alsAdmin = (methode: 'get' | 'post' | 'put' | 'delete', pad: string) =>
  request(app)[methode](`/api/seating${pad}`).set('Authorization', `Bearer ${adminToken}`);

async function maakRij(naam: string, rijnummer: number, instrumentIds?: string[]) {
  const res = await alsAdmin('post', '/sections').send({
    orchestraId: orkestId,
    name: naam,
    rowNumber: rijnummer,
    ...(instrumentIds ? { instrumentIds } : {}),
  });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

function maakLid(voornaam: string, achternaam = 'Speler', rol: TestUser['role'] = 'member') {
  return createTestUser(associationId, {
    email: `${voornaam.toLowerCase()}-${uuidv4()}@test.nl`,
    firstName: voornaam,
    lastName: achternaam,
    role: rol,
  });
}

function maakAanwezig(
  repetitieId: string,
  naam: string,
  overschrijf: { userId?: string | null; spondMemberId?: string | null; status?: string } = {},
) {
  db.prepare(
    `INSERT INTO rehearsal_attendance (id, rehearsal_id, user_id, spond_member_id, member_name, status)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    uuidv4(),
    repetitieId,
    overschrijf.userId ?? null,
    overschrijf.spondMemberId ?? null,
    naam,
    overschrijf.status ?? 'accepted',
  );
}

function stoelenVan(repetitieId: string) {
  return db
    .prepare(
      `SELECT member_name, row_number, position_in_row, is_conductor, section_id, instrument_name
       FROM rehearsal_seating WHERE rehearsal_id = ? ORDER BY row_number, position_in_row`,
    )
    .all(repetitieId) as {
    member_name: string;
    row_number: number;
    position_in_row: number;
    is_conductor: number;
    section_id: string | null;
    instrument_name: string | null;
  }[];
}

describe('Standaardopstelling', () => {
  it('zet vijf rijen neer en hangt de bestaande instrumenten eraan', async () => {
    // De route zoekt instrumenten op naam op. De testdatabase heeft er geen,
    // dus we zetten er twee neer die in de standaardindeling voorkomen.
    createTestInstrument({ name: 'Flute' });
    createTestInstrument({ name: 'Timpani' });

    const res = await alsAdmin('post', `/sections/${orkestId}/default`);
    expect(res.status).toBe(201);

    const rijen = await alsAdmin('get', `/sections/${orkestId}`);
    expect(rijen.body).toHaveLength(5);
    expect(rijen.body.map((r: { rowNumber: number }) => r.rowNumber)).toEqual([1, 2, 3, 4, 5]);

    // Fluit hoort bij rij 1, pauken bij rij 5; de instrumenten die niet in de
    // database staan worden overgeslagen in plaats van dat de hele indeling
    // afbreekt.
    const namenPerRij = rijen.body.map((r: { instruments: { name: string }[] }) => r.instruments.map((i) => i.name));
    expect(namenPerRij[0]).toEqual(['Flute']);
    expect(namenPerRij[1]).toEqual([]);
    expect(namenPerRij[4]).toEqual(['Timpani']);
  });

  it('zet er geen tweede overheen', async () => {
    expect((await alsAdmin('post', `/sections/${orkestId}/default`)).status).toBe(201);

    const res = await alsAdmin('post', `/sections/${orkestId}/default`);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('al een opstelling');

    // En er mogen geen tien rijen zijn ontstaan.
    const aantal = db
      .prepare('SELECT COUNT(*) as aantal FROM seating_sections WHERE orchestra_id = ?')
      .get(orkestId) as { aantal: number };
    expect(aantal.aantal).toBe(5);
  });

  it('weigert een standaardopstelling voor het orkest van een andere vereniging', async () => {
    const andere = createTestAssociation({ name: `Buren-${uuidv4()}` });
    const hunOrkest = createTestOrchestra(andere.id);

    const res = await alsAdmin('post', `/sections/${hunOrkest.id}/default`);
    expect(res.status).toBe(404);
    expect(db.prepare('SELECT COUNT(*) as aantal FROM seating_sections').get()).toMatchObject({ aantal: 0 });
  });

  it('laat een gewoon lid geen standaardopstelling neerzetten', async () => {
    const res = await request(app)
      .post(`/api/seating/sections/${orkestId}/default`)
      .set('Authorization', `Bearer ${memberToken}`);
    expect(res.status).toBe(403);
  });
});

describe('Rijen en hun instrumenten', () => {
  it('bewaart de instrumenten die bij een nieuwe rij horen', async () => {
    const fluit = createTestInstrument({ name: 'Fluit', tuning: 'C' });
    const hobo = createTestInstrument({ name: 'Hobo' });

    await maakRij('Houtrij', 1, [fluit.id, hobo.id]);

    const res = await alsAdmin('get', `/sections/${orkestId}`);
    expect(res.body[0].instruments.map((i: { name: string }) => i.name)).toEqual(['Fluit', 'Hobo']);
    expect(res.body[0].instruments[0].tuning).toBe('C');
  });

  it('vervangt de instrumenten van een rij in plaats van ze aan te vullen', async () => {
    const fluit = createTestInstrument({ name: 'Fluit2' });
    const hobo = createTestInstrument({ name: 'Hobo2' });
    const rij = await maakRij('Houtrij', 1, [fluit.id]);

    const res = await alsAdmin('put', `/sections/${rij}`).send({ instrumentIds: [hobo.id] });
    expect(res.status).toBe(200);

    const lijst = await alsAdmin('get', `/sections/${orkestId}`);
    expect(lijst.body[0].instruments.map((i: { name: string }) => i.name)).toEqual(['Hobo2']);
  });

  it('haalt de instrumenten weg bij een lege lijst', async () => {
    const fluit = createTestInstrument({ name: 'Fluit3' });
    const rij = await maakRij('Houtrij', 1, [fluit.id]);

    expect((await alsAdmin('put', `/sections/${rij}`).send({ instrumentIds: [] })).status).toBe(200);

    const lijst = await alsAdmin('get', `/sections/${orkestId}`);
    expect(lijst.body[0].instruments).toEqual([]);
  });

  it('geeft een rijnummer bij het bijwerken niet aan twee rijen', async () => {
    await maakRij('Rij een', 1);
    const tweede = await maakRij('Rij twee', 2);

    const res = await alsAdmin('put', `/sections/${tweede}`).send({ rowNumber: 1 });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('bestaat al');

    const rij = db.prepare('SELECT row_number FROM seating_sections WHERE id = ?').get(tweede) as {
      row_number: number;
    };
    expect(rij.row_number).toBe(2);
  });

  it('laat een rij zijn eigen rijnummer houden', async () => {
    const rij = await maakRij('Rij een', 1);

    const res = await alsAdmin('put', `/sections/${rij}`).send({ name: 'Anders', rowNumber: 1 });
    expect(res.status).toBe(200);
  });

  it('meldt een onbekende rij als niet gevonden', async () => {
    expect((await alsAdmin('put', `/sections/${uuidv4()}`).send({ name: 'X' })).status).toBe(404);
    expect((await alsAdmin('delete', `/sections/${uuidv4()}`)).status).toBe(404);
  });

  it('veegt alle rijen van een orkest leeg', async () => {
    await maakRij('Rij een', 1);
    await maakRij('Rij twee', 2);

    const res = await alsAdmin('delete', `/sections/orchestra/${orkestId}`);
    expect(res.status).toBe(200);
    expect((await alsAdmin('get', `/sections/${orkestId}`)).body).toEqual([]);
  });

  it('veegt de rijen van een ander orkest niet leeg', async () => {
    const andere = createTestAssociation({ name: `Buren-${uuidv4()}` });
    const hunOrkest = createTestOrchestra(andere.id);
    db.prepare(
      'INSERT INTO seating_sections (id, orchestra_id, name, row_number, sort_order) VALUES (?, ?, ?, ?, ?)',
    ).run(uuidv4(), hunOrkest.id, 'Hun rij', 1, 1);

    const res = await alsAdmin('delete', `/sections/orchestra/${hunOrkest.id}`);
    expect(res.status).toBe(404);
    expect(
      db.prepare('SELECT COUNT(*) as aantal FROM seating_sections WHERE orchestra_id = ?').get(hunOrkest.id),
    ).toMatchObject({ aantal: 1 });
  });

  it('meldt een onbekend orkest bij het opvragen van de rijen', async () => {
    expect((await alsAdmin('get', `/sections/${uuidv4()}`)).status).toBe(404);
  });
});

describe('Een stoel is voor een persoon', () => {
  /**
   * BEWIJS. De tabel seating_assignments kent UNIQUE(orchestra_id, user_id) -
   * een lid krijgt dus maar een plek - maar niets belet twee leden dezelfde
   * plek. De route controleerde dat ook niet.
   *
   * Zonder de reparatie in routes/seating.ts (bewaakVrijeStoel) meldt vitest:
   *   AssertionError: expected 201 to be 400
   *   - Expected: 400  + Received: 201
   * bij 'zet twee leden niet op dezelfde stoel', en
   *   AssertionError: expected 200 to be 400
   * bij 'verplaatst een lid niet naar een bezette stoel' en
   *   AssertionError: expected 200 to be 400
   * bij 'weigert een sleepactie die twee leden op een stoel zet'.
   */
  it('zet twee leden niet op dezelfde stoel', async () => {
    const rij = await maakRij('Eerste rij', 1);
    const eerste = maakLid('Anna');
    const tweede = maakLid('Bert');

    const een = await alsAdmin('post', '/assignments').send({
      orchestraId: orkestId,
      userId: eerste.id,
      sectionId: rij,
      positionInSection: 0,
    });
    expect(een.status).toBe(201);

    const twee = await alsAdmin('post', '/assignments').send({
      orchestraId: orkestId,
      userId: tweede.id,
      sectionId: rij,
      positionInSection: 0,
    });

    expect(twee.status).toBe(400);
    expect(twee.body.error).toMatch(/bezet/i);

    const aantal = db
      .prepare('SELECT COUNT(*) as aantal FROM seating_assignments WHERE section_id = ? AND position_in_section = 0')
      .get(rij);
    expect(aantal).toMatchObject({ aantal: 1 });
  });

  it('laat dezelfde plek in een andere rij wel toe', async () => {
    const eersteRij = await maakRij('Eerste rij', 1);
    const tweedeRij = await maakRij('Tweede rij', 2);

    const een = await alsAdmin('post', '/assignments').send({
      orchestraId: orkestId,
      userId: maakLid('Anna').id,
      sectionId: eersteRij,
      positionInSection: 0,
    });
    expect(een.status).toBe(201);

    const twee = await alsAdmin('post', '/assignments').send({
      orchestraId: orkestId,
      userId: maakLid('Bert').id,
      sectionId: tweedeRij,
      positionInSection: 0,
    });
    expect(twee.status).toBe(201);
  });

  it('verplaatst een lid niet naar een bezette stoel', async () => {
    const rij = await maakRij('Eerste rij', 1);
    const bezet = await alsAdmin('post', '/assignments').send({
      orchestraId: orkestId,
      userId: maakLid('Anna').id,
      sectionId: rij,
      positionInSection: 0,
    });
    expect(bezet.status).toBe(201);

    const verhuizer = await alsAdmin('post', '/assignments').send({
      orchestraId: orkestId,
      userId: maakLid('Bert').id,
      sectionId: rij,
      positionInSection: 1,
    });
    expect(verhuizer.status).toBe(201);

    const res = await alsAdmin('put', `/assignments/${verhuizer.body.id}`).send({ positionInSection: 0 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/bezet/i);
    const na = db
      .prepare('SELECT position_in_section FROM seating_assignments WHERE id = ?')
      .get(verhuizer.body.id) as { position_in_section: number };
    expect(na.position_in_section).toBe(1);
  });

  it('laat een lid op zijn eigen stoel blijven zitten bij het bijwerken', async () => {
    const rij = await maakRij('Eerste rij', 1);
    const gemaakt = await alsAdmin('post', '/assignments').send({
      orchestraId: orkestId,
      userId: maakLid('Anna').id,
      sectionId: rij,
      positionInSection: 0,
    });

    const res = await alsAdmin('put', `/assignments/${gemaakt.body.id}`).send({
      seatLabel: '1e stem',
      notes: 'zit graag vooraan',
      positionInSection: 0,
    });
    expect(res.status).toBe(200);

    const lijst = await alsAdmin('get', `/assignments/${orkestId}`);
    expect(lijst.body[0].seatLabel).toBe('1e stem');
    expect(lijst.body[0].notes).toBe('zit graag vooraan');
  });

  it('weigert een stoel in een rij die niet bestaat', async () => {
    const res = await alsAdmin('post', '/assignments').send({
      orchestraId: orkestId,
      userId: maakLid('Anna').id,
      sectionId: uuidv4(),
      positionInSection: 0,
    });
    expect(res.status).toBe(404);
    expect(res.body.error).toContain('Sectie');
  });

  it('weigert een negatieve plek en een onvolledige aanvraag', async () => {
    const rij = await maakRij('Eerste rij', 1);
    const lid = maakLid('Anna');

    const negatief = await alsAdmin('post', '/assignments').send({
      orchestraId: orkestId,
      userId: lid.id,
      sectionId: rij,
      positionInSection: -1,
    });
    expect(negatief.status).toBe(400);

    const zonderRij = await alsAdmin('post', '/assignments').send({
      orchestraId: orkestId,
      userId: lid.id,
      positionInSection: 0,
    });
    expect(zonderRij.status).toBe(400);
  });

  it('toont de instrumenten van het lid bij de stoel', async () => {
    const rij = await maakRij('Eerste rij', 1);
    const lid = maakLid('Anna');
    const fluit = createTestInstrument({ name: 'Fluit4' });
    addInstrumentToUser(lid.id, fluit.id);

    await alsAdmin('post', '/assignments').send({
      orchestraId: orkestId,
      userId: lid.id,
      sectionId: rij,
      positionInSection: 0,
    });

    const res = await alsAdmin('get', `/assignments/${orkestId}`);
    expect(res.body[0].instruments).toBe('Fluit4');
    expect(res.body[0].userName).toBe('Anna Speler');
  });

  it('laat een lid zonder instrument gewoon een stoel houden', async () => {
    const rij = await maakRij('Eerste rij', 1);
    const lid = maakLid('Anna');

    await alsAdmin('post', '/assignments').send({
      orchestraId: orkestId,
      userId: lid.id,
      sectionId: rij,
      positionInSection: 0,
    });

    const res = await alsAdmin('get', `/assignments/${orkestId}`);
    expect(res.body[0].instruments).toBeNull();
  });

  it('verwijdert een stoel', async () => {
    const rij = await maakRij('Eerste rij', 1);
    const gemaakt = await alsAdmin('post', '/assignments').send({
      orchestraId: orkestId,
      userId: maakLid('Anna').id,
      sectionId: rij,
      positionInSection: 0,
    });

    expect((await alsAdmin('delete', `/assignments/${gemaakt.body.id}`)).status).toBe(200);
    expect((await alsAdmin('get', `/assignments/${orkestId}`)).body).toEqual([]);
  });

  it('meldt een onbekende stoel als niet gevonden', async () => {
    expect((await alsAdmin('delete', `/assignments/${uuidv4()}`)).status).toBe(404);
    expect((await alsAdmin('put', `/assignments/${uuidv4()}`).send({ notes: 'x' })).status).toBe(404);
  });

  it('meldt een onbekend orkest bij het opvragen van de opstelling', async () => {
    expect((await alsAdmin('get', `/assignments/${uuidv4()}`)).status).toBe(404);
  });
});

describe('Slepen en neerzetten', () => {
  it('zet nieuwe stoelen neer en verplaatst bestaande', async () => {
    const eersteRij = await maakRij('Eerste rij', 1);
    const tweedeRij = await maakRij('Tweede rij', 2);
    const anna = maakLid('Anna');
    const bert = maakLid('Bert');

    const eerst = await alsAdmin('put', `/assignments/bulk/${orkestId}`).send({
      assignments: [
        { userId: anna.id, sectionId: eersteRij, positionInSection: 0 },
        { userId: bert.id, sectionId: eersteRij, positionInSection: 1 },
      ],
    });
    expect(eerst.status).toBe(200);

    // Nu Anna naar de tweede rij slepen. Bert blijft staan.
    const daarna = await alsAdmin('put', `/assignments/bulk/${orkestId}`).send({
      assignments: [{ userId: anna.id, sectionId: tweedeRij, positionInSection: 0 }],
    });
    expect(daarna.status).toBe(200);

    const lijst = await alsAdmin('get', `/assignments/${orkestId}`);
    const perLid = Object.fromEntries(
      lijst.body.map((s: { userId: string; sectionId: string }) => [s.userId, s.sectionId]),
    );
    expect(perLid[anna.id]).toBe(tweedeRij);
    expect(perLid[bert.id]).toBe(eersteRij);
    expect(lijst.body).toHaveLength(2);
  });

  it('wisselt twee leden van stoel in een keer', async () => {
    const rij = await maakRij('Eerste rij', 1);
    const anna = maakLid('Anna');
    const bert = maakLid('Bert');

    await alsAdmin('put', `/assignments/bulk/${orkestId}`).send({
      assignments: [
        { userId: anna.id, sectionId: rij, positionInSection: 0 },
        { userId: bert.id, sectionId: rij, positionInSection: 1 },
      ],
    });

    const res = await alsAdmin('put', `/assignments/bulk/${orkestId}`).send({
      assignments: [
        { userId: anna.id, sectionId: rij, positionInSection: 1 },
        { userId: bert.id, sectionId: rij, positionInSection: 0 },
      ],
    });
    expect(res.status).toBe(200);

    const lijst = await alsAdmin('get', `/assignments/${orkestId}`);
    const perLid = Object.fromEntries(
      lijst.body.map((s: { userId: string; positionInSection: number }) => [s.userId, s.positionInSection]),
    );
    expect(perLid[anna.id]).toBe(1);
    expect(perLid[bert.id]).toBe(0);
  });

  it('weigert een sleepactie die twee leden op een stoel zet', async () => {
    const rij = await maakRij('Eerste rij', 1);
    const anna = maakLid('Anna');
    const bert = maakLid('Bert');

    const res = await alsAdmin('put', `/assignments/bulk/${orkestId}`).send({
      assignments: [
        { userId: anna.id, sectionId: rij, positionInSection: 0 },
        { userId: bert.id, sectionId: rij, positionInSection: 0 },
      ],
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/bezet/i);
    expect(db.prepare('SELECT COUNT(*) as aantal FROM seating_assignments').get()).toMatchObject({ aantal: 0 });
  });

  it('weigert een sleepactie naar een stoel die al door iemand anders bezet is', async () => {
    const rij = await maakRij('Eerste rij', 1);
    const anna = maakLid('Anna');
    const bert = maakLid('Bert');

    await alsAdmin('put', `/assignments/bulk/${orkestId}`).send({
      assignments: [{ userId: anna.id, sectionId: rij, positionInSection: 0 }],
    });

    const res = await alsAdmin('put', `/assignments/bulk/${orkestId}`).send({
      assignments: [{ userId: bert.id, sectionId: rij, positionInSection: 0 }],
    });

    expect(res.status).toBe(400);
    expect(db.prepare('SELECT COUNT(*) as aantal FROM seating_assignments').get()).toMatchObject({ aantal: 1 });
  });

  it('weigert iets dat geen lijst is', async () => {
    const res = await alsAdmin('put', `/assignments/bulk/${orkestId}`).send({ assignments: 'alles' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('array');
  });

  it('meldt een onbekend orkest bij een sleepactie', async () => {
    const res = await alsAdmin('put', `/assignments/bulk/${uuidv4()}`).send({ assignments: [] });
    expect(res.status).toBe(404);
  });
});

describe('Buurvoorkeuren', () => {
  it('bewaart en toont een voorkeur met beide namen', async () => {
    const anna = maakLid('Anna');
    const bert = maakLid('Bert');

    const gemaakt = await alsAdmin('post', '/neighbors').send({
      orchestraId: orkestId,
      userId: anna.id,
      neighborUserId: bert.id,
      preference: 'avoid',
    });
    expect(gemaakt.status).toBe(201);

    const res = await alsAdmin('get', `/neighbors/${orkestId}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      userName: 'Anna Speler',
      neighborUserName: 'Bert Speler',
      preference: 'avoid',
    });
  });

  it('kent alleen voorkeur en afkeer', async () => {
    const res = await alsAdmin('post', '/neighbors').send({
      orchestraId: orkestId,
      userId: maakLid('Anna').id,
      neighborUserId: maakLid('Bert').id,
      preference: 'misschien',
    });
    expect(res.status).toBe(400);
  });

  it('toont geen voorkeur meer als een van de twee vertrokken is', async () => {
    const anna = maakLid('Anna');
    const bert = maakLid('Bert');
    await alsAdmin('post', '/neighbors').send({
      orchestraId: orkestId,
      userId: anna.id,
      neighborUserId: bert.id,
      preference: 'preferred',
    });

    db.prepare("UPDATE users SET deleted_at = '2026-03-03T00:00:00.000Z' WHERE id = ?").run(bert.id);

    expect((await alsAdmin('get', `/neighbors/${orkestId}`)).body).toEqual([]);
  });

  it('verwijdert een voorkeur', async () => {
    const gemaakt = await alsAdmin('post', '/neighbors').send({
      orchestraId: orkestId,
      userId: maakLid('Anna').id,
      neighborUserId: maakLid('Bert').id,
      preference: 'preferred',
    });

    expect((await alsAdmin('delete', `/neighbors/${gemaakt.body.id}`)).status).toBe(200);
    expect((await alsAdmin('get', `/neighbors/${orkestId}`)).body).toEqual([]);
  });

  it('verwijdert de voorkeur van een andere vereniging niet', async () => {
    const andere = createTestAssociation({ name: `Buren-${uuidv4()}` });
    const hunOrkest = createTestOrchestra(andere.id);
    const hunAdmin = createTestUser(andere.id, { email: `buuradmin-${uuidv4()}@test.nl`, role: 'admin' });
    const hunLid = createTestUser(andere.id, { email: `buur1-${uuidv4()}@test.nl` });
    const hunTweedeLid = createTestUser(andere.id, { email: `buur2-${uuidv4()}@test.nl` });

    const gemaakt = await request(app)
      .post('/api/seating/neighbors')
      .set('Authorization', `Bearer ${generateTestToken(hunAdmin)}`)
      .send({
        orchestraId: hunOrkest.id,
        userId: hunLid.id,
        neighborUserId: hunTweedeLid.id,
        preference: 'preferred',
      });
    expect(gemaakt.status).toBe(201);

    expect((await alsAdmin('delete', `/neighbors/${gemaakt.body.id}`)).status).toBe(404);
    expect(db.prepare('SELECT id FROM seating_neighbors WHERE id = ?').get(gemaakt.body.id)).toBeTruthy();
  });

  it('meldt een onbekend orkest bij het opvragen van de voorkeuren', async () => {
    expect((await alsAdmin('get', `/neighbors/${uuidv4()}`)).status).toBe(404);
  });

  it('meldt een onbekende voorkeur bij het verwijderen', async () => {
    expect((await alsAdmin('delete', `/neighbors/${uuidv4()}`)).status).toBe(404);
  });
});

describe('Opstelling per repetitie', () => {
  it('zet een lid in de rij van zijn instrument en een lid zonder instrument erachter', async () => {
    const fluit = createTestInstrument({ name: 'Fluit5' });
    const houtrij = await maakRij('Houtrij', 1, [fluit.id]);
    await maakRij('Koperrij', 2);

    const fluitist = maakLid('Anna');
    addUserToOrchestra(fluitist.id, orkestId);
    addInstrumentToUser(fluitist.id, fluit.id);

    const zonderInstrument = maakLid('Bert');
    addUserToOrchestra(zonderInstrument.id, orkestId);

    const repetitie = createTestRehearsal(associationId, adminGebruiker.id, { orchestraId: orkestId });
    maakAanwezig(repetitie.id, 'Anna Speler', { userId: fluitist.id });
    maakAanwezig(repetitie.id, 'Bert Speler', { userId: zonderInstrument.id });

    const res = await alsAdmin('post', `/rehearsal/${repetitie.id}/generate`);
    expect(res.status).toBe(200);
    expect(res.body.memberCount).toBe(2);

    const stoelen = stoelenVan(repetitie.id);
    const anna = stoelen.find((s) => s.member_name === 'Anna Speler')!;
    const bert = stoelen.find((s) => s.member_name === 'Bert Speler')!;

    expect(anna.row_number).toBe(1);
    expect(anna.section_id).toBe(houtrij);
    expect(anna.instrument_name).toBe('Fluit5');

    // Bert past nergens: hij krijgt geen rij toegewezen en belandt achteraan.
    expect(bert.section_id).toBeNull();
    expect(bert.instrument_name).toBeNull();
    expect(bert.row_number).toBeGreaterThan(anna.row_number);
    expect(bert.row_number).not.toBe(99);
  });

  it('zet de dirigent vooraan op rij nul', async () => {
    await maakRij('Houtrij', 1);
    const repetitie = createTestRehearsal(associationId, adminGebruiker.id, { orchestraId: orkestId });
    maakAanwezig(repetitie.id, 'Dirigent Jansen');
    maakAanwezig(repetitie.id, 'Bert Speler');

    expect((await alsAdmin('post', `/rehearsal/${repetitie.id}/generate`)).status).toBe(200);

    const stoelen = stoelenVan(repetitie.id);
    const dirigent = stoelen.find((s) => s.member_name === 'Dirigent Jansen')!;
    expect(dirigent.row_number).toBe(0);
    expect(dirigent.is_conductor).toBeTruthy();
  });

  it('herkent de dirigent ook aan zijn rol', async () => {
    const dirigent = maakLid('Chris', 'Dirigeer', 'conductor');
    addUserToOrchestra(dirigent.id, orkestId);
    await maakRij('Houtrij', 1);

    const repetitie = createTestRehearsal(associationId, adminGebruiker.id, { orchestraId: orkestId });
    maakAanwezig(repetitie.id, 'Chris Dirigeer', { userId: dirigent.id });

    expect((await alsAdmin('post', `/rehearsal/${repetitie.id}/generate`)).status).toBe(200);

    const stoel = stoelenVan(repetitie.id)[0];
    expect(stoel.row_number).toBe(0);
    expect(stoel.is_conductor).toBeTruthy();
  });

  it('herkent een lid dat alleen in Spond staat aan zijn naam', async () => {
    const fluit = createTestInstrument({ name: 'Fluit6' });
    await maakRij('Houtrij', 1, [fluit.id]);

    const lid = maakLid('Dana');
    addUserToOrchestra(lid.id, orkestId);
    addInstrumentToUser(lid.id, fluit.id);

    const repetitie = createTestRehearsal(associationId, adminGebruiker.id, { orchestraId: orkestId });
    // Geen user_id: alleen een naam en een Spond-nummer, zoals bij een
    // koppeling die nog niet aan een account hangt.
    maakAanwezig(repetitie.id, 'Dana Speler', { spondMemberId: 'spond-1' });

    expect((await alsAdmin('post', `/rehearsal/${repetitie.id}/generate`)).status).toBe(200);

    const stoel = stoelenVan(repetitie.id)[0];
    expect(stoel.row_number).toBe(1);
    expect(stoel.instrument_name).toBe('Fluit6');
  });

  it('laat een handmatige toewijzing zwaarder wegen dan het instrument', async () => {
    const fluit = createTestInstrument({ name: 'Fluit7' });
    await maakRij('Houtrij', 1, [fluit.id]);
    const koperrij = await maakRij('Koperrij', 2);

    const lid = maakLid('Anna');
    addUserToOrchestra(lid.id, orkestId);
    addInstrumentToUser(lid.id, fluit.id);

    const toegewezen = await alsAdmin('post', '/assignments').send({
      orchestraId: orkestId,
      userId: lid.id,
      sectionId: koperrij,
      positionInSection: 0,
    });
    expect(toegewezen.status).toBe(201);

    const repetitie = createTestRehearsal(associationId, adminGebruiker.id, { orchestraId: orkestId });
    maakAanwezig(repetitie.id, 'Anna Speler', { userId: lid.id });

    expect((await alsAdmin('post', `/rehearsal/${repetitie.id}/generate`)).status).toBe(200);

    const stoel = stoelenVan(repetitie.id)[0];
    expect(stoel.section_id).toBe(koperrij);
    expect(stoel.row_number).toBe(2);
  });

  it('telt alleen wie zich heeft aangemeld', async () => {
    await maakRij('Houtrij', 1);
    const repetitie = createTestRehearsal(associationId, adminGebruiker.id, { orchestraId: orkestId });
    maakAanwezig(repetitie.id, 'Wel Aanwezig');
    maakAanwezig(repetitie.id, 'Niet Aanwezig', { status: 'declined' });

    const res = await alsAdmin('post', `/rehearsal/${repetitie.id}/generate`);
    expect(res.body.memberCount).toBe(1);
    expect(stoelenVan(repetitie.id).map((s) => s.member_name)).toEqual(['Wel Aanwezig']);
  });

  it('gooit de vorige opstelling weg voordat hij een nieuwe maakt', async () => {
    await maakRij('Houtrij', 1);
    const repetitie = createTestRehearsal(associationId, adminGebruiker.id, { orchestraId: orkestId });
    maakAanwezig(repetitie.id, 'Anna Speler');

    await alsAdmin('post', `/rehearsal/${repetitie.id}/generate`);
    await alsAdmin('post', `/rehearsal/${repetitie.id}/generate`);

    expect(stoelenVan(repetitie.id)).toHaveLength(1);
  });

  it('weigert te genereren zonder aanwezigen', async () => {
    const repetitie = createTestRehearsal(associationId, adminGebruiker.id, { orchestraId: orkestId });

    const res = await alsAdmin('post', `/rehearsal/${repetitie.id}/generate`);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Geen aanwezigen');
  });

  it('genereert niet voor de repetitie van een andere vereniging', async () => {
    const andere = createTestAssociation({ name: `Buren-${uuidv4()}` });
    const hunAdmin = createTestUser(andere.id, { email: `buuradmin-${uuidv4()}@test.nl`, role: 'admin' });
    const hunRepetitie = createTestRehearsal(andere.id, hunAdmin.id);
    maakAanwezig(hunRepetitie.id, 'Geheime Buurman');

    const res = await alsAdmin('post', `/rehearsal/${hunRepetitie.id}/generate`);
    expect(res.status).toBe(404);
    expect(stoelenVan(hunRepetitie.id)).toEqual([]);
  });

  it('valt terug op het eerste orkest met een indeling als de repetitie er geen heeft', async () => {
    const fluit = createTestInstrument({ name: 'Fluit8' });
    const houtrij = await maakRij('Houtrij', 1, [fluit.id]);

    const lid = maakLid('Anna');
    addInstrumentToUser(lid.id, fluit.id);

    // Repetitie zonder orkest: geldt voor alle orkesten.
    const repetitie = createTestRehearsal(associationId, adminGebruiker.id);
    maakAanwezig(repetitie.id, 'Anna Speler', { userId: lid.id });

    expect((await alsAdmin('post', `/rehearsal/${repetitie.id}/generate`)).status).toBe(200);
    expect(stoelenVan(repetitie.id)[0].section_id).toBe(houtrij);
  });

  it('toont de opstelling van een repetitie met de naam van de rij erbij', async () => {
    const rij = await maakRij('Houtrij', 1);
    const repetitie = createTestRehearsal(associationId, adminGebruiker.id, { orchestraId: orkestId });
    db.prepare(
      `INSERT INTO rehearsal_seating (id, rehearsal_id, member_name, section_id, row_number, position_in_row)
       VALUES (?, ?, 'Anna Speler', ?, 1, 0)`,
    ).run(uuidv4(), repetitie.id, rij);

    const res = await alsAdmin('get', `/rehearsal/${repetitie.id}`);
    expect(res.status).toBe(200);
    expect(res.body[0]).toMatchObject({ memberName: 'Anna Speler', sectionName: 'Houtrij', isConductor: false });
  });

  it('toont de opstelling van een repetitie van een andere vereniging niet', async () => {
    const andere = createTestAssociation({ name: `Buren-${uuidv4()}` });
    const hunAdmin = createTestUser(andere.id, { email: `buuradmin-${uuidv4()}@test.nl`, role: 'admin' });
    const hunRepetitie = createTestRehearsal(andere.id, hunAdmin.id);
    db.prepare(
      `INSERT INTO rehearsal_seating (id, rehearsal_id, member_name, row_number, position_in_row)
       VALUES (?, ?, 'Geheime Buurman', 1, 0)`,
    ).run(uuidv4(), hunRepetitie.id);

    const res = await alsAdmin('get', `/rehearsal/${hunRepetitie.id}`);
    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toContain('Buurman');
  });
});

describe('Een losse stoel verslepen in de repetitie-opstelling', () => {
  async function repetitieMetStoel() {
    const repetitie = createTestRehearsal(associationId, adminGebruiker.id, { orchestraId: orkestId });
    const stoelId = uuidv4();
    db.prepare(
      `INSERT INTO rehearsal_seating (id, rehearsal_id, member_name, row_number, position_in_row)
       VALUES (?, ?, 'Anna Speler', 1, 0)`,
    ).run(stoelId, repetitie.id);
    return { repetitie, stoelId };
  }

  it('verplaatst een stoel', async () => {
    const { repetitie, stoelId } = await repetitieMetStoel();

    const res = await alsAdmin('put', `/rehearsal/${repetitie.id}/seat/${stoelId}`).send({
      rowNumber: 3,
      positionInRow: 2,
    });
    expect(res.status).toBe(200);

    const stoel = stoelenVan(repetitie.id)[0];
    expect(stoel.row_number).toBe(3);
    expect(stoel.position_in_row).toBe(2);
  });

  /**
   * BEWIJS. De UPDATE stond er met `WHERE id = ? AND rehearsal_id = ?` en er
   * werd nooit gekeken of dat ook iets raakte. Een stoel die niet in deze
   * opstelling voorkomt gaf daardoor 200 met "Zitplaats bijgewerkt.", terwijl
   * er niets gebeurde - de frontend tekent dan een verplaatsing die na een
   * herlaadbeurt weer weg is.
   *
   * Zonder de reparatie in routes/seating.ts meldt vitest:
   *   AssertionError: expected 200 to be 404
   *   - Expected: 404  + Received: 200
   */
  it('meldt een stoel die niet in deze opstelling bestaat', async () => {
    const { repetitie } = await repetitieMetStoel();

    const res = await alsAdmin('put', `/rehearsal/${repetitie.id}/seat/${uuidv4()}`).send({
      rowNumber: 2,
      positionInRow: 0,
    });

    expect(res.status).toBe(404);
  });

  it('verplaatst geen stoel uit de opstelling van een andere repetitie', async () => {
    const eigen = await repetitieMetStoel();
    const andere = await repetitieMetStoel();

    const res = await alsAdmin('put', `/rehearsal/${eigen.repetitie.id}/seat/${andere.stoelId}`).send({
      rowNumber: 9,
      positionInRow: 9,
    });

    expect(res.status).toBe(404);
    expect(stoelenVan(andere.repetitie.id)[0].row_number).toBe(1);
  });

  it('verplaatst geen stoel in de repetitie van een andere vereniging', async () => {
    const andere = createTestAssociation({ name: `Buren-${uuidv4()}` });
    const hunAdmin = createTestUser(andere.id, { email: `buuradmin-${uuidv4()}@test.nl`, role: 'admin' });
    const hunRepetitie = createTestRehearsal(andere.id, hunAdmin.id);
    const stoelId = uuidv4();
    db.prepare(
      `INSERT INTO rehearsal_seating (id, rehearsal_id, member_name, row_number, position_in_row)
       VALUES (?, ?, 'Geheime Buurman', 1, 0)`,
    ).run(stoelId, hunRepetitie.id);

    const res = await alsAdmin('put', `/rehearsal/${hunRepetitie.id}/seat/${stoelId}`).send({
      rowNumber: 5,
      positionInRow: 5,
    });

    expect(res.status).toBe(404);
    expect(stoelenVan(hunRepetitie.id)[0].row_number).toBe(1);
  });

  /**
   * WACHT. Een rijnummer is verplicht in het schema (NOT NULL). De route nam
   * de body ongezien over, dus een aanvraag zonder rijnummer schreef daar een
   * lege waarde in. Deze test legt vast dat dat een nette 400 oplevert.
   */
  it('weigert een verplaatsing zonder rijnummer', async () => {
    const { repetitie, stoelId } = await repetitieMetStoel();

    const res = await alsAdmin('put', `/rehearsal/${repetitie.id}/seat/${stoelId}`).send({ positionInRow: 1 });

    expect(res.status).toBe(400);
    expect(stoelenVan(repetitie.id)[0].row_number).toBe(1);
  });
});

describe('Opstellingskaart', () => {
  it('telt het aantal stoelen per rij', async () => {
    const rij = await maakRij('Houtrij', 1);
    const anna = maakLid('Anna');
    const bert = maakLid('Bert');

    await alsAdmin('put', `/assignments/bulk/${orkestId}`).send({
      assignments: [
        { userId: anna.id, sectionId: rij, positionInSection: 0 },
        { userId: bert.id, sectionId: rij, positionInSection: 1 },
      ],
    });

    const res = await alsAdmin('get', `/chart/${orkestId}`);
    expect(res.status).toBe(200);
    expect(res.body.totalRows).toBe(1);
    expect(res.body.sections[0].seatCount).toBe(2);
    expect(res.body.seats).toHaveLength(2);
  });

  it('meldt een onbekend orkest', async () => {
    expect((await alsAdmin('get', `/chart/${uuidv4()}`)).status).toBe(404);
  });
});
