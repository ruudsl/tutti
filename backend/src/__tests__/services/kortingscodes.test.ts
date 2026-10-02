/**
 * services/kortingscodes.ts: de ene regel voor een geldige kortingscode, en
 * het reserveren, tellen en vrijgeven van het gebruik.
 *
 * De gevallen bovenaan stonden eerder bij validateDiscountCode in
 * services/ticketing.ts, een tweede controle die nergens werd aangeroepen en
 * niet naar het gebruik per koper of naar kaartsoorten keek. Die is weg; de
 * gevallen gelden voor de regel die er nu is.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import testDb from '../testDb';
import { createTestEnvironment, TestAssociation } from '../testUtils';
import {
  beoordeelKortingscode,
  berekenKorting,
  geefKortingscodeVrij,
  reserveerKortingscode,
  telKortingscodeAlsGebruikt,
  type KortingscodeRij,
} from '../../services/kortingscodes';

let vereniging: TestAssociation;
let concertId: string;

function maakConcert(associationId: string): string {
  const id = uuidv4();
  testDb
    .prepare("INSERT INTO concerts (id, association_id, name, date) VALUES (?, ?, 'Concert', '2026-12-01')")
    .run(id, associationId);
  return id;
}

function maakKortingscode(overrides: Record<string, unknown> = {}): string {
  const id = uuidv4();
  const w = {
    code: 'LENTE10',
    discount_type: 'percentage',
    discount_value: 10,
    min_order_amount: 0,
    max_uses: null,
    uses_count: 0,
    max_uses_per_user: 1,
    valid_from: null,
    valid_until: null,
    concert_ids: null,
    ticket_type_ids: null,
    is_active: 1,
    ...overrides,
  };
  testDb
    .prepare(
      `INSERT INTO discount_codes
         (id, association_id, code, discount_type, discount_value, min_order_amount, max_uses, uses_count,
          max_uses_per_user, valid_from, valid_until, concert_ids, ticket_type_ids, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      vereniging.id,
      w.code,
      w.discount_type,
      w.discount_value,
      w.min_order_amount,
      w.max_uses,
      w.uses_count,
      w.max_uses_per_user,
      w.valid_from,
      w.valid_until,
      w.concert_ids,
      w.ticket_type_ids,
      w.is_active,
    );
  return id;
}

function maakBestelling(email = 'lid@test.nl', status = 'pending', verloopt = '2999-01-01T00:00:00.000Z'): string {
  const id = uuidv4();
  testDb
    .prepare(
      `INSERT INTO ticket_orders (id, concert_id, total, status, buyer_name, buyer_email, expires_at)
       VALUES (?, ?, 100, ?, 'Koper', ?, ?)`,
    )
    .run(id, concertId, status, email, verloopt);
  return id;
}

const code = (id: string) => testDb.prepare('SELECT * FROM discount_codes WHERE id = ?').get(id) as KortingscodeRij;

const beoordeel = (vraag: Partial<Parameters<typeof beoordeelKortingscode>[0]> = {}) =>
  beoordeelKortingscode({
    associationId: vereniging.id,
    code: 'LENTE10',
    concertId,
    bedrag: 100,
    koperEmail: 'lid@test.nl',
    ...vraag,
  });

beforeEach(() => {
  vereniging = createTestEnvironment().association;
  concertId = maakConcert(vereniging.id);
});

describe('beoordeelKortingscode', () => {
  it('rekent een procentuele korting uit', () => {
    maakKortingscode();
    expect(beoordeel()).toMatchObject({ geldig: true, korting: 10 });
  });

  it('rekent een vast bedrag af', () => {
    maakKortingscode({ code: 'VIJFEURO', discount_type: 'fixed_amount', discount_value: 5 });
    expect(beoordeel({ code: 'VIJFEURO' })).toMatchObject({ geldig: true, korting: 5 });
  });

  it('laat de korting nooit boven het bedrag uitkomen', () => {
    maakKortingscode({ code: 'HONDERD', discount_type: 'fixed_amount', discount_value: 100 });
    expect(beoordeel({ code: 'HONDERD', bedrag: 20 })).toMatchObject({ korting: 20 });
  });

  it('rondt een procentuele korting af op centen', () => {
    maakKortingscode({ discount_value: 15 });
    expect(beoordeel({ bedrag: 33.33 })).toMatchObject({ korting: 5 });
    expect(berekenKorting('percentage', 12.5, 10.1)).toBe(1.26);
  });

  it('herkent de code ongeacht hoofdletters en spaties eromheen', () => {
    maakKortingscode();
    expect(beoordeel({ code: ' lente10 ' }).geldig).toBe(true);
  });

  it.each([
    ['onbekend', {}, { code: 'BESTAATNIET' }],
    ['inactief', { is_active: 0 }, {}],
    ['op', { max_uses: 3, uses_count: 3 }, {}],
    ['nog_niet_geldig', { valid_from: '2099-01-01T00:00:00.000Z' }, {}],
    ['verlopen', { valid_until: '2020-01-01T00:00:00.000Z' }, {}],
    ['minimum', { min_order_amount: 50 }, { bedrag: 20 }],
  ])('weigert met reden %s', (reden, waarden, vraag) => {
    maakKortingscode(waarden);
    expect(beoordeel(vraag)).toMatchObject({ geldig: false, reden });
  });

  it('kent geen code van een andere vereniging', () => {
    maakKortingscode();
    expect(beoordeel({ associationId: uuidv4() })).toMatchObject({ geldig: false, reden: 'onbekend' });
  });

  it('accepteert een code die zijn maximum nog niet heeft bereikt', () => {
    maakKortingscode({ max_uses: 3, uses_count: 2 });
    expect(beoordeel().geldig).toBe(true);
  });

  it('accepteert precies het minimumbedrag', () => {
    maakKortingscode({ min_order_amount: 50 });
    expect(beoordeel({ bedrag: 50 }).geldig).toBe(true);
  });

  it('beperkt tot de genoemde concerten; een lege lijst beperkt niets', () => {
    const anderConcert = maakConcert(vereniging.id);
    maakKortingscode({ concert_ids: JSON.stringify([anderConcert]) });
    expect(beoordeel()).toMatchObject({ geldig: false, reden: 'concert' });
    expect(beoordeel({ concertId: anderConcert }).geldig).toBe(true);

    maakKortingscode({ code: 'OVERAL', concert_ids: '[]' });
    expect(beoordeel({ code: 'OVERAL' }).geldig).toBe(true);
  });

  it('vraagt minstens één toegestane kaartsoort', () => {
    maakKortingscode({ ticket_type_ids: JSON.stringify(['soort-a']) });
    expect(beoordeel({ kaartsoorten: ['soort-b'] })).toMatchObject({ geldig: false, reden: 'kaartsoort' });
    expect(beoordeel({ kaartsoorten: ['soort-b', 'soort-a'] }).geldig).toBe(true);
  });

  it('rekent de korting over het bedrag waarvoor de code geldt', () => {
    maakKortingscode({ discount_value: 50 });
    expect(beoordeel({ bedrag: 100, bedragGeldig: 40 })).toMatchObject({ korting: 20 });
  });

  it('telt het gebruik per koper, met betaalde en lopende bestellingen', () => {
    const id = maakKortingscode({ max_uses_per_user: 1 });
    reserveerKortingscode(code(id), maakBestelling('kees@test.nl'), 'kees@test.nl', 10);

    expect(beoordeel({ koperEmail: 'KEES@test.nl' })).toMatchObject({ geldig: false, reden: 'koper' });
    expect(beoordeel({ koperEmail: 'anna@test.nl' }).geldig).toBe(true);
  });
});

describe('reserveren, tellen en vrijgeven', () => {
  it('reserveert tot het maximum, en dan niet meer', () => {
    const id = maakKortingscode({ max_uses: 2, max_uses_per_user: 0 });

    expect(reserveerKortingscode(code(id), maakBestelling('a@test.nl'), 'a@test.nl', 10)).toBe(true);
    expect(reserveerKortingscode(code(id), maakBestelling('b@test.nl'), 'b@test.nl', 10)).toBe(true);
    expect(reserveerKortingscode(code(id), maakBestelling('c@test.nl'), 'c@test.nl', 10)).toBe(false);
  });

  it('telt betaald gebruik (uses_count) mee voor het maximum', () => {
    const id = maakKortingscode({ max_uses: 1, uses_count: 1, max_uses_per_user: 0 });
    expect(reserveerKortingscode(code(id), maakBestelling(), 'lid@test.nl', 10)).toBe(false);
  });

  it('laat een verlopen lopende bestelling niet meetellen', () => {
    const id = maakKortingscode({ max_uses: 1, max_uses_per_user: 0 });
    reserveerKortingscode(
      code(id),
      maakBestelling('a@test.nl', 'pending', '2000-01-01T00:00:00.000Z'),
      'a@test.nl',
      10,
    );

    expect(reserveerKortingscode(code(id), maakBestelling('b@test.nl'), 'b@test.nl', 10)).toBe(true);
  });

  it('weigert een tweede reservering voor dezelfde bestelling', () => {
    const id = maakKortingscode({ max_uses_per_user: 0 });
    const bestelling = maakBestelling();
    reserveerKortingscode(code(id), bestelling, 'lid@test.nl', 10);

    expect(() => reserveerKortingscode(code(id), bestelling, 'lid@test.nl', 10)).toThrow(/UNIQUE/);
  });

  it('telt als gebruikt na betalen, en geeft vrij als de bestelling niet doorgaat', () => {
    const id = maakKortingscode({ max_uses: 1, max_uses_per_user: 0 });
    const betaald = maakBestelling();
    testDb.prepare('UPDATE ticket_orders SET discount_code_id = ? WHERE id = ?').run(id, betaald);
    reserveerKortingscode(code(id), betaald, 'lid@test.nl', 10);
    telKortingscodeAlsGebruikt(betaald);
    expect(code(id).uses_count).toBe(1);

    const tweede = maakKortingscode({ code: 'TWEEDE', max_uses: 1, max_uses_per_user: 0 });
    const afgebroken = maakBestelling();
    reserveerKortingscode(code(tweede), afgebroken, 'lid@test.nl', 10);
    geefKortingscodeVrij(afgebroken);
    expect(reserveerKortingscode(code(tweede), maakBestelling(), 'lid@test.nl', 10)).toBe(true);
  });
});
