/**
 * Taken: de randen van de route.
 *
 * tasks.test.ts dekt het aanmaken, bijwerken en verwijderen van taken en
 * lijsten af. Wat daarnaast in de route staat kwam niet aan bod: de filters op
 * het overzicht, de checklist, de reacties, de samenvatting en de templates.
 *
 * Twee dingen lopen door dit hele bestand heen. Ten eerste de
 * verenigingsgrens: elke plek waar de route een verwijzing uit het verzoek
 * overneemt - een takenlijst, een toegewezene - moet controleren van wie die
 * is. Bij het aanmaken en bijwerken van een taak gebeurt dat; de templates
 * waren die controle vergeten. Ten tweede het eigendom van reacties: die mag
 * je alleen zelf weghalen, tenzij je bestuur bent.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';
import '../setup';
import db from '../../database/connection';
import tasksRoutes from '../../routes/tasks';
import { errorHandler } from '../../middleware/errorHandler';
import {
  createTestAssociation,
  createTestUser,
  generateTestToken,
  createTestEnvironment,
  TestAssociation,
  TestUser,
} from '../testUtils';

// Zelfde geheim als in setup.ts en testUtils.ts. Nodig omdat testUtils geen
// token kan maken voor een gebruiker zonder vereniging.
const JWT_SECRET = 'test-jwt-secret-for-testing-must-be-at-least-32-characters';

const app = express();
app.use(express.json());
app.use('/api', rateLimit({ windowMs: 60_000, limit: 10_000 }));
app.use('/api/tasks', tasksRoutes);
app.use(errorHandler);

type Methode = 'get' | 'post' | 'put' | 'patch' | 'delete';

let adminToken: string;
let memberToken: string;
let adminUser: TestUser;
let memberUser: TestUser;
let associationId: string;

beforeEach(() => {
  const omgeving = createTestEnvironment();
  adminToken = omgeving.adminToken;
  memberToken = omgeving.memberToken;
  adminUser = omgeving.adminUser;
  memberUser = omgeving.memberUser;
  associationId = omgeving.association.id;
});

const alsAdmin = (methode: Methode, pad: string) =>
  request(app)[methode](`/api/tasks${pad}`).set('Authorization', `Bearer ${adminToken}`);

const alsLid = (methode: Methode, pad: string) =>
  request(app)[methode](`/api/tasks${pad}`).set('Authorization', `Bearer ${memberToken}`);

async function maakTaak(overschrijf: Record<string, unknown> = {}) {
  const res = await alsAdmin('post', '/').send({ title: 'Podium opbouwen', ...overschrijf });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

async function maakLijst(naam = 'Concertvoorbereiding') {
  const res = await alsAdmin('post', '/lists').send({ name: naam });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

async function maakTemplate(overschrijf: Record<string, unknown> = {}) {
  const res = await alsAdmin('post', '/templates').send({ name: 'Concertdraaiboek', ...overschrijf });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

/** Een tweede vereniging met een eigen beheerder en een eigen lid. */
function andereVereniging(kenmerk: string): {
  vereniging: TestAssociation;
  token: string;
  beheerder: TestUser;
  lid: TestUser;
} {
  const vereniging = createTestAssociation();
  const beheerder = createTestUser(vereniging.id, {
    email: `beheerder-${kenmerk}-${uuidv4().slice(0, 8)}@test.com`,
    role: 'admin',
  });
  const lid = createTestUser(vereniging.id, {
    email: `lid-${kenmerk}-${uuidv4().slice(0, 8)}@test.com`,
    role: 'member',
  });
  return { vereniging, token: generateTestToken(beheerder), beheerder, lid };
}

// =====================================================
// HET OVERZICHT
// =====================================================

