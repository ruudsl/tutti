/**
 * GET /api/users/bezetting: wie speelt wat, in welk orkest.
 *
 * Opstelling, bezetting, buurvoorkeuren en het podium van een concert zijn er
 * voor muziekcommissie en dirigent, maar haalden GET /users op, en die is
 * alleen voor de beheerder. De muziekcommissie kreeg een 403 en zag geen
 * leden. Wat hier vastligt:
 *
 * - beheer, muziekcommissie en dirigent krijgen de leden met instrumenten en
 *   orkesten; een gewoon lid niet;
 * - zonder e-mail, rol of andere gegevens die die pagina's niet nodig hebben;
 * - alleen de eigen vereniging, en geen verwijderde leden.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import '../setup';
import db from '../../database/connection';
import app from '../testApp';
import {
  createTestAssociation,
  createTestEnvironment,
  createTestInstrument,
  createTestOrchestra,
  createTestUser,
  generateTestToken,
} from '../testUtils';

let omgeving: ReturnType<typeof createTestEnvironment>;
let dirigentToken: string;
let orkestId: string;
let instrumentId: string;

beforeEach(() => {
  omgeving = createTestEnvironment();
  const dirigent = createTestUser(omgeving.association.id, { email: 'dirigent@voorbeeld.nl', role: 'conductor' });
  dirigentToken = generateTestToken(dirigent);
  orkestId = createTestOrchestra(omgeving.association.id, { name: 'Groot Orkest' }).id;
  instrumentId = createTestInstrument({ name: 'Trompet' }).id;
  db.prepare('INSERT INTO user_orchestras (user_id, orchestra_id) VALUES (?, ?)').run(omgeving.memberUser.id, orkestId);
  db.prepare('INSERT INTO user_instruments (user_id, instrument_id) VALUES (?, ?)').run(
    omgeving.memberUser.id,
    instrumentId,
  );
});

const vraag = (token: string) => request(app).get('/api/users/bezetting').set('Authorization', `Bearer ${token}`);

describe('leden voor de opstelling', () => {
  it('geeft de muziekcommissie de leden met instrumenten en orkesten', async () => {
    const antwoord = await vraag(omgeving.musicCommitteeToken);

    expect(antwoord.status).toBe(200);
    const lid = antwoord.body.find((l: { id: string }) => l.id === omgeving.memberUser.id);
    expect(lid).toEqual({
      id: omgeving.memberUser.id,
      firstName: omgeving.memberUser.firstName,
      lastName: omgeving.memberUser.lastName,
      instruments: [expect.objectContaining({ id: instrumentId, name: 'Trompet' })],
      orchestras: [{ id: orkestId, name: 'Groot Orkest' }],
    });
  });

  it('geeft ook de dirigent en de beheerder de lijst', async () => {
    expect((await vraag(dirigentToken)).status).toBe(200);
    expect((await vraag(omgeving.adminToken)).status).toBe(200);
  });

  it('geeft geen e-mailadressen of rollen mee', async () => {
    const antwoord = await vraag(omgeving.musicCommitteeToken);

    const tekst = JSON.stringify(antwoord.body);
    expect(tekst).not.toContain('@');
    expect(antwoord.body.every((l: Record<string, unknown>) => !('role' in l) && !('email' in l))).toBe(true);
  });

  it('is niet voor een gewoon lid', async () => {
    expect((await vraag(omgeving.memberToken)).status).toBe(403);
    expect((await request(app).get('/api/users/bezetting')).status).toBe(401);
  });

  it('noemt geen leden van een andere vereniging en geen verwijderde leden', async () => {
    const ander = createTestAssociation();
    const vreemde = createTestUser(ander.id, { email: 'vreemd@ander.nl' });
    const weg = createTestUser(omgeving.association.id, { email: 'weg@voorbeeld.nl' });
    db.prepare('UPDATE users SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?').run(weg.id);

    const ids = (await vraag(omgeving.musicCommitteeToken)).body.map((l: { id: string }) => l.id);

    expect(ids).toContain(omgeving.memberUser.id);
    expect(ids).not.toContain(vreemde.id);
    expect(ids).not.toContain(weg.id);
  });
});
