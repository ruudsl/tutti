/**
 * Het deel van services/ticketing.ts dat de deur en de klok bewaakt: een kaart
 * afstempelen bij binnenkomst, de roterende QR-code, de statistieken per
 * concert, en het verlengen van een reservering.
 *
 * ticketing.test.ts dekt de codes en de voorraad af, ticketing-korting.test.ts
 * de kortingen en ticketing-overdracht.test.ts het overdragen. Wat overbleef
 * staat hier.
 *
 * De rode draad is de verenigingsgrens en het dubbel scannen. Een kaartcode is
 * uniek over de hele installatie, dus zonder die grens vindt een scanner van de
 * ene vereniging de kaart van de andere - en dan staat de bezoeker die er wel
 * recht op heeft bij de deur met een kaart die al gescand heet te zijn.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import {
  generateQRCodeSVG,
  validateTicket,
  markTicketAsUsed,
  getConcertTicketStats,
  exportAttendeeList,
  generateDynamicQRCode,
  validateDynamicQRCode,
  extendOrderReservation,
} from '../../services/ticketing';
import { createTestAssociation, createTestEnvironment } from '../testUtils';

let associationId: string;
let adminId: string;
let concertId: string;
let kaartsoortId: string;

beforeEach(() => {
  const omgeving = createTestEnvironment();
  associationId = omgeving.association.id;
  adminId = omgeving.adminUser.id;
  concertId = maakConcert(associationId);
  kaartsoortId = maakKaartsoort(concertId);
});

function overDagen(aantal: number) {
  const d = new Date();
  d.setDate(d.getDate() + aantal);
  return d.toISOString().slice(0, 10);
}

function maakConcert(vanVereniging: string, overschrijf: { datum?: string; eindDatum?: string | null } = {}) {
  const id = uuidv4();
  db.prepare(
    `INSERT INTO concerts (id, association_id, name, date, end_date, location, created_by)
     VALUES (?, ?, 'Nieuwjaarsconcert', ?, ?, 'De Harmonie', ?)`,
  ).run(id, vanVereniging, overschrijf.datum ?? overDagen(30), overschrijf.eindDatum ?? null, adminId);
  return id;
}

function maakKaartsoort(vanConcert: string, overschrijf: { prijs?: number; oplage?: number; verkocht?: number } = {}) {
  const id = uuidv4();
  db.prepare(
    `INSERT INTO ticket_types (id, concert_id, name, price, quantity, sold)
     VALUES (?, ?, 'Entree', ?, ?, ?)`,
  ).run(id, vanConcert, overschrijf.prijs ?? 12.5, overschrijf.oplage ?? 100, overschrijf.verkocht ?? 0);
  return id;
}

function maakBestelling(vanConcert: string, overschrijf: { status?: string; verlooptOver?: number | null } = {}) {
  const id = uuidv4();
  const verlooptOp =
    overschrijf.verlooptOver === null
      ? null
      : new Date(Date.now() + (overschrijf.verlooptOver ?? 30 * 60 * 1000)).toISOString();
  db.prepare(
    `INSERT INTO ticket_orders (id, concert_id, total, status, buyer_name, buyer_email, expires_at, paid_at)
     VALUES (?, ?, 12.5, ?, 'Jan Jansen', 'jan@example.com', ?, CURRENT_TIMESTAMP)`,
  ).run(id, vanConcert, overschrijf.status ?? 'paid', verlooptOp);
  return id;
}

function maakKaart(
  soortId: string,
  orderId: string,
  overschrijf: { status?: string; naam?: string; email?: string } = {},
) {
  const id = uuidv4();
  const code = `KAART-${uuidv4().slice(0, 12)}`;
  db.prepare(
    `INSERT INTO tickets (id, ticket_type_id, order_id, buyer_name, buyer_email, status, qr_code)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    soortId,
    orderId,
    overschrijf.naam ?? 'Jan Jansen',
    overschrijf.email ?? 'jan@example.com',
    overschrijf.status ?? 'valid',
    code,
  );
  return { id, code };
}

describe('Een kaart nakijken aan de deur', () => {
  it('keurt een geldige kaart goed', () => {
    const kaart = maakKaart(kaartsoortId, maakBestelling(concertId));
    const uitkomst = validateTicket(kaart.code);
    expect(uitkomst).toMatchObject({ valid: true, status: 'valid' });
    expect(uitkomst.ticket?.buyerName).toBe('Jan Jansen');
  });

  it('meldt een code die niet bestaat', () => {
    expect(validateTicket('KAART-BESTAATNIET')).toMatchObject({ valid: false, status: 'not_found' });
  });

  it.each([
    ['used', 'used'],
    ['cancelled', 'cancelled'],
    ['refunded', 'refunded'],
  ])('weigert een kaart met status %s', (kaartStatus, verwacht) => {
    const kaart = maakKaart(kaartsoortId, maakBestelling(concertId), { status: kaartStatus });
    expect(validateTicket(kaart.code)).toMatchObject({ valid: false, status: verwacht });
  });

  it('weigert een kaart die voor een ander concert is', () => {
    const anderConcert = maakConcert(associationId);
    const kaart = maakKaart(kaartsoortId, maakBestelling(concertId));

    expect(validateTicket(kaart.code, anderConcert)).toMatchObject({ valid: false, status: 'wrong_concert' });
  });

  it('vindt de kaart van een andere vereniging niet', () => {
    const andereVereniging = createTestAssociation();
    const elders = maakConcert(andereVereniging.id);
    const kaart = maakKaart(maakKaartsoort(elders), maakBestelling(elders));

    expect(validateTicket(kaart.code, undefined, associationId)).toMatchObject({
      valid: false,
      status: 'not_found',
    });
  });

  it('weigert een kaart voor een concert dat allang geweest is', () => {
    const oudConcert = maakConcert(associationId, { datum: overDagen(-10) });
    const kaart = maakKaart(maakKaartsoort(oudConcert), maakBestelling(oudConcert));

    expect(validateTicket(kaart.code)).toMatchObject({ valid: false, status: 'expired' });
  });

  it('laat de kaart op de concertdag zelf toe', () => {
    const vandaag = maakConcert(associationId, { datum: overDagen(0) });
    const kaart = maakKaart(maakKaartsoort(vandaag), maakBestelling(vandaag));

    expect(validateTicket(kaart.code).valid).toBe(true);
  });

  /**
   * WACHT, geen bewijs: hier lopen het commentaar in de service en de code
   * uiteen, en ik heb dat niet aangeraakt.
   *
   * Bij de berekening staat "Allow entry until day after concert", maar
   * `endDate.setDate(endDate.getDate() + 1)` op een datum zonder tijd komt uit
   * op middernacht aan het begin van de dag erna. De grens ligt dus op het eind
   * van de concertdag, niet op het eind van de dag daarna. Voor een concert dat
   * over middernacht heen loopt is dat een verschil dat aan de deur telt.
   *
   * Het gaat om de geldigheid van een kaart, en die ruimer maken is geen
   * reparatie die ik op eigen houtje hoor te doen: het is een keuze van de
   * vereniging, niet een programmeerfout. Deze test legt vast waar de grens nu
   * ligt, zodat een verschuiving opvalt.
   */
  it('weigert de kaart de dag na het concert', () => {
    const gisteren = maakConcert(associationId, { datum: overDagen(-1) });
    const kaart = maakKaart(maakKaartsoort(gisteren), maakBestelling(gisteren));

    expect(validateTicket(kaart.code)).toMatchObject({ valid: false, status: 'expired' });
  });

  it('rekent bij een meerdaags concert met de einddatum', () => {
    const meerdaags = maakConcert(associationId, { datum: overDagen(-5), eindDatum: overDagen(0) });
    const kaart = maakKaart(maakKaartsoort(meerdaags), maakBestelling(meerdaags));

    expect(validateTicket(kaart.code).valid).toBe(true);
  });

  /**
   * Een scan die het apparaat offline maakte wordt pas later nagestuurd. Zonder
   * het moment van scannen valt zo'n scan onder 'verlopen' en wordt de kaart
   * nooit afgestempeld, terwijl de bezoeker er wel degelijk was.
   */
  it('rekent met het moment van scannen en niet met het moment van nasturen', () => {
    const geweest = maakConcert(associationId, { datum: overDagen(-3) });
    const kaart = maakKaart(maakKaartsoort(geweest), maakBestelling(geweest));

    expect(validateTicket(kaart.code).status).toBe('expired');

    const tijdensHetConcert = new Date();
    tijdensHetConcert.setDate(tijdensHetConcert.getDate() - 3);
    expect(validateTicket(kaart.code, undefined, undefined, tijdensHetConcert).valid).toBe(true);
  });
});

