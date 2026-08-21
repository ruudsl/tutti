/**
 * De betaaldienst. Hier loopt het geld van de kaartverkoop doorheen, dus telt
 * dekking dubbel: elke tak die hier stilzwijgend "betaald" zegt, kost de
 * vereniging kaarten zonder opbrengst.
 *
 * Vier dingen wegen in dit bestand het zwaarst:
 *
 * 1. **De handtekening van de Stripe-webhook.** Dat is de enige grendel tussen
 *    het open internet en een bestelling die op betaald gaat. De tests rekenen
 *    de HMAC hieronder ECHT uit (crypto.createHmac), want een test die de
 *    verificatie zelf nabootst toetst alleen zijn eigen nabootsing.
 * 2. **Mollie haalt terug.** Het betaalkenmerk in de body van de webhook is
 *    onbetrouwbaar; de status wordt bij Mollie zelf opgevraagd. Een vervalste
 *    body hoort dus niets op te leveren.
 * 3. **De nepbetaalprovider.** Die hoort bij ontwikkelen en mag in productie
 *    niet meedoen. Dat is precies het soort schakelaar dat per ongeluk open
 *    blijft staan.
 * 4. **Centen en euro's.** Een fout van een factor honderd is hier het
 *    klassieke geval, dus beide richtingen liggen vast.
 *
 * De module leest zijn sleutels eenmalig bij het inladen uit process.env. Een
 * test die de omgeving wil varieren moet de module dus opnieuw inladen; vandaar
 * laadBetalingen() met vi.resetModules().
 *
 * Het netwerk is volledig nagebootst. Er gaat geen enkel verzoek naar Mollie of
 * Stripe.
 */

import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import crypto from 'crypto';
import '../setup';

/**
 * De databasetoegang van deze dienst beperkt zich tot het wegschrijven van
 * webhookregels. Die willen we kunnen tellen - vooral om te tonen dat er bij
 * een storing NIETS geboekt wordt - maar wel tegen het echte schema, zodat een
 * kapotte INSERT hier ook echt stukgaat.
 *
 * Vandaar deze dubbelganger: hij schrijft door naar dezelfde testdatabase als
 * de rest van de suite en houdt alleen bij welke opdrachten langskwamen. De
 * verwijzing naar dat ene exemplaar wordt eenmalig vastgehouden, want na
 * vi.resetModules() zou een nieuwe import van testDb een tweede, nog niet
 * geinitialiseerd exemplaar opleveren.
 */
const houder = vi.hoisted(() => ({
  echt: null as null | { prepare: (sql: string) => { run: (...p: unknown[]) => unknown } },
  regels: [] as { sql: string; params: unknown[] }[],
}));

vi.mock('../../database/connection', async () => {
  if (!houder.echt) houder.echt = (await import('../testDb')).default as never;

  return {
    default: new Proxy(houder.echt as object, {
      get(doel: object, eigenschap: string | symbol) {
        if (eigenschap === 'prepare') {
          return (sql: string) => {
            const opdracht = (doel as { prepare: (s: string) => Record<string, (...p: unknown[]) => unknown> }).prepare(
              sql,
            );
            return {
              run: (...params: unknown[]) => {
                houder.regels.push({ sql, params });
                return opdracht.run(...params);
              },
              get: (...params: unknown[]) => opdracht.get(...params),
              all: (...params: unknown[]) => opdracht.all(...params),
            };
          };
        }
        const waarde = (doel as Record<string | symbol, unknown>)[eigenschap];
        return typeof waarde === 'function' ? (waarde as () => unknown).bind(doel) : waarde;
      },
    }),
  };
});

type BetalingenModule = typeof import('../../services/payments');
type GemockteLogger = {
  info: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  debug: ReturnType<typeof vi.fn>;
};

// Bewust NIET in de vorm van een echte sleutel. Een testfixture die eruitziet
// als `sk_live_...` of `live_...` wordt door de geheimdetectie van GitHub
// tegengehouden - terecht, want aan de vorm is niet te zien of hij verzonnen
// is. Zo'n fixture leert lezers bovendien om die melding weg te klikken.
// De code kijkt alleen of de sleutel niet leeg is; het voorvoegsel doet niets.
const MOLLIE_SLEUTEL = 'nep-mollie-sleutel-voor-tests';
const STRIPE_SLEUTEL = 'nep-stripe-sleutel-voor-tests';
const WEBHOOK_GEHEIM = 'nep-webhookgeheim-voor-tests';

const omgevingsSleutels = [
  'MOLLIE_API_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'FRONTEND_URL',
  'NODE_ENV',
] as const;

const oorspronkelijkeOmgeving: Record<string, string | undefined> = {};
for (const sleutel of omgevingsSleutels) oorspronkelijkeOmgeving[sleutel] = process.env[sleutel];

/**
 * Laadt de betaaldienst opnieuw met de opgegeven omgeving.
 *
 * Alle omgevingsvariabelen die deze dienst leest worden eerst gewist, zodat een
 * test nooit per ongeluk meelift op een sleutel die een eerdere test zette.
 */
async function laadBetalingen(
  omgeving: Partial<Record<(typeof omgevingsSleutels)[number], string | undefined>> = {},
): Promise<BetalingenModule & { logger: GemockteLogger }> {
  for (const sleutel of omgevingsSleutels) delete process.env[sleutel];
  // NODE_ENV staat in de testomgeving standaard op 'test'; alleen een test die
  // productie nabootst zet hem anders.
  process.env.NODE_ENV = 'test';
  for (const [sleutel, waarde] of Object.entries(omgeving)) {
    if (waarde === undefined) delete process.env[sleutel];
    else process.env[sleutel] = waarde;
  }

  vi.resetModules();
  const betalingen = await import('../../services/payments');
  const logger = (await import('../../utils/logger')).default as unknown as GemockteLogger;
  // De gemockte logger overleeft resetModules(): zonder schoonmaak telt een
  // test de logregels van eerdere tests mee.
  for (const niveau of [logger.info, logger.warn, logger.error, logger.debug]) niveau.mockClear();
  return { ...betalingen, logger };
}

/** Een antwoord zoals fetch dat teruggeeft. */
function antwoord(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    json: async () => {
      if (typeof body === 'string') return JSON.parse(body);
      return body;
    },
  } as unknown as Response;
}

/** Zet fetch klaar met een rij antwoorden; het laatste antwoord blijft gelden. */
function netwerk(...antwoorden: Response[]) {
  let volgende = 0;
  const nep = vi.fn(async () => antwoorden[Math.min(volgende++, antwoorden.length - 1)]);
  vi.stubGlobal('fetch', nep);
  return nep;
}

/** Zet fetch klaar met een storing: het verzoek komt er niet doorheen. */
function netwerkStoring(fout: Error = new Error('ECONNRESET')) {
  const nep = vi.fn(async () => {
    throw fout;
  });
  vi.stubGlobal('fetch', nep);
  return nep;
}

/**
 * Rekent een echte Stripe-handtekening uit over de ruwe bytes, volgens het
 * schema dat Stripe gebruikt: HMAC-SHA256 over "<tijdstempel>.<payload>".
 *
 * Dit is bewust geen nabootsing van de verificatie in de dienst: de test
 * berekent zelf, met crypto, wat Stripe zou versturen.
 */
function tekenen(payload: string | Buffer, geheim: string, tijdstempel: number): string {
  const bytes = Buffer.isBuffer(payload) ? payload : Buffer.from(payload, 'utf8');
  const hmac = crypto.createHmac('sha256', geheim).update(`${tijdstempel}.`).update(bytes).digest('hex');
  return `t=${tijdstempel},v1=${hmac}`;
}

function nu(): number {
  return Math.floor(Date.now() / 1000);
}

/** Het aantal weggeschreven webhookregels; gebruikt om te tonen dat er NIETS geboekt is. */
function webhookRegels(): { sql: string; params: unknown[] }[] {
  return houder.regels;
}

