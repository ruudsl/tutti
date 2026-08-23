/**
 * De routes rond het overdragen van een kaart aan iemand anders.
 *
 * services/ticketing.ts heeft eigen overdrachtsfuncties, en die staan in
 * ticketing-overdracht.test.ts. De routes hier gebruiken die functies niet:
 * ze doen het werk zelf, met een eigen eigendomscontrole en een eigen
 * vervaltermijn. Dat is precies waar het hier over gaat - wie een kaart mag
 * weggeven, wie hem mag aannemen, en wat er gebeurt met een overdracht die
 * blijft liggen.
 *
 * Het aannemen van een overdracht door de verkeerde persoon staat al in
 * tickets.test.ts; dat wordt hier niet herhaald.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import ticketsRoutes from '../../routes/tickets';
import { errorHandler } from '../../middleware/errorHandler';
import { createTestUser, generateTestToken, createTestEnvironment, TestUser } from '../testUtils';
import { clearModuleCache } from '../../modules/service';

vi.mock('express-rate-limit', () => ({
  default: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const app = express();
app.use(express.json());
app.use('/api', ticketsRoutes);
app.use(errorHandler);

let associationId: string;
let adminId: string;
let concertId: string;
let kaartsoortId: string;
/** De verkoper: bezit de kaart en geeft hem weg. */
let verkoper: TestUser;
let verkoperToken: string;
/** De geadresseerde: krijgt de overdrachtscode per e-mail. */
let ontvanger: TestUser;
let ontvangerToken: string;
/** Een derde die er niets mee te maken heeft. */
let derde: TestUser;
let derdeToken: string;

beforeEach(() => {
  const omgeving = createTestEnvironment();
  associationId = omgeving.association.id;
  adminId = omgeving.adminUser.id;

  db.prepare(
    `INSERT INTO association_modules (id, association_id, module_key, enabled, updated_by)
     VALUES (?, ?, 'ticketing', 1, ?)
     ON CONFLICT(association_id, module_key) DO UPDATE SET enabled = 1`,
  ).run(uuidv4(), associationId, adminId);
  clearModuleCache();

  verkoper = createTestUser(associationId, { email: 'verkoper@example.com', firstName: 'Vera', lastName: 'Koper' });
  verkoperToken = generateTestToken(verkoper);
  ontvanger = createTestUser(associationId, { email: 'ontvanger@example.com', firstName: 'Otto', lastName: 'Vanger' });
  ontvangerToken = generateTestToken(ontvanger);
  derde = createTestUser(associationId, { email: 'derde@example.com', firstName: 'Derk', lastName: 'Derde' });
  derdeToken = generateTestToken(derde);

  concertId = maakConcert();
  kaartsoortId = maakKaartsoort(concertId);
});

function datumOverEenJaar() {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

function datumVorigJaar() {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 1);
  return d.toISOString().slice(0, 10);
}

function maakConcert(datum = datumOverEenJaar()) {
  const id = uuidv4();
  db.prepare(
    `INSERT INTO concerts (id, association_id, name, date, location, created_by)
     VALUES (?, ?, 'Nieuwjaarsconcert', ?, 'De Harmonie', ?)`,
  ).run(id, associationId, datum, adminId);
  return id;
}

function maakKaartsoort(vanConcert: string) {
  const id = uuidv4();
  db.prepare(
    `INSERT INTO ticket_types (id, concert_id, name, price, quantity, sold, max_per_order)
     VALUES (?, ?, 'Entree', 12.5, 100, 0, 10)`,
  ).run(id, vanConcert);
  return id;
}

function maakBestelling(vanConcert = concertId, status = 'paid') {
  const id = uuidv4();
  db.prepare(
    `INSERT INTO ticket_orders (id, concert_id, total, status, payment_id, buyer_name, buyer_email, paid_at)
     VALUES (?, ?, 12.5, ?, ?, 'Vera Koper', 'verkoper@example.com', CURRENT_TIMESTAMP)`,
  ).run(id, vanConcert, status, `tr_${id.slice(0, 8)}`);
  return id;
}