describe('Een kaart afstempelen', () => {
  it('zet de kaart op gebruikt en noteert wie hem scande', () => {
    const kaart = maakKaart(kaartsoortId, maakBestelling(concertId));

    expect(markTicketAsUsed(kaart.code, adminId)).toMatchObject({ success: true });

    const rij = db.prepare('SELECT status, validated_by, used_at FROM tickets WHERE id = ?').get(kaart.id) as {
      status: string;
      validated_by: string;
      used_at: string;
    };
    expect(rij.status).toBe('used');
    expect(rij.validated_by).toBe(adminId);
    expect(rij.used_at).toBeTruthy();
  });

  it('stempelt dezelfde kaart geen tweede keer af', () => {
    const kaart = maakKaart(kaartsoortId, maakBestelling(concertId));
    markTicketAsUsed(kaart.code, adminId);

    const tweede = markTicketAsUsed(kaart.code, adminId);
    expect(tweede.success).toBe(false);
    expect(tweede.message).toContain('already used');
  });

  it('houdt het tijdstip van de eerste scan vast bij een tweede poging', () => {
    const kaart = maakKaart(kaartsoortId, maakBestelling(concertId));
    markTicketAsUsed(kaart.code, adminId, undefined, '2026-01-01T20:00:00.000Z');

    markTicketAsUsed(kaart.code, adminId, undefined, '2026-01-01T22:30:00.000Z');

    expect((db.prepare('SELECT used_at FROM tickets WHERE id = ?').get(kaart.id) as { used_at: string }).used_at).toBe(
      '2026-01-01T20:00:00.000Z',
    );
  });

  it('stempelt de kaart van een andere vereniging niet af', () => {
    const andereVereniging = createTestAssociation();
    const elders = maakConcert(andereVereniging.id);
    const kaart = maakKaart(maakKaartsoort(elders), maakBestelling(elders));

    expect(markTicketAsUsed(kaart.code, adminId, associationId).success).toBe(false);
    expect(
      (db.prepare('SELECT status FROM tickets WHERE id = ?').get(kaart.id) as { status: string }).status,
    ).toBe('valid');
  });

  it('stempelt een ingetrokken kaart niet af', () => {
    const kaart = maakKaart(kaartsoortId, maakBestelling(concertId), { status: 'cancelled' });
    expect(markTicketAsUsed(kaart.code, adminId).success).toBe(false);
  });

  /**
   * Het tijdstip van een nagestuurde scan is het moment aan de deur, niet het
   * moment waarop de telefoon weer bereik kreeg. Anders staat op elke kaart
   * dezelfde tijd en is niet meer na te gaan wie er als eerste door de deur
   * ging.
   */
  it('legt bij een nagestuurde scan het moment aan de deur vast', () => {
    const geweest = maakConcert(associationId, { datum: overDagen(-2) });
    const kaart = maakKaart(maakKaartsoort(geweest), maakBestelling(geweest));

    const aanDeDeur = new Date();
    aanDeDeur.setDate(aanDeDeur.getDate() - 2);
    const tijdstip = aanDeDeur.toISOString();

    expect(markTicketAsUsed(kaart.code, adminId, associationId, tijdstip).success).toBe(true);
    expect((db.prepare('SELECT used_at FROM tickets WHERE id = ?').get(kaart.id) as { used_at: string }).used_at).toBe(
      tijdstip,
    );
  });
});

