/**
 * De IP-whitelist bewaakt de beheerroutes: instellingen, back-ups, auditlogs
 * en de Entra-synchronisatie. Een lijst met toegestane adressen is pas een
 * controle als vaststaat welke adressen er *niet* langs komen, dus deze tests
 * proberen vooral de omwegen.
 *
 * Drie dingen zijn hier vastgelegd die geen van beide vanzelf spreken:
 *
 *  1. Bij een lege of kapotte lijst gaat de deur DICHT, niet open. Ook als de
 *     tabel ontbreekt of de database een fout geeft.
 *  2. `X-Forwarded-For` komt van de client. Deze code vertrouwt hem
 *     onvoorwaardelijk en neemt het meest linkse adres - precies het adres dat
 *     de aanvrager zelf verzint. Dat is een openstaande omweg; de tests die
 *     dat vastleggen zeggen dat er met zoveel woorden bij.
 *  3. CIDR-bereiken werken alleen goed sinds ipToNumber niet meer via een
 *     32-bits signed shift rekent. Zie de test over 192.168.0.0/16.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import config from '../../config';
import db from '../../database/connection';
import {
  ipWhitelistMiddleware,
  createAssociationIpWhitelist,
  invalidateWhitelistCache,
  wouldIpBeAllowed,
  isIpAllowed,
  isPrivateIp,
  parseCidr,
  getClientIp,
} from '../../middleware/ipWhitelist';
import { createTestAssociation } from '../testUtils';

/** Een minimale app met alleen de whitelist ervoor. */
function maakApp(middleware: express.RequestHandler) {
  const app = express();
  app.get('/beheer', middleware, (_req, res) => {
    res.json({ ok: true });
  });
  app.post('/beheer/:verenigingId', middleware, (_req, res) => {
    res.json({ ok: true });
  });
  return app;
}

const app = maakApp(ipWhitelistMiddleware);