/**
 * Een kaart op naam van de verkoper. `eigenaar` staat los van `opEmail` omdat
 * de routes op allebei kijken: een gast bestelt zonder account en heeft alleen
 * een e-mailadres, een lid heeft ook een user_id.
 */
function maakKaart(
  overschrijf: {
    orderId?: string;
    soortId?: string;
    status?: string;
    eigenaar?: string | null;
    opEmail?: string;
  } = {},
) {
  const id = uuidv4();
  const code = `KAART-${uuidv4().slice(0, 12)}`;
  db.prepare(
    `INSERT INTO tickets (id, ticket_type_id, order_id, user_id, buyer_name, buyer_email, status, qr_code)
     VALUES (?, ?, ?, ?, 'Vera Koper', ?, ?, ?)`,
  ).run(
    id,
    overschrijf.soortId ?? kaartsoortId,
    overschrijf.orderId ?? maakBestelling(),
    overschrijf.eigenaar === undefined ? verkoper.id : overschrijf.eigenaar,
    overschrijf.opEmail ?? verkoper.email,
    overschrijf.status ?? 'valid',
    code,
  );
  return { id, code };
}

/** Een overdracht rechtstreeks in de database, zodat de vervaldatum vrij te kiezen is. */
function maakOverdracht(
  kaartId: string,
  overschrijf: { status?: string; verlooptOver?: number; naar?: string; van?: TestUser } = {},
) {
  const id = uuidv4();
  const code = `OVER-${uuidv4().slice(0, 12)}`;
  const van = overschrijf.van ?? verkoper;
  const verlooptOp = new Date(Date.now() + (overschrijf.verlooptOver ?? 7 * 24 * 60 * 60 * 1000)).toISOString();
  db.prepare(
    `INSERT INTO ticket_transfers
       (id, ticket_id, from_user_id, from_email, from_name, recipient_email, recipient_name, transfer_code, status, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, 'Otto Vanger', ?, ?, ?)`,
  ).run(
    id,
    kaartId,
    van.id,
    van.email,
    `${van.firstName} ${van.lastName}`,
    overschrijf.naar ?? ontvanger.email,
    code,
    overschrijf.status ?? 'pending',
    verlooptOp,
  );
  return { id, code };
}

function overdrachtStatus(id: string) {
  return (db.prepare('SELECT status FROM ticket_transfers WHERE id = ?').get(id) as { status: string }).status;
}

const als = (token: string, methode: 'get' | 'post' | 'delete', pad: string) =>
  request(app)[methode](`/api${pad}`).set('Authorization', `Bearer ${token}`);

describe('Overdraagbare kaarten', () => {
  it('toont de eigen geldige kaart voor een concert dat nog komt', async () => {
    const kaart = maakKaart();
    const res = await als(verkoperToken, 'get', '/tickets/transferable');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe(kaart.id);
    expect(res.body[0].hasPendingTransfer).toBe(false);
  });

  it('toont de kaart van iemand anders niet', async () => {
    maakKaart();
    const res = await als(derdeToken, 'get', '/tickets/transferable');
    expect(res.body).toEqual([]);
  });

  it('toont een kaart die al gescand is niet', async () => {
    maakKaart({ status: 'used' });
    const res = await als(verkoperToken, 'get', '/tickets/transferable');
    expect(res.body).toEqual([]);
  });

  it('toont een kaart uit een bestelling die nooit is betaald niet', async () => {
    maakKaart({ orderId: maakBestelling(concertId, 'pending') });
    const res = await als(verkoperToken, 'get', '/tickets/transferable');
    expect(res.body).toEqual([]);
  });

  it('toont een kaart voor een concert dat al is geweest niet', async () => {
    const oudConcert = maakConcert(datumVorigJaar());
    maakKaart({
      soortId: maakKaartsoort(oudConcert),
      orderId: maakBestelling(oudConcert),
    });
    const res = await als(verkoperToken, 'get', '/tickets/transferable');
    expect(res.body).toEqual([]);
  });

  it('vindt de kaart ook op e-mailadres, voor een koper zonder account', async () => {
    maakKaart({ eigenaar: null, opEmail: verkoper.email });
    const res = await als(verkoperToken, 'get', '/tickets/transferable');
    expect(res.body).toHaveLength(1);
  });

  it('meldt dat er al een overdracht loopt', async () => {
    const kaart = maakKaart();
    maakOverdracht(kaart.id);
    const res = await als(verkoperToken, 'get', '/tickets/transferable');
    expect(res.body[0].hasPendingTransfer).toBe(true);
  });

  it('vraagt om een token', async () => {
    const res = await request(app).get('/api/tickets/transferable');
    expect(res.status).toBe(401);
  });
});