describe('Statistieken per concert', () => {
  it('telt oplage, verkoop en omzet per kaartsoort op', () => {
    maakKaartsoort(concertId, { prijs: 10, oplage: 50, verkocht: 5 });
    maakKaartsoort(concertId, { prijs: 20, oplage: 30, verkocht: 2 });

    const stats = getConcertTicketStats(concertId)!;
    // De kaartsoort uit beforeEach telt mee: 100 + 50 + 30.
    expect(stats.totalCapacity).toBe(180);
    expect(stats.totalSold).toBe(7);
    expect(stats.totalRevenue).toBe(10 * 5 + 20 * 2);
  });

  it('geeft niets terug voor een concert dat niet bestaat', () => {
    expect(getConcertTicketStats(uuidv4())).toBeNull();
  });

  it('telt verstuurde vrijkaarten mee in het aantal maar niet in de omzet', () => {
    maakKaartsoort(concertId, { prijs: 10, oplage: 50, verkocht: 5 });
    db.prepare(
      `INSERT INTO guest_list (id, concert_id, name, email, ticket_count, tickets_sent, created_by)
       VALUES (?, ?, 'Wethouder', 'wethouder@gemeente.test', 4, 1, ?)`,
    ).run(uuidv4(), concertId, adminId);

    const stats = getConcertTicketStats(concertId)!;
    expect(stats.guestListTickets).toBe(4);
    expect(stats.totalSold).toBe(9);
    expect(stats.totalRevenue).toBe(50);
  });

  it('telt vrijkaarten die nog niet verstuurd zijn niet mee', () => {
    db.prepare(
      `INSERT INTO guest_list (id, concert_id, name, email, ticket_count, tickets_sent, created_by)
       VALUES (?, ?, 'Wethouder', 'wethouder@gemeente.test', 4, 0, ?)`,
    ).run(uuidv4(), concertId, adminId);

    expect(getConcertTicketStats(concertId)!.guestListTickets).toBe(0);
  });
});

