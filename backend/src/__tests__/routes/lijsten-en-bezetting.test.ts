/**
 * Losse eindjes rond muzieklijsten en de bezetting van een orkest.
 *
 * Vier plekken die hetzelfde patroon delen als eerder gerepareerde routes,
 * maar er tot nu toe buiten vielen:
 *
 *   - De bezetting van een orkest toonde leden van een andere vereniging en
 *     leden die zacht verwijderd zijn. Het orkest zelf is wel op vereniging
 *     gecontroleerd, maar user_orchestras legt geen vereniging vast.
 *   - Het aantal partijen op een lijst telde zacht verwijderde partijen mee,
 *     in het orkestoverzicht en in de zoekresultaten.
 *   - pdf-tools en failed-imports schreven een listId uit de aanvraag weg
 *     zonder te controleren of die lijst bij de eigen vereniging hoort.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import express from 'express';
import searchRoutes from '../../routes/search';
import { errorHandler } from '../../middleware/errorHandler';
import app from '../testApp';
import db from '../../database/connection';
import {
  createTestAssociation,
  createTestEnvironment,
  createTestOrchestra,
  createTestUser,
  addUserToOrchestra,
  TestAssociation,
  TestOrchestra,
} from '../testUtils';

let association: TestAssociation;
let adminToken: string;
let orkest: TestOrchestra;

beforeEach(() => {
  const omgeving = createTestEnvironment();
  association = omgeving.association;
  adminToken = omgeving.adminToken;
  orkest = createTestOrchestra(association.id, { name: 'Harmonieorkest' });
});

// testApp mount de zoekroute niet, dus die krijgt een eigen app - net als in
// search.test.ts.
const zoekApp = express();
zoekApp.use(express.json());
zoekApp.use('/api/search', searchRoutes);
zoekApp.use(errorHandler);

function maakLijst(orchestraId: string, naam = 'Concertlijst'): string {
  const id = uuidv4();
  db.prepare('INSERT INTO music_lists (id, orchestra_id, name) VALUES (?, ?, ?)').run(id, orchestraId, naam);
  return id;
}

function maakPartij(associationId: string, titel: string, verwijderd = false): string {
  const id = uuidv4();
  db.prepare(
    `INSERT INTO music_pieces (id, title, association_id, file_path, original_filename, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, titel, associationId, `/tmp/${id}.pdf`, `${titel}.pdf`, verwijderd ? new Date().toISOString() : null);
  return id;
}

function zetOpLijst(listId: string, pieceId: string) {
  db.prepare('INSERT INTO music_list_pieces (music_list_id, music_piece_id) VALUES (?, ?)').run(listId, pieceId);
}

describe('De bezetting van een orkest', () => {
  it('toont geen lid van een andere vereniging', async () => {
    const andere = createTestAssociation();
    const hunLid = createTestUser(andere.id, { email: 'hunlid-orkest@test.com', role: 'member' });
    addUserToOrchestra(hunLid.id, orkest.id);

    const res = await request(app).get(`/api/orchestras/${orkest.id}`).set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const ids = res.body.members.map((m: { id: string }) => m.id);
    expect(ids).not.toContain(hunLid.id);
  });

  it('toont geen zacht verwijderd lid', async () => {
    const vertrokken = createTestUser(association.id, { email: 'vertrokken-orkest@test.com', role: 'member' });
    addUserToOrchestra(vertrokken.id, orkest.id);
    db.prepare('UPDATE users SET deleted_at = ? WHERE id = ?').run(new Date().toISOString(), vertrokken.id);

    const res = await request(app).get(`/api/orchestras/${orkest.id}`).set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const ids = res.body.members.map((m: { id: string }) => m.id);
    expect(ids).not.toContain(vertrokken.id);
  });

  it('toont een eigen, actief lid gewoon', async () => {
    const lid = createTestUser(association.id, { email: 'gewoonlid-orkest@test.com', role: 'member' });
    addUserToOrchestra(lid.id, orkest.id);

    const res = await request(app).get(`/api/orchestras/${orkest.id}`).set('Authorization', `Bearer ${adminToken}`);

    const ids = res.body.members.map((m: { id: string }) => m.id);
    expect(ids).toContain(lid.id);
  });
});

describe('Het aantal partijen op een lijst', () => {
  it('telt zacht verwijderde partijen niet mee in het orkestoverzicht', async () => {
    const lijst = maakLijst(orkest.id);
    zetOpLijst(lijst, maakPartij(association.id, 'Mars - Trompet'));
    zetOpLijst(lijst, maakPartij(association.id, 'Mars - Klarinet', true));

    const res = await request(app).get(`/api/orchestras/${orkest.id}`).set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const gevonden = res.body.lists.find((l: { id: string }) => l.id === lijst);
    expect(gevonden.pieceCount ?? gevonden.piece_count).toBe(1);
  });

  it('toont een verwijderde lijst niet in het orkestoverzicht', async () => {
    const lijst = maakLijst(orkest.id, 'Weggegooid');
    db.prepare('UPDATE music_lists SET deleted_at = ? WHERE id = ?').run(new Date().toISOString(), lijst);

    const res = await request(app).get(`/api/orchestras/${orkest.id}`).set('Authorization', `Bearer ${adminToken}`);

    const ids = res.body.lists.map((l: { id: string }) => l.id);
    expect(ids).not.toContain(lijst);
  });

  it('telt zacht verwijderde partijen niet mee in de zoekresultaten', async () => {
    const lijst = maakLijst(orkest.id, 'Zoekbare lijst');
    zetOpLijst(lijst, maakPartij(association.id, 'Bolero - Trompet'));
    zetOpLijst(lijst, maakPartij(association.id, 'Bolero - Hoorn', true));

    const res = await request(zoekApp).get('/api/search?q=Zoekbare').set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const treffer = res.body.results.find((r: { id: string }) => r.id === lijst);
    expect(treffer).toBeTruthy();
    expect(treffer.metadata.pieceCount).toBe(1);
    // De ondertitel toont hetzelfde getal aan de gebruiker.
    expect(treffer.subtitle).toContain('1 stukken');
  });
});