describe('Het overzicht filteren', () => {
  it('verbergt afgeronde en geannuleerde taken tenzij erom gevraagd wordt', async () => {
    const open = await maakTaak({ title: 'Nog te doen' });
    const klaar = await maakTaak({ title: 'Al gedaan' });
    const geschrapt = await maakTaak({ title: 'Gaat niet door' });
    expect((await alsAdmin('put', `/${klaar}`).send({ status: 'done' })).status).toBe(200);
    expect((await alsAdmin('put', `/${geschrapt}`).send({ status: 'cancelled' })).status).toBe(200);

    const standaard = await alsAdmin('get', '/');
    expect(standaard.body.map((t: { id: string }) => t.id)).toEqual([open]);

    const alles = await alsAdmin('get', '/?showCompleted=true');
    const ids = alles.body.map((t: { id: string }) => t.id);
    expect(ids).toContain(klaar);
    expect(ids).toContain(geschrapt);
  });

  it('filtert op status en op urgentie', async () => {
    const bezig = await maakTaak({ title: 'Onderweg', priority: 'urgent' });
    await maakTaak({ title: 'Rustig aan', priority: 'low' });
    expect((await alsAdmin('put', `/${bezig}`).send({ status: 'in_progress' })).status).toBe(200);

    const opStatus = await alsAdmin('get', '/?status=in_progress');
    expect(opStatus.body.map((t: { id: string }) => t.id)).toEqual([bezig]);

    const opUrgentie = await alsAdmin('get', '/?priority=low');
    expect(opUrgentie.body.map((t: { title: string }) => t.title)).toEqual(['Rustig aan']);
  });

  it('filtert op takenlijst en op taken zonder lijst', async () => {
    const lijst = await maakLijst('Concert');
    const inLijst = await maakTaak({ title: 'In de lijst', taskListId: lijst });
    const losseTaak = await maakTaak({ title: 'Los' });

    const opLijst = await alsAdmin('get', `/?listId=${lijst}`);
    expect(opLijst.body.map((t: { id: string }) => t.id)).toEqual([inLijst]);
    expect(opLijst.body[0].listName).toBe('Concert');

    const zonderLijst = await alsAdmin('get', '/?listId=none');
    expect(zonderLijst.body.map((t: { id: string }) => t.id)).toEqual([losseTaak]);
  });

  it('filtert op toegewezene, op mijzelf en op nog niet toegewezen', async () => {
    const mijn = await maakTaak({ title: 'Voor de beheerder', assignedTo: adminUser.id });
    const vanHetLid = await maakTaak({ title: 'Voor het lid', assignedTo: memberUser.id });
    const niemand = await maakTaak({ title: 'Nog van niemand' });

    const vanMij = await alsAdmin('get', '/?assignedTo=me');
    expect(vanMij.body.map((t: { id: string }) => t.id)).toEqual([mijn]);

    const opNaam = await alsAdmin('get', `/?assignedTo=${memberUser.id}`);
    expect(opNaam.body.map((t: { id: string }) => t.id)).toEqual([vanHetLid]);
    expect(opNaam.body[0].assignedToName).toBe('Member User');

    const zonder = await alsAdmin('get', '/?assignedTo=unassigned');
    expect(zonder.body.map((t: { id: string }) => t.id)).toEqual([niemand]);
  });

  it('geeft ieder lid zijn eigen taken bij assignedTo=me', async () => {
    // Het overzicht wordt in de cache gezet. Zonder een sleutel per gebruiker
    // deelden twee leden van dezelfde vereniging dezelfde ingang, en kreeg de
    // tweede de taken van de eerste te zien.
    const vanDeBeheerder = await maakTaak({ title: 'Voor de beheerder', assignedTo: adminUser.id });
    const vanHetLid = await maakTaak({ title: 'Voor het lid', assignedTo: memberUser.id });

    const eerst = await alsAdmin('get', '/?assignedTo=me');
    expect(eerst.body.map((t: { id: string }) => t.id)).toEqual([vanDeBeheerder]);

    const daarna = await alsLid('get', '/?assignedTo=me');
    expect(daarna.body.map((t: { id: string }) => t.id)).toEqual([vanHetLid]);
  });

  it('zoekt in de titel en de omschrijving', async () => {
    await maakTaak({ title: 'Stoelen klaarzetten', description: 'Zaal A' });
    await maakTaak({ title: 'Bladmuziek kopieren', description: 'Voor de koperblazers' });

    const opTitel = await alsAdmin('get', '/?search=stoelen');
    expect(opTitel.body.map((t: { title: string }) => t.title)).toEqual(['Stoelen klaarzetten']);

    const opOmschrijving = await alsAdmin('get', '/?search=koperblazers');
    expect(opOmschrijving.body.map((t: { title: string }) => t.title)).toEqual(['Bladmuziek kopieren']);
  });

  it('telt de checklist mee in het overzicht', async () => {
    const id = await maakTaak();
    const eerste = await alsAdmin('post', `/${id}/checklist`).send({ content: 'Stoelen tellen' });
    await alsAdmin('post', `/${id}/checklist`).send({ content: 'Podium vegen' });
    expect((await alsAdmin('put', `/${id}/checklist/${eerste.body.id}`).send({ isCompleted: true })).status).toBe(200);

    const res = await alsAdmin('get', '/');
    const taak = res.body.find((t: { id: string }) => t.id === id);
    expect(taak.checklistTotal).toBe(2);
    expect(taak.checklistDone).toBe(1);
  });

  it('toont geen taken van een andere vereniging', async () => {
    await maakTaak({ title: 'Van ons' });
    const hun = andereVereniging('overzicht');
    await request(app).post('/api/tasks/').set('Authorization', `Bearer ${hun.token}`).send({ title: 'Van hen' });

    const res = await alsAdmin('get', '/');
    const titels = res.body.map((t: { title: string }) => t.title);
    expect(titels).toContain('Van ons');
    expect(titels).not.toContain('Van hen');
  });
});

// =====================================================
// EEN TAAK BIJWERKEN
// =====================================================

