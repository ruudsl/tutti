/**
 * Kaartverkoop was na de boekhouding het grootste onafgedekte bestand: 3212
 * regels, 29 routes, nul procent.
 *
 * De nadruk ligt hier op de dingen die geld kosten als ze misgaan. Meer kaarten
 * verkopen dan er zijn, een kaart twee keer laten scannen, of de omzet van een
 * andere vereniging kunnen inzien.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import ticketsRoutes from '../../routes/tickets';
import { errorHandler } from '../../middleware/errorHandler';
import { createTestAssociation, createTestUser, generateTestToken, createTestEnvironment } from '../testUtils';
import { clearModuleCache } from '../../modules/service';

/**
 * De bestelroutes dragen een eigen limiet van vijf bestellingen per minuut per
 * IP. Elk verzoek uit dit bestand komt van hetzelfde adres, dus vanaf de zesde
 * bestelling antwoordt die limiet met 429 en gaat de test over iets anders dan
 * waar hij over hoort te gaan. Dat de limieten zelf werken staat in
 * rate-limit-keys.test.ts.
 */
vi.mock('express-rate-limit', () => ({
  default: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

// De mount volgt index.ts: deze router hangt op /api omdat hij paden onder
// meerdere voorvoegsels bedient.
const app = express();
app.use(express.json());
app.use('/api', ticketsRoutes);
app.use(errorHandler);

let adminToken: string;
let associationId: string;
let adminId: string;

beforeEach(() => {
  const omgeving = createTestEnvironment();
  adminToken = omgeving.adminToken;
  associationId = omgeving.association.id;
  adminId = omgeving.adminUser.id;
  zetTicketingAan(associationId);
});

/**
 * De module kaartverkoop staat standaard uit, en de router draagt de guard
 * zelf. Zonder dit antwoordt elke route hier met 404 - en dan slagen de tests
 * over scheiding tussen verenigingen om de verkeerde reden, want die
 * verwachten juist een 404. Dat de guard werkt wordt in modules.test.ts
 * nagekeken; hier gaat het om wat de routes zelf doen.
 */
function zetTicketingAan(vanVereniging: string) {
  db.prepare(
    `INSERT INTO association_modules (id, association_id, module_key, enabled, updated_by)
     VALUES (?, ?, 'ticketing', 1, ?)
     ON CONFLICT(association_id, module_key) DO UPDATE SET enabled = 1`,
  ).run(uuidv4(), vanVereniging, adminId);
  clearModuleCache();
}

/**
 * Er is geen gedeelde helper voor concerten, dus die staat hier. De datum ligt
 * bewust een jaar vooruit en niet vast: een kaart van een concert dat al
 * geweest is telt bij het scannen als verlopen, en met een vaste datum zouden
 * die tests op een dag vanzelf omvallen.
 */
function maakConcert(vanVereniging = associationId, datum = datumOverEenJaar()) {
  const id = uuidv4();
  db.prepare(
    `INSERT INTO concerts (id, association_id, name, date, location, created_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, vanVereniging, 'Nieuwjaarsconcert', datum, 'De Harmonie', adminId);
  return id;
}

function datumOverEenJaar() {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

/** Een betaalde bestelling, want zonder bestelling kan er geen kaart bestaan. */
function maakBestelling(
  concertId: string,
  overschrijf: { userId?: string | null; status?: string; buyerEmail?: string; buyerName?: string } = {},
) {
  const id = uuidv4();
  db.prepare(
    `INSERT INTO ticket_orders (id, user_id, concert_id, total, status, payment_id, buyer_name, buyer_email, paid_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
  ).run(
    id,
    overschrijf.userId ?? null,
    concertId,
    25,
    overschrijf.status ?? 'paid',
    'tr_test_' + id.slice(0, 8),
    overschrijf.buyerName ?? 'Jan Jansen',
    overschrijf.buyerEmail ?? 'jan@example.com',
  );
  return id;
}

function maakKaart(
  kaartsoortId: string,
  orderId: string,
  overschrijf: { status?: string; userId?: string | null; buyerEmail?: string } = {},
) {
  const id = uuidv4();
  const code = `KAART-${uuidv4().slice(0, 12)}`;
  db.prepare(
    `INSERT INTO tickets (id, ticket_type_id, order_id, user_id, buyer_name, buyer_email, status, qr_code)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    kaartsoortId,
    orderId,
    overschrijf.userId ?? null,
    'Jan Jansen',
    overschrijf.buyerEmail ?? 'jan@example.com',
    overschrijf.status ?? 'valid',
    code,
  );
  return { id, code };
}

function kaartStatus(id: string) {
  return (db.prepare('SELECT status FROM tickets WHERE id = ?').get(id) as { status: string }).status;
}

const alsAdmin = (methode: 'get' | 'post' | 'put' | 'delete', pad: string) =>
  request(app)[methode](`/api${pad}`).set('Authorization', `Bearer ${adminToken}`);

async function maakKaartsoort(concertId: string, overschrijf: Record<string, unknown> = {}) {
  const res = await alsAdmin('post', `/concerts/${concertId}/ticket-types`).send({
    name: 'Entree',
    price: 12.5,
    quantity: 100,
    ...overschrijf,
  });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

describe('Kaartsoorten', () => {
  it('maakt een kaartsoort aan en toont hem', async () => {
    const concertId = maakConcert();
    const id = await maakKaartsoort(concertId);

    // Er is geen aparte GET voor kaartsoorten; ze komen mee met het concert.
    const res = await request(app).get(`/api/concerts/${concertId}/tickets`);
    expect(res.status).toBe(200);
    const soorten = res.body.ticketTypes ?? res.body.ticket_types ?? [];
    expect(soorten.map((k: { id: string }) => k.id)).toContain(id);
  });

  it('weigert een negatieve prijs', async () => {
    const concertId = maakConcert();
    const res = await alsAdmin('post', `/concerts/${concertId}/ticket-types`).send({
      name: 'Fout',
      price: -5,
      quantity: 10,
    });
    expect(res.status).toBe(400);
  });

  it('weigert een oplage van nul', async () => {
    const concertId = maakConcert();
    const res = await alsAdmin('post', `/concerts/${concertId}/ticket-types`).send({
      name: 'Fout',
      price: 10,
      quantity: 0,
    });
    expect(res.status).toBe(400);
  });

  it('werkt een kaartsoort bij', async () => {
    const concertId = maakConcert();
    const id = await maakKaartsoort(concertId);

    const res = await alsAdmin('put', `/ticket-types/${id}`).send({ price: 15 });
    expect(res.status).toBe(200);
  });
});

describe('Bestellen', () => {
  it('plaatst een bestelling', async () => {
    const concertId = maakConcert();
    const kaartsoortId = await maakKaartsoort(concertId);

    const res = await request(app)
      .post(`/api/concerts/${concertId}/tickets/order`)
      .send({
        items: [{ ticketTypeId: kaartsoortId, quantity: 2 }],
        buyerName: 'Jan Jansen',
        buyerEmail: 'jan@example.com',
      });

    expect(res.status).toBe(201);
  });

  it('verkoopt niet meer kaarten dan er zijn', async () => {
    // Dit is het duurste dat hier mis kan gaan: meer kaarten verkopen dan de
    // zaal heeft, en dat pas bij de deur ontdekken.
    const concertId = maakConcert();
    const kaartsoortId = await maakKaartsoort(concertId, { quantity: 3, maxPerOrder: 50 });

    const res = await request(app)
      .post(`/api/concerts/${concertId}/tickets/order`)
      .send({
        items: [{ ticketTypeId: kaartsoortId, quantity: 10 }],
        buyerName: 'Gretige Koper',
        buyerEmail: 'gretig@example.com',
      });

    expect(res.status).toBe(400);
  });

  it('weigert een bestelling zonder regels', async () => {
    const concertId = maakConcert();

    const res = await request(app).post(`/api/concerts/${concertId}/tickets/order`).send({
      items: [],
      buyerName: 'Jan',
      buyerEmail: 'jan@example.com',
    });

    expect(res.status).toBe(400);
  });

  it('weigert een ongeldig e-mailadres', async () => {
    const concertId = maakConcert();
    const kaartsoortId = await maakKaartsoort(concertId);

    // Zonder geldig adres kan de koper zijn kaart niet ontvangen.
    const res = await request(app)
      .post(`/api/concerts/${concertId}/tickets/order`)
      .send({
        items: [{ ticketTypeId: kaartsoortId, quantity: 1 }],
        buyerName: 'Jan',
        buyerEmail: 'geen-adres',
      });

    expect(res.status).toBe(400);
  });

  it('meldt dat een onbekend concert niet bestaat', async () => {
    const res = await request(app)
      .post(`/api/concerts/${uuidv4()}/tickets/order`)
      .send({
        items: [{ ticketTypeId: uuidv4(), quantity: 1 }],
        buyerName: 'Jan',
        buyerEmail: 'jan@example.com',
      });

    expect(res.status).toBe(404);
  });
});

describe('Overzichten', () => {
  it('geeft de verkoopcijfers van een concert', async () => {
    const concertId = maakConcert();
    await maakKaartsoort(concertId);

    const res = await alsAdmin('get', `/concerts/${concertId}/ticket-stats`);
    expect(res.status).toBe(200);
  });

  it('geeft de bezoekerslijst', async () => {
    const concertId = maakConcert();
    const res = await alsAdmin('get', `/concerts/${concertId}/attendees`);
    expect(res.status).toBe(200);
  });

  it('geeft mijn eigen kaarten', async () => {
    const res = await alsAdmin('get', '/tickets/my');
    expect(res.status).toBe(200);
  });
});

describe('Scheiding tussen verenigingen', () => {
  it('laat geen kaartsoort aanmaken bij het concert van een ander', async () => {
    const andere = createTestAssociation();
    zetTicketingAan(andere.id);
    const concertVanAnder = maakConcert(andere.id);

    const res = await alsAdmin('post', `/concerts/${concertVanAnder}/ticket-types`).send({
      name: 'Ingebroken',
      price: 1,
      quantity: 1,
    });

    expect([403, 404]).toContain(res.status);
  });

  it('toont de verkoopcijfers van een ander concert niet', async () => {
    const andere = createTestAssociation();
    zetTicketingAan(andere.id);
    const concertVanAnder = maakConcert(andere.id);

    const res = await alsAdmin('get', `/concerts/${concertVanAnder}/ticket-stats`);
    expect([403, 404]).toContain(res.status);
  });

  it('toont de bezoekerslijst van een ander concert niet', async () => {
    // Een bezoekerslijst bevat namen en e-mailadressen van kopers.
    const andere = createTestAssociation();
    zetTicketingAan(andere.id);
    const concertVanAnder = maakConcert(andere.id);

    const res = await alsAdmin('get', `/concerts/${concertVanAnder}/attendees`);
    expect([403, 404]).toContain(res.status);
  });
});

describe('Wie mag wat', () => {
  it('vraagt om een token voor de verkoopcijfers', async () => {
    const concertId = maakConcert();
    const res = await request(app).get(`/api/concerts/${concertId}/ticket-stats`);
    expect(res.status).toBe(401);
  });

  it('laat een gewoon lid geen kaartsoort aanmaken', async () => {
    const concertId = maakConcert();
    const lid = createTestUser(associationId, { email: 'lid-tickets@test.com', role: 'member' });

    const res = await request(app)
      .post(`/api/concerts/${concertId}/ticket-types`)
      .set('Authorization', `Bearer ${generateTestToken(lid)}`)
      .send({ name: 'Mag niet', price: 5, quantity: 5 });

    expect(res.status).toBe(403);
  });
});

/** Een kaartsoort buiten de eigen vereniging om, want alsAdmin komt daar niet. */
function maakKaartsoortDirect(concertId: string, overschrijf: Record<string, number | string> = {}) {
  const id = uuidv4();
  const w = { name: 'Entree', price: 12.5, quantity: 100, max_per_order: 10, ...overschrijf };
  db.prepare(
    `INSERT INTO ticket_types (id, concert_id, name, price, quantity, max_per_order)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, concertId, w.name, w.price, w.quantity, w.max_per_order);
  return id;
}

describe('Kaart scannen bij de deur', () => {
  it('zet een eigen kaart op gebruikt', async () => {
    const concertId = maakConcert();
    const kaartsoortId = await maakKaartsoort(concertId);
    const orderId = maakBestelling(concertId);
    const kaart = maakKaart(kaartsoortId, orderId);

    const res = await alsAdmin('post', `/tickets/${kaart.code}/validate`).send({ concertId });

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
    expect(kaartStatus(kaart.id)).toBe('used');
  });

  it('laat een dirigent geen kaart van een andere vereniging afstempelen', async () => {
    // De kaart hoort bij vereniging B. Een scan door vereniging A mag hem niet
    // op 'used' zetten: dan staat de echte bezoeker van B bij de deur met een
    // kaart die al gebruikt heet te zijn.
    const andere = createTestAssociation();
    const concertVanAnder = maakConcert(andere.id);
    const kaartsoortVanAnder = maakKaartsoortDirect(concertVanAnder);
    const orderVanAnder = maakBestelling(concertVanAnder);
    const kaart = maakKaart(kaartsoortVanAnder, orderVanAnder);

    const res = await alsAdmin('post', `/tickets/${kaart.code}/validate`).send({});

    expect(res.body.valid).not.toBe(true);
    expect(kaartStatus(kaart.id)).toBe('valid');
  });

  it('meldt een kaart die al gebruikt is', async () => {
    const concertId = maakConcert();
    const kaartsoortId = await maakKaartsoort(concertId);
    const orderId = maakBestelling(concertId);
    const kaart = maakKaart(kaartsoortId, orderId, { status: 'used' });

    const res = await alsAdmin('post', `/tickets/${kaart.code}/validate`).send({});
    expect(res.body.valid).toBe(false);
    expect(res.body.status).toBe('used');
  });
});

describe('Een kaart overdragen', () => {
  function maakOverdracht(kaartId: string, ontvangerEmail: string, overschrijf: Record<string, string> = {}) {
    const id = uuidv4();
    const code = `OVER-${uuidv4().slice(0, 12)}`;
    const verlooptOp = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
    db.prepare(
      `INSERT INTO ticket_transfers (id, ticket_id, from_user_id, from_email, from_name, recipient_email, recipient_name, transfer_code, status, expires_at)
       VALUES (?, ?, NULL, 'jan@example.com', 'Jan Jansen', ?, 'Ontvanger', ?, ?, ?)`,
    ).run(id, kaartId, ontvangerEmail, code, overschrijf.status ?? 'pending', verlooptOp);
    return { id, code };
  }

  it('draagt de kaart over aan de geadresseerde', async () => {
    const concertId = maakConcert();
    const kaartsoortId = await maakKaartsoort(concertId);
    const orderId = maakBestelling(concertId);
    const kaart = maakKaart(kaartsoortId, orderId);
    const ontvanger = createTestUser(associationId, { email: `ontvanger-${uuidv4()}@test.nl`, role: 'member' });
    const overdracht = maakOverdracht(kaart.id, ontvanger.email);

    const res = await request(app)
      .post(`/api/tickets/transfers/${overdracht.code}/accept`)
      .set('Authorization', `Bearer ${generateTestToken(ontvanger)}`);

    expect(res.status).toBe(200);
    const rij = db.prepare('SELECT user_id FROM tickets WHERE id = ?').get(kaart.id) as { user_id: string };
    expect(rij.user_id).toBe(ontvanger.id);
  });

  it('laat een ander de overdracht niet onderscheppen', async () => {
    // De overdrachtscode gaat per e-mail naar één adres. Wie hem in handen
    // krijgt maar niet de geadresseerde is, mag de kaart niet opeisen.
    const concertId = maakConcert();
    const kaartsoortId = await maakKaartsoort(concertId);
    const orderId = maakBestelling(concertId);
    const kaart = maakKaart(kaartsoortId, orderId);
    const overdracht = maakOverdracht(kaart.id, `bedoeld-${uuidv4()}@test.nl`);
    const indringer = createTestUser(associationId, { email: `indringer-${uuidv4()}@test.nl`, role: 'member' });

    const res = await request(app)
      .post(`/api/tickets/transfers/${overdracht.code}/accept`)
      .set('Authorization', `Bearer ${generateTestToken(indringer)}`);

    expect(res.status).toBe(403);
    const rij = db.prepare('SELECT user_id FROM tickets WHERE id = ?').get(kaart.id) as { user_id: string | null };
    expect(rij.user_id).toBeNull();
    const over = db.prepare('SELECT status FROM ticket_transfers WHERE id = ?').get(overdracht.id) as {
      status: string;
    };
    expect(over.status).toBe('pending');
  });

  it('draagt een ingetrokken kaart niet over', async () => {
    // De kaart is na het aanmaken van de overdracht geannuleerd en het geld is
    // terug. Hem alsnog op naam van de ontvanger zetten geeft toegang met een
    // kaart die niet meer bestaat.
    const concertId = maakConcert();
    const kaartsoortId = await maakKaartsoort(concertId);
    const orderId = maakBestelling(concertId);
    const kaart = maakKaart(kaartsoortId, orderId, { status: 'cancelled' });
    const ontvanger = createTestUser(associationId, { email: `ontvanger2-${uuidv4()}@test.nl`, role: 'member' });
    const overdracht = maakOverdracht(kaart.id, ontvanger.email);

    const res = await request(app)
      .post(`/api/tickets/transfers/${overdracht.code}/accept`)
      .set('Authorization', `Bearer ${generateTestToken(ontvanger)}`);

    expect(res.status).toBe(400);
    expect(kaartStatus(kaart.id)).toBe('cancelled');
  });
});

describe('Een bestelling opvragen', () => {
  it('laat de gast zijn eigen bestelling zien', async () => {
    // Een gast heeft geen account; het bestelnummer uit de betaalterugkeer is
    // het enige dat hij heeft. Die weg moet open blijven.
    const concertId = maakConcert();
    const orderId = maakBestelling(concertId, { userId: null, buyerEmail: 'gast@example.com' });

    const res = await request(app).get(`/api/tickets/orders/${orderId}`);
    expect(res.status).toBe(200);
    expect(res.body.buyerEmail).toBe('gast@example.com');
  });

  it('laat de koper zijn eigen bestelling zien', async () => {
    const concertId = maakConcert();
    const orderId = maakBestelling(concertId, { userId: adminId });

    const res = await alsAdmin('get', `/tickets/orders/${orderId}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(orderId);
  });

  it('geeft de bestelling van een ander niet prijs', async () => {
    // De bestelling bevat naam, e-mailadres, telefoonnummer en na betaling de
    // kaartcodes. Dat is niet van de vrager.
    const concertId = maakConcert();
    const koper = createTestUser(associationId, { email: `koper-${uuidv4()}@test.nl`, role: 'member' });
    const orderId = maakBestelling(concertId, { userId: koper.id, buyerEmail: koper.email });

    // De vreemde vereniging krijgt kaartverkoop aan, anders houdt de
    // module-guard het verzoek al tegen en slaagt deze test om de verkeerde
    // reden.
    const andere = createTestAssociation();
    zetTicketingAan(andere.id);
    const buitenstaander = createTestUser(andere.id, {
      email: `buiten-${uuidv4()}@test.nl`,
      role: 'admin',
    });

    const res = await request(app)
      .get(`/api/tickets/orders/${orderId}`)
      .set('Authorization', `Bearer ${generateTestToken(buitenstaander)}`);

    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toContain(koper.email);
  });

  it('laat een beheerder van de eigen vereniging de bestelling wel zien', async () => {
    // De verkoopadministratie van de vereniging hoort erbij te kunnen.
    const concertId = maakConcert();
    const koper = createTestUser(associationId, { email: `koper2-${uuidv4()}@test.nl`, role: 'member' });
    const orderId = maakBestelling(concertId, { userId: koper.id, buyerEmail: koper.email });

    const res = await alsAdmin('get', `/tickets/orders/${orderId}`);
    expect(res.status).toBe(200);
  });
});

describe('Verwijderde concerten', () => {
  function verwijderConcert(concertId: string) {
    db.prepare('UPDATE concerts SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?').run(concertId);
  }

  it('toont geen kaartsoorten meer van een verwijderd concert', async () => {
    const concertId = maakConcert();
    await maakKaartsoort(concertId);
    verwijderConcert(concertId);

    const res = await request(app).get(`/api/concerts/${concertId}/tickets`);
    expect(res.status).toBe(404);
  });

  it('rekent een openstaande bestelling van een verwijderd concert niet meer af', async () => {
    const concertId = maakConcert();
    const orderId = maakBestelling(concertId, { status: 'pending' });
    verwijderConcert(concertId);

    const res = await request(app).post(`/api/tickets/orders/${orderId}/pay`).send({ method: 'ideal' });
    expect(res.status).toBe(404);
  });

  it('neemt geen bestelling meer aan voor een verwijderd concert', async () => {
    // Een concert dat weg is gaat niet door. Kaarten blijven verkopen betekent
    // geld innen voor een avond die er niet komt.
    const concertId = maakConcert();
    const kaartsoortId = await maakKaartsoort(concertId);
    verwijderConcert(concertId);

    const res = await request(app)
      .post(`/api/concerts/${concertId}/tickets/order`)
      .send({
        items: [{ ticketTypeId: kaartsoortId, quantity: 1 }],
        buyerName: 'Jan',
        buyerEmail: 'jan@example.com',
      });

    expect(res.status).toBe(404);
    const aantal = db.prepare('SELECT COUNT(*) AS n FROM ticket_orders WHERE concert_id = ?').get(concertId) as {
      n: number;
    };
    expect(aantal.n).toBe(0);
  });
});

describe('Maximum per bestelling', () => {
  it('telt dezelfde kaartsoort over meerdere regels bij elkaar op', async () => {
    // Drie regels van twee is ook zes kaarten. Per regel kijken laat de grens
    // van vier ongemerkt passeren.
    const concertId = maakConcert();
    const kaartsoortId = await maakKaartsoort(concertId, { maxPerOrder: 4, quantity: 100 });

    const res = await request(app)
      .post(`/api/concerts/${concertId}/tickets/order`)
      .send({
        items: [
          { ticketTypeId: kaartsoortId, quantity: 2 },
          { ticketTypeId: kaartsoortId, quantity: 2 },
          { ticketTypeId: kaartsoortId, quantity: 2 },
        ],
        buyerName: 'Handelaar',
        buyerEmail: 'handel@example.com',
      });

    expect(res.status).toBe(400);
    const soort = db.prepare('SELECT sold FROM ticket_types WHERE id = ?').get(kaartsoortId) as { sold: number };
    expect(soort.sold).toBe(0);
  });

  it('laat de grens zelf gewoon toe', async () => {
    const concertId = maakConcert();
    const kaartsoortId = await maakKaartsoort(concertId, { maxPerOrder: 4, quantity: 100 });

    const res = await request(app)
      .post(`/api/concerts/${concertId}/tickets/order`)
      .send({
        items: [
          { ticketTypeId: kaartsoortId, quantity: 2 },
          { ticketTypeId: kaartsoortId, quantity: 2 },
        ],
        buyerName: 'Koper',
        buyerEmail: 'koper@example.com',
      });

    expect(res.status).toBe(201);
    const soort = db.prepare('SELECT sold FROM ticket_types WHERE id = ?').get(kaartsoortId) as { sold: number };
    expect(soort.sold).toBe(4);
  });
});
