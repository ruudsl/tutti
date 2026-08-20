/**
 * De rekenregels achter de kaartverkoop.
 *
 * Deze service stond op zeven procent. Anders dan de routes bestaat hij vooral
 * uit pure functies, en dat zijn precies de regels waar geld aan hangt: hoeveel
 * kaarten er nog zijn, of een kaart al gescand is, en welke prijs er geldt.
 *
 * De belangrijkste eigenschap zit in reserveTickets. Die doet de controle en de
 * ophoging in een enkele update, zodat twee gelijktijdige bestellingen niet
 * allebei langs dezelfde vrije plek kunnen. Zonder dat verkoop je bij drukte
 * meer kaarten dan de zaal heeft - juist op het moment dat het ertoe doet.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import {
  generateTicketCode,
  generateSecureTicketCode,
  validateTicketCodeChecksum,
  getAvailableTickets,
  reserveTickets,
  releaseTickets,
  calculateEarlyBirdPrice,
} from '../../services/ticketing';
import { createTestEnvironment } from '../testUtils';

let associationId: string;
let adminId: string;

beforeEach(() => {
  const omgeving = createTestEnvironment();
  associationId = omgeving.association.id;
  adminId = omgeving.adminUser.id;
});

/** Een concert met een kaartsoort, want daar draait de voorraad om. */
function maakKaartsoort(oplage: number, verkocht = 0): string {
  const concertId = uuidv4();
  db.prepare(`INSERT INTO concerts (id, association_id, name, date, created_by) VALUES (?, ?, ?, ?, ?)`).run(
    concertId,
    associationId,
    'Testconcert',
    '2026-12-31',
    adminId,
  );

  const id = uuidv4();
  db.prepare(
    `INSERT INTO ticket_types (id, concert_id, name, price, quantity, sold)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, concertId, 'Entree', 15, oplage, verkocht);
  return id;
}

describe('Kaartcodes', () => {
  it('geeft elke keer een andere code', () => {
    const codes = new Set(Array.from({ length: 200 }, () => generateTicketCode()));
    // Twee kaarten met dezelfde code betekent dat er iemand ten onrechte
    // wordt geweigerd of dubbel binnenkomt.
    expect(codes.size).toBe(200);
  });

  it('gebruikt geen tekens die op elkaar lijken', () => {
    // Een code wordt aan de deur overgetypt; nul en O of een en I door elkaar
    // halen levert daar ruzie op.
    const code = generateTicketCode();
    expect(code).not.toMatch(/[0O1I]/);
  });

  it('maakt een beveiligde code die zijn eigen controle doorstaat', () => {
    const code = generateSecureTicketCode();
    expect(validateTicketCodeChecksum(code)).toBe(true);
  });

  it('herkent een code waar aan gesleuteld is', () => {
    const code = generateSecureTicketCode();
    // Verander een teken in het willekeurige deel; de controlewaarde klopt dan
    // niet meer.
    const eerste = code[0] === 'A' ? 'B' : 'A';
    const geknoeid = eerste + code.slice(1);

    expect(validateTicketCodeChecksum(geknoeid)).toBe(false);
  });

  it('wijst onzin af', () => {
    expect(validateTicketCodeChecksum('')).toBe(false);
    expect(validateTicketCodeChecksum('geen-geldige-code')).toBe(false);
  });

  it('leest een code met en zonder streepjes hetzelfde', () => {
    const code = generateSecureTicketCode();
    expect(validateTicketCodeChecksum(code.replace(/-/g, ''))).toBe(true);
  });
});

describe('Voorraad', () => {
  it('telt af wat er nog is', () => {
    const id = maakKaartsoort(100, 30);
    expect(getAvailableTickets(id)).toBe(70);
  });

  it('geeft nul terug als alles weg is', () => {
    const id = maakKaartsoort(10, 10);
    expect(getAvailableTickets(id)).toBe(0);
  });

  it('reserveert wat er is', () => {
    const id = maakKaartsoort(10);

    const res = reserveTickets(id, 4);
    expect(res.success).toBe(true);
    expect(getAvailableTickets(id)).toBe(6);
  });

  it('reserveert niet meer dan er is', () => {
    // Dit is het duurste dat hier mis kan gaan: kaarten verkopen die niet
    // bestaan, en dat aan de deur ontdekken.
    const id = maakKaartsoort(3);

    const res = reserveTickets(id, 5);
    expect(res.success).toBe(false);
    expect(getAvailableTickets(id)).toBe(3);
  });

  it('laat precies de laatste kaarten reserveren', () => {
    const id = maakKaartsoort(5, 3);

    expect(reserveTickets(id, 2).success).toBe(true);
    expect(getAvailableTickets(id)).toBe(0);
  });

  it('laat er geen een meer toe als het op is', () => {
    const id = maakKaartsoort(2);
    reserveTickets(id, 2);

    expect(reserveTickets(id, 1).success).toBe(false);
  });

  it('houdt de voorraad kloppend bij achtereenvolgende reserveringen', () => {
    // De controle en de ophoging zitten in een enkele update, juist zodat twee
    // bestellingen niet allebei langs dezelfde vrije plek kunnen. Deze test
    // legt de uitkomst daarvan vast: na tien keer twee is het op, en de elfde
    // lukt niet.
    const id = maakKaartsoort(20);

    const uitkomsten = Array.from({ length: 11 }, () => reserveTickets(id, 2).success);

    expect(uitkomsten.filter(Boolean)).toHaveLength(10);
    expect(uitkomsten[10]).toBe(false);
    expect(getAvailableTickets(id)).toBe(0);
  });

  it('geeft vrijgegeven kaarten terug aan de voorraad', () => {
    const id = maakKaartsoort(10, 6);

    releaseTickets(id, 2);
    expect(getAvailableTickets(id)).toBe(6);
  });

  it('meldt een onbekende kaartsoort in plaats van om te vallen', () => {
    expect(getAvailableTickets(uuidv4())).toBe(0);
    expect(reserveTickets(uuidv4(), 1).success).toBe(false);
  });
});

describe('Vroegboekprijs', () => {
  const morgen = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const gisteren = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  it('rekent de lage prijs zolang de termijn loopt', () => {
    const prijs = calculateEarlyBirdPrice({
      id: 'x',
      price: 20,
      earlyBirdPrice: 15,
      earlyBirdEndDate: morgen,
    } as Parameters<typeof calculateEarlyBirdPrice>[0]);

    expect(prijs).toBe(15);
  });

  it('rekent de gewone prijs zodra de termijn voorbij is', () => {
    const prijs = calculateEarlyBirdPrice({
      id: 'x',
      price: 20,
      earlyBirdPrice: 15,
      earlyBirdEndDate: gisteren,
    } as Parameters<typeof calculateEarlyBirdPrice>[0]);

    expect(prijs).toBe(20);
  });

  it('rekent de gewone prijs als er geen vroegboektarief is', () => {
    const prijs = calculateEarlyBirdPrice({
      id: 'x',
      price: 20,
    } as Parameters<typeof calculateEarlyBirdPrice>[0]);

    expect(prijs).toBe(20);
  });

  it('rekent de gewone prijs als de einddatum ontbreekt', () => {
    // Een lage prijs zonder einddatum zou anders eeuwig gelden.
    const prijs = calculateEarlyBirdPrice({
      id: 'x',
      price: 20,
      earlyBirdPrice: 15,
    } as Parameters<typeof calculateEarlyBirdPrice>[0]);

    expect(prijs).toBe(20);
  });
});