describe('Een taak bijwerken', () => {
  it('zet de afrondtijd bij afronden en haalt hem weer weg', async () => {
    const id = await maakTaak();

    expect((await alsAdmin('put', `/${id}`).send({ status: 'done' })).status).toBe(200);
    const naAfronden = await alsAdmin('get', `/${id}`);
    expect(naAfronden.body.completedAt).toBeTruthy();

    expect((await alsAdmin('put', `/${id}`).send({ status: 'todo' })).status).toBe(200);
    const naHeropenen = await alsAdmin('get', `/${id}`);
    expect(naHeropenen.body.completedAt).toBeNull();
  });

  it('laat de afrondtijd staan als de taak al afgerond was', async () => {
    const id = await maakTaak();
    expect((await alsAdmin('put', `/${id}`).send({ status: 'done' })).status).toBe(200);
    const eerste = (await alsAdmin('get', `/${id}`)).body.completedAt;

    expect((await alsAdmin('put', `/${id}`).send({ status: 'done', title: 'Zelfde status' })).status).toBe(200);
    expect((await alsAdmin('get', `/${id}`)).body.completedAt).toBe(eerste);
  });

  it('schrijft alle velden weg in een keer', async () => {
    const lijst = await maakLijst('Doel');
    const id = await maakTaak();

    const res = await alsAdmin('put', `/${id}`).send({
      title: 'Podium afbreken',
      description: 'Na afloop',
      taskListId: lijst,
      status: 'review',
      priority: 'high',
      dueDate: '2026-09-01T18:00:00.000Z',
      reminderAt: '2026-08-31T18:00:00.000Z',
      estimatedHours: 4,
      actualHours: 5,
      assignedTo: memberUser.id,
    });
    expect(res.status).toBe(200);

    const na = await alsAdmin('get', `/${id}`);
    expect(na.body).toMatchObject({
      title: 'Podium afbreken',
      description: 'Na afloop',
      taskListId: lijst,
      status: 'review',
      priority: 'high',
      estimatedHours: 4,
      actualHours: 5,
      assignedTo: memberUser.id,
      assignedToName: 'Member User',
      listName: 'Doel',
    });
  });

  it('weigert een onbekende status en een negatief aantal uren', async () => {
    const id = await maakTaak();

    expect((await alsAdmin('put', `/${id}`).send({ status: 'bijna' })).status).toBe(400);
    expect((await alsAdmin('put', `/${id}`).send({ actualHours: -1 })).status).toBe(400);
    expect((await alsAdmin('put', `/${id}`).send({ dueDate: 'morgen' })).status).toBe(400);
  });

  it('laat een verzoek zonder enig veld de taak ongemoeid', async () => {
    const id = await maakTaak();

    expect((await alsAdmin('put', `/${id}`).send({})).status).toBe(200);
    expect((await alsAdmin('get', `/${id}`)).body.title).toBe('Podium opbouwen');
  });

  it('weigert bij het aanmaken een takenlijst van een andere vereniging', async () => {
    const hun = andereVereniging('aanmaken-lijst');
    const hunLijst = uuidv4();
    db.prepare('INSERT INTO task_lists (id, association_id, name, created_by) VALUES (?, ?, ?, ?)').run(
      hunLijst,
      hun.vereniging.id,
      'Hun lijst',
      hun.beheerder.id,
    );

    const res = await alsAdmin('post', '/').send({ title: 'Verkeerde lijst', taskListId: hunLijst });
    expect(res.status).toBe(404);
    expect(db.prepare('SELECT COUNT(*) AS n FROM tasks').get()).toEqual({ n: 0 });
  });

  it('meldt netjes dat een onbekende taak niet bijgewerkt of verwijderd kan worden', async () => {
    expect((await alsAdmin('put', `/${uuidv4()}`).send({ title: 'Iets' })).status).toBe(404);
    expect((await alsAdmin('delete', `/${uuidv4()}`)).status).toBe(404);
  });

  it('laat de taak van een andere vereniging niet bijwerken', async () => {
    const id = await maakTaak();
    const hun = andereVereniging('bijwerken');

    const res = await request(app)
      .put(`/api/tasks/${id}`)
      .set('Authorization', `Bearer ${hun.token}`)
      .send({ title: 'Overgenomen' });
    expect(res.status).toBe(404);

    const rij = db.prepare('SELECT title FROM tasks WHERE id = ?').get(id) as { title: string };
    expect(rij.title).toBe('Podium opbouwen');
  });
});

// =====================================================
// TAKENLIJSTEN
// =====================================================