describe('Een overdracht starten', () => {
  it('legt een overdracht vast met een code', async () => {
    const kaart = maakKaart();
    const res = await als(verkoperToken, 'post', `/tickets/${kaart.id}/transfer`).send({
      recipientEmail: ontvanger.email,
      recipientName: 'Otto Vanger',
    });
    expect(res.status).toBe(201);
    expect(res.body.transfer.transferCode).toBeTruthy();
    expect(res.body.transfer.status).toBe('pending');

    const rij = db
      .prepare('SELECT recipient_email, from_email FROM ticket_transfers WHERE id = ?')
      .get(res.body.transfer.id) as { recipient_email: string; from_email: string };
    expect(rij).toEqual({ recipient_email: ontvanger.email, from_email: verkoper.email });
  });

  it('geeft de kaart van iemand anders niet weg', async () => {
    const kaart = maakKaart();
    const res = await als(derdeToken, 'post', `/tickets/${kaart.id}/transfer`).send({
      recipientEmail: derde.email,
      recipientName: 'Derk Derde',
    });
    expect(res.status).toBe(403);
    expect(db.prepare('SELECT id FROM ticket_transfers WHERE ticket_id = ?').get(kaart.id)).toBeUndefined();
  });

  it('meldt een kaart die niet bestaat', async () => {
    const res = await als(verkoperToken, 'post', `/tickets/${uuidv4()}/transfer`).send({
      recipientEmail: ontvanger.email,
      recipientName: 'Otto Vanger',
    });
    expect(res.status).toBe(404);
  });

  it('geeft een kaart uit een onbetaalde bestelling niet weg', async () => {
    const kaart = maakKaart({ orderId: maakBestelling(concertId, 'pending') });
    const res = await als(verkoperToken, 'post', `/tickets/${kaart.id}/transfer`).send({
      recipientEmail: ontvanger.email,
      recipientName: 'Otto Vanger',
    });
    expect(res.status).toBe(404);
  });

  it('geeft een ingetrokken kaart niet weg', async () => {
    const kaart = maakKaart({ status: 'cancelled' });
    const res = await als(verkoperToken, 'post', `/tickets/${kaart.id}/transfer`).send({
      recipientEmail: ontvanger.email,
      recipientName: 'Otto Vanger',
    });
    expect(res.status).toBe(400);
  });

  it('staat maar één lopende overdracht per kaart toe', async () => {
    const kaart = maakKaart();
    maakOverdracht(kaart.id);

    const res = await als(verkoperToken, 'post', `/tickets/${kaart.id}/transfer`).send({
      recipientEmail: derde.email,
      recipientName: 'Derk Derde',
    });
    expect(res.status).toBe(400);
    expect(
      (db.prepare('SELECT COUNT(*) as n FROM ticket_transfers WHERE ticket_id = ?').get(kaart.id) as { n: number }).n,
    ).toBe(1);
  });

  it('laat na een ingetrokken overdracht een nieuwe toe', async () => {
    const kaart = maakKaart();
    maakOverdracht(kaart.id, { status: 'cancelled' });

    const res = await als(verkoperToken, 'post', `/tickets/${kaart.id}/transfer`).send({
      recipientEmail: derde.email,
      recipientName: 'Derk Derde',
    });
    expect(res.status).toBe(201);
  });

  it('draagt niet over aan jezelf', async () => {
    const kaart = maakKaart();
    const res = await als(verkoperToken, 'post', `/tickets/${kaart.id}/transfer`).send({
      recipientEmail: verkoper.email,
      recipientName: 'Vera Koper',
    });
    expect(res.status).toBe(400);
  });

  it('kijkt daarbij niet naar hoofdletters', async () => {
    const kaart = maakKaart();
    const res = await als(verkoperToken, 'post', `/tickets/${kaart.id}/transfer`).send({
      recipientEmail: verkoper.email.toUpperCase(),
      recipientName: 'Vera Koper',
    });
    expect(res.status).toBe(400);
  });

  it('weigert een adres dat geen e-mailadres is', async () => {
    const kaart = maakKaart();
    const res = await als(verkoperToken, 'post', `/tickets/${kaart.id}/transfer`).send({
      recipientEmail: 'geen-adres',
      recipientName: 'Otto Vanger',
    });
    expect(res.status).toBe(400);
  });

  it('weigert een lege naam voor de ontvanger', async () => {
    const kaart = maakKaart();
    const res = await als(verkoperToken, 'post', `/tickets/${kaart.id}/transfer`).send({
      recipientEmail: ontvanger.email,
      recipientName: '',
    });
    expect(res.status).toBe(400);
  });
});