describe('Bezoekerslijst', () => {
  it('neemt alleen kaarten uit betaalde bestellingen op', () => {
    maakKaart(kaartsoortId, maakBestelling(concertId, { status: 'paid' }), { naam: 'Anna' });
    maakKaart(kaartsoortId, maakBestelling(concertId, { status: 'pending' }), { naam: 'Bert' });

    const lijst = exportAttendeeList(concertId);
    expect(lijst.map((a) => a.buyerName)).toEqual(['Anna']);
  });

  it('sorteert op naam', () => {
    const orderId = maakBestelling(concertId);
    maakKaart(kaartsoortId, orderId, { naam: 'Zwaan' });
    maakKaart(kaartsoortId, orderId, { naam: 'Aalbers' });

    expect(exportAttendeeList(concertId).map((a) => a.buyerName)).toEqual(['Aalbers', 'Zwaan']);
  });

  it('neemt geen kaarten van een ander concert op', () => {
    const anderConcert = maakConcert(associationId);
    maakKaart(maakKaartsoort(anderConcert), maakBestelling(anderConcert), { naam: 'Elders' });

    expect(exportAttendeeList(concertId)).toEqual([]);
  });

  it('geeft een lege lijst voor een concert zonder kaarten', () => {
    expect(exportAttendeeList(uuidv4())).toEqual([]);
  });
});