describe('Takenlijsten', () => {
  it('telt de open en de totale taken per lijst', async () => {
    const lijst = await maakLijst('Concert');
    await maakTaak({ title: 'Open', taskListId: lijst });
    const klaar = await maakTaak({ title: 'Klaar', taskListId: lijst });
    expect((await alsAdmin('put', `/${klaar}`).send({ status: 'done' })).status).toBe(200);

    const res = await alsAdmin('get', '/lists');
    const gevonden = res.body.find((l: { id: string }) => l.id === lijst);
    expect(gevonden.openCount).toBe(1);
    expect(gevonden.totalCount).toBe(2);
  });

  it('schrijft alle velden van een lijst weg', async () => {
    const res = await alsAdmin('post', '/lists').send({
      name: 'Concert',
      description: 'Alles rond het najaarsconcert',
      color: '#123456',
      icon: 'noot',
    });
    expect(res.status).toBe(201);

    const bijgewerkt = await alsAdmin('put', `/lists/${res.body.id}`).send({
      name: 'Najaarsconcert',
      description: 'Bijgewerkt',
      color: '#654321',
      icon: 'podium',
    });
    expect(bijgewerkt.status).toBe(200);

    const lijst = (await alsAdmin('get', '/lists')).body.find((l: { id: string }) => l.id === res.body.id);
    expect(lijst).toMatchObject({
      name: 'Najaarsconcert',
      description: 'Bijgewerkt',
      color: '#654321',
      icon: 'podium',
    });
  });

  it('verwijdert een lijst waar nog taken aan hangen zonder die taken mee te nemen', async () => {
    // Dit is het geval waar het misgaat als de route de taken zou meenemen:
    // een lijst opruimen aan het eind van een seizoen mag geen werk wissen dat
    // nog openstaat. De taken raken alleen hun lijst kwijt.
    const lijst = await maakLijst('Tijdelijk');
    const taak = await maakTaak({ title: 'Blijft bestaan', taskListId: lijst });

    expect((await alsAdmin('delete', `/lists/${lijst}`)).status).toBe(200);

    const na = await alsAdmin('get', `/${taak}`);
    expect(na.status).toBe(200);
    expect(na.body.taskListId).toBeNull();
    expect(na.body.listName).toBeNull();

    const zonderLijst = await alsAdmin('get', '/?listId=none');
    expect(zonderLijst.body.map((t: { id: string }) => t.id)).toEqual([taak]);
  });

  it('meldt netjes dat een onbekende lijst niet bestaat', async () => {
    expect((await alsAdmin('put', `/lists/${uuidv4()}`).send({ name: 'Iets' })).status).toBe(404);
    expect((await alsAdmin('delete', `/lists/${uuidv4()}`)).status).toBe(404);
  });

  it('laat de lijst van een andere vereniging niet wijzigen of verwijderen', async () => {
    const lijst = await maakLijst('Van ons');
    const hun = andereVereniging('lijsten');

    const wijzigen = await request(app)
      .put(`/api/tasks/lists/${lijst}`)
      .set('Authorization', `Bearer ${hun.token}`)
      .send({ name: 'Overgenomen' });
    expect(wijzigen.status).toBe(404);

    const verwijderen = await request(app)
      .delete(`/api/tasks/lists/${lijst}`)
      .set('Authorization', `Bearer ${hun.token}`);
    expect(verwijderen.status).toBe(404);

    const rij = db.prepare('SELECT name FROM task_lists WHERE id = ?').get(lijst) as { name: string };
    expect(rij.name).toBe('Van ons');
  });

  it('laat een gewoon lid geen lijst wijzigen of verwijderen', async () => {
    const lijst = await maakLijst();

    expect((await alsLid('put', `/lists/${lijst}`).send({ name: 'Stiekem' })).status).toBe(403);
    expect((await alsLid('delete', `/lists/${lijst}`)).status).toBe(403);
    expect((await alsLid('get', '/lists')).status).toBe(200);
  });
});

// =====================================================
// CHECKLIST
// =====================================================

describe('De checklist van een taak', () => {
  it('nummert nieuwe punten oplopend door', async () => {
    const id = await maakTaak();
    await alsAdmin('post', `/${id}/checklist`).send({ content: 'Eerst dit' });
    await alsAdmin('post', `/${id}/checklist`).send({ content: 'Dan dat' });

    const res = await alsAdmin('get', `/${id}`);
    expect(res.body.checklist.map((c: { content: string }) => c.content)).toEqual(['Eerst dit', 'Dan dat']);
    expect(res.body.checklist.map((c: { sortOrder: number }) => c.sortOrder)).toEqual([1, 2]);
  });

  it('houdt bij wie een punt heeft afgevinkt en wist dat weer bij ontvinken', async () => {
    const id = await maakTaak();
    const punt = await alsAdmin('post', `/${id}/checklist`).send({ content: 'Stoelen tellen' });

    expect((await alsLid('put', `/${id}/checklist/${punt.body.id}`).send({ isCompleted: true })).status).toBe(200);
    const afgevinkt = (await alsAdmin('get', `/${id}`)).body.checklist[0];
    expect(afgevinkt.isCompleted).toBe(true);
    expect(afgevinkt.completedBy).toBe(memberUser.id);
    expect(afgevinkt.completedByName).toBe('Member User');
    expect(afgevinkt.completedAt).toBeTruthy();

    expect((await alsAdmin('put', `/${id}/checklist/${punt.body.id}`).send({ isCompleted: false })).status).toBe(200);
    const ontvinkt = (await alsAdmin('get', `/${id}`)).body.checklist[0];
    expect(ontvinkt.isCompleted).toBe(false);
    expect(ontvinkt.completedBy).toBeNull();
    expect(ontvinkt.completedAt).toBeNull();
  });

  it('werkt alleen de tekst bij zonder het vinkje aan te raken', async () => {
    const id = await maakTaak();
    const punt = await alsAdmin('post', `/${id}/checklist`).send({ content: 'Stoelen tellen' });
    expect((await alsAdmin('put', `/${id}/checklist/${punt.body.id}`).send({ isCompleted: true })).status).toBe(200);

    expect(
      (await alsAdmin('put', `/${id}/checklist/${punt.body.id}`).send({ content: 'Stoelen natellen' })).status,
    ).toBe(200);

    const na = (await alsAdmin('get', `/${id}`)).body.checklist[0];
    expect(na.content).toBe('Stoelen natellen');
    expect(na.isCompleted).toBe(true);
  });

  it('laat een verzoek zonder velden het punt ongemoeid', async () => {
    const id = await maakTaak();
    const punt = await alsAdmin('post', `/${id}/checklist`).send({ content: 'Stoelen tellen' });

    expect((await alsAdmin('put', `/${id}/checklist/${punt.body.id}`).send({})).status).toBe(200);
    expect((await alsAdmin('get', `/${id}`)).body.checklist[0].content).toBe('Stoelen tellen');
  });

  it('weigert een punt zonder inhoud', async () => {
    const id = await maakTaak();
    expect((await alsAdmin('post', `/${id}/checklist`).send({ content: '' })).status).toBe(400);
  });

  it('verwijdert een punt', async () => {
    const id = await maakTaak();
    const punt = await alsAdmin('post', `/${id}/checklist`).send({ content: 'Weg hiermee' });

    expect((await alsAdmin('delete', `/${id}/checklist/${punt.body.id}`)).status).toBe(200);
    expect((await alsAdmin('get', `/${id}`)).body.checklist).toEqual([]);
  });

  it('neemt de checklist mee als de taak wordt verwijderd', async () => {
    const id = await maakTaak();
    await alsAdmin('post', `/${id}/checklist`).send({ content: 'Hangt aan de taak' });

    expect((await alsAdmin('delete', `/${id}`)).status).toBe(200);
    expect(db.prepare('SELECT COUNT(*) AS n FROM task_checklist_items WHERE task_id = ?').get(id)).toEqual({ n: 0 });
  });

  it('meldt netjes dat een onbekende taak of een onbekend punt niet bestaat', async () => {
    const onbekend = uuidv4();
    const id = await maakTaak();

    expect((await alsAdmin('post', `/${onbekend}/checklist`).send({ content: 'Iets' })).status).toBe(404);
    expect((await alsAdmin('put', `/${onbekend}/checklist/${uuidv4()}`).send({ content: 'Iets' })).status).toBe(404);
    expect((await alsAdmin('delete', `/${onbekend}/checklist/${uuidv4()}`)).status).toBe(404);
    expect((await alsAdmin('put', `/${id}/checklist/${uuidv4()}`).send({ content: 'Iets' })).status).toBe(404);
  });

  it('laat de checklist van een andere vereniging niet aanraken', async () => {
    const id = await maakTaak();
    const punt = await alsAdmin('post', `/${id}/checklist`).send({ content: 'Stoelen tellen' });
    const hun = andereVereniging('checklist');

    for (const verzoek of [
      request(app).post(`/api/tasks/${id}/checklist`).send({ content: 'Van hen' }),
      request(app).put(`/api/tasks/${id}/checklist/${punt.body.id}`).send({ content: 'Overgenomen' }),
      request(app).delete(`/api/tasks/${id}/checklist/${punt.body.id}`),
    ]) {
      const res = await verzoek.set('Authorization', `Bearer ${hun.token}`);
      expect(res.status).toBe(404);
    }

    const rij = db.prepare('SELECT content FROM task_checklist_items WHERE id = ?').get(punt.body.id) as {
      content: string;
    };
    expect(rij.content).toBe('Stoelen tellen');
  });
});

