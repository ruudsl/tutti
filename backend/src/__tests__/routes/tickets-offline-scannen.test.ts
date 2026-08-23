/**
 * De kaartscanner aan de deur, als het netwerk wegvalt.
 *
 * De scanner haalt vooraf een voorraad kaarten op en stuurt de scans die hij
 * offline maakte later na. Beide routes bestonden aan de serverkant niet - de
 * frontend riep ze aan en kwam elke keer in de notFoundHandler terecht, zodat
 * de hele offline-modus in de praktijk nooit werkte.
 *
 * Wat hier wordt vastgelegd zijn de dingen die aan de deur misgaan als het niet
 * klopt: een lijst met kaarten van een andere vereniging, een lijst met meer
 * persoonsgegevens dan het scherm toont, een kaart die twee keer wordt geteld
 * omdat de scanner zijn wachtrij opnieuw aanbood, en een botsing tussen twee
 * scanners waarbij de verkeerde scan blijft staan.
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

// De bestelroutes dragen een limiet per IP; zie tickets.test.ts. Elk verzoek
// hier komt van hetzelfde adres.
vi.mock('express-rate-limit', () => ({
  default: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const app = express();
app.use(express.json());
app.use('/api', ticketsRoutes);
app.use(errorHandler);

let adminToken: string;
let memberToken: string;
let associationId: string;
let adminId: string;

beforeEach(() => {
  const omgeving = createTestEnvironment();
  adminToken = omgeving.adminToken;
  memberToken = omgeving.memberToken;
  associationId = omgeving.association.id;
  adminId = omgeving.adminUser.id;
  zetTicketingAan(associationId);
});

/** De module kaartverkoop staat standaard uit; zonder dit is elke route 404. */
function zetTicketingAan(vanVereniging: string) {
  db.prepare(
    `INSERT INTO association_modules (id, association_id, module_key, enabled, updated_by)
     VALUES (?, ?, 'ticketing', 1, ?)
     ON CONFLICT(association_id, module_key) DO UPDATE SET enabled = 1`,
  ).run(uuidv4(), vanVereniging, adminId);
  clearModuleCache();
}

/**
 * Het concert ligt een jaar vooruit. Een kaart van een concert dat al geweest
 * is telt bij het scannen als verlopen, en met een vaste datum zouden deze
 * tests op een dag vanzelf omvallen.
 */