/**
 * De roterende QR-code is bedoeld tegen het doorsturen van een schermafbeelding:
 * de code in de app verandert elke dertig seconden. Zonder QR_SECRET valt er
 * niets te ondertekenen, en dan hoort de functie te weigeren in plaats van een
 * code af te geven die iedereen kan namaken.
 */
describe('Roterende QR-code', () => {
  const oorspronkelijkGeheim = process.env.QR_SECRET;

  afterEach(() => {
    if (oorspronkelijkGeheim === undefined) {
      delete process.env.QR_SECRET;
    } else {
      process.env.QR_SECRET = oorspronkelijkGeheim;
    }
  });

  it('weigert zonder QR_SECRET in plaats van een code af te geven die niemand kan nakijken', async () => {
    delete process.env.QR_SECRET;
    const kaart = maakKaart(kaartsoortId, maakBestelling(concertId));

    await expect(generateDynamicQRCode(kaart.id)).rejects.toThrow('QR_SECRET');
  });

  it('maakt een code die zijn eigen controle doorstaat', async () => {
    process.env.QR_SECRET = 'geheim-voor-de-test';
    const kaart = maakKaart(kaartsoortId, maakBestelling(concertId));

    const { qrCode, validUntil } = await generateDynamicQRCode(kaart.id);
    expect(qrCode.startsWith('data:image/png;base64,')).toBe(true);
    expect(validUntil.getTime()).toBeGreaterThan(Date.now());

    const tijdvak = Math.floor(Date.now() / 30000);
    const token = tekenZelf(kaart.id, tijdvak, 'geheim-voor-de-test');
    expect(validateDynamicQRCode(kaart.id, `${kaart.id}:${token}:${tijdvak}`)).toBe(true);
  });

  it('weigert een code voor een kaart die niet bestaat', async () => {
    process.env.QR_SECRET = 'geheim-voor-de-test';
    await expect(generateDynamicQRCode(uuidv4())).rejects.toThrow('Ticket not found');
  });

  it('weigert een code voor een kaart die al gescand is', async () => {
    process.env.QR_SECRET = 'geheim-voor-de-test';
    const kaart = maakKaart(kaartsoortId, maakBestelling(concertId), { status: 'used' });

    await expect(generateDynamicQRCode(kaart.id)).rejects.toThrow('used');
  });

  it('weigert een code die bij een andere kaart hoort', () => {
    process.env.QR_SECRET = 'geheim-voor-de-test';
    const tijdvak = Math.floor(Date.now() / 30000);
    const eigenaar = uuidv4();
    const token = tekenZelf(eigenaar, tijdvak, 'geheim-voor-de-test');

    expect(validateDynamicQRCode(uuidv4(), `${eigenaar}:${token}:${tijdvak}`)).toBe(false);
  });

  it('weigert een token dat niet klopt', () => {
    process.env.QR_SECRET = 'geheim-voor-de-test';
    const kaartId = uuidv4();
    const tijdvak = Math.floor(Date.now() / 30000);

    expect(validateDynamicQRCode(kaartId, `${kaartId}:0000000000000000:${tijdvak}`)).toBe(false);
  });

  it('weigert een token dat met een ander geheim is ondertekend', () => {
    const kaartId = uuidv4();
    const tijdvak = Math.floor(Date.now() / 30000);
    const token = tekenZelf(kaartId, tijdvak, 'geheim-van-de-buren');

    process.env.QR_SECRET = 'geheim-voor-de-test';
    expect(validateDynamicQRCode(kaartId, `${kaartId}:${token}:${tijdvak}`)).toBe(false);
  });

  it('accepteert het vorige tijdvak, zodat een scan op de grens niet afketst', () => {
    process.env.QR_SECRET = 'geheim-voor-de-test';
    const kaartId = uuidv4();
    const vorig = Math.floor(Date.now() / 30000) - 1;
    const token = tekenZelf(kaartId, vorig, 'geheim-voor-de-test');

    expect(validateDynamicQRCode(kaartId, `${kaartId}:${token}:${vorig}`)).toBe(true);
  });

  it('weigert een schermafbeelding van een paar minuten oud', () => {
    process.env.QR_SECRET = 'geheim-voor-de-test';
    const kaartId = uuidv4();
    const langGeleden = Math.floor(Date.now() / 30000) - 10;
    const token = tekenZelf(kaartId, langGeleden, 'geheim-voor-de-test');

    expect(validateDynamicQRCode(kaartId, `${kaartId}:${token}:${langGeleden}`)).toBe(false);
  });

  it('weigert een code uit de toekomst', () => {
    process.env.QR_SECRET = 'geheim-voor-de-test';
    const kaartId = uuidv4();
    const straks = Math.floor(Date.now() / 30000) + 5;
    const token = tekenZelf(kaartId, straks, 'geheim-voor-de-test');

    expect(validateDynamicQRCode(kaartId, `${kaartId}:${token}:${straks}`)).toBe(false);
  });

  it('weigert een code die niet uit drie delen bestaat', () => {
    process.env.QR_SECRET = 'geheim-voor-de-test';
    expect(validateDynamicQRCode(uuidv4(), 'onzin')).toBe(false);
  });

  it('geeft false terug in plaats van om te vallen zonder QR_SECRET', () => {
    delete process.env.QR_SECRET;
    const kaartId = uuidv4();
    const tijdvak = Math.floor(Date.now() / 30000);

    expect(validateDynamicQRCode(kaartId, `${kaartId}:abcdef0123456789:${tijdvak}`)).toBe(false);
  });

  /** Dezelfde berekening als in de service, zodat de test niet op zijn eigen uitvoer steunt. */
  function tekenZelf(kaartId: string, tijdvak: number, geheim: string) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const crypto = require('crypto');
    return crypto.createHmac('sha256', geheim).update(`${kaartId}:${tijdvak}`).digest('hex').substring(0, 16);
  }
});