// =====================================================
// REACTIES
// =====================================================

describe('Reacties bij een taak', () => {
  it('plaatst een reactie met de naam van de schrijver erbij', async () => {
    const id = await maakTaak();

    const res = await alsLid('post', `/${id}/comments`).send({ content: 'Ik pak dit op.' });
    expect(res.status).toBe(201);
    expect(res.body.authorName).toBe('Member User');
    expect(res.body.authorId).toBe(memberUser.id);

    const taak = await alsAdmin('get', `/${id}`);
    expect(taak.body.comments).toHaveLength(1);
    expect(taak.body.comments[0]).toMatchObject({ content: 'Ik pak dit op.', authorName: 'Member User' });
  });

  it('weigert een lege reactie', async () => {
    const id = await maakTaak();
    expect((await alsAdmin('post', `/${id}/comments`).send({ content: '' })).status).toBe(400);
  });

  it('laat iemand zijn eigen reactie verwijderen', async () => {
    const id = await maakTaak();
    const reactie = await alsLid('post', `/${id}/comments`).send({ content: 'Van mij' });

    expect((await alsLid('delete', `/${id}/comments/${reactie.body.id}`)).status).toBe(200);
    expect((await alsAdmin('get', `/${id}`)).body.comments).toEqual([]);
  });

  it('laat een lid de reactie van iemand anders niet verwijderen', async () => {
    // Een reactie is van de schrijver. Zonder deze controle kan elk lid de
    // woorden van een ander uit de taak halen.
    const id = await maakTaak();
    const reactie = await alsAdmin('post', `/${id}/comments`).send({ content: 'Van de beheerder' });

    const res = await alsLid('delete', `/${id}/comments/${reactie.body.id}`);
    expect(res.status).toBe(403);
    expect(db.prepare('SELECT COUNT(*) AS n FROM task_comments WHERE id = ?').get(reactie.body.id)).toEqual({ n: 1 });
  });

  it('laat het bestuur de reactie van een ander wel verwijderen', async () => {
    const id = await maakTaak();
    const reactie = await alsLid('post', `/${id}/comments`).send({ content: 'Iets onaardigs' });

    expect((await alsAdmin('delete', `/${id}/comments/${reactie.body.id}`)).status).toBe(200);
  });

  it('neemt de reacties mee als de taak wordt verwijderd', async () => {
    const id = await maakTaak();
    await alsAdmin('post', `/${id}/comments`).send({ content: 'Hangt aan de taak' });

    expect((await alsAdmin('delete', `/${id}`)).status).toBe(200);
    expect(db.prepare('SELECT COUNT(*) AS n FROM task_comments WHERE task_id = ?').get(id)).toEqual({ n: 0 });
  });

  it('meldt netjes dat een onbekende taak of een onbekende reactie niet bestaat', async () => {
    const id = await maakTaak();

    expect((await alsAdmin('post', `/${uuidv4()}/comments`).send({ content: 'Iets' })).status).toBe(404);
    expect((await alsAdmin('delete', `/${uuidv4()}/comments/${uuidv4()}`)).status).toBe(404);
    expect((await alsAdmin('delete', `/${id}/comments/${uuidv4()}`)).status).toBe(404);
  });

  it('laat de reacties van een andere vereniging niet aanraken', async () => {
    const id = await maakTaak();
    const reactie = await alsAdmin('post', `/${id}/comments`).send({ content: 'Intern' });
    const hun = andereVereniging('reacties');

    const plaatsen = await request(app)
      .post(`/api/tasks/${id}/comments`)
      .set('Authorization', `Bearer ${hun.token}`)
      .send({ content: 'Van hen' });
    expect(plaatsen.status).toBe(404);

    const verwijderen = await request(app)
      .delete(`/api/tasks/${id}/comments/${reactie.body.id}`)
      .set('Authorization', `Bearer ${hun.token}`);
    expect(verwijderen.status).toBe(404);

    expect(db.prepare('SELECT COUNT(*) AS n FROM task_comments WHERE task_id = ?').get(id)).toEqual({ n: 1 });
  });
});