function maakConcert(vanVereniging = associationId) {
  const id = uuidv4();
  const datum = new Date();
  datum.setFullYear(datum.getFullYear() + 1);
  db.prepare(
    `INSERT INTO concerts (id, association_id, name, date, location, created_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, vanVereniging, 'Nieuwjaarsconcert', datum.toISOString().slice(0, 10), 'De Harmonie', adminId);
  return id;
}

function maakKaartsoort(concertId: string) {
  const id = uuidv4();
  db.prepare(
    `INSERT INTO ticket_types (id, concert_id, name, price, quantity, sold)
     VALUES (?, ?, 'Entree', 12.5, 100, 0)`,
  ).run(id, concertId);
  return id;
}

function maakBestelling(concertId: string) {
  const id = uuidv4();
  db.prepare(
    `INSERT INTO ticket_orders (id, user_id, concert_id, total, status, buyer_name, buyer_email, paid_at)
     VALUES (?, NULL, ?, 25, 'paid', 'Anna de Groot', 'anna@example.com', CURRENT_TIMESTAMP)`,
  ).run(id, concertId);
  return id;
}

function maakKaart(
  kaartsoortId: string,
  orderId: string,
  overschrijf: { status?: string; usedAt?: string; seatInfo?: string } = {},
) {
  const id = uuidv4();
  const code = `KAART-${uuidv4().slice(0, 12)}`;
  db.prepare(
    `INSERT INTO tickets (id, ticket_type_id, order_id, user_id, buyer_name, buyer_email, status, qr_code, seat_info, used_at)
     VALUES (?, ?, ?, NULL, 'Anna de Groot', 'anna@example.com', ?, ?, ?, ?)`,
  ).run(
    id,
    kaartsoortId,
    orderId,
    overschrijf.status ?? 'valid',
    code,
    overschrijf.seatInfo ?? 'Rij 3, stoel 12',
    overschrijf.usedAt ?? null,
  );
  return { id, code };
}

/** Een compleet concert met één kaart erop. */
function maakConcertMetKaart(vanVereniging = associationId, kaartOverschrijf = {}) {
  const concertId = maakConcert(vanVereniging);
  const kaartsoortId = maakKaartsoort(concertId);
  const orderId = maakBestelling(concertId);
  const kaart = maakKaart(kaartsoortId, orderId, kaartOverschrijf);
  return { concertId, kaartsoortId, orderId, kaart };
}

function kaartRij(id: string) {
  return db.prepare('SELECT status, used_at, validated_by FROM tickets WHERE id = ?').get(id) as {
    status: string;
    used_at: string | null;
    validated_by: string | null;
  };
}

function urenGeleden(uren: number) {
  return new Date(Date.now() - uren * 60 * 60 * 1000).toISOString();
}

const alsAdmin = (methode: 'get' | 'post', pad: string) =>
  request(app)[methode](`/api${pad}`).set('Authorization', `Bearer ${adminToken}`);

const alsLid = (methode: 'get' | 'post', pad: string) =>
  request(app)[methode](`/api${pad}`).set('Authorization', `Bearer ${memberToken}`);

function scanregel(code: string, scannedAt: string, overschrijf: Record<string, unknown> = {}) {
  return {
    id: `scan-${uuidv4().slice(0, 8)}`,
    qrCode: code,
    scannedAt,
    result: 'offline_valid',
    synced: false,
    ...overschrijf,
  };
}

describe('Kaartvoorraad ophalen om offline mee te scannen', () => {
  it('geeft de voorraad met het moment waarop hij is samengesteld', async () => {
    const { concertId } = maakConcertMetKaart();

    const res = await alsAdmin('get', `/concerts/${concertId}/tickets/offline-sync`);

    expect(res.status).toBe(200);
    expect(res.body.tickets).toHaveLength(1);
    // Zonder dit tijdstip kan de scanner niet zien dat zijn lijst verouderd is,
    // en werkt hij aan de deur met kaarten van een week geleden zonder dat
    // iemand het merkt.
    expect(typeof res.body.generatedAt).toBe('string');
    expect(new Date(res.body.generatedAt).getTime()).not.toBeNaN();
  });

  it('neemt ook de al gebruikte kaarten mee', async () => {
    const concertId = maakConcert();
    const kaartsoortId = maakKaartsoort(concertId);
    const orderId = maakBestelling(concertId);
    maakKaart(kaartsoortId, orderId);
    maakKaart(kaartsoortId, orderId, { status: 'used', usedAt: urenGeleden(1) });

    const res = await alsAdmin('get', `/concerts/${concertId}/tickets/offline-sync`);

    // Zonder de gebruikte kaarten kan de scanner offline niet zeggen "deze is
    // al binnen", en komt iedereen met een gekopieerd kaartje er een tweede
    // keer doorheen.
    const statussen = res.body.tickets.map((k: { status: string }) => k.status).sort();
    expect(statussen).toEqual(['used', 'valid']);
    expect(res.body.tickets.find((k: { status: string }) => k.status === 'used').usedAt).toBeTruthy();
  });

  it('laat geannuleerde en terugbetaalde kaarten eruit', async () => {
    const concertId = maakConcert();
    const kaartsoortId = maakKaartsoort(concertId);
    const orderId = maakBestelling(concertId);
    maakKaart(kaartsoortId, orderId, { status: 'cancelled' });
    maakKaart(kaartsoortId, orderId, { status: 'refunded' });

    const res = await alsAdmin('get', `/concerts/${concertId}/tickets/offline-sync`);

    expect(res.body.tickets).toEqual([]);
  });

  it('stuurt geen persoonsgegevens mee die de scanner niet toont', async () => {
    const { concertId } = maakConcertMetKaart();

    const res = await alsAdmin('get', `/concerts/${concertId}/tickets/offline-sync`);

    // De voorraad belandt in de browser van een telefoon die de zaal uit gaat.
    // De scanner toont alleen aantallen en het tijdstip van een eerdere scan,
    // dus meer dan dit heeft hij niet nodig - en wat niet meegaat kan ook niet
    // op een geleend toestel achterblijven.
    // usedAt ontbreekt bij een ongebruikte kaart; het gaat erom dat er niets
    // bij staat wat hier niet hoort.
    for (const sleutel of Object.keys(res.body.tickets[0])) {
      expect(['qrCode', 'status', 'usedAt']).toContain(sleutel);
    }
    const alsTekst = JSON.stringify(res.body);
    expect(alsTekst).not.toContain('Anna de Groot');
    expect(alsTekst).not.toContain('anna@example.com');
    expect(alsTekst).not.toContain('Rij 3');
  });

  it('geeft een gewoon lid niets', async () => {
    const { concertId } = maakConcertMetKaart();

    const res = await alsLid('get', `/concerts/${concertId}/tickets/offline-sync`);

    expect(res.status).toBe(403);
  });

  it('weigert zonder inlog', async () => {
    const { concertId } = maakConcertMetKaart();

    const res = await request(app).get(`/api/concerts/${concertId}/tickets/offline-sync`);

    expect(res.status).toBe(401);
  });

  it('geeft het concert van een andere vereniging niet prijs', async () => {
    const andere = createTestAssociation();
    const { concertId } = maakConcertMetKaart(andere.id);

    const res = await alsAdmin('get', `/concerts/${concertId}/tickets/offline-sync`);

    // Anders levert een geraden concert-id de complete kaartlijst van een
    // andere vereniging op, inclusief welke codes nog niet gebruikt zijn.
    expect(res.status).toBe(404);
  });
});

describe('Offline gemaakte scans nasturen', () => {
  it('stempelt de kaart af op het tijdstip van de scan, niet van het nasturen', async () => {
    const { concertId, kaart } = maakConcertMetKaart();
    const gescandOp = urenGeleden(3);

    const res = await alsAdmin('post', `/concerts/${concertId}/tickets/sync-offline-scans`).send({
      scans: [scanregel(kaart.code, gescandOp)],
    });

    expect(res.status).toBe(200);
    expect(res.body.processed).toBe(1);
    const rij = kaartRij(kaart.id);
    expect(rij.status).toBe('used');
    // Zou hier het moment van nasturen staan, dan draagt elke kaart de tijd
    // waarop de telefoon weer bereik kreeg en is niet meer na te gaan wie er
    // als eerste door de deur ging.
    expect(rij.used_at).toBe(gescandOp);
    expect(rij.validated_by).toBe(adminId);
  });

  it('telt dezelfde lijst niet twee keer', async () => {
    const { concertId, kaart } = maakConcertMetKaart();
    const gescandOp = urenGeleden(3);
    const lijst = { scans: [scanregel(kaart.code, gescandOp)] };

    const eerste = await alsAdmin('post', `/concerts/${concertId}/tickets/sync-offline-scans`).send(lijst);
    const tweede = await alsAdmin('post', `/concerts/${concertId}/tickets/sync-offline-scans`).send(lijst);

    expect(eerste.body.processed).toBe(1);
    // De scanner biedt zijn wachtrij opnieuw aan zodra een poging hapert. De
    // tweede ronde hoort niets meer te veranderen en al helemaal geen botsing
    // te melden over de kaart die hij zelf net heeft afgestempeld.
    expect(tweede.body.processed).toBe(0);
    expect(tweede.body.skipped).toBe(1);
    expect(tweede.body.warnings).toEqual([]);
    expect(kaartRij(kaart.id).used_at).toBe(gescandOp);
  });

  it('laat bij een botsing de vroegste scan staan en meldt de latere', async () => {
    // De kaart is online al afgestempeld, vóór het moment van de offline scan.
    const eersteScan = urenGeleden(4);
    const { concertId, kaart } = maakConcertMetKaart(associationId, {
      status: 'used',
      usedAt: eersteScan,
    });
    const latereScan = urenGeleden(2);

    const res = await alsAdmin('post', `/concerts/${concertId}/tickets/sync-offline-scans`).send({
      scans: [scanregel(kaart.code, latereScan)],
    });

    expect(res.status).toBe(200);
    expect(kaartRij(kaart.id).used_at).toBe(eersteScan);
    // Niet stil weggegooid: iemand moet achteraf kunnen zien dat twee scanners
    // dezelfde kaart hebben gezien.
    expect(res.body.warnings).toHaveLength(1);
    expect(res.body.warnings[0].reason).toBe('earlier_scan_kept');
    expect(res.body.warnings[0].keptScanAt).toBe(eersteScan);
    expect(res.body.warnings[0].rejectedScanAt).toBe(latereScan);
  });

  it('laat een offline scan die eerder was alsnog winnen, en meldt dat ook', async () => {
    // Omgekeerd: de tweede scanner was online eerst, maar de offline scan aan
    // de andere deur was eerder. Die telt.
    const latereScan = urenGeleden(1);
    const { concertId, kaart } = maakConcertMetKaart(associationId, {
      status: 'used',
      usedAt: latereScan,
    });
    const vroegsteScan = urenGeleden(3);

    const res = await alsAdmin('post', `/concerts/${concertId}/tickets/sync-offline-scans`).send({
      scans: [scanregel(kaart.code, vroegsteScan)],
    });

    expect(kaartRij(kaart.id).used_at).toBe(vroegsteScan);
    expect(res.body.warnings).toHaveLength(1);
    expect(res.body.warnings[0].reason).toBe('offline_scan_kept');
    expect(res.body.warnings[0].keptScanAt).toBe(vroegsteScan);
    expect(res.body.warnings[0].rejectedScanAt).toBe(latereScan);
  });

  it('vindt een kaart van een andere vereniging niet en stempelt hem niet af', async () => {
    const andere = createTestAssociation();
    const vreemd = maakConcertMetKaart(andere.id);
    const eigenConcert = maakConcert();

    const res = await alsAdmin('post', `/concerts/${eigenConcert}/tickets/sync-offline-scans`).send({
      scans: [scanregel(vreemd.kaart.code, urenGeleden(2))],
    });

    expect(res.status).toBe(200);
    expect(res.body.results[0].status).toBe('not_found');
    // Anders staat de echte bezoeker van die andere vereniging bij de deur met
    // een kaart die al gebruikt heet te zijn.
    expect(kaartRij(vreemd.kaart.id).status).toBe('valid');
  });

  it('stuurt niets na naar het concert van een andere vereniging', async () => {
    const andere = createTestAssociation();
    const vreemd = maakConcertMetKaart(andere.id);

    const res = await alsAdmin('post', `/concerts/${vreemd.concertId}/tickets/sync-offline-scans`).send({
      scans: [scanregel(vreemd.kaart.code, urenGeleden(2))],
    });

    expect(res.status).toBe(404);
    expect(kaartRij(vreemd.kaart.id).status).toBe('valid');
  });

  it('stempelt niets af voor een bezoeker die aan de deur is geweigerd', async () => {
    const { concertId, kaart } = maakConcertMetKaart();

    const res = await alsAdmin('post', `/concerts/${concertId}/tickets/sync-offline-scans`).send({
      // De scanner kende deze code niet omdat zijn voorraad verouderd was en
      // heeft de bezoeker buiten laten staan. Hem hier alsnog afstempelen zou
      // een bezoeker tellen die er nooit in is gekomen.
      scans: [scanregel(kaart.code, urenGeleden(2), { result: 'not_found' })],
    });

    expect(kaartRij(kaart.id).status).toBe('valid');
    // Wel melden: de kaart is hier gewoon geldig, dus er stond iemand met een
    // goed kaartje voor een dichte deur.
    expect(res.body.warnings[0].reason).toBe('refused_offline');
  });

  it('geeft een gewoon lid geen toegang tot het nasturen', async () => {
    const { concertId, kaart } = maakConcertMetKaart();

    const res = await alsLid('post', `/concerts/${concertId}/tickets/sync-offline-scans`).send({
      scans: [scanregel(kaart.code, urenGeleden(2))],
    });

    expect(res.status).toBe(403);
    expect(kaartRij(kaart.id).status).toBe('valid');
  });

  it('laat een dirigent wel nasturen', async () => {
    // Dezelfde rollen als POST /tickets/:code/validate: wie aan de deur mag
    // afstempelen mag ook nasturen wat hij offline scande.
    const dirigent = createTestUser(associationId, { email: 'dirigent@test.com', role: 'conductor' });
    const { concertId, kaart } = maakConcertMetKaart();

    const res = await request(app)
      .post(`/api/concerts/${concertId}/tickets/sync-offline-scans`)
      .set('Authorization', `Bearer ${generateTestToken(dirigent)}`)
      .send({ scans: [scanregel(kaart.code, urenGeleden(2))] });

    expect(res.status).toBe(200);
    expect(kaartRij(kaart.id).status).toBe('used');
  });

  it('weigert een scan zonder bruikbaar tijdstip', async () => {
    const { concertId, kaart } = maakConcertMetKaart();

    const res = await alsAdmin('post', `/concerts/${concertId}/tickets/sync-offline-scans`).send({
      scans: [scanregel(kaart.code, 'gisteravond')],
    });

    expect(res.status).toBe(400);
    expect(kaartRij(kaart.id).status).toBe('valid');
  });

  it('weigert een scan zonder uitkomst van het apparaat', async () => {
    // Zonder dat veld valt niet vast te stellen of de bezoeker naar binnen is
    // gegaan. Afstempelen op een gok telt iemand die er nooit was; stilzwijgend
    // overslaan verliest de scan. Dus: terug naar de afzender.
    const { concertId, kaart } = maakConcertMetKaart();
    const zonderUitkomst = scanregel(kaart.code, urenGeleden(2)) as Record<string, unknown>;
    delete zonderUitkomst.result;

    const res = await alsAdmin('post', `/concerts/${concertId}/tickets/sync-offline-scans`).send({
      scans: [zonderUitkomst],
    });

    expect(res.status).toBe(400);
    expect(kaartRij(kaart.id).status).toBe('valid');
  });

  it('knipt een tijdstip in de toekomst af op nu', async () => {
    // Een geleende telefoon met een verkeerd ingestelde klok. Zonder afkappen
    // draagt de kaart een tijdstip dat nog moet komen, en verliest hij het bij
    // een botsing nooit meer van een echte latere scan.
    const { concertId, kaart } = maakConcertMetKaart();
    const overEenUur = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    await alsAdmin('post', `/concerts/${concertId}/tickets/sync-offline-scans`).send({
      scans: [scanregel(kaart.code, overEenUur)],
    });

    const rij = kaartRij(kaart.id);
    expect(rij.status).toBe('used');
    expect(new Date(rij.used_at ?? '').getTime()).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it('verwerkt een lege lijst zonder te klagen', async () => {
    const { concertId } = maakConcertMetKaart();

    const res = await alsAdmin('post', `/concerts/${concertId}/tickets/sync-offline-scans`).send({ scans: [] });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ processed: 0, skipped: 0, warnings: [] });
  });
});