describe('Reservering verlengen', () => {
  it('schuift de vervaltijd op en telt de verlenging', () => {
    const orderId = maakBestelling(concertId, { status: 'pending', verlooptOver: 60 * 1000 });

    const uitkomst = extendOrderReservation(orderId);
    expect(uitkomst.success).toBe(true);
    expect(new Date(uitkomst.newExpiresAt).getTime()).toBeGreaterThan(Date.now() + 14 * 60 * 1000);

    const rij = db.prepare('SELECT extension_count FROM ticket_orders WHERE id = ?').get(orderId) as {
      extension_count: number;
    };
    expect(rij.extension_count).toBe(1);
  });

  it('verlengt maar één keer, zodat de plaatsen niet eindeloos vast blijven staan', () => {
    const orderId = maakBestelling(concertId, { status: 'pending' });

    expect(extendOrderReservation(orderId).success).toBe(true);
    const tweede = extendOrderReservation(orderId);
    expect(tweede.success).toBe(false);
    expect(tweede.message).toContain('Maximum');
  });

  it('verlengt een bestelling die al betaald is niet', () => {
    const orderId = maakBestelling(concertId, { status: 'paid' });
    expect(extendOrderReservation(orderId)).toMatchObject({ success: false });
  });

  it('verlengt een bestelling die al verlopen is niet', () => {
    const orderId = maakBestelling(concertId, { status: 'pending', verlooptOver: -60 * 1000 });

    const uitkomst = extendOrderReservation(orderId);
    expect(uitkomst.success).toBe(false);
    expect(uitkomst.message).toContain('expired');
  });

  it('meldt een bestelling die niet bestaat', () => {
    expect(extendOrderReservation(uuidv4())).toMatchObject({ success: false, message: 'Order not found' });
  });
});

describe('QR-code als SVG', () => {
  it('geeft een tekening terug waar de code in staat', async () => {
    const svg = await generateQRCodeSVG('KAART-ABC123');
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
  });
});