beforeEach(() => {
  houder.regels.length = 0;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(() => {
  for (const sleutel of omgevingsSleutels) {
    const waarde = oorspronkelijkeOmgeving[sleutel];
    if (waarde === undefined) delete process.env[sleutel];
    else process.env[sleutel] = waarde;
  }
});

// ============================================================
// 1. De handtekeningcontrole van de Stripe-webhook
// ============================================================

describe('Stripe-webhook: handtekeningcontrole', () => {
  const BERICHT = JSON.stringify({
    id: 'evt_1',
    type: 'checkout.session.completed',
    data: { object: { id: 'cs_test_1', payment_status: 'paid', metadata: { order_id: 'bestelling-1' } } },
  });

  it('aanvaardt een handtekening die over de ruwe bytes klopt', async () => {
    const { verifyStripeWebhook } = await laadBetalingen({ STRIPE_WEBHOOK_SECRET: WEBHOOK_GEHEIM });

    const resultaat = verifyStripeWebhook(Buffer.from(BERICHT), tekenen(BERICHT, WEBHOOK_GEHEIM, nu()));

    expect(resultaat.valid).toBe(true);
    expect((resultaat.event as { id: string }).id).toBe('evt_1');
  });

  it('rekent over de bytes en niet over de betekenis: dezelfde JSON anders opgemaakt valt af', async () => {
    const { verifyStripeWebhook } = await laadBetalingen({ STRIPE_WEBHOOK_SECRET: WEBHOOK_GEHEIM });
    const tijdstempel = nu();
    const handtekening = tekenen(BERICHT, WEBHOOK_GEHEIM, tijdstempel);

    // Dezelfde gegevens, opnieuw geserialiseerd met inspringing. Als de dienst
    // over een geparste-en-weer-geserialiseerde body zou rekenen, zou dit
    // slagen - en dan zou een aanvaller de body kunnen herschikken.
    const herschikt = JSON.stringify(JSON.parse(BERICHT), null, 2);

    expect(verifyStripeWebhook(herschikt, handtekening).valid).toBe(false);
  });

  it('weigert een handtekening die met een ander geheim is gezet', async () => {
    const { verifyStripeWebhook } = await laadBetalingen({ STRIPE_WEBHOOK_SECRET: WEBHOOK_GEHEIM });

    const vanAanvaller = tekenen(BERICHT, 'nep-geheim-van-de-aanvaller', nu());

    expect(verifyStripeWebhook(BERICHT, vanAanvaller).valid).toBe(false);
  });

  it('weigert een geldige handtekening van een ANDER bericht (hergebruik)', async () => {
    const { verifyStripeWebhook } = await laadBetalingen({ STRIPE_WEBHOOK_SECRET: WEBHOOK_GEHEIM });
    const tijdstempel = nu();

    // Een echt, eerder ontvangen bericht met een echte handtekening. De
    // aanvaller plakt die handtekening op een bericht van eigen makelij.
    const echteHandtekening = tekenen(BERICHT, WEBHOOK_GEHEIM, tijdstempel);
    const vervalstBericht = JSON.stringify({
      id: 'evt_1',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_test_1', payment_status: 'paid', metadata: { order_id: 'bestelling-van-aanvaller' } } },
    });

    expect(verifyStripeWebhook(vervalstBericht, echteHandtekening).valid).toBe(false);
  });

  it('weigert een geknipte handtekening', async () => {
    const { verifyStripeWebhook } = await laadBetalingen({ STRIPE_WEBHOOK_SECRET: WEBHOOK_GEHEIM });
    const tijdstempel = nu();
    const volledig = tekenen(BERICHT, WEBHOOK_GEHEIM, tijdstempel);
    const hex = volledig.split('v1=')[1];

    // De helft van een kloppende handtekening. Zonder lengtecontrole vooraf
    // zou crypto.timingSafeEqual hierop een uitzondering gooien in plaats van
    // netjes 'ongeldig' te zeggen.
    const geknipt = `t=${tijdstempel},v1=${hex.slice(0, 32)}`;

    expect(verifyStripeWebhook(BERICHT, geknipt).valid).toBe(false);
  });

  it('weigert een handtekening waarin een enkel teken is omgeklapt', async () => {
    const { verifyStripeWebhook } = await laadBetalingen({ STRIPE_WEBHOOK_SECRET: WEBHOOK_GEHEIM });
    const tijdstempel = nu();
    const hex = tekenen(BERICHT, WEBHOOK_GEHEIM, tijdstempel).split('v1=')[1];
    const omgeklapt = (hex[0] === 'a' ? 'b' : 'a') + hex.slice(1);

    expect(verifyStripeWebhook(BERICHT, `t=${tijdstempel},v1=${omgeklapt}`).valid).toBe(false);
  });

  it('weigert een handtekening die geen geldige hex is', async () => {
    const { verifyStripeWebhook } = await laadBetalingen({ STRIPE_WEBHOOK_SECRET: WEBHOOK_GEHEIM });

    // Buffer.from(..., 'hex') stopt bij het eerste onbruikbare teken; de
    // lengtecontrole vangt het gevolg daarvan op.
    expect(verifyStripeWebhook(BERICHT, `t=${nu()},v1=zzzz`).valid).toBe(false);
    expect(verifyStripeWebhook(BERICHT, `t=${nu()},v1=`).valid).toBe(false);
  });

  it('weigert een ontbrekende of onvolledige handtekeningkop', async () => {
    const { verifyStripeWebhook } = await laadBetalingen({ STRIPE_WEBHOOK_SECRET: WEBHOOK_GEHEIM });
    const tijdstempel = nu();
    const hex = tekenen(BERICHT, WEBHOOK_GEHEIM, tijdstempel).split('v1=')[1];

    expect(verifyStripeWebhook(BERICHT, '').valid).toBe(false);
    // Wel een tijdstempel, geen handtekening.
    expect(verifyStripeWebhook(BERICHT, `t=${tijdstempel}`).valid).toBe(false);
    // Wel een handtekening, geen tijdstempel: dan is er geen replaybescherming
    // en klopt de berekening sowieso niet.
    expect(verifyStripeWebhook(BERICHT, `v1=${hex}`).valid).toBe(false);
    // Een andere versieaanduiding telt niet mee.
    expect(verifyStripeWebhook(BERICHT, `t=${tijdstempel},v0=${hex}`).valid).toBe(false);
  });

  it('weigert een kop met spaties na de komma, zoals Stripe die niet stuurt', async () => {
    const { verifyStripeWebhook } = await laadBetalingen({ STRIPE_WEBHOOK_SECRET: WEBHOOK_GEHEIM });
    const tijdstempel = nu();
    const hex = tekenen(BERICHT, WEBHOOK_GEHEIM, tijdstempel).split('v1=')[1];

    // Vastgelegd omdat het strenger is dan de officiele Stripe-bibliotheek:
    // die trimt de onderdelen. Stripe zelf stuurt geen spaties, dus dit is
    // veilig, maar het is goed dat het zichtbaar is als het ooit wel gebeurt.
    expect(verifyStripeWebhook(BERICHT, `t=${tijdstempel}, v1=${hex}`).valid).toBe(false);
  });

  it('neemt bij meerdere v1-waarden alleen de eerste', async () => {
    const { verifyStripeWebhook } = await laadBetalingen({ STRIPE_WEBHOOK_SECRET: WEBHOOK_GEHEIM });
    const tijdstempel = nu();
    const geldig = tekenen(BERICHT, WEBHOOK_GEHEIM, tijdstempel).split('v1=')[1];
    const rommel = 'a'.repeat(64);

    // Stripe zet bij een sleutelwissel meerdere v1-waarden in de kop. Deze
    // dienst kijkt alleen naar de eerste. Dat is strenger dan Stripe zelf en
    // dus geen gat - maar tijdens een sleutelwissel kan een op zich geldige
    // webhook hierdoor afvallen.
    expect(verifyStripeWebhook(BERICHT, `t=${tijdstempel},v1=${geldig},v1=${rommel}`).valid).toBe(true);
    expect(verifyStripeWebhook(BERICHT, `t=${tijdstempel},v1=${rommel},v1=${geldig}`).valid).toBe(false);
  });

  it('aanvaardt een handtekening in hoofdletters', async () => {
    const { verifyStripeWebhook } = await laadBetalingen({ STRIPE_WEBHOOK_SECRET: WEBHOOK_GEHEIM });
    const tijdstempel = nu();
    const hex = tekenen(BERICHT, WEBHOOK_GEHEIM, tijdstempel).split('v1=')[1];

    // Dezelfde bytes, anders geschreven. Buffer.from(...,'hex') is niet
    // hoofdlettergevoelig, dus dit hoort te slagen.
    expect(verifyStripeWebhook(BERICHT, `t=${tijdstempel},v1=${hex.toUpperCase()}`).valid).toBe(true);
  });

  it('behandelt een Buffer en een string met dezelfde inhoud gelijk', async () => {
    const { verifyStripeWebhook } = await laadBetalingen({ STRIPE_WEBHOOK_SECRET: WEBHOOK_GEHEIM });
    const handtekening = tekenen(BERICHT, WEBHOOK_GEHEIM, nu());

    expect(verifyStripeWebhook(Buffer.from(BERICHT, 'utf8'), handtekening).valid).toBe(true);
    expect(verifyStripeWebhook(BERICHT, handtekening).valid).toBe(true);
  });

  it('rekent over de ruwe bytes, ook bij tekens buiten ASCII', async () => {
    const { verifyStripeWebhook } = await laadBetalingen({ STRIPE_WEBHOOK_SECRET: WEBHOOK_GEHEIM });
    const metAccenten = JSON.stringify({ type: 'ping', omschrijving: 'Kaarten Nieuwjaarsconcert – café Zürich' });
    const bytes = Buffer.from(metAccenten, 'utf8');

    expect(verifyStripeWebhook(bytes, tekenen(bytes, WEBHOOK_GEHEIM, nu())).valid).toBe(true);
  });

  it('weigert zonder ingesteld webhookgeheim, ook bij een op zich kloppende berekening', async () => {
    const { verifyStripeWebhook, logger } = await laadBetalingen({ STRIPE_WEBHOOK_SECRET: undefined });

    // Zonder geheim is er niets om tegen af te zetten. De dienst hoort dicht te
    // gaan, niet open: een lege sleutel is geen geldige sleutel.
    const resultaat = verifyStripeWebhook(BERICHT, tekenen(BERICHT, '', nu()));

    expect(resultaat.valid).toBe(false);
    expect(resultaat.event).toBeUndefined();
    expect(logger.warn).toHaveBeenCalled();
  });
});

describe('Stripe-webhook: tijdstempel tegen hergebruik', () => {
  const BERICHT = JSON.stringify({ type: 'ping' });

  it('aanvaardt een tijdstempel net binnen de tolerantie van vijf minuten', async () => {
    const { verifyStripeWebhook } = await laadBetalingen({ STRIPE_WEBHOOK_SECRET: WEBHOOK_GEHEIM });
    const bijnaOud = nu() - 299;

    expect(verifyStripeWebhook(BERICHT, tekenen(BERICHT, WEBHOOK_GEHEIM, bijnaOud)).valid).toBe(true);
  });

  it('weigert een tijdstempel ouder dan de tolerantie, ook met een kloppende handtekening', async () => {
    const { verifyStripeWebhook, logger } = await laadBetalingen({ STRIPE_WEBHOOK_SECRET: WEBHOOK_GEHEIM });
    const teOud = nu() - 301;

    // Dit is het hergebruikgeval: een aanvaller die een oud, echt ondertekend
    // bericht opnieuw afvuurt. De handtekening klopt dan nog steeds.
    const handtekening = tekenen(BERICHT, WEBHOOK_GEHEIM, teOud);
    expect(verifyStripeWebhook(BERICHT, handtekening).valid).toBe(false);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('weigert een tijdstempel ver in de toekomst', async () => {
    const { verifyStripeWebhook } = await laadBetalingen({ STRIPE_WEBHOOK_SECRET: WEBHOOK_GEHEIM });
    const straks = nu() + 301;

    // Zonder bovengrens kan iemand een bericht met een tijdstempel van volgend
    // jaar maken en dat maandenlang blijven inzenden.
    expect(verifyStripeWebhook(BERICHT, tekenen(BERICHT, WEBHOOK_GEHEIM, straks)).valid).toBe(false);
  });

  it('weigert een tijdstempel dat geen getal is', async () => {
    const { verifyStripeWebhook } = await laadBetalingen({ STRIPE_WEBHOOK_SECRET: WEBHOOK_GEHEIM });
    const hex = tekenen(BERICHT, WEBHOOK_GEHEIM, nu()).split('v1=')[1];

    expect(verifyStripeWebhook(BERICHT, `t=straks,v1=${hex}`).valid).toBe(false);
    expect(verifyStripeWebhook(BERICHT, `t=,v1=${hex}`).valid).toBe(false);
  });

  it('weigert een tijdstempel in milliseconden', async () => {
    const { verifyStripeWebhook } = await laadBetalingen({ STRIPE_WEBHOOK_SECRET: WEBHOOK_GEHEIM });
    const inMillis = Date.now();

    // Een veelgemaakte fout aan de verzendkant. Die hoort niet stilzwijgend
    // door te glippen: in seconden gelezen ligt dit jaren in de toekomst.
    expect(verifyStripeWebhook(BERICHT, tekenen(BERICHT, WEBHOOK_GEHEIM, inMillis)).valid).toBe(false);
  });

  it('houdt de tijdstempelcontrole aan het bericht vast: het tijdstempel telt mee in de berekening', async () => {
    const { verifyStripeWebhook } = await laadBetalingen({ STRIPE_WEBHOOK_SECRET: WEBHOOK_GEHEIM });
    const tijdstempel = nu();
    const hex = tekenen(BERICHT, WEBHOOK_GEHEIM, tijdstempel).split('v1=')[1];

    // Het tijdstempel oprekken zonder opnieuw te tekenen breekt de
    // handtekening. Zonder dat zou een oud bericht simpelweg van een vers
    // tijdstempel voorzien kunnen worden.
    expect(verifyStripeWebhook(BERICHT, `t=${tijdstempel + 1},v1=${hex}`).valid).toBe(false);
  });
});

describe('Stripe-webhook: parsen gebeurt pas na verificatie', () => {
  it('parseert de JSON niet wanneer de handtekening niet klopt', async () => {
    const { verifyStripeWebhook, logger } = await laadBetalingen({ STRIPE_WEBHOOK_SECRET: WEBHOOK_GEHEIM });

    // Onleesbare JSON met een ondeugdelijke handtekening. Zou de dienst eerst
    // parsen, dan zou dat hier stukgaan en een foutregel opleveren. Er komt
    // geen foutregel: de handtekening valt eerder af.
    const resultaat = verifyStripeWebhook('dit-is-geen-json{{{', `t=${nu()},v1=${'a'.repeat(64)}`);

    expect(resultaat.valid).toBe(false);
    expect(resultaat.event).toBeUndefined();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('parseert pas na een kloppende handtekening, en meldt onleesbare inhoud dan als ongeldig', async () => {
    const { verifyStripeWebhook, logger } = await laadBetalingen({ STRIPE_WEBHOOK_SECRET: WEBHOOK_GEHEIM });
    const rommel = 'dit-is-geen-json{{{';

    // Nu klopt de handtekening wel, dus wordt er wel geparsed - en gaat dat
    // stuk. Het verschil met de vorige test toont de volgorde aan.
    const resultaat = verifyStripeWebhook(rommel, tekenen(rommel, WEBHOOK_GEHEIM, nu()));

    expect(resultaat.valid).toBe(false);
    expect(logger.error).toHaveBeenCalled();
  });

  it('geeft bij een geldige handtekening het geparste bericht terug', async () => {
    const { verifyStripeWebhook } = await laadBetalingen({ STRIPE_WEBHOOK_SECRET: WEBHOOK_GEHEIM });
    const bericht = JSON.stringify({ type: 'checkout.session.expired', data: { object: { id: 'cs_2' } } });

    const resultaat = verifyStripeWebhook(bericht, tekenen(bericht, WEBHOOK_GEHEIM, nu()));

    expect(resultaat.valid).toBe(true);
    expect(resultaat.event).toEqual({ type: 'checkout.session.expired', data: { object: { id: 'cs_2' } } });
  });
});

describe('Stripe-webhook: verwerking van het bericht', () => {
  async function verwerk(event: Record<string, unknown>) {
    const { handleStripeWebhook } = await laadBetalingen({ STRIPE_SECRET_KEY: STRIPE_SLEUTEL });
    return handleStripeWebhook(event);
  }

  it('meldt een afgeronde betaling met het bestelnummer uit de metadata', async () => {
    const resultaat = await verwerk({
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_1', payment_status: 'paid', metadata: { order_id: 'bestelling-1' } } },
    });

    expect(resultaat).toEqual({ success: true, orderId: 'bestelling-1', status: 'paid' });
  });

  it('meldt een sessie zonder betaling niet als betaald', async () => {
    const resultaat = await verwerk({
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_1', payment_status: 'unpaid', metadata: { order_id: 'bestelling-1' } } },
    });

    // Alles wat niet letterlijk 'paid' is blijft in behandeling. Een bestelling
    // op betaald zetten hoort alleen bij een betaling die er echt is.
    expect(resultaat.status).toBe('pending');
  });

  it('weigert een afgeronde sessie zonder bestelnummer', async () => {
    const resultaat = await verwerk({
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_1', payment_status: 'paid' } },
    });

    expect(resultaat).toEqual({ success: false, error: 'Order ID not found' });
  });

  it('meldt een verlopen sessie als verlopen', async () => {
    const resultaat = await verwerk({
      type: 'checkout.session.expired',
      data: { object: { metadata: { order_id: 'bestelling-2' } } },
    });

    expect(resultaat).toEqual({ success: true, orderId: 'bestelling-2', status: 'expired' });
  });

  it('doet niets bij een onbekend berichttype', async () => {
    const resultaat = await verwerk({ type: 'invoice.paid', data: { object: {} } });

    // Geen bestelnummer, geen status: er hoort niets bijgewerkt te worden op
    // grond van een bericht dat we niet kennen.
    expect(resultaat).toEqual({ success: true });
    expect(resultaat.orderId).toBeUndefined();
  });

  it('legt elk binnengekomen bericht vast in payment_webhooks', async () => {
    await verwerk({
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_1', payment_status: 'paid', metadata: { order_id: 'bestelling-1' } } },
    });

    const inserts = webhookRegels().filter((r) => r.sql.includes('INSERT INTO payment_webhooks'));
    expect(inserts).toHaveLength(1);
    expect(inserts[0].sql).toContain("'stripe'");
    expect(inserts[0].params).toContain('checkout.session.completed');
  });
});

// ============================================================
// 2. Mollie haalt de status zelf op (fetch-back)
// ============================================================

describe('Mollie-webhook: de body wordt niet vertrouwd', () => {
  function molliesAntwoord(overrides: Record<string, unknown> = {}) {
    return antwoord(200, {
      id: 'tr_echt123',
      status: 'paid',
      amount: { value: '25.00', currency: 'EUR' },
      method: 'ideal',
      paidAt: '2026-08-21T10:00:00Z',
      metadata: { order_id: 'bestelling-1' },
      ...overrides,
    });
  }

  it('haalt de status bij Mollie op in plaats van hem uit de body te geloven', async () => {
    const nep = netwerk(molliesAntwoord({ status: 'failed' }));
    const { handleMollieWebhook } = await laadBetalingen({ MOLLIE_API_KEY: MOLLIE_SLEUTEL });

    // Een aanvaller die 'betaald' roept krijgt te horen wat Mollie zegt, en
    // Mollie zegt: mislukt.
    const resultaat = await handleMollieWebhook('tr_vervalst');

    expect(nep).toHaveBeenCalledTimes(1);
    expect(nep.mock.calls[0][0]).toBe('https://api.mollie.com/v2/payments/tr_vervalst');
    expect(resultaat).toEqual({ success: true, orderId: 'bestelling-1', status: 'failed' });
  });

  it('gebruikt het bestelnummer uit Mollies antwoord, niet uit de body', async () => {
    netwerk(molliesAntwoord({ metadata: { order_id: 'bestelling-van-mollie' } }));
    const { handleMollieWebhook } = await laadBetalingen({ MOLLIE_API_KEY: MOLLIE_SLEUTEL });

    const resultaat = await handleMollieWebhook('tr_wat_dan_ook');

    expect(resultaat.orderId).toBe('bestelling-van-mollie');
  });

  it('stuurt de sleutel mee en vraagt niets anders op', async () => {
    const nep = netwerk(molliesAntwoord());
    const { handleMollieWebhook } = await laadBetalingen({ MOLLIE_API_KEY: MOLLIE_SLEUTEL });

    await handleMollieWebhook('tr_echt123');

    const opties = nep.mock.calls[0][1] as RequestInit;
    expect((opties.headers as Record<string, string>).Authorization).toBe(`Bearer ${MOLLIE_SLEUTEL}`);
  });

  it('boekt niets als Mollie de betaling niet kent', async () => {
    netwerk(antwoord(404, { detail: 'No payment exists' }));
    const { handleMollieWebhook } = await laadBetalingen({ MOLLIE_API_KEY: MOLLIE_SLEUTEL });

    const resultaat = await handleMollieWebhook('tr_bestaatniet');

    expect(resultaat).toEqual({ success: false, error: 'Payment not found' });
    // Belangrijk: geen webhookregel, dus ook geen spoor van een betaling die
    // er niet is.
    expect(webhookRegels()).toHaveLength(0);
  });

  it('weigert een betaalkenmerk met padtekens zonder het netwerk op te gaan', async () => {
    const nep = netwerk(molliesAntwoord());
    const { handleMollieWebhook } = await laadBetalingen({ MOLLIE_API_KEY: MOLLIE_SLEUTEL });

    // Zonder controle zou dit een ander eindpunt van Mollie raken, met de
    // sleutel van de vereniging eraan vast.
    const resultaat = await handleMollieWebhook('../../organizations/me');

    expect(nep).not.toHaveBeenCalled();
    expect(resultaat.success).toBe(false);
  });

  it('weigert een leeg of te lang betaalkenmerk', async () => {
    const nep = netwerk(molliesAntwoord());
    const { handleMollieWebhook } = await laadBetalingen({ MOLLIE_API_KEY: MOLLIE_SLEUTEL });

    expect((await handleMollieWebhook('')).success).toBe(false);
    expect((await handleMollieWebhook('t'.repeat(65))).success).toBe(false);
    expect(nep).not.toHaveBeenCalled();
  });

  it('weigert een betaling zonder bestelnummer in de metadata', async () => {
    netwerk(molliesAntwoord({ metadata: undefined }));
    const { handleMollieWebhook } = await laadBetalingen({ MOLLIE_API_KEY: MOLLIE_SLEUTEL });

    const resultaat = await handleMollieWebhook('tr_echt123');

    expect(resultaat).toEqual({ success: false, error: 'Order ID not found in metadata' });
    expect(webhookRegels()).toHaveLength(0);
  });

  it('legt een verwerkte betaling vast in payment_webhooks', async () => {
    netwerk(molliesAntwoord());
    const { handleMollieWebhook } = await laadBetalingen({ MOLLIE_API_KEY: MOLLIE_SLEUTEL });

    await handleMollieWebhook('tr_echt123');

    const inserts = webhookRegels().filter((r) => r.sql.includes('INSERT INTO payment_webhooks'));
    expect(inserts).toHaveLength(1);
    expect(inserts[0].sql).toContain("'mollie'");
    expect(inserts[0].params).toContain('paid');
  });

  it('boekt niets wanneer Mollie een storing geeft', async () => {
    netwerk(antwoord(500, 'Internal Server Error'));
    const { handleMollieWebhook } = await laadBetalingen({ MOLLIE_API_KEY: MOLLIE_SLEUTEL });

    // Een storing bij de betaaldienst mag een bestelling nooit stil als betaald
    // markeren; hij hoort onbeslist te blijven.
    const resultaat = await handleMollieWebhook('tr_echt123');

    expect(resultaat.success).toBe(false);
    expect(resultaat.status).toBeUndefined();
    expect(webhookRegels()).toHaveLength(0);
  });

  it('boekt niets wanneer het netwerk eruit ligt', async () => {
    netwerkStoring();
    const { handleMollieWebhook } = await laadBetalingen({ MOLLIE_API_KEY: MOLLIE_SLEUTEL });

    const resultaat = await handleMollieWebhook('tr_echt123');

    expect(resultaat).toEqual({ success: false, error: 'Payment not found' });
    expect(webhookRegels()).toHaveLength(0);
  });

  it('boekt niets wanneer Mollie onzin teruggeeft', async () => {
    netwerk(antwoord(200, 'geen json'));
    const { handleMollieWebhook } = await laadBetalingen({ MOLLIE_API_KEY: MOLLIE_SLEUTEL });

    const resultaat = await handleMollieWebhook('tr_echt123');

    expect(resultaat.success).toBe(false);
    expect(webhookRegels()).toHaveLength(0);
  });

  it('boekt niets wanneer het antwoord de velden mist die we nodig hebben', async () => {
    netwerk(antwoord(200, { id: 'tr_echt123', status: 'paid' }));
    const { handleMollieWebhook } = await laadBetalingen({ MOLLIE_API_KEY: MOLLIE_SLEUTEL });

    // Geen amount-veld: parseFloat op undefined loopt stuk. Dat hoort een
    // nette 'niet gevonden' te worden, geen uitzondering naar buiten.
    const resultaat = await handleMollieWebhook('tr_echt123');

    expect(resultaat.success).toBe(false);
  });

  it('doet zonder ingestelde sleutel geen enkel verzoek', async () => {
    const nep = netwerk(molliesAntwoord());
    const { handleMollieWebhook } = await laadBetalingen({ MOLLIE_API_KEY: undefined });

    const resultaat = await handleMollieWebhook('tr_echt123');

    expect(nep).not.toHaveBeenCalled();
    expect(resultaat.success).toBe(false);
  });

  it('vertaalt de statussen van Mollie naar onze eigen woorden', async () => {
    const gevallen: [string, string][] = [
      ['open', 'pending'],
      ['pending', 'pending'],
      ['authorized', 'pending'],
      ['paid', 'paid'],
      ['failed', 'failed'],
      ['canceled', 'cancelled'],
      ['expired', 'expired'],
      ['refunded', 'refunded'],
      // Een status die we niet kennen mag nooit als betaald gelden.
      ['iets_nieuws_van_mollie', 'pending'],
    ];

    for (const [vanMollie, verwacht] of gevallen) {
      netwerk(molliesAntwoord({ status: vanMollie }));
      const { getPaymentStatus } = await laadBetalingen({ MOLLIE_API_KEY: MOLLIE_SLEUTEL });
      const status = await getPaymentStatus('tr_echt123');
      expect(status?.status, `Mollie-status ${vanMollie}`).toBe(verwacht);
    }
  });
});

// ============================================================
// 3. De nepbetaalprovider mag niet mee naar productie
// ============================================================

describe('De nepbetaalprovider', () => {
  it('springt in wanneer er in ontwikkeling geen provider is ingesteld', async () => {
    const { createPayment } = await laadBetalingen({ FRONTEND_URL: 'http://localhost:5173' });

    const resultaat = await createPayment({
      orderId: 'bestelling-1',
      amount: 25,
      description: 'Kaarten',
      redirectUrl: 'http://localhost:5173/terug',
      webhookUrl: 'http://localhost:3000/webhook',
    });

    expect(resultaat.success).toBe(true);
    expect(resultaat.paymentId).toMatch(/^mock_/);
    expect(resultaat.checkoutUrl).toBe('http://localhost:5173/tickets/orders/bestelling-1/mock-payment');
  });

  it('geeft in ontwikkeling een verzonnen betaling als betaald terug', async () => {
    const { getPaymentStatus } = await laadBetalingen();

    const status = await getPaymentStatus('mock_abc');

    expect(status).toEqual({ id: 'mock_abc', status: 'paid', amount: 0 });
  });

  it('kent in ontwikkeling geen andere kenmerken dan de eigen nepkenmerken', async () => {
    const { getPaymentStatus } = await laadBetalingen();

    expect(await getPaymentStatus('tr_echt123')).toBeNull();
  });

  it('maakt in productie GEEN nepbetaling aan wanneer er geen provider is ingesteld', async () => {
    const { createPayment, logger } = await laadBetalingen({ NODE_ENV: 'production' });

    // Een deploy zonder MOLLIE_API_KEY of STRIPE_SECRET_KEY is genoeg om hier
    // te belanden. De nepprovider verzint dan een betaalkenmerk dat niemand
    // ooit voldoet; de bestelling krijgt een kenmerk dat nergens op slaat.
    const resultaat = await createPayment({
      orderId: 'bestelling-1',
      amount: 25,
      description: 'Kaarten',
      redirectUrl: 'https://vereniging.nl/terug',
      webhookUrl: 'https://vereniging.nl/webhook',
    });

    expect(resultaat.success).toBe(false);
    expect(resultaat.paymentId).toBeUndefined();
    expect(resultaat.checkoutUrl).toBeUndefined();
    expect(logger.error).toHaveBeenCalled();
  });

  it('meldt in productie geen verzonnen betaling als betaald', async () => {
    const { getPaymentStatus } = await laadBetalingen({ NODE_ENV: 'production' });

    // 'paid' teruggeven op een kenmerk dat alleen maar met mock_ begint is in
    // productie het gevaarlijkste antwoord dat deze dienst kan geven.
    expect(await getPaymentStatus('mock_abc')).toBeNull();
  });

  it('meldt in productie geen verzonnen terugbetaling als geslaagd', async () => {
    const { createRefund } = await laadBetalingen({ NODE_ENV: 'production' });

    // Dit is de duurste tak: de aanroeper zet de bestelling op 'refunded' en
    // trekt de kaarten in, terwijl er geen cent terugging.
    const resultaat = await createRefund({ paymentId: 'mock_abc', reason: 'Concert afgelast' });

    expect(resultaat.success).toBe(false);
    expect(resultaat.refundId).toBeUndefined();
  });

  it('blijft in productie gewoon werken zodra er wel een provider is', async () => {
    const nep = netwerk(antwoord(201, { id: 'tr_1', _links: { checkout: { href: 'https://mollie/checkout' } } }));
    const { createPayment } = await laadBetalingen({ NODE_ENV: 'production', MOLLIE_API_KEY: MOLLIE_SLEUTEL });

    const resultaat = await createPayment({
      orderId: 'bestelling-1',
      amount: 25,
      description: 'Kaarten',
      redirectUrl: 'https://vereniging.nl/terug',
      webhookUrl: 'https://vereniging.nl/webhook',
    });

    expect(nep).toHaveBeenCalled();
    expect(resultaat).toEqual({ success: true, paymentId: 'tr_1', checkoutUrl: 'https://mollie/checkout' });
  });

  it('geeft in ontwikkeling een nepterugbetaling', async () => {
    const { createRefund } = await laadBetalingen();

    const resultaat = await createRefund({ paymentId: 'mock_abc' });

    expect(resultaat.success).toBe(true);
    expect(resultaat.refundId).toMatch(/^mock_refund_/);
  });
});

describe('Keuze van de betaalprovider', () => {
  it('kiest Mollie wanneer alleen Mollie is ingesteld', async () => {
    const { getPaymentProvider, getAvailablePaymentMethods } = await laadBetalingen({ MOLLIE_API_KEY: MOLLIE_SLEUTEL });

    expect(getPaymentProvider()).toBe('mollie');
    expect(getAvailablePaymentMethods()).toEqual(['ideal', 'creditcard', 'bancontact', 'paypal']);
  });

  it('kiest Stripe wanneer alleen Stripe is ingesteld', async () => {
    const { getPaymentProvider, getAvailablePaymentMethods } = await laadBetalingen({
      STRIPE_SECRET_KEY: STRIPE_SLEUTEL,
    });

    expect(getPaymentProvider()).toBe('stripe');
    expect(getAvailablePaymentMethods()).toEqual(['ideal', 'creditcard', 'bancontact']);
  });

  it('geeft Mollie voorrang wanneer beide zijn ingesteld', async () => {
    const nep = netwerk(antwoord(201, { id: 'tr_1', _links: { checkout: { href: 'https://mollie/checkout' } } }));
    const { getPaymentProvider, createPayment } = await laadBetalingen({
      MOLLIE_API_KEY: MOLLIE_SLEUTEL,
      STRIPE_SECRET_KEY: STRIPE_SLEUTEL,
    });

    expect(getPaymentProvider()).toBe('mollie');
    await createPayment({
      orderId: 'b1',
      amount: 10,
      description: 'Kaarten',
      redirectUrl: 'x',
      webhookUrl: 'y',
    });
    expect(nep.mock.calls[0][0]).toContain('api.mollie.com');
  });

  it('geeft geen provider en geen betaalwijzen zonder sleutels', async () => {
    const { getPaymentProvider, getAvailablePaymentMethods } = await laadBetalingen();

    expect(getPaymentProvider()).toBeNull();
    expect(getAvailablePaymentMethods()).toEqual([]);
  });
});

// ============================================================
// 4. Centen en euro's
// ============================================================

describe('Bedragen: euro naar de betaaldienst', () => {
  async function mollieBedrag(bedrag: number): Promise<string> {
    const nep = netwerk(antwoord(201, { id: 'tr_1', _links: { checkout: { href: 'https://mollie/checkout' } } }));
    const { createPayment } = await laadBetalingen({ MOLLIE_API_KEY: MOLLIE_SLEUTEL });
    await createPayment({
      orderId: 'b1',
      amount: bedrag,
      description: 'Kaarten',
      redirectUrl: 'x',
      webhookUrl: 'y',
    });
    const opties = nep.mock.calls[0][1] as RequestInit;
    return JSON.parse(opties.body as string).amount.value;
  }

  async function stripeCenten(bedrag: number): Promise<string | null> {
    const nep = netwerk(antwoord(200, { id: 'cs_1', url: 'https://stripe/checkout' }));
    const { createPayment } = await laadBetalingen({ STRIPE_SECRET_KEY: STRIPE_SLEUTEL });
    await createPayment({
      orderId: 'b1',
      amount: bedrag,
      description: 'Kaarten',
      redirectUrl: 'x',
      webhookUrl: 'y',
    });
    const opties = nep.mock.calls[0][1] as RequestInit;
    return new URLSearchParams(opties.body as string).get('line_items[0][price_data][unit_amount]');
  }

  it('stuurt Mollie een bedrag in euro met twee decimalen', async () => {
    expect(await mollieBedrag(25)).toBe('25.00');
    expect(await mollieBedrag(12.5)).toBe('12.50');
    expect(await mollieBedrag(1234.56)).toBe('1234.56');
  });

  it('stuurt Stripe een bedrag in centen', async () => {
    // De klassieke fout van een factor honderd: 19,99 euro is 1999 cent, niet
    // 199 en niet 199900.
    expect(await stripeCenten(19.99)).toBe('1999');
    expect(await stripeCenten(25)).toBe('2500');
    expect(await stripeCenten(0.01)).toBe('1');
  });

  it('houdt drijvende-kommaruis buiten het bedrag', async () => {
    // 0.1 + 0.2 is in JavaScript 0.30000000000000004. Ongeschonden doorgegeven
    // zou Mollie het bedrag weigeren en zou Stripe 30,000000000000004 cent
    // krijgen.
    expect(await mollieBedrag(0.1 + 0.2)).toBe('0.30');
    expect(await stripeCenten(0.1 + 0.2)).toBe('30');
    expect(await stripeCenten(1.1 * 3)).toBe('330');
  });

  it('rondt bij Stripe af op hele centen', async () => {
    expect(await stripeCenten(10.994)).toBe('1099');
    expect(await stripeCenten(10.996)).toBe('1100');
  });

  it('rondt een halve cent bij Mollie en Stripe niet altijd hetzelfde af', async () => {
    // BEVINDING - vastgelegd zoals het NU is. Mollie krijgt toFixed(2), Stripe
    // krijgt Math.round(bedrag * 100). Bij een derde decimaal van precies 5
    // lopen die twee uiteen, omdat de vermenigvuldiging met honderd zijn eigen
    // afrondingsruis toevoegt: dezelfde bestelling van 2,675 euro wordt bij
    // Mollie 2,67 en bij Stripe 2,68.
    //
    // Niet gerepareerd: zolang bedragen bovenstrooms in hele centen worden
    // gerekend - en dat doen de kaartprijzen - komt dit niet voor. Er een
    // gedeelde afrondingsregel van maken raakt beide providers tegelijk en
    // hoort een aparte, bewuste wijziging te zijn.
    expect(await mollieBedrag(2.675)).toBe('2.67');
    expect(await stripeCenten(2.675)).toBe('268');

    expect(await mollieBedrag(1.115)).toBe('1.11');
    expect(await stripeCenten(1.115)).toBe('112');

    // Bij 12,345 zijn ze het wel eens: beide ronden naar boven af.
    expect(await mollieBedrag(12.345)).toBe('12.35');
    expect(await stripeCenten(12.345)).toBe('1235');
  });

  it('laat een bedrag van nul ongewijzigd door', async () => {
    // De dienst controleert het bedrag niet; nul gaat gewoon de deur uit en
    // wordt door de betaaldienst geweigerd. Dat is bekend gedrag, geen
    // vangnet.
    expect(await mollieBedrag(0)).toBe('0.00');
    expect(await stripeCenten(0)).toBe('0');
  });

  it('laat een negatief bedrag ongewijzigd door', async () => {
    // BEVINDING - vastgelegd zoals het NU is. Deze dienst weigert een negatief
    // bedrag niet; hij stuurt '-10.00' respectievelijk '-1000' door. Mollie en
    // Stripe weigeren dat zelf, dus er ontstaat geen negatieve afschrijving,
    // maar een controle hoort thuis bij de aanroeper of hier - dat is een
    // bewuste keuze en geen bijvangst van een testronde.
    expect(await mollieBedrag(-10)).toBe('-10.00');
    expect(await stripeCenten(-10)).toBe('-1000');
  });

  it('maakt van een bedrag dat geen getal is geen stille nul', async () => {
    // NaN levert bij Mollie letterlijk 'NaN' op en bij Stripe 'NaN'. Beide
    // worden door de betaaldienst geweigerd. Belangrijk is vooral dat het
    // GEEN 0 of leeg veld wordt: een gratis kaart is erger dan een fout.
    expect(await mollieBedrag(Number.NaN)).toBe('NaN');
    expect(await stripeCenten(Number.NaN)).toBe('NaN');
  });
});

describe('Bedragen: centen terug naar euro', () => {
  it('rekent de centen van Stripe terug naar euro', async () => {
    netwerk(
      antwoord(200, {
        id: 'cs_1',
        payment_status: 'paid',
        amount_total: 1999,
        payment_method_types: ['ideal'],
        metadata: { order_id: 'b1' },
      }),
    );
    const { getPaymentStatus } = await laadBetalingen({ STRIPE_SECRET_KEY: STRIPE_SLEUTEL });

    const status = await getPaymentStatus('cs_1');

    expect(status?.amount).toBe(19.99);
    expect(status?.method).toBe('ideal');
    expect(status?.status).toBe('paid');
  });

  it('leest het bedrag van Mollie als euro', async () => {
    netwerk(
      antwoord(200, {
        id: 'tr_1',
        status: 'paid',
        amount: { value: '19.99', currency: 'EUR' },
        method: 'ideal',
        metadata: { order_id: 'b1' },
      }),
    );
    const { getPaymentStatus } = await laadBetalingen({ MOLLIE_API_KEY: MOLLIE_SLEUTEL });

    expect((await getPaymentStatus('tr_1'))?.amount).toBe(19.99);
  });

  it('komt heen en terug op hetzelfde bedrag uit', async () => {
    for (const bedrag of [0.01, 1, 12.5, 19.99, 99.95, 1234.56]) {
      const nep = netwerk(antwoord(200, { id: 'cs_1', url: 'https://stripe/checkout' }));
      const { createPayment } = await laadBetalingen({ STRIPE_SECRET_KEY: STRIPE_SLEUTEL });
      await createPayment({ orderId: 'b1', amount: bedrag, description: 'K', redirectUrl: 'x', webhookUrl: 'y' });
      const centen = Number(
        new URLSearchParams((nep.mock.calls[0][1] as RequestInit).body as string).get(
          'line_items[0][price_data][unit_amount]',
        ),
      );

      netwerk(
        antwoord(200, { id: 'cs_1', payment_status: 'paid', amount_total: centen, payment_method_types: ['card'] }),
      );
      const { getPaymentStatus } = await laadBetalingen({ STRIPE_SECRET_KEY: STRIPE_SLEUTEL });
      expect((await getPaymentStatus('cs_1'))?.amount, `bedrag ${bedrag}`).toBe(bedrag);
    }
  });

  it('vertaalt de betaalstatussen van Stripe', async () => {
    const gevallen: [string, string][] = [
      ['unpaid', 'pending'],
      ['paid', 'paid'],
      ['no_payment_required', 'paid'],
      // Onbekend hoort nooit betaald te betekenen.
      ['iets_nieuws', 'pending'],
    ];

    for (const [vanStripe, verwacht] of gevallen) {
      netwerk(antwoord(200, { id: 'cs_1', payment_status: vanStripe, amount_total: 100, payment_method_types: [] }));
      const { getPaymentStatus } = await laadBetalingen({ STRIPE_SECRET_KEY: STRIPE_SLEUTEL });
      expect((await getPaymentStatus('cs_1'))?.status, `Stripe-status ${vanStripe}`).toBe(verwacht);
    }
  });
});

// ============================================================
// 5. Wat er gebeurt als de betaaldienst hapert
// ============================================================

describe('Storingen bij het aanmaken van een betaling', () => {
  const aanvraag = {
    orderId: 'bestelling-1',
    amount: 25,
    description: 'Kaarten Nieuwjaarsconcert',
    redirectUrl: 'https://vereniging.nl/terug',
    webhookUrl: 'https://vereniging.nl/webhook',
  };

  it('meldt een fout wanneer Mollie een 500 geeft', async () => {
    netwerk(antwoord(500, 'Internal Server Error'));
    const { createPayment } = await laadBetalingen({ MOLLIE_API_KEY: MOLLIE_SLEUTEL });

    const resultaat = await createPayment(aanvraag);

    expect(resultaat).toEqual({ success: false, error: 'Failed to create payment' });
    expect(resultaat.checkoutUrl).toBeUndefined();
  });

  it('meldt een fout wanneer Mollie een 422 geeft', async () => {
    netwerk(antwoord(422, { detail: 'The amount is invalid' }));
    const { createPayment } = await laadBetalingen({ MOLLIE_API_KEY: MOLLIE_SLEUTEL });

    expect((await createPayment(aanvraag)).success).toBe(false);
  });

  it('meldt een fout wanneer het netwerk eruit ligt', async () => {
    netwerkStoring();
    const { createPayment } = await laadBetalingen({ MOLLIE_API_KEY: MOLLIE_SLEUTEL });

    expect(await createPayment(aanvraag)).toEqual({ success: false, error: 'Payment service unavailable' });
  });

  it('meldt een fout wanneer een traag verzoek wordt afgebroken', async () => {
    // Een afgebroken verzoek komt bij fetch terug als een afwijzing. Van
    // belang is dat er geen half resultaat uit komt.
    netwerkStoring(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }));
    const { createPayment } = await laadBetalingen({ MOLLIE_API_KEY: MOLLIE_SLEUTEL });

    expect((await createPayment(aanvraag)).success).toBe(false);
  });

  it('meldt een fout wanneer Mollie onzin teruggeeft in plaats van JSON', async () => {
    netwerk(antwoord(201, '<html>onderhoud</html>'));
    const { createPayment } = await laadBetalingen({ MOLLIE_API_KEY: MOLLIE_SLEUTEL });

    expect((await createPayment(aanvraag)).success).toBe(false);
  });

  it('meldt een fout wanneer Mollie geen betaallink meestuurt', async () => {
    netwerk(antwoord(201, { id: 'tr_1' }));
    const { createPayment } = await laadBetalingen({ MOLLIE_API_KEY: MOLLIE_SLEUTEL });

    // Zonder _links.checkout kan de koper nergens heen. Een 'geslaagde'
    // betaling zonder betaallink is erger dan een duidelijke fout.
    const resultaat = await createPayment(aanvraag);
    expect(resultaat.success).toBe(false);
  });

  it('meldt een fout wanneer Stripe een 500 geeft', async () => {
    netwerk(antwoord(500, 'Internal Server Error'));
    const { createPayment } = await laadBetalingen({ STRIPE_SECRET_KEY: STRIPE_SLEUTEL });

    expect(await createPayment(aanvraag)).toEqual({ success: false, error: 'Failed to create payment session' });
  });

  it('meldt een fout wanneer Stripe onbereikbaar is', async () => {
    netwerkStoring();
    const { createPayment } = await laadBetalingen({ STRIPE_SECRET_KEY: STRIPE_SLEUTEL });

    expect(await createPayment(aanvraag)).toEqual({ success: false, error: 'Payment service unavailable' });
  });

  it('stuurt de meegegeven metadata mee naar Stripe', async () => {
    const nep = netwerk(antwoord(200, { id: 'cs_1', url: 'https://stripe/checkout' }));
    const { createPayment } = await laadBetalingen({ STRIPE_SECRET_KEY: STRIPE_SLEUTEL });

    await createPayment({ ...aanvraag, metadata: { concert_name: 'Nieuwjaar', zaal: 'De Harmonie' } });

    const params = new URLSearchParams((nep.mock.calls[0][1] as RequestInit).body as string);
    expect(params.get('metadata[concert_name]')).toBe('Nieuwjaar');
    expect(params.get('metadata[zaal]')).toBe('De Harmonie');
    // Het bestelnummer staat er als eerste in en wordt niet overschreven: bij
    // URLSearchParams levert een tweede metadata[order_id] een tweede regel op,
    // en Stripe houdt de eerste aan.
    expect(params.getAll('metadata[order_id]')).toEqual(['bestelling-1']);
  });

  it('meldt een fout wanneer de sleutel ontbreekt terwijl de provider wel gekozen is', async () => {
    // Een lege sleutel telt niet als ingesteld, dus dit valt terug op de
    // nepprovider; met een sleutel van alleen spaties wel. Zo blijft zichtbaar
    // dat een half ingevulde omgeving niet stilzwijgend langs de kassa loopt.
    const nep = netwerk(antwoord(500, 'x'));
    const { createPayment, getPaymentProvider } = await laadBetalingen({ MOLLIE_API_KEY: ' ' });

    expect(getPaymentProvider()).toBe('mollie');
    expect((await createPayment(aanvraag)).success).toBe(false);
    expect(nep).toHaveBeenCalled();
  });

  it('zet geen tijdslimiet op het verzoek', async () => {
    const nep = netwerk(antwoord(201, { id: 'tr_1', _links: { checkout: { href: 'https://x' } } }));
    const { createPayment } = await laadBetalingen({ MOLLIE_API_KEY: MOLLIE_SLEUTEL });

    await createPayment(aanvraag);

    // BEVINDING - vastgelegd zoals het NU is. Er gaat geen AbortSignal mee,
    // dus een hangende betaaldienst houdt onze eigen aanvraag net zo lang
    // bezet, met een verbinding en een werker eraan vast. Niet gerepareerd:
    // een tijdslimiet raakt alle zes de verzoeken in deze dienst en hoort een
    // bewuste keuze te zijn, met een limiet die bij de betaalstroom past.
    const opties = nep.mock.calls[0][1] as RequestInit;
    expect(opties.signal).toBeUndefined();
  });

  it('stuurt de betaalwijze en de metadata mee naar Mollie', async () => {
    const nep = netwerk(antwoord(201, { id: 'tr_1', _links: { checkout: { href: 'https://x' } } }));
    const { createPayment } = await laadBetalingen({ MOLLIE_API_KEY: MOLLIE_SLEUTEL });

    await createPayment({ ...aanvraag, method: 'ideal', metadata: { concert_name: 'Nieuwjaar' } });

    const body = JSON.parse((nep.mock.calls[0][1] as RequestInit).body as string);
    expect(body.method).toBe('ideal');
    expect(body.metadata).toEqual({ order_id: 'bestelling-1', concert_name: 'Nieuwjaar' });
    expect(body.webhookUrl).toBe(aanvraag.webhookUrl);
  });

  it('laat het bestelnummer niet overschrijven door meegegeven metadata', async () => {
    const nep = netwerk(antwoord(201, { id: 'tr_1', _links: { checkout: { href: 'https://x' } } }));
    const { createPayment } = await laadBetalingen({ MOLLIE_API_KEY: MOLLIE_SLEUTEL });

    await createPayment({ ...aanvraag, metadata: { order_id: 'bestelling-van-aanvaller' } });

    // BEVINDING - vastgelegd zoals het NU is. De meegegeven metadata staan NA
    // order_id in het object, dus ze winnen. De aanroeper (routes/tickets.ts)
    // geeft alleen concert_name mee, dus dit is nu geen gat, maar het is een
    // valkuil voor de volgende aanroeper. Niet gerepareerd: de volgorde
    // omdraaien is een gedragswijziging in de geldstroom die apart afgewogen
    // hoort te worden.
    const body = JSON.parse((nep.mock.calls[0][1] as RequestInit).body as string);
    expect(body.metadata.order_id).toBe('bestelling-van-aanvaller');
  });

  it('stuurt het e-mailadres van de koper mee naar Stripe', async () => {
    const nep = netwerk(antwoord(200, { id: 'cs_1', url: 'https://stripe/checkout' }));
    const { createPayment } = await laadBetalingen({ STRIPE_SECRET_KEY: STRIPE_SLEUTEL });

    await createPayment({ ...aanvraag, customerEmail: 'koper@example.com' });

    const params = new URLSearchParams((nep.mock.calls[0][1] as RequestInit).body as string);
    expect(params.get('customer_email')).toBe('koper@example.com');
    expect(params.get('metadata[order_id]')).toBe('bestelling-1');
    expect(params.get('mode')).toBe('payment');
  });
});

describe('Storingen bij het opvragen van een status', () => {
  it('geeft null wanneer Mollie een storing heeft', async () => {
    netwerk(antwoord(503, 'Service Unavailable'));
    const { getPaymentStatus } = await laadBetalingen({ MOLLIE_API_KEY: MOLLIE_SLEUTEL });

    expect(await getPaymentStatus('tr_1')).toBeNull();
  });

  it('geeft null wanneer Stripe een storing heeft', async () => {
    netwerk(antwoord(503, 'Service Unavailable'));
    const { getPaymentStatus } = await laadBetalingen({ STRIPE_SECRET_KEY: STRIPE_SLEUTEL });

    expect(await getPaymentStatus('cs_1')).toBeNull();
  });

  it('geeft null wanneer het netwerk eruit ligt', async () => {
    netwerkStoring();
    const { getPaymentStatus } = await laadBetalingen({ STRIPE_SECRET_KEY: STRIPE_SLEUTEL });

    expect(await getPaymentStatus('cs_1')).toBeNull();
  });

  it('geeft null wanneer het antwoord geen JSON is', async () => {
    netwerk(antwoord(200, 'onderhoud'));
    const { getPaymentStatus } = await laadBetalingen({ STRIPE_SECRET_KEY: STRIPE_SLEUTEL });

    expect(await getPaymentStatus('cs_1')).toBeNull();
  });

  it('weigert een betaalkenmerk met vreemde tekens zonder het netwerk op te gaan', async () => {
    const nep = netwerk(antwoord(200, { id: 'cs_1', payment_status: 'paid', amount_total: 100 }));
    const { getPaymentStatus } = await laadBetalingen({ STRIPE_SECRET_KEY: STRIPE_SLEUTEL });

    expect(await getPaymentStatus('cs_1/../../account')).toBeNull();
    expect(await getPaymentStatus('cs 1')).toBeNull();
    expect(nep).not.toHaveBeenCalled();
  });

  it('weigert een betaalkenmerk langer dan vierenzestig tekens', async () => {
    const nep = netwerk(antwoord(200, { id: 'cs_1', payment_status: 'paid', amount_total: 100 }));
    const { getPaymentStatus } = await laadBetalingen({ STRIPE_SECRET_KEY: STRIPE_SLEUTEL });

    // BEVINDING - vastgelegd zoals het NU is. Stripe-sessiekenmerken zijn in de
    // praktijk lang (cs_test_ gevolgd door een lange reeks). Een kenmerk van
    // 65 tekens wordt hier geweigerd en levert stilzwijgend null op, wat in de
    // beheerweergave 'geen gegevens' oplevert en bij een terugbetaling
    // 'Refund service unavailable'. Niet gerepareerd: de grens verruimen raakt
    // een invoercontrole die er niet voor niets staat, en zonder een echt
    // Stripe-kenmerk naast me kan ik niet vaststellen welke grens klopt.
    expect(await getPaymentStatus(`cs_test_${'a'.repeat(57)}`)).toBeNull();
    expect(nep).not.toHaveBeenCalled();
  });
});

describe('Terugbetalingen', () => {
  it('vraagt bij Mollie een volledige terugbetaling aan', async () => {
    const nep = netwerk(antwoord(201, { id: 're_1' }));
    const { createRefund } = await laadBetalingen({ MOLLIE_API_KEY: MOLLIE_SLEUTEL });

    const resultaat = await createRefund({ paymentId: 'tr_1', reason: 'Concert afgelast' });

    expect(resultaat).toEqual({ success: true, refundId: 're_1' });
    expect(nep.mock.calls[0][0]).toBe('https://api.mollie.com/v2/payments/tr_1/refunds');
    const body = JSON.parse((nep.mock.calls[0][1] as RequestInit).body as string);
    expect(body.amount).toBeUndefined();
    expect(body.description).toBe('Concert afgelast');
  });

  it('vraagt bij Mollie een gedeeltelijke terugbetaling aan in euro', async () => {
    const nep = netwerk(antwoord(201, { id: 're_1' }));
    const { createRefund } = await laadBetalingen({ MOLLIE_API_KEY: MOLLIE_SLEUTEL });

    await createRefund({ paymentId: 'tr_1', amount: 12.5 });

    const body = JSON.parse((nep.mock.calls[0][1] as RequestInit).body as string);
    expect(body.amount).toEqual({ currency: 'EUR', value: '12.50' });
  });

  it('vraagt bij Stripe een gedeeltelijke terugbetaling aan in centen', async () => {
    const nep = netwerk(antwoord(200, { payment_intent: 'pi_1' }), antwoord(200, { id: 're_1' }));
    const { createRefund } = await laadBetalingen({ STRIPE_SECRET_KEY: STRIPE_SLEUTEL });

    const resultaat = await createRefund({ paymentId: 'cs_1', amount: 19.99 });

    expect(resultaat).toEqual({ success: true, refundId: 're_1' });
    const params = new URLSearchParams((nep.mock.calls[1][1] as RequestInit).body as string);
    expect(params.get('payment_intent')).toBe('pi_1');
    expect(params.get('amount')).toBe('1999');
  });

  it('maakt van een terugbetaling van nul euro een VOLLEDIGE terugbetaling', async () => {
    const nep = netwerk(antwoord(201, { id: 're_1' }));
    const { createRefund } = await laadBetalingen({ MOLLIE_API_KEY: MOLLIE_SLEUTEL });

    await createRefund({ paymentId: 'tr_1', amount: 0 });

    // BEVINDING - vastgelegd zoals het NU is. `if (request.amount)` is onwaar
    // bij 0, dus een verzoek om nul euro terug te betalen wordt een verzoek om
    // ALLES terug te betalen. De huidige aanroeper geeft nooit een bedrag mee,
    // dus dit is nu geen actief lek. Niet gerepareerd: welk gedrag hier goed
    // is - weigeren of nul doorsturen - is een keuze over de geldstroom.
    const body = JSON.parse((nep.mock.calls[0][1] as RequestInit).body as string);
    expect(body.amount).toBeUndefined();
  });

  it('geeft de reden bij Stripe door als de vaste reden requested_by_customer', async () => {
    const nep = netwerk(antwoord(200, { payment_intent: 'pi_1' }), antwoord(200, { id: 're_1' }));
    const { createRefund } = await laadBetalingen({ STRIPE_SECRET_KEY: STRIPE_SLEUTEL });

    await createRefund({ paymentId: 'cs_1', reason: 'Concert afgelast wegens storm' });

    // Stripe kent maar drie redenen, dus de tekst van de vereniging gaat hier
    // verloren. Bij Mollie komt die tekst wel als omschrijving mee. Vastgelegd
    // omdat het verschil in het overzicht van de penningmeester zichtbaar is.
    const params = new URLSearchParams((nep.mock.calls[1][1] as RequestInit).body as string);
    expect(params.get('reason')).toBe('requested_by_customer');
    expect((nep.mock.calls[1][1] as RequestInit).body).not.toContain('storm');
  });

  it('meldt geen succes wanneer Mollie de terugbetaling weigert', async () => {
    netwerk(antwoord(422, { detail: 'Amount exceeds remaining' }));
    const { createRefund } = await laadBetalingen({ MOLLIE_API_KEY: MOLLIE_SLEUTEL });

    expect(await createRefund({ paymentId: 'tr_1' })).toEqual({ success: false, error: 'Failed to create refund' });
  });

  it('meldt geen succes wanneer het netwerk eruit ligt bij Mollie', async () => {
    netwerkStoring();
    const { createRefund } = await laadBetalingen({ MOLLIE_API_KEY: MOLLIE_SLEUTEL });

    expect(await createRefund({ paymentId: 'tr_1' })).toEqual({
      success: false,
      error: 'Refund service unavailable',
    });
  });

  it('meldt geen succes wanneer de Stripe-sessie niet gevonden wordt', async () => {
    netwerk(antwoord(404, 'No such session'));
    const { createRefund } = await laadBetalingen({ STRIPE_SECRET_KEY: STRIPE_SLEUTEL });

    expect(await createRefund({ paymentId: 'cs_1' })).toEqual({ success: false, error: 'Session not found' });
  });

  it('meldt geen succes wanneer Stripe de terugbetaling weigert', async () => {
    netwerk(antwoord(200, { payment_intent: 'pi_1' }), antwoord(400, { error: 'charge_already_refunded' }));
    const { createRefund } = await laadBetalingen({ STRIPE_SECRET_KEY: STRIPE_SLEUTEL });

    // Dit is de tak die het duurst is als hij het verkeerd doet: de aanroeper
    // zet de bestelling op 'refunded' zodra success waar is.
    expect(await createRefund({ paymentId: 'cs_1' })).toEqual({ success: false, error: 'Failed to create refund' });
  });

  it('meldt geen succes wanneer Stripe onzin teruggeeft', async () => {
    netwerk(antwoord(200, 'onderhoud'));
    const { createRefund } = await laadBetalingen({ STRIPE_SECRET_KEY: STRIPE_SLEUTEL });

    expect((await createRefund({ paymentId: 'cs_1' })).success).toBe(false);
  });

  it('weigert een betaalkenmerk met padtekens bij een terugbetaling', async () => {
    const nep = netwerk(antwoord(201, { id: 're_1' }));
    const { createRefund } = await laadBetalingen({ MOLLIE_API_KEY: MOLLIE_SLEUTEL });

    const resultaat = await createRefund({ paymentId: '../refunds' });

    expect(nep).not.toHaveBeenCalled();
    expect(resultaat.success).toBe(false);
  });
});

// ============================================================
// 6. De sleutel per vereniging doet niet mee
// ============================================================

describe('De Mollie-sleutel komt uit de omgeving, niet uit payment_settings', () => {
  it('gebruikt bij elke aanroep de sleutel uit MOLLIE_API_KEY', async () => {
    const nep = netwerk(antwoord(201, { id: 'tr_1', _links: { checkout: { href: 'https://x' } } }));
    const { createPayment } = await laadBetalingen({ MOLLIE_API_KEY: MOLLIE_SLEUTEL });

    // BEVINDING - vastgelegd, niet gerepareerd. De tabel payment_settings
    // bewaart per vereniging een eigen (versleutelde) Mollie-sleutel, maar
    // deze dienst kent geen vereniging: geen enkele functie neemt een
    // association_id aan, en de sleutel komt uit process.env.MOLLIE_API_KEY.
    // In een opzet met meerdere verenigingen loopt het geld daarmee via een
    // en dezelfde rekening. Dit repareren betekent de sleutel per vereniging
    // opzoeken en ontsleutelen in elke aanroep - een grotere ingreep die
    // buiten deze testronde valt.
    await createPayment({ orderId: 'b1', amount: 10, description: 'K', redirectUrl: 'x', webhookUrl: 'y' });

    const opties = nep.mock.calls[0][1] as RequestInit;
    expect((opties.headers as Record<string, string>).Authorization).toBe(`Bearer ${MOLLIE_SLEUTEL}`);
  });

  it('valt zonder MOLLIE_API_KEY terug op de nepprovider, ook al staat er een sleutel in payment_settings', async () => {
    const nep = netwerk(antwoord(201, { id: 'tr_1', _links: { checkout: { href: 'https://x' } } }));
    const { createPayment, getPaymentProvider } = await laadBetalingen({ MOLLIE_API_KEY: undefined });

    // Er bestaat geen weg van payment_settings naar deze dienst: zonder de
    // omgevingsvariabele is er domweg geen provider.
    expect(getPaymentProvider()).toBeNull();
    const resultaat = await createPayment({
      orderId: 'b1',
      amount: 10,
      description: 'K',
      redirectUrl: 'x',
      webhookUrl: 'y',
    });
    expect(resultaat.paymentId).toMatch(/^mock_/);
    expect(nep).not.toHaveBeenCalled();
  });

  it('stuurt de Stripe-sleutel als basisauthenticatie mee', async () => {
    const nep = netwerk(antwoord(200, { id: 'cs_1', url: 'https://stripe/checkout' }));
    const { createPayment } = await laadBetalingen({ STRIPE_SECRET_KEY: STRIPE_SLEUTEL });

    await createPayment({ orderId: 'b1', amount: 10, description: 'K', redirectUrl: 'x', webhookUrl: 'y' });

    const opties = nep.mock.calls[0][1] as RequestInit;
    const kop = (opties.headers as Record<string, string>).Authorization;
    expect(Buffer.from(kop.replace('Basic ', ''), 'base64').toString()).toBe(`${STRIPE_SLEUTEL}:`);
  });
});