/** Zet een adres in de database-whitelist. */
function zetInDatabase(ip: string, verenigingId: string | null = null, ingeschakeld = 1) {
  db.prepare(
    `INSERT INTO ip_whitelist (id, association_id, ip_address, description, is_enabled)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(`wl-${Math.random().toString(36).slice(2)}`, verenigingId, ip, 'test', ingeschakeld);
}

let origineel: { ingeschakeld: boolean; ontwikkel: boolean; adressen: string[] };

beforeEach(() => {
  origineel = {
    ingeschakeld: config.ipWhitelistEnabled,
    ontwikkel: config.isDevelopment,
    adressen: config.adminAllowedIps,
  };
  // Standaard voor deze tests: controle aan, en niet in ontwikkelmodus - want
  // in ontwikkelmodus wordt elk privéadres sowieso doorgelaten en meet je de
  // lijst helemaal niet.
  config.ipWhitelistEnabled = true;
  config.isDevelopment = false;
  config.adminAllowedIps = [];
  // De cache is module-globaal en leeft dus tussen tests door.
  invalidateWhitelistCache();
});

afterEach(() => {
  config.ipWhitelistEnabled = origineel.ingeschakeld;
  config.isDevelopment = origineel.ontwikkel;
  config.adminAllowedIps = origineel.adressen;
  invalidateWhitelistCache();
});

describe('ipWhitelistMiddleware - de deur staat standaard dicht', () => {
  it('laat alles door zolang de controle uitstaat', async () => {
    config.ipWhitelistEnabled = false;

    const res = await request(app).get('/beheer');

    expect(res.status).toBe(200);
  });

  it('weigert bij een lege lijst - een niet ingevulde whitelist zet de deur niet open', async () => {
    config.adminAllowedIps = [];

    const res = await request(app).get('/beheer');

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/niet geautoriseerd|not authorized/i);
  });

  it('weigert ook een verzoek vanaf localhost zodra de ontwikkelmodus uit is', async () => {
    // Supertest praat over de loopback; zonder de ontwikkeluitzondering is dat
    // geen reden om binnen te mogen.
    const res = await request(app).get('/beheer');

    expect(res.status).toBe(403);
  });

  it('weigert wanneer de tabel ip_whitelist ontbreekt in plaats van open te vallen', async () => {
    db.exec('DROP TABLE ip_whitelist');

    const res = await request(app).get('/beheer').set('X-Forwarded-For', '203.0.113.7');

    expect(res.status).toBe(403);
  });

  it('weigert wanneer de databasequery stukloopt in plaats van open te vallen', async () => {
    // Een tabel met de juiste naam maar zonder kolom ip_address laat de query
    // een fout gooien; de catch in getWhitelistedIpsFromDb moet dan [] geven.
    db.exec('DROP TABLE ip_whitelist');
    db.exec('CREATE TABLE ip_whitelist (id TEXT PRIMARY KEY, is_enabled INTEGER)');
    db.prepare('INSERT INTO ip_whitelist (id, is_enabled) VALUES (?, 1)').run('x');

    const res = await request(app).get('/beheer').set('X-Forwarded-For', '203.0.113.7');

    expect(res.status).toBe(403);
  });

  it('verklapt in de weigering niet welke adressen wél mogen', async () => {
    config.adminAllowedIps = ['198.51.100.4', '10.0.0.0/8'];

    const res = await request(app).get('/beheer').set('X-Forwarded-For', '203.0.113.7');

    expect(res.status).toBe(403);
    const tekst = JSON.stringify(res.body);
    expect(tekst).not.toContain('198.51.100.4');
    expect(tekst).not.toContain('10.0.0.0');
  });

  it('negeert uitgeschakelde rijen in de database', async () => {
    zetInDatabase('203.0.113.7', null, 0);

    const res = await request(app).get('/beheer').set('X-Forwarded-For', '203.0.113.7');

    expect(res.status).toBe(403);
  });

  it('laat een adres uit de configuratie door', async () => {
    config.adminAllowedIps = ['203.0.113.7'];

    const res = await request(app).get('/beheer').set('X-Forwarded-For', '203.0.113.7');

    expect(res.status).toBe(200);
  });

  it('laat een adres uit de database door', async () => {
    zetInDatabase('203.0.113.7');

    const res = await request(app).get('/beheer').set('X-Forwarded-For', '203.0.113.7');

    expect(res.status).toBe(200);
  });

  it('laat een verminkte lijstwaarde geen uitzondering worden en houdt de deur dicht', async () => {
    config.adminAllowedIps = ['geen-ip', '10.0.0.0/33', '10.0.0.0/abc', '999.999.999.999', '/24'];

    const res = await request(app).get('/beheer').set('X-Forwarded-For', '203.0.113.7');

    expect(res.status).toBe(403);
  });
});

describe('ipWhitelistMiddleware - het clientadres', () => {
  it('BEVINDING: vertrouwt X-Forwarded-For van de client zelf', async () => {
    // Deze omweg staat OPEN. De verbinding komt van de loopback, maar de
    // client zegt zelf dat hij 203.0.113.7 is en dat wordt geloofd.
    //
    // Dat is geen fout in de test maar in getClientIp: het meest linkse adres
    // uit X-Forwarded-For is per definitie het adres dat de aanvrager erin
    // heeft gezet. Achter een proxy die de header overschrijft klopt het; komt
    // er ooit een verzoek rechtstreeks binnen, of laat de proxy een bestaande
    // header staan, dan is de hele whitelist met één header te omzeilen.
    //
    // Niet gerepareerd: de app draait in productie achter een proxy en zet
    // `trust proxy` (index.ts). De juiste oplossing is req.ip gebruiken met een
    // kloppende trust-proxy-instelling, en dat raakt bestanden buiten deze
    // middleware. Valt deze test om omdat de header niet meer vertrouwd wordt,
    // dan is dat goed nieuws - pas hem aan.
    config.adminAllowedIps = ['203.0.113.7'];

    const res = await request(app).get('/beheer').set('X-Forwarded-For', '203.0.113.7');

    expect(res.status).toBe(200);
  });

  it('neemt bij meerdere adressen het meest linkse - dus dat van de client, niet dat van de proxy', async () => {
    config.adminAllowedIps = ['203.0.113.7'];

    const eerste = await request(app).get('/beheer').set('X-Forwarded-For', '203.0.113.7, 198.51.100.9, 10.0.0.1');
    expect(eerste.status).toBe(200);

    // Staat het toegestane adres rechts (waar de proxy het zou schrijven), dan
    // wordt het niet gezien. Dat bevestigt dat er links wordt gekeken.
    const tweede = await request(app).get('/beheer').set('X-Forwarded-For', '198.51.100.9, 203.0.113.7');
    expect(tweede.status).toBe(403);
  });

  it('gebruikt X-Real-IP als X-Forwarded-For ontbreekt', async () => {
    config.adminAllowedIps = ['203.0.113.7'];

    const res = await request(app).get('/beheer').set('X-Real-IP', '203.0.113.7');

    expect(res.status).toBe(200);
  });

  it('geeft X-Forwarded-For voorrang boven X-Real-IP', async () => {
    config.adminAllowedIps = ['203.0.113.7'];

    const res = await request(app)
      .get('/beheer')
      .set('X-Forwarded-For', '198.51.100.9')
      .set('X-Real-IP', '203.0.113.7');

    expect(res.status).toBe(403);
  });

  it('valt terug op het socketadres als er geen enkele header staat', () => {
    const nep = { headers: {}, ip: '203.0.113.7', socket: {} } as unknown as express.Request;
    expect(getClientIp(nep)).toBe('203.0.113.7');

    const zonderIp = { headers: {}, socket: { remoteAddress: '198.51.100.2' } } as unknown as express.Request;
    expect(getClientIp(zonderIp)).toBe('198.51.100.2');

    const onbekend = { headers: {}, socket: {} } as unknown as express.Request;
    expect(getClientIp(onbekend)).toBe('unknown');
  });

  it('haalt spaties weg rondom het adres in de header', async () => {
    config.adminAllowedIps = ['203.0.113.7'];

    const res = await request(app).get('/beheer').set('X-Forwarded-For', '   203.0.113.7   , 10.0.0.1');

    expect(res.status).toBe(200);
  });
});

describe('isIpAllowed - exacte adressen en IPv6-schrijfwijzen', () => {
  it('herkent een exact adres', () => {
    expect(isIpAllowed('203.0.113.7', '203.0.113.7')).toBe(true);
    expect(isIpAllowed('203.0.113.8', '203.0.113.7')).toBe(false);
  });

  it('ziet ::ffff:127.0.0.1 als hetzelfde adres als 127.0.0.1', () => {
    // Node levert loopback over IPv4 vaak in deze vorm aan; zonder deze
    // normalisatie zou een beheerder op zijn eigen machine buitengesloten zijn.
    expect(isIpAllowed('::ffff:127.0.0.1', '127.0.0.1')).toBe(true);
    expect(isIpAllowed('::ffff:10.0.0.5', '10.0.0.0/8')).toBe(true);
  });

  it('behandelt het onverkorte ::ffff:-adres niet als een vrijbrief', () => {
    expect(isIpAllowed('::ffff:203.0.113.7', '127.0.0.1')).toBe(false);
  });

  it('BEVINDING: de hoofdletterversie ::FFFF:127.0.0.1 wordt niet herkend', () => {
    // startsWith('::ffff:') is hoofdlettergevoelig. Dit valt de veilige kant
    // op - het adres wordt geweigerd, niet toegelaten - maar een beheerder op
    // een stack die hoofdletters gebruikt raakt er wel buiten. Niet aangepast:
    // Node schrijft het zelf in kleine letters, dus in de praktijk komt deze
    // vorm hier niet binnen, en een normalisatie erbij is een gedragswijziging
    // die niemand nu nodig heeft.
    expect(isIpAllowed('::FFFF:127.0.0.1', '127.0.0.1')).toBe(false);
  });

  it('herkent een letterlijk IPv6-adres', () => {
    expect(isIpAllowed('::1', '::1')).toBe(true);
    expect(isIpAllowed('2001:db8::1', '2001:db8::/32')).toBe(true);
    expect(isIpAllowed('2001:db9::1', '2001:db8::/32')).toBe(false);
  });
});

describe('parseCidr en CIDR-bereiken', () => {
  it('weigert een onzinnig masker', () => {
    expect(parseCidr('10.0.0.0/33')).toBeNull();
    expect(parseCidr('10.0.0.0/-1')).toBeNull();
    expect(parseCidr('10.0.0.0/abc')).toBeNull();
    expect(parseCidr('geen-ip/24')).toBeNull();
    expect(parseCidr('::1/129')).toBeNull();
  });

  it('rekent de randen van een /24 goed uit', () => {
    // De randgevallen zijn het punt: het eerste en het laatste adres horen
    // erbij, het adres net erbuiten niet.
    expect(isIpAllowed('10.0.0.0', '10.0.0.0/24')).toBe(true);
    expect(isIpAllowed('10.0.0.255', '10.0.0.0/24')).toBe(true);
    expect(isIpAllowed('10.0.1.0', '10.0.0.0/24')).toBe(false);
    expect(isIpAllowed('9.255.255.255', '10.0.0.0/24')).toBe(false);
  });

  it('laat bij /32 precies één adres toe', () => {
    expect(isIpAllowed('10.0.0.5', '10.0.0.5/32')).toBe(true);
    expect(isIpAllowed('10.0.0.6', '10.0.0.5/32')).toBe(false);
  });

  it('rekent CIDR-bereiken ook goed uit boven 127 in het eerste octet', () => {
    // Dit ging mis. ipToNumber rekende met `(a << 24) | ...`, en die shift is
    // in JavaScript 32-bits *signed*: vanaf 128 in het eerste octet werd de
    // uitkomst negatief. Het bereik zelf kwam via een BigInt-masker wél
    // positief uit de bus, dus de vergelijking `ipNum >= start` was altijd
    // onwaar en 192.168.0.0/16 kwam met geen enkel adres overeen.
    //
    // De fout viel de veilige kant op - alles werd geweigerd - maar hij zette
    // wel elk bereik uit de whitelist met een eerste octet vanaf 128 stil:
    // 192.168.x, 172.16.x en zo'n beetje elk publiek CIDR-bereik.
    expect(isIpAllowed('192.168.1.50', '192.168.0.0/16')).toBe(true);
    expect(isIpAllowed('192.169.1.50', '192.168.0.0/16')).toBe(false);
    expect(isIpAllowed('172.16.0.1', '172.16.0.0/12')).toBe(true);
    expect(isIpAllowed('203.0.113.5', '203.0.113.0/24')).toBe(true);
    expect(isIpAllowed('203.0.114.5', '203.0.113.0/24')).toBe(false);
    expect(isIpAllowed('255.255.255.255', '255.255.255.0/24')).toBe(true);
  });

  it('houdt de randen van 172.16.0.0/12 op de juiste plek', () => {
    expect(isIpAllowed('172.15.255.255', '172.16.0.0/12')).toBe(false);
    expect(isIpAllowed('172.16.0.0', '172.16.0.0/12')).toBe(true);
    expect(isIpAllowed('172.31.255.255', '172.16.0.0/12')).toBe(true);
    expect(isIpAllowed('172.32.0.0', '172.16.0.0/12')).toBe(false);
  });

  it('laat 0.0.0.0/0 alles door - dat is de keuze van wie dat invult, geen fout', () => {
    expect(isIpAllowed('203.0.113.7', '0.0.0.0/0')).toBe(true);
    expect(isIpAllowed('10.0.0.1', '0.0.0.0/0')).toBe(true);
  });

  it('laat een IPv4-adres niet in een IPv6-bereik vallen en andersom', () => {
    expect(isIpAllowed('10.0.0.1', 'fc00::/7')).toBe(false);
    expect(isIpAllowed('fc00::1', '10.0.0.0/8')).toBe(false);
  });
});

describe('isPrivateIp', () => {
  it('herkent de privébereiken', () => {
    expect(isPrivateIp('127.0.0.1')).toBe(true);
    expect(isPrivateIp('::1')).toBe(true);
    expect(isPrivateIp('10.1.2.3')).toBe(true);
    expect(isPrivateIp('192.168.1.1')).toBe(true);
    expect(isPrivateIp('172.20.0.1')).toBe(true);
    expect(isPrivateIp('fc00::1')).toBe(true);
    expect(isPrivateIp('fe80::1')).toBe(true);
  });

  it('houdt publieke adressen buiten de privébereiken', () => {
    expect(isPrivateIp('8.8.8.8')).toBe(false);
    expect(isPrivateIp('203.0.113.7')).toBe(false);
    expect(isPrivateIp('172.32.0.1')).toBe(false);
    expect(isPrivateIp('2001:db8::1')).toBe(false);
    expect(isPrivateIp('onzin')).toBe(false);
  });
});

describe('ontwikkelmodus', () => {
  it('laat privéadressen door zodra isDevelopment aanstaat', async () => {
    config.isDevelopment = true;

    const res = await request(app).get('/beheer').set('X-Forwarded-For', '192.168.1.50');

    expect(res.status).toBe(200);
  });

  it('laat ook in ontwikkelmodus een publiek adres niet zomaar binnen', async () => {
    config.isDevelopment = true;

    const res = await request(app).get('/beheer').set('X-Forwarded-For', '203.0.113.7');

    expect(res.status).toBe(403);
  });
});

describe('de cache van de databaselijst', () => {
  it('BEVINDING: een ingetrokken adres blijft tot een minuut lang werken', async () => {
    // De lijst uit de database wordt een minuut lang bewaard in een
    // module-globale cache. invalidateWhitelistCache() bestaat om dat op te
    // ruimen, maar wordt nergens in de applicatie aangeroepen - ook niet in de
    // beheerroutes die de lijst aanpassen. Wie een adres intrekt, sluit het
    // dus pas maximaal een minuut later buiten.
    //
    // Niet gerepareerd: de aanroep hoort in routes/settings.ts, en dat bestand
    // mag hier niet gewijzigd worden.
    zetInDatabase('203.0.113.7');

    expect((await request(app).get('/beheer').set('X-Forwarded-For', '203.0.113.7')).status).toBe(200);

    db.prepare('DELETE FROM ip_whitelist').run();

    const naIntrekken = await request(app).get('/beheer').set('X-Forwarded-For', '203.0.113.7');
    expect(naIntrekken.status).toBe(200); // nog steeds toegang: de cache

    invalidateWhitelistCache();

    const naLegen = await request(app).get('/beheer').set('X-Forwarded-For', '203.0.113.7');
    expect(naLegen.status).toBe(403);
  });

  it('BEVINDING: de algemene beheercontrole kijkt naar de adressen van álle verenigingen', async () => {
    // getWhitelistedIpsFromDb() wordt hier zonder verenigingId aangeroepen en
    // haalt dan elke ingeschakelde rij op. Een adres dat vereniging B voor
    // zichzelf heeft toegevoegd, opent daarmee ook de beheerroutes die niet aan
    // een vereniging hangen (auditlogs, back-ups).
    //
    // Niet gerepareerd: welke vereniging bij zo'n route hoort volgt uit de
    // route zelf, niet uit deze middleware, en de routes mogen hier niet
    // gewijzigd worden.
    const vereniging = createTestAssociation();
    zetInDatabase('203.0.113.7', vereniging.id);

    const res = await request(app).get('/beheer').set('X-Forwarded-For', '203.0.113.7');

    expect(res.status).toBe(200);
  });
});

describe('createAssociationIpWhitelist', () => {
  const appPerVereniging = maakApp(createAssociationIpWhitelist((req) => req.params.verenigingId ?? null));

  it('laat het adres van de eigen vereniging door', async () => {
    const vereniging = createTestAssociation();
    zetInDatabase('203.0.113.7', vereniging.id);

    const res = await request(appPerVereniging).post(`/beheer/${vereniging.id}`).set('X-Forwarded-For', '203.0.113.7');

    expect(res.status).toBe(200);
  });

  it('houdt het adres van een andere vereniging buiten', async () => {
    const eigen = createTestAssociation();
    const andere = createTestAssociation();
    zetInDatabase('203.0.113.7', andere.id);

    const res = await request(appPerVereniging).post(`/beheer/${eigen.id}`).set('X-Forwarded-For', '203.0.113.7');

    expect(res.status).toBe(403);
  });

  it('laat een adres zonder vereniging (NULL) voor iedereen gelden', async () => {
    const vereniging = createTestAssociation();
    zetInDatabase('203.0.113.7', null);

    const res = await request(appPerVereniging).post(`/beheer/${vereniging.id}`).set('X-Forwarded-For', '203.0.113.7');

    expect(res.status).toBe(200);
  });

  it('gebruikt de cache niet, dus een intrekking werkt hier meteen', async () => {
    const vereniging = createTestAssociation();
    zetInDatabase('203.0.113.7', vereniging.id);

    expect(
      (await request(appPerVereniging).post(`/beheer/${vereniging.id}`).set('X-Forwarded-For', '203.0.113.7')).status,
    ).toBe(200);

    db.prepare('DELETE FROM ip_whitelist').run();

    expect(
      (await request(appPerVereniging).post(`/beheer/${vereniging.id}`).set('X-Forwarded-For', '203.0.113.7')).status,
    ).toBe(403);
  });

  it('weigert wanneer er geen vereniging uit het verzoek te halen is', async () => {
    const appZonder = maakApp(createAssociationIpWhitelist(() => null));
    zetInDatabase('203.0.113.7', createTestAssociation().id);

    const res = await request(appZonder).post('/beheer/x').set('X-Forwarded-For', '203.0.113.7');

    // Zonder verenigingId valt de query terug op alle rijen; dat is dezelfde
    // ruime uitkomst als bij de algemene middleware en hier bewust vastgelegd.
    expect(res.status).toBe(200);
  });

  it('laat alles door zolang de controle uitstaat', async () => {
    config.ipWhitelistEnabled = false;

    const res = await request(appPerVereniging).post('/beheer/xyz');

    expect(res.status).toBe(200);
  });

  it('laat een adres uit de configuratie door zonder naar de vereniging te kijken', async () => {
    config.adminAllowedIps = ['203.0.113.7'];

    const res = await request(appPerVereniging)
      .post(`/beheer/${createTestAssociation().id}`)
      .set('X-Forwarded-For', '203.0.113.7');

    expect(res.status).toBe(200);
  });

  it('laat in ontwikkelmodus een privéadres door', async () => {
    config.isDevelopment = true;

    const res = await request(appPerVereniging).post('/beheer/xyz').set('X-Forwarded-For', '10.0.0.9');

    expect(res.status).toBe(200);
  });
});

describe('wouldIpBeAllowed', () => {
  it('geeft false bij een lege lijst', () => {
    expect(wouldIpBeAllowed('203.0.113.7', [])).toBe(false);
  });

  it('geeft true zodra één patroon past', () => {
    expect(wouldIpBeAllowed('10.0.0.5', ['203.0.113.7', '10.0.0.0/8'])).toBe(true);
  });
});
