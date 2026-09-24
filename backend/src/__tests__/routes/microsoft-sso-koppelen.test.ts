/**
 * Wie via Microsoft binnenkomt, en als wie.
 *
 * De callback koppelde een Microsoft-account aan een lid op basis van `mail`
 * (of anders de userPrincipalName), zonder te kijken uit welke tenant het
 * account kwam en zonder naar de status van het lid te kijken. Met `common` of
 * `organizations` als tenant kon iedereen een eigen tenant aanmaken, daar
 * `mail` op het adres van een lid zetten en als dat lid inloggen. En een lid
 * dat uit dienst was, kwam via Microsoft gewoon binnen.
 *
 * Nu: eerst op microsoft_id; automatisch koppelen alleen op de UPN, alleen bij
 * een ingestelde tenant-id die gelijk is aan de `tid` in het id_token; een lid
 * uit dienst komt er niet in; en open tenants zijn niet in te stellen.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import '../setup';
import db from '../../database/connection';
import microsoftAuthRoutes from '../../routes/microsoft-auth';
import { errorHandler } from '../../middleware/errorHandler';
import { createTestEnvironment, TestAssociation, TestUser } from '../testUtils';

const app = express();
app.use(express.json());
app.use('/api/auth/microsoft', microsoftAuthRoutes);
app.use(errorHandler);

const EIGEN_TENANT = '11111111-2222-3333-4444-555555555555';
const VREEMDE_TENANT = '99999999-8888-7777-6666-555555555555';

function antwoord(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    json: async () => body,
  } as unknown as Response;
}

/** Een id_token zoals het token-eindpunt het teruggeeft; alleen de claims tellen. */
function idToken(claims: Record<string, unknown>): string {
  const deel = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${deel({ alg: 'none' })}.${deel(claims)}.handtekening`;
}

/** Laat Microsoft antwoorden met dit profiel, ingelogd in deze tenant. */
function nepMicrosoft(profiel: Record<string, unknown>, tid: string) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (String(url).includes('/oauth2/v2.0/token')) {
        return antwoord(200, {
          access_token: 'toegang',
          id_token: idToken({ tid, oid: profiel.id }),
          token_type: 'Bearer',
          expires_in: 3600,
        });
      }
      return antwoord(200, profiel);
    }),
  );
}

describe('Microsoft-SSO: koppelen en toelaten', () => {
  let vereniging: TestAssociation;
  let lid: TestUser;
  let beheerderToken: string;

  beforeEach(() => {
    const omgeving = createTestEnvironment();
    vereniging = omgeving.association;
    lid = omgeving.memberUser;
    beheerderToken = omgeving.adminToken;
    db.prepare(
      `UPDATE associations
         SET slug = 'harmonie', microsoft_client_id = 'client', microsoft_client_secret = 'geheim',
             microsoft_tenant_id = ?, microsoft_enabled = 1
       WHERE id = ?`,
    ).run(EIGEN_TENANT, vereniging.id);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function logIn(): Promise<request.Response> {
    const start = await request(app).get('/api/auth/microsoft/login?slug=harmonie');
    expect(start.status, JSON.stringify(start.body)).toBe(200);
    const state = new URL(start.body.authUrl).searchParams.get('state');
    return request(app).post('/api/auth/microsoft/callback').send({ code: 'code', state });
  }

  function microsoftIdVan(userId: string): string | null {
    return (db.prepare('SELECT microsoft_id FROM users WHERE id = ?').get(userId) as { microsoft_id: string | null })
      .microsoft_id;
  }

  it('koppelt niet op `mail`: een vreemd account met het adres van een lid komt er niet in', async () => {
    nepMicrosoft({ id: 'aanvaller', mail: lid.email, userPrincipalName: 'iemand@aanvaller.example' }, EIGEN_TENANT);

    const uitslag = await logIn();

    expect(uitslag.status).toBe(400);
    expect(uitslag.body.token).toBeUndefined();
    expect(microsoftIdVan(lid.id)).toBeNull();
  });

  it('koppelt niet op e-mail als het account uit een andere tenant komt', async () => {
    nepMicrosoft({ id: 'vreemd', userPrincipalName: lid.email }, VREEMDE_TENANT);

    const uitslag = await logIn();

    expect(uitslag.status).toBe(403);
    expect(microsoftIdVan(lid.id)).toBeNull();
  });

  it('koppelt op de UPN als het account uit de eigen tenant komt', async () => {
    nepMicrosoft({ id: 'eigen-account', userPrincipalName: lid.email.toUpperCase() }, EIGEN_TENANT);

    const uitslag = await logIn();

    expect(uitslag.status, JSON.stringify(uitslag.body)).toBe(200);
    expect(uitslag.body.user.id).toBe(lid.id);
    expect(microsoftIdVan(lid.id)).toBe('eigen-account');
  });

  it('koppelt geen gastaccount (#EXT#) op e-mail', async () => {
    nepMicrosoft({ id: 'gast', userPrincipalName: `${lid.email}#EXT#@tenant.onmicrosoft.com` }, EIGEN_TENANT);

    expect((await logIn()).status).toBe(400);
    expect(microsoftIdVan(lid.id)).toBeNull();
  });

  it('laat een al gekoppeld lid binnen op microsoft_id', async () => {
    db.prepare('UPDATE users SET microsoft_id = ? WHERE id = ?').run('gekoppeld', lid.id);
    nepMicrosoft({ id: 'gekoppeld', userPrincipalName: 'andere-naam@harmonie.example' }, EIGEN_TENANT);

    const uitslag = await logIn();

    expect(uitslag.status, JSON.stringify(uitslag.body)).toBe(200);
    expect(uitslag.body.user.id).toBe(lid.id);
  });

  it('weigert een gekoppeld lid dat uit dienst is', async () => {
    db.prepare("UPDATE users SET microsoft_id = ?, status = 'inactive' WHERE id = ?").run('gekoppeld', lid.id);
    nepMicrosoft({ id: 'gekoppeld', userPrincipalName: lid.email }, EIGEN_TENANT);

    const uitslag = await logIn();

    expect(uitslag.status).toBe(403);
    expect(uitslag.body.token).toBeUndefined();
  });

  it('weigert een lid dat uit dienst is ook via koppelen op e-mail', async () => {
    db.prepare("UPDATE users SET status = 'inactive' WHERE id = ?").run(lid.id);
    nepMicrosoft({ id: 'nieuw', userPrincipalName: lid.email }, EIGEN_TENANT);

    const uitslag = await logIn();

    expect(uitslag.status).toBe(403);
    expect(microsoftIdVan(lid.id)).toBeNull();
  });

  it('biedt geen inloggen aan met een open tenant van vóór de controle', async () => {
    db.prepare("UPDATE associations SET microsoft_tenant_id = 'common' WHERE id = ?").run(vereniging.id);

    expect((await request(app).get('/api/auth/microsoft/enabled?slug=harmonie')).body.enabled).toBe(false);
    expect((await request(app).get('/api/auth/microsoft/login?slug=harmonie')).status).toBe(400);
  });

  describe('de tenant instellen', () => {
    const sla = (tenantId: string) =>
      request(app)
        .put('/api/auth/microsoft/config')
        .set('Authorization', `Bearer ${beheerderToken}`)
        .send({ clientId: 'client', tenantId, enabled: true });

    it.each(['common', 'organizations', 'consumers', 'Common'])('weigert %s als tenant', async (tenant) => {
      const uitslag = await sla(tenant);
      expect(uitslag.status).toBe(400);

      const rij = db.prepare('SELECT microsoft_tenant_id FROM associations WHERE id = ?').get(vereniging.id) as {
        microsoft_tenant_id: string;
      };
      expect(rij.microsoft_tenant_id).toBe(EIGEN_TENANT);
    });

    it('weigert een tenant die het adres zou ombuigen', async () => {
      expect((await sla('../common')).status).toBe(400);
    });

    it('accepteert een tenant-id en een domeinnaam', async () => {
      expect((await sla(VREEMDE_TENANT)).status).toBe(200);
      expect((await sla('harmonie.onmicrosoft.com')).status).toBe(200);
    });
  });
});