// =====================================================
// DE SAMENVATTING
// =====================================================

describe('De samenvatting', () => {
  it('telt per status en somt de open taken op', async () => {
    const mijn = await maakTaak({ title: 'Voor mij', assignedTo: adminUser.id });
    const klaar = await maakTaak({ title: 'Klaar' });
    expect((await alsAdmin('put', `/${klaar}`).send({ status: 'done' })).status).toBe(200);
    const bezig = await maakTaak({ title: 'Bezig' });
    expect((await alsAdmin('put', `/${bezig}`).send({ status: 'in_progress' })).status).toBe(200);

    const res = await alsAdmin('get', '/summary');
    expect(res.status).toBe(200);
    expect(res.body.statusSummary).toMatchObject({ todo: 1, in_progress: 1, done: 1 });
    expect(res.body.totalOpen).toBe(2);
    expect(res.body.myTasks.map((t: { id: string }) => t.id)).toEqual([mijn]);
    expect(res.body.recentCompleted.map((t: { id: string }) => t.id)).toEqual([klaar]);
  });

  it('zet een taak waarvan de datum verstreken is bij de achterstand', async () => {
    const teLaat = await maakTaak({ title: 'Had al gemoeten', dueDate: '2020-01-01T12:00:00.000Z' });
    await maakTaak({ title: 'Nog even', dueDate: '2099-01-01T12:00:00.000Z' });

    const res = await alsAdmin('get', '/summary');
    expect(res.body.overdueTasks.map((t: { id: string }) => t.id)).toEqual([teLaat]);
  });

  it('telt de taken van een andere vereniging niet mee', async () => {
    const hun = andereVereniging('samenvatting');
    await request(app).post('/api/tasks/').set('Authorization', `Bearer ${hun.token}`).send({ title: 'Van hen' });

    const res = await alsAdmin('get', '/summary');
    expect(res.body.statusSummary.todo).toBe(0);
    expect(res.body.totalOpen).toBe(0);
  });
});

// =====================================================
// TEMPLATES
// =====================================================

