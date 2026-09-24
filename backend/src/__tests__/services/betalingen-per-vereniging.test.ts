/**
 * Het kaartgeld gaat naar de vereniging van het concert (openstaande beslissing
 * 2 in ROADMAP.md).
 *
 * Een vereniging koppelt haar eigen Mollie-account op Betaalinstellingen; de
 * sleutel staat versleuteld in payment_settings. Tot september 2026 gebruikte
 * de betaaldienst die sleutel nergens: alles liep over MOLLIE_API_KEY uit de
 * omgeving, dus met meerdere verenigingen op één installatie kwam al het geld
 * op één rekening. Wat hier vastligt:
 * - de eigen sleutel, live of test naar de gekozen modus;
 * - de sleutel van de installatie als terugval, voor wie niets koppelt;
 * - nooit de sleutel van een andere vereniging, en bij een onleesbare eigen
 *   sleutel ook niet die van de installatie;
 * - de webhook vraagt de betaling terug met de sleutel van de vereniging van
 *   de bestelling, ook als de installatie zelf geen Mollie-sleutel heeft.
 *
 * Het netwerk is nagebootst; de database en de versleuteling zijn echt.
 */

import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';

// De betaaldienst leest MOLLIE_API_KEY bij het inladen; dit staat daarom voor
// de imports. Bewust niet in de vorm van een echte sleutel (zie betalingen.test.ts).
const vorigeSleutel = vi.hoisted(() => {
  const vorige = process.env.MOLLIE_API_KEY;
  process.env.MOLLIE_API_KEY = 'nep-sleutel-van-de-installatie';
  return vorige;
});

import '../setup';
import db from '../../database/connection';
import { encrypt } from '../../utils/encryption';
import { createPayment, createRefund, getPaymentProvider, mollieSleutel } from '../../services/payments';
import ticketsRoutes from '../../routes/tickets';
import { errorHandler } from '../../middleware/errorHandler';
import { clearModuleCache } from '../../modules/service';
import { createTestAssociation, createTestEnvironment, TestAssociation, TestUser } from '../testUtils';