describe('Lopende overdrachten opvragen', () => {
  it('toont alleen de eigen lopende overdrachten', async () => {
    const eigen = maakOverdracht(maakKaart().id);
    maakOverdracht(maakKaart({ eigenaar: derde.id, opEmail: derde.email }).id, { van: derde });

    const res = await als(verkoperToken, 'get', '/tickets/transfers');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe(eigen.id);
  });

  it('toont een afgeronde overdracht niet meer als lopend', async () => {
    maakOverdracht(maakKaart().id, { status: 'accepted' });
    const res = await als(verkoperToken, 'get', '/tickets/transfers');
    expect(res.body).toEqual([]);
  });

  /**
   * /tickets/transfers/history staat in de router vóór
   * /tickets/transfers/:transferCode. Draait die volgorde ooit om, dan leest
   * de tweede route 'history' als een overdrachtscode en antwoordt met 404.
   */
  it('leest history niet als een overdrachtscode', async () => {
    maakOverdracht(maakKaart().id);
    const res = await als(verkoperToken, 'get', '/tickets/transfers/history');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('toont de geschiedenis aan zowel de verkoper als de geadresseerde', async () => {
    maakOverdracht(maakKaart().id, { status: 'accepted' });

    const bijVerkoper = await als(verkoperToken, 'get', '/tickets/transfers/history');
    expect(bijVerkoper.body).toHaveLength(1);

    const bijOntvanger = await als(ontvangerToken, 'get', '/tickets/transfers/history');
    expect(bijOntvanger.body).toHaveLength(1);
    expect(bijOntvanger.body[0].fromEmail).toBe(verkoper.email);
  });

  it('toont de geschiedenis niet aan een buitenstaander', async () => {
    maakOverdracht(maakKaart().id, { status: 'accepted' });
    const res = await als(derdeToken, 'get', '/tickets/transfers/history');
    expect(res.body).toEqual([]);
  });
});

describe('Een overdracht opzoeken met de code', () => {
  it('geeft de gegevens bij een geldige code', async () => {
    const kaart = maakKaart();
    const overdracht = maakOverdracht(kaart.id);

    const res = await request(app).get(`/api/tickets/transfers/${overdracht.code}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('pending');
    expect(res.body.ticketId).toBe(kaart.id);
  });

  it('meldt een code die niet bestaat', async () => {
    const res = await request(app).get(`/api/tickets/transfers/${uuidv4()}`);
    expect(res.status).toBe(404);
  });

  it('zet een overdracht die over de datum is op verlopen', async () => {
    const overdracht = maakOverdracht(maakKaart().id, { verlooptOver: -1000 });

    const res = await request(app).get(`/api/tickets/transfers/${overdracht.code}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('expired');
    // En dat wordt ook vastgelegd, niet alleen in het antwoord gemeld.
    expect(overdrachtStatus(overdracht.id)).toBe('expired');
  });
});

describe('Een overdracht intrekken', () => {
  it('trekt de eigen lopende overdracht in', async () => {
    const overdracht = maakOverdracht(maakKaart().id);
    const res = await als(verkoperToken, 'delete', `/tickets/transfers/${overdracht.id}`);
    expect(res.status).toBe(200);
    expect(overdrachtStatus(overdracht.id)).toBe('cancelled');
  });

  it('laat een buitenstaander de overdracht niet intrekken', async () => {
    const overdracht = maakOverdracht(maakKaart().id);
    const res = await als(derdeToken, 'delete', `/tickets/transfers/${overdracht.id}`);
    expect(res.status).toBe(403);
    expect(overdrachtStatus(overdracht.id)).toBe('pending');
  });

  it('laat ook de geadresseerde de overdracht niet intrekken', async () => {
    const overdracht = maakOverdracht(maakKaart().id);
    const res = await als(ontvangerToken, 'delete', `/tickets/transfers/${overdracht.id}`);
    expect(res.status).toBe(403);
  });

  it('trekt een overdracht die al is aangenomen niet meer in', async () => {
    const overdracht = maakOverdracht(maakKaart().id, { status: 'accepted' });
    const res = await als(verkoperToken, 'delete', `/tickets/transfers/${overdracht.id}`);
    expect(res.status).toBe(400);
    expect(overdrachtStatus(overdracht.id)).toBe('accepted');
  });

  it('meldt een overdracht die niet bestaat', async () => {
    const res = await als(verkoperToken, 'delete', `/tickets/transfers/${uuidv4()}`);
    expect(res.status).toBe(404);
  });
});

describe('Een overdracht aannemen', () => {
  it('zet de kaart op naam van de geadresseerde', async () => {
    const kaart = maakKaart();
    const overdracht = maakOverdracht(kaart.id);

    const res = await als(ontvangerToken, 'post', `/tickets/transfers/${overdracht.code}/accept`);
    expect(res.status).toBe(200);

    const rij = db.prepare('SELECT user_id, buyer_email FROM tickets WHERE id = ?').get(kaart.id) as {
      user_id: string;
      buyer_email: string;
    };
    expect(rij).toEqual({ user_id: ontvanger.id, buyer_email: ontvanger.email });
    expect(overdrachtStatus(overdracht.id)).toBe('accepted');
  });

  it('neemt een verlopen overdracht niet meer aan en noteert dat', async () => {
    const kaart = maakKaart();
    const overdracht = maakOverdracht(kaart.id, { verlooptOver: -1000 });

    const res = await als(ontvangerToken, 'post', `/tickets/transfers/${overdracht.code}/accept`);
    expect(res.status).toBe(400);
    expect(overdrachtStatus(overdracht.id)).toBe('expired');
    expect((db.prepare('SELECT user_id FROM tickets WHERE id = ?').get(kaart.id) as { user_id: string }).user_id).toBe(
      verkoper.id,
    );
  });

  it('neemt dezelfde overdracht geen tweede keer aan', async () => {
    const overdracht = maakOverdracht(maakKaart().id);
    expect((await als(ontvangerToken, 'post', `/tickets/transfers/${overdracht.code}/accept`)).status).toBe(200);

    const tweede = await als(ontvangerToken, 'post', `/tickets/transfers/${overdracht.code}/accept`);
    expect(tweede.status).toBe(400);
  });

  it('meldt een code die niet bestaat', async () => {
    const res = await als(ontvangerToken, 'post', `/tickets/transfers/${uuidv4()}/accept`);
    expect(res.status).toBe(404);
  });

  it('vraagt om een token', async () => {
    const overdracht = maakOverdracht(maakKaart().id);
    const res = await request(app).post(`/api/tickets/transfers/${overdracht.code}/accept`);
    expect(res.status).toBe(401);
  });
});