describe('Templates', () => {
  it('maakt een template met checklist en toont hem', async () => {
    const lijst = await maakLijst('Concert');
    const id = await maakTemplate({
      description: 'Vaste stappen voor een concert',
      taskListId: lijst,
      priority: 'high',
      estimatedHours: 6,
      checklistItems: ['Zaal boeken', 'Programma drukken'],
    });

    const res = await alsAdmin('get', '/templates');
    expect(res.status).toBe(200);
    const template = res.body.find((t: { id: string }) => t.id === id);
    expect(template).toMatchObject({
      name: 'Concertdraaiboek',
      description: 'Vaste stappen voor een concert',
      taskListId: lijst,
      listName: 'Concert',
      priority: 'high',
      estimatedHours: 6,
      createdByName: 'Admin User',
    });
    expect(template.checklistItems).toEqual(['Zaal boeken', 'Programma drukken']);
  });

  it('weigert een template zonder naam en met een onbekende urgentie', async () => {
    expect((await alsAdmin('post', '/templates').send({ name: '' })).status).toBe(400);
    expect((await alsAdmin('post', '/templates').send({ name: 'Iets', priority: 'brandend' })).status).toBe(400);
  });

  it('werkt alle velden van een template bij', async () => {
    const lijst = await maakLijst('Nieuwe lijst');
    const id = await maakTemplate({ checklistItems: ['Oud punt'] });

    const res = await alsAdmin('put', `/templates/${id}`).send({
      name: 'Bijgewerkt draaiboek',
      description: 'Nieuwe omschrijving',
      taskListId: lijst,
      priority: 'urgent',
      estimatedHours: 8,
      checklistItems: ['Nieuw punt'],
    });
    expect(res.status).toBe(200);

    const template = (await alsAdmin('get', '/templates')).body.find((t: { id: string }) => t.id === id);
    expect(template).toMatchObject({
      name: 'Bijgewerkt draaiboek',
      description: 'Nieuwe omschrijving',
      taskListId: lijst,
      priority: 'urgent',
      estimatedHours: 8,
    });
    expect(template.checklistItems).toEqual(['Nieuw punt']);
  });

  it('laat een verzoek zonder velden het template ongemoeid', async () => {
    const id = await maakTemplate();

    expect((await alsAdmin('put', `/templates/${id}`).send({})).status).toBe(200);
    expect((await alsAdmin('get', '/templates')).body.find((t: { id: string }) => t.id === id).name).toBe(
      'Concertdraaiboek',
    );
  });

  it('haalt een verwijderd template uit het overzicht zonder de rij weg te gooien', async () => {
    const id = await maakTemplate();

    expect((await alsAdmin('delete', `/templates/${id}`)).status).toBe(200);
    expect((await alsAdmin('get', '/templates')).body.map((t: { id: string }) => t.id)).not.toContain(id);
    expect(db.prepare('SELECT is_active FROM task_templates WHERE id = ?').get(id)).toEqual({ is_active: 0 });
  });

  it('maakt van een verwijderd template geen taak meer', async () => {
    const id = await maakTemplate();
    expect((await alsAdmin('delete', `/templates/${id}`)).status).toBe(200);

    expect((await alsAdmin('post', `/templates/${id}/create-task`).send({})).status).toBe(404);
  });

  it('meldt netjes dat een onbekend template niet bestaat', async () => {
    const onbekend = uuidv4();
    expect((await alsAdmin('put', `/templates/${onbekend}`).send({ name: 'Iets' })).status).toBe(404);
    expect((await alsAdmin('delete', `/templates/${onbekend}`)).status).toBe(404);
    expect((await alsAdmin('post', `/templates/${onbekend}/create-task`).send({})).status).toBe(404);
  });

  it('laat een gewoon lid geen template beheren maar wel gebruiken', async () => {
    const id = await maakTemplate();

    expect((await alsLid('post', '/templates').send({ name: 'Stiekem' })).status).toBe(403);
    expect((await alsLid('put', `/templates/${id}`).send({ name: 'Stiekem' })).status).toBe(403);
    expect((await alsLid('delete', `/templates/${id}`)).status).toBe(403);

    expect((await alsLid('get', '/templates')).status).toBe(200);
    expect((await alsLid('post', `/templates/${id}/create-task`).send({})).status).toBe(201);
  });

  it('laat het template van een andere vereniging niet zien of gebruiken', async () => {
    const id = await maakTemplate();
    const hun = andereVereniging('templates');

    const lezen = await request(app).get('/api/tasks/templates').set('Authorization', `Bearer ${hun.token}`);
    expect(lezen.body.map((t: { id: string }) => t.id)).not.toContain(id);

    const gebruiken = await request(app)
      .post(`/api/tasks/templates/${id}/create-task`)
      .set('Authorization', `Bearer ${hun.token}`)
      .send({});
    expect(gebruiken.status).toBe(404);

    const wijzigen = await request(app)
      .put(`/api/tasks/templates/${id}`)
      .set('Authorization', `Bearer ${hun.token}`)
      .send({ name: 'Overgenomen' });
    expect(wijzigen.status).toBe(404);
  });
});