vi.mock('express-rate-limit', () => ({
  default: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const INSTALLATIE = 'nep-sleutel-van-de-installatie';
const EIGEN_LIVE = 'nep-livesleutel-van-de-harmonie';
const EIGEN_TEST = 'nep-testsleutel-van-de-harmonie';

afterAll(() => {
  if (vorigeSleutel === undefined) delete process.env.MOLLIE_API_KEY;
  else process.env.MOLLIE_API_KEY = vorigeSleutel;
});

let vereniging: TestAssociation;
let beheerder: TestUser;
let netwerk: ReturnType<typeof vi.fn>;

beforeEach(() => {
  const omgeving = createTestEnvironment();
  vereniging = omgeving.association;
  beheerder = omgeving.adminUser;
  netwerk = vi.fn(
    async () =>
      ({
        ok: true,
        status: 201,
        json: async () => ({ id: 'tr_1', status: 'open', _links: { checkout: { href: 'https://mollie.test/x' } } }),
        text: async () => '',
      }) as unknown as Response,
  );
  vi.stubGlobal('fetch', netwerk);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function koppel(
  associationId: string,
  instellingen: { modus?: 'live' | 'test'; live?: string | null; test?: string | null; verbonden?: boolean },
) {
  db.prepare(
    `INSERT INTO payment_settings (id, association_id, provider, mollie_mode, mollie_api_key_encrypted, mollie_test_api_key_encrypted, is_connected)
     VALUES (?, ?, 'mollie', ?, ?, ?, ?)`,
  ).run(
    uuidv4(),
    associationId,
    instellingen.modus ?? 'live',
    instellingen.live === undefined ? encrypt(EIGEN_LIVE) : instellingen.live,
    instellingen.test === undefined ? encrypt(EIGEN_TEST) : instellingen.test,
    instellingen.verbonden === false ? 0 : 1,
  );
}

/** De sleutel waarmee de laatste aanroep naar Mollie ging. */
function laatsteSleutel(): string {
  const [, opties] = netwerk.mock.calls.at(-1) as [string, RequestInit];
  return String((opties.headers as Record<string, string>).Authorization).replace('Bearer ', '');
}

const BETALING = { orderId: 'b1', amount: 12.5, description: 'Kaarten', redirectUrl: 'x', webhookUrl: 'y' };

describe('de Mollie-sleutel per vereniging', () => {
  it('betaalt via het eigen account van de vereniging', async () => {
    koppel(vereniging.id, {});

    await createPayment({ ...BETALING, associationId: vereniging.id });

    expect(laatsteSleutel()).toBe(EIGEN_LIVE);
  });

  it('gebruikt in testmodus de testsleutel', async () => {
    koppel(vereniging.id, { modus: 'test' });

    await createPayment({ ...BETALING, associationId: vereniging.id });

    expect(laatsteSleutel()).toBe(EIGEN_TEST);
  });

  it('valt terug op de installatie als de vereniging niets gekoppeld heeft', async () => {
    await createPayment({ ...BETALING, associationId: vereniging.id });

    expect(laatsteSleutel()).toBe(INSTALLATIE);
  });

  it('valt terug op de installatie als de vereniging haar account heeft losgekoppeld', async () => {
    koppel(vereniging.id, { verbonden: false });

    expect(mollieSleutel(vereniging.id)).toBe(INSTALLATIE);
  });

  it('gebruikt nooit de sleutel van een andere vereniging', async () => {
    const andere = createTestAssociation({ name: 'Andere vereniging' });
    koppel(andere.id, {});

    await createPayment({ ...BETALING, associationId: vereniging.id });

    expect(laatsteSleutel()).toBe(INSTALLATIE);
  });

  it('gebruikt bij een onleesbare eigen sleutel ook niet die van de installatie', async () => {
    // Anders ging het geld van deze vereniging naar de rekening van de installatie.
    // Versleuteld, maar met een beschadigd controleteken: bijvoorbeeld na het
    // wisselen van ENCRYPTION_SECRET zonder de sleutels opnieuw in te voeren.
    const [iv, , inhoud] = encrypt(EIGEN_LIVE).split(':');
    koppel(vereniging.id, { live: `${iv}:${'0'.repeat(32)}:${inhoud}` });

    expect(mollieSleutel(vereniging.id)).toBe('');
    expect(getPaymentProvider(vereniging.id)).not.toBe('mollie');
    await createPayment({ ...BETALING, associationId: vereniging.id });
    expect(netwerk).not.toHaveBeenCalled();
  });

  it('betaalt terug via het eigen account', async () => {
    koppel(vereniging.id, {});

    await createRefund({ paymentId: 'tr_1', associationId: vereniging.id });

    expect(laatsteSleutel()).toBe(EIGEN_LIVE);
  });
});

describe('de webhook van Mollie', () => {
  const app = express();
  app.use('/api/tickets/webhooks/payment', express.raw({ type: 'application/json' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());
  app.use('/api', ticketsRoutes);
  app.use(errorHandler);

  function maakBestelling(associationId: string, paymentId: string): string {
    const concertId = uuidv4();
    db.prepare(
      `INSERT INTO concerts (id, association_id, name, date, location, created_by)
       VALUES (?, ?, 'Nieuwjaarsconcert', '2099-01-01', 'De Harmonie', ?)`,
    ).run(concertId, associationId, beheerder.id);
    const orderId = uuidv4();
    db.prepare(
      `INSERT INTO ticket_orders (id, concert_id, total, status, payment_id, payment_method, buyer_name, buyer_email)
       VALUES (?, ?, 25, 'pending', ?, 'ideal', 'Jan Jansen', 'jan@example.com')`,
    ).run(orderId, concertId, paymentId);
    return orderId;
  }

  beforeEach(() => {
    db.prepare(
      `INSERT INTO association_modules (id, association_id, module_key, enabled, updated_by)
       VALUES (?, ?, 'ticketing', 1, ?)`,
    ).run(uuidv4(), vereniging.id, beheerder.id);
    clearModuleCache();
  });

  it('vraagt de betaling terug met de sleutel van de vereniging van de bestelling', async () => {
    koppel(vereniging.id, {});
    const orderId = maakBestelling(vereniging.id, 'tr_harmonie1');
    netwerk.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: 'tr_harmonie1',
        status: 'open',
        amount: { value: '25.00' },
        metadata: { order_id: orderId },
      }),
      text: async () => '',
    } as unknown as Response);

    const antwoord = await request(app).post('/api/tickets/webhooks/payment').type('form').send({ id: 'tr_harmonie1' });

    expect(antwoord.status).toBe(200);
    expect(String(netwerk.mock.calls[0][0])).toContain('/payments/tr_harmonie1');
    expect(laatsteSleutel()).toBe(EIGEN_LIVE);
  });
});
