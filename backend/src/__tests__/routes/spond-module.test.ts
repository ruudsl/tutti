/**
 * De Spond-koppeling is een module — maar niet alles onder /spond is koppeling.
 *
 * Uitzetten hoort de koppeling te verbergen: de configuratie, de groepen, de
 * gekoppelde leden en het synchroniseren. Wat níét mag verdwijnen is de eigen
 * aanwezigheid van een lid. Die twee routes heten wel `/spond/attendance/...`,
 * maar het is kernfunctionaliteit die daar alleen staat omdat ze ooit samen
 * met de synchronisatie is geschreven.
 *
 * Zou de guard ook op die twee staan, dan raakt elk lid zijn afmeldknop kwijt
 * zodra een beheerder Spond uitzet. Dat zou niemand aan de module koppelen, en
 * de melding zou een 404 zijn.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import '../setup';
import db from '../../database/connection';
import spondRoutes from '../../routes/spond';
import { errorHandler } from '../../middleware/errorHandler';
import { createTestEnvironment, createTestRehearsal } from '../testUtils';
import { setModuleEnabled, clearModuleCache } from '../../modules/service';

const app = express();
app.use(express.json());
app.use('/api/spond', spondRoutes);
app.use(errorHandler);

let adminToken: string;
let memberToken: string;
let associationId: string;
let adminId: string;
let rehearsalId: string;

beforeEach(() => {
  const omgeving = createTestEnvironment();
  adminToken = omgeving.adminToken;
  memberToken = omgeving.memberToken;
  associationId = omgeving.association.id;
  adminId = omgeving.adminUser.id;
  rehearsalId = createTestRehearsal(associationId, adminId).id;
  // Standaard staat de module uit, net als alle andere. Elke test hieronder
  // zegt zelf welke stand hij onderzoekt; dit is de uitgangspositie "aan".
  setModuleEnabled(associationId, 'spond', true, adminId);
});

/** Zet de module uit voor deze vereniging, zoals een beheerder dat zou doen. */
function zetSpondUit() {
  setModuleEnabled(associationId, 'spond', false, adminId);
  clearModuleCache(associationId);
}

describe('module aan', () => {
  it('geeft de configuratie gewoon terug', async () => {
    const res = await request(app).get('/api/spond/config').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });
});

describe('module uit: de koppeling is weg', () => {
  beforeEach(zetSpondUit);

  const koppelingsroutes: [string, string][] = [
    ['get', '/api/spond/config'],
    ['get', '/api/spond/groups'],
    ['get', '/api/spond/orchestra-groups'],
    ['get', '/api/spond/member-links'],
    ['post', '/api/spond/sync'],
  ];

  for (const [methode, pad] of koppelingsroutes) {
    it(`geeft 404 op ${methode.toUpperCase()} ${pad}`, async () => {
      const res = await (request(app) as any)[methode](pad).set('Authorization', `Bearer ${adminToken}`).send({});
      // 404 en niet 403: een uitgezette module hoort niet te bestaan voor deze
      // vereniging. Een 403 zou verklappen dat de functionaliteit er wel is.
      expect(res.status).toBe(404);
    });
  }

  it('raakt de opgeslagen configuratie niet aan', async () => {
    db.prepare(
      `INSERT INTO spond_config (id, association_id, username, password_encrypted, sync_enabled)
       VALUES ('cfg-1', ?, 'iemand@example.com', 'versleuteld', 1)`,
    ).run(associationId);

    await request(app).get('/api/spond/config').set('Authorization', `Bearer ${adminToken}`);

    // Uitzetten verbergt, het verwijdert niets.
    const rij = db.prepare('SELECT username FROM spond_config WHERE association_id = ?').get(associationId) as
      { username: string } | undefined;
    expect(rij?.username).toBe('iemand@example.com');
  });
});

describe('module uit: de eigen aanwezigheid blijft', () => {
  beforeEach(zetSpondUit);

  it('laat een lid zich nog steeds aanmelden', async () => {
    const res = await request(app)
      .put(`/api/spond/attendance/${rehearsalId}`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ accepted: true });

    expect(res.status).toBe(200);
  });

  it('geeft een lid zijn eigen status terug', async () => {
    await request(app)
      .put(`/api/spond/attendance/${rehearsalId}`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ accepted: false });

    const res = await request(app)
      .get(`/api/spond/attendance/${rehearsalId}/my-status`)
      .set('Authorization', `Bearer ${memberToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('declined');
  });

  it('biedt geen synchronisatie naar Spond aan', async () => {
    // Er is geen koppeling om naartoe te sturen, dus de knop hoort weg.
    const res = await request(app)
      .get(`/api/spond/attendance/${rehearsalId}/my-status`)
      .set('Authorization', `Bearer ${memberToken}`);

    expect(res.status).toBe(200);
    expect(res.body.canSyncToSpond).toBe(false);
  });
});