describe('Een taak uit een template', () => {
  it('neemt naam, omschrijving, urgentie, lijst en checklist over', async () => {
    const lijst = await maakLijst('Concert');
    const template = await maakTemplate({
      description: 'Vaste stappen',
      taskListId: lijst,
      priority: 'high',
      estimatedHours: 6,
      checklistItems: ['Zaal boeken', 'Programma drukken'],
    });

    const res = await alsAdmin('post', `/templates/${template}/create-task`).send({});
    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Concertdraaiboek');

    const taak = await alsAdmin('get', `/${res.body.id}`);
    expect(taak.body).toMatchObject({
      title: 'Concertdraaiboek',
      description: 'Vaste stappen',
      priority: 'high',
      estimatedHours: 6,
      taskListId: lijst,
      status: 'todo',
    });
    expect(taak.body.checklist.map((c: { content: string }) => c.content)).toEqual([
      'Zaal boeken',
      'Programma drukken',
    ]);
  });

  it('gebruikt een eigen titel en datum als die worden meegegeven', async () => {
    const template = await maakTemplate();

    const res = await alsAdmin('post', `/templates/${template}/create-task`).send({
      title: 'Draaiboek najaarsconcert',
      dueDate: '2026-11-01T12:00:00.000Z',
    });
    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Draaiboek najaarsconcert');

    const taak = await alsAdmin('get', `/${res.body.id}`);
    expect(taak.body.title).toBe('Draaiboek najaarsconcert');
    expect(taak.body.dueDate).toBe('2026-11-01T12:00:00.000Z');
  });

  it('wijst de taak toe aan een eigen lid', async () => {
    const template = await maakTemplate();

    const res = await alsAdmin('post', `/templates/${template}/create-task`).send({ assignedTo: memberUser.id });
    expect(res.status).toBe(201);
    expect((await alsAdmin('get', `/${res.body.id}`)).body.assignedTo).toBe(memberUser.id);
  });

  it('wijst geen taak uit een template toe aan iemand van een andere vereniging', async () => {
    // BEWIJS. Het aanmaken en het bijwerken van een taak controleren de
    // toegewezene tegen de eigen vereniging; deze derde plek waar een taak
    // ontstaat deed dat niet en nam assignedTo ongezien uit het verzoek over.
    //
    // De uitkomst is een toewijzing die nergens heen gaat: het overzicht
    // filtert op vereniging, dus de toegewezene ziet de taak nooit, terwijl
    // zijn naam hier wel in het overzicht en de samenvatting verschijnt. Het
    // werk lijkt belegd en ligt stil.
    //
    // Zonder de reparatie in tasks.ts geeft dit 201 en staat de vreemde
    // gebruiker in assigned_to; met de reparatie 404.
    const hun = andereVereniging('template-toewijzen');
    const template = await maakTemplate();

    const res = await alsAdmin('post', `/templates/${template}/create-task`).send({ assignedTo: hun.lid.id });

    expect(res.status).toBe(404);
    expect(db.prepare('SELECT COUNT(*) AS n FROM tasks WHERE assigned_to = ?').get(hun.lid.id)).toEqual({ n: 0 });
  });

  it('zet een template niet op de takenlijst van een andere vereniging', async () => {
    // BEWIJS. Dezelfde vergeten controle een stap eerder: het template zelf
    // nam taskListId ongezien over. Een taak die daaruit ontstaat krijgt dan
    // een lijst van een andere vereniging, en het takenoverzicht haalt de naam
    // en de kleur van die lijst op met een LEFT JOIN zonder verenigingsfilter.
    // De naam van een lijst van een andere vereniging kwam zo gewoon in beeld.
    //
    // Zonder de reparatie in tasks.ts geven beide verzoeken hieronder 201/200;
    // met de reparatie 404.
    const hun = andereVereniging('template-lijst');
    const hunLijst = uuidv4();
    db.prepare('INSERT INTO task_lists (id, association_id, name, created_by) VALUES (?, ?, ?, ?)').run(
      hunLijst,
      hun.vereniging.id,
      'Sponsorgesprekken Rabobank',
      hun.beheerder.id,
    );

    const aanmaken = await alsAdmin('post', '/templates').send({ name: 'Vreemde lijst', taskListId: hunLijst });
    expect(aanmaken.status).toBe(404);

    const eigen = await maakTemplate();
    const bijwerken = await alsAdmin('put', `/templates/${eigen}`).send({ taskListId: hunLijst });
    expect(bijwerken.status).toBe(404);

    expect(db.prepare('SELECT COUNT(*) AS n FROM task_templates WHERE task_list_id = ?').get(hunLijst)).toEqual({
      n: 0,
    });
  });
});

// =====================================================
// EEN GEBRUIKER ZONDER VERENIGING
// =====================================================

describe('Een gebruiker zonder vereniging', () => {
  // Een account bestaat al voordat het aan een vereniging hangt. Zo'n token
  // komt door de authenticatie heen, maar elke route hier werkt met een
  // vereniging. Het antwoord hoort een nette 400 te zijn en geen serverfout,
  // en zeker geen zoekopdracht zonder verenigingsfilter.
  let losToken: string;

  beforeEach(() => {
    const zonder = createTestUser(associationId, {
      email: `los-${uuidv4().slice(0, 8)}@test.com`,
      role: 'admin',
    });
    losToken = jwt.sign({ id: zonder.id, email: zonder.email, role: 'admin', associationId: null }, JWT_SECRET, {
      expiresIn: '1h',
    });
  });

  const zonderVereniging = (methode: Methode, pad: string) =>
    request(app)[methode](`/api/tasks${pad}`).set('Authorization', `Bearer ${losToken}`);

  it('geeft een nette foutmelding op de overzichten', async () => {
    for (const pad of ['/', '/lists', '/templates', '/summary']) {
      const res = await zonderVereniging('get', pad);
      expect({ pad, status: res.status }).toEqual({ pad, status: 400 });
      expect(res.body.error).toMatch(/vereniging/i);
    }
  });

  it('geeft een nette foutmelding bij het aanmaken', async () => {
    const gevallen: [Methode, string, Record<string, unknown>][] = [
      ['post', '/', { title: 'Taak' }],
      ['post', '/lists', { name: 'Lijst' }],
      ['post', '/templates', { name: 'Template' }],
      ['post', `/templates/${uuidv4()}/create-task`, {}],
    ];

    for (const [methode, pad, lichaam] of gevallen) {
      const res = await zonderVereniging(methode, pad).send(lichaam);
      expect({ pad, status: res.status }).toEqual({ pad, status: 400 });
    }
  });
});

// =====================================================
// LOSSE TOEWIJZINGEN
// =====================================================

describe('Losse toewijzingen bij een taak', () => {
  it('toont de namen van iedereen die aan de taak is gekoppeld', async () => {
    // task_assignments wordt door geen enkele route gevuld maar wel door
    // GET /:id gelezen. Deze test legt vast dat die uitlezing werkt, zodat een
    // route die de tabel later wel vult niet stilletjes op niets uitkomt.
    const id = await maakTaak();
    db.prepare('INSERT INTO task_assignments (id, task_id, user_id, assigned_by) VALUES (?, ?, ?, ?)').run(
      uuidv4(),
      id,
      memberUser.id,
      adminUser.id,
    );

    const res = await alsAdmin('get', `/${id}`);
    expect(res.body.assignments).toEqual([expect.objectContaining({ userId: memberUser.id, userName: 'Member User' })]);
  });
});
