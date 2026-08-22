/**
 * In .github/codeql-config.yml staat `js/missing-token-validation` uit, met
 * als redenering dat de CSRF-bescherming hier zelfgebouwd is en de scanner
 * alleen csurf en lusca herkent. Zo'n onderdrukking is alleen te verdedigen
 * als de zelfbouw ook echt doet wat csurf zou doen. Deze tests leggen dat vast.
 *
 * De kern van de bescherming: het token moet in een *header* meekomen en wordt
 * vergeleken met wat de server heeft opgeslagen. Een aanvaller op een vreemde
 * site kan de browser wel een verzoek laten sturen (en daarbij automatisch
 * cookies laten meesturen), maar geen eigen header zetten zonder dat de
 * browser eerst een preflight doet die deze server niet goedkeurt. Daarom is
 * de test "alleen de cookie meesturen wordt geweigerd" de belangrijkste van
 * dit bestand: zou de cookie alleen al volstaan, dan was de bescherming nul.
 *
 * Wat hier NIET dicht zit staat als BEVINDING gemarkeerd.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import config from '../../config';
import { csrfTokenMiddleware, validateCsrfToken, getCsrfToken, addCsrfExemptRoute } from '../../middleware/csrf';

/** Dezelfde volgorde als index.ts: eerst het token zetten, dan controleren. */
function maakApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(csrfTokenMiddleware);
  app.use(validateCsrfToken);
  app.get('/api/csrf-token', getCsrfToken);
  app.use((req, res) => {
    res.json({ ok: true, pad: req.path });
  });
  return app;
}

/** Alleen de controle, zonder de middleware die een token aanmaakt. */
function maakAppZonderTokenmiddleware() {
  const app = express();
  app.use(cookieParser());
  app.use(validateCsrfToken);
  app.use((_req, res) => {
    res.json({ ok: true });
  });
  return app;
}

const app = maakApp();

/**
 * Het token hangt aan IP + User-Agent (zie getClientId). Het IP is in een test
 * altijd de loopback, dus een unieke User-Agent per test is wat één "client"
 * van een andere scheidt.
 */
let teller = 0;
function nieuweClient(): string {
  teller += 1;
  return `test-client-${teller}`;
}

/** De csrf-cookie uit een set-cookie-header, of een duidelijke fout als hij ontbreekt. */
function csrfCookie(koppen: string[] | undefined): string {
  const cookie = (koppen ?? []).find((c) => c.startsWith(config.csrfCookieName));
  if (!cookie) throw new Error('geen csrf-cookie in het antwoord');
  return cookie;
}

/** Haal een geldig token op zoals de frontend dat doet. */
async function haalToken(client: string): Promise<string> {
  const res = await request(app).get('/iets').set('User-Agent', client);
  return res.headers['x-csrf-token'];
}

let origineelIngeschakeld: boolean;
let origineelProductie: boolean;

beforeEach(() => {
  origineelIngeschakeld = config.csrfEnabled;
  origineelProductie = config.isProduction;
  config.csrfEnabled = true;
});

afterEach(() => {
  config.csrfEnabled = origineelIngeschakeld;
  config.isProduction = origineelProductie;
});

describe('lezende methodes zijn vrij', () => {
  it.each(['get', 'head'] as const)('laat %s zonder token door', async (methode) => {
    const res = await request(app)[methode]('/api/leden').set('User-Agent', nieuweClient());

    expect(res.status).toBe(200);
  });

  it('laat OPTIONS zonder token door, want dat is de preflight zelf', async () => {
    const res = await request(app).options('/api/leden').set('User-Agent', nieuweClient());

    expect(res.status).toBe(200);
  });
});

describe('schrijvende methodes zonder geldig token', () => {
  it.each(['post', 'put', 'patch', 'delete'] as const)('weigert %s zonder token', async (methode) => {
    const res = await request(app)[methode]('/api/leden').set('User-Agent', nieuweClient());

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/csrf/i);
  });

  it('weigert een verkeerd token van de juiste vorm', async () => {
    const client = nieuweClient();
    await haalToken(client);

    const res = await request(app).post('/api/leden').set('User-Agent', client).set('x-csrf-token', 'a'.repeat(64));

    expect(res.status).toBe(403);
  });

  it('weigert een leeg token', async () => {
    const client = nieuweClient();
    await haalToken(client);

    const res = await request(app).post('/api/leden').set('User-Agent', client).set('x-csrf-token', '');

    expect(res.status).toBe(403);
  });

  it('weigert een token dat een andere lengte heeft zonder onderuit te gaan', async () => {
    const client = nieuweClient();
    await haalToken(client);

    const res = await request(app).post('/api/leden').set('User-Agent', client).set('x-csrf-token', 'kort');

    expect(res.status).toBe(403);
  });

  it('weigert het token van een andere client', async () => {
    const clientA = nieuweClient();
    const clientB = nieuweClient();
    const tokenVanA = await haalToken(clientA);
    await haalToken(clientB);

    const res = await request(app).post('/api/leden').set('User-Agent', clientB).set('x-csrf-token', tokenVanA);

    expect(res.status).toBe(403);
  });

  it('weigert het token wanneer er alleen een stukje van klopt', async () => {
    const client = nieuweClient();
    const token = await haalToken(client);

    const res = await request(app)
      .post('/api/leden')
      .set('User-Agent', client)
      .set('x-csrf-token', token.slice(0, -1) + (token.endsWith('0') ? '1' : '0'));

    expect(res.status).toBe(403);
  });

  it('meldt bij een onbekende client dat het token ontbreekt', async () => {
    // Deze tak is alleen bereikbaar zonder csrfTokenMiddleware ervoor. In
    // index.ts staat die er wél voor, dus in de draaiende applicatie krijgt
    // niemand deze melding ooit te zien - hij maakt eerst een token aan en de
    // controle valt daarna op "ongeldig". Geen gat, wel goed om te weten.
    const res = await request(maakAppZonderTokenmiddleware()).post('/api/leden').set('User-Agent', nieuweClient());

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/ontbreekt|missing/i);
  });
});

describe('de cookie alleen is niet genoeg', () => {
  it('weigert een verzoek dat alleen de csrf-cookie meestuurt', async () => {
    // Dit is de aanval zelf: een formulier op een vreemde site laat de browser
    // posten, en de browser stuurt de cookie vanzelf mee. Zonder de header
    // moet dat stuklopen, anders is de bescherming er niet.
    const client = nieuweClient();
    const token = await haalToken(client);

    const res = await request(app)
      .post('/api/leden')
      .set('User-Agent', client)
      .set('Cookie', `${config.csrfCookieName}=${token}`);

    expect(res.status).toBe(403);
  });

  it('weigert ook wanneer de cookie klopt en de header iets anders zegt', async () => {
    const client = nieuweClient();
    const token = await haalToken(client);

    const res = await request(app)
      .post('/api/leden')
      .set('User-Agent', client)
      .set('Cookie', `${config.csrfCookieName}=${token}`)
      .set('x-csrf-token', 'b'.repeat(64));

    expect(res.status).toBe(403);
  });

  it('laat het verzoek door met de header, ook zónder cookie', async () => {
    const client = nieuweClient();
    const token = await haalToken(client);

    const res = await request(app).post('/api/leden').set('User-Agent', client).set('x-csrf-token', token);

    expect(res.status).toBe(200);
  });
});

describe('een geldig token komt erdoor', () => {
  it.each(['post', 'put', 'patch', 'delete'] as const)('laat %s met het juiste token door', async (methode) => {
    const client = nieuweClient();
    const token = await haalToken(client);

    const res = await request(app)[methode]('/api/leden').set('User-Agent', client).set('x-csrf-token', token);

    expect(res.status).toBe(200);
  });

  it('trekt zich niets aan van de hoofdletters in de headernaam', async () => {
    const client = nieuweClient();
    const token = await haalToken(client);

    const res = await request(app).post('/api/leden').set('User-Agent', client).set('X-CSRF-TOKEN', token);

    expect(res.status).toBe(200);
  });

  it('weigert wanneer de header twee keer wordt meegestuurd', async () => {
    // Node plakt dubbele headers aan elkaar met een komma; dat is geen geldig
    // token meer. Belangrijk dat dat weigert en niet stiekem op het eerste
    // deel matcht.
    const client = nieuweClient();
    const token = await haalToken(client);

    const res = await request(app)
      .post('/api/leden')
      .set('User-Agent', client)
      .set('x-csrf-token', `${token}, ${token}`);

    expect(res.status).toBe(403);
  });

  it('BEVINDING: het token hangt aan IP en User-Agent, niet aan de gebruiker', async () => {
    // getClientId is sha256(ip + user-agent). Twee verschillende ingelogde
    // leden achter hetzelfde adres met dezelfde browser krijgen dus hetzelfde
    // token, en het token van de een werkt voor het verzoek van de ander.
    // Hieronder is de "sessie" compleet anders (andere cookies), en toch komt
    // het token erdoor.
    //
    // Voor CSRF is dat geen open deur: de aanvaller moet het token nog steeds
    // in een header krijgen, en dat kan een vreemde site niet. Het scheelt wel
    // in diepte: bindt het token aan de sessie, dan helpt een gelekt token van
    // een buurman niet meer. Niet gerepareerd - dat vraagt een sessiebegrip dat
    // deze applicatie (JWT in de header) niet heeft.
    const client = nieuweClient();
    const token = await haalToken(client);

    const res = await request(app)
      .post('/api/leden')
      .set('User-Agent', client)
      .set('Cookie', 'iets_heel_anders=1')
      .set('x-csrf-token', token);

    expect(res.status).toBe(200);
  });
});

describe('de vergelijking van het token', () => {
  it('vergelijkt tijdsonafhankelijk', () => {
    // Een gewone `!==` op een geheim stopt bij het eerste verschillende teken.
    // Dat verschil is over een netwerk lastig te meten, maar het is precies de
    // reden dat crypto.timingSafeEqual bestaat en het kost hier niets.
    // Deze test leest de bron, omdat je aan het gedrag niet ziet hoe er
    // vergeleken wordt.
    const bron = fs.readFileSync(path.join(__dirname, '../../middleware/csrf.ts'), 'utf-8');

    expect(bron).toMatch(/timingSafeEqual/);
  });

  it('blijft een token van afwijkende lengte gewoon weigeren', async () => {
    // timingSafeEqual gooit een fout bij ongelijke lengtes; dat moet opgevangen
    // zijn, anders wordt een 403 een 500.
    const client = nieuweClient();
    await haalToken(client);

    for (const onzin of ['', 'x', 'a'.repeat(63), 'a'.repeat(65), 'a'.repeat(1000)]) {
      const res = await request(app).post('/api/leden').set('User-Agent', client).set('x-csrf-token', onzin);
      expect(res.status).toBe(403);
    }
  });
});

describe('de uitzonderingen zijn precies zo ruim als bedoeld', () => {
  const vrijgesteld = [
    '/api/auth/login',
    '/api/auth/register',
    '/api/auth/refresh',
    '/api/auth/forgot-password',
    '/api/auth/reset-password',
    '/api/auth/microsoft/callback',
    '/api/health',
    '/api/settings/theme',
    '/api/settings/branding',
    '/api/settings/logo/abc.png',
    '/api/changelog',
    '/api/tickets/webhooks/payment',
  ];

  it.each(vrijgesteld)('laat %s zonder token door', async (pad) => {
    const res = await request(app).post(pad).set('User-Agent', nieuweClient());

    expect(res.status).toBe(200);
  });

  const nietVrijgesteld = [
    // Het anker aan het eind doet zijn werk: een pad dat met een vrijgesteld
    // pad begint is zelf niet vrijgesteld.
    '/api/tickets/webhooks/payment/extra',
    '/api/tickets/webhooks/payment2',
    '/api/health/status',
    '/api/healthcheck',
    '/api/settings/theme/kleuren',
    '/api/settings',
    '/api/auth/login/nogmaals',
    // De prefix voor Microsoft eist een schuine streep; zonder die streep is
    // een gelijkende route niet vrijgesteld.
    '/api/auth/microsoftkwaad',
    '/api/auth/microsoft',
    // Gewone routes.
    '/api/leden',
    '/api/tickets/1',
    '/api/settings/logo',
  ];

  it.each(nietVrijgesteld)('eist een token voor %s', async (pad) => {
    const res = await request(app).post(pad).set('User-Agent', nieuweClient());

    expect(res.status).toBe(403);
  });

  it('laat de webhook van de betaalprovider door - die tekent zelf en heeft geen browser', async () => {
    const res = await request(app)
      .post('/api/tickets/webhooks/payment')
      .set('User-Agent', nieuweClient())
      .send({ id: 'tr_1' });

    expect(res.status).toBe(200);
  });

  it('kijkt naar het pad zonder querystring', async () => {
    const vrij = await request(app).post('/api/health?bron=uptime').set('User-Agent', nieuweClient());
    expect(vrij.status).toBe(200);

    // En andersom: een querystring die op een vrijgesteld pad lijkt maakt een
    // gewone route niet vrij.
    const niet = await request(app).post('/api/leden?pad=/api/health').set('User-Agent', nieuweClient());
    expect(niet.status).toBe(403);
  });

  it('BEVINDING: een afwijkende schrijfwijze van het pad is niet vrijgesteld', async () => {
    // Express routeert hoofdletterongevoelig, de uitzonderingslijst is dat
    // niet. Dat valt de veilige kant op - er wordt méér gecontroleerd, niet
    // minder - maar een client die POST /API/auth/login stuurt krijgt een 403
    // waar hij een inlogscherm verwacht. Zelfde verhaal voor de slash aan het
    // eind.
    expect((await request(app).post('/API/auth/login').set('User-Agent', nieuweClient())).status).toBe(403);
    expect((await request(app).post('/api/health/').set('User-Agent', nieuweClient())).status).toBe(403);
  });

  it('kan er een uitzondering bij krijgen via addCsrfExemptRoute', async () => {
    expect((await request(app).post('/nog-niet-vrij').set('User-Agent', nieuweClient())).status).toBe(403);

    addCsrfExemptRoute(/^\/nog-niet-vrij$/);

    expect((await request(app).post('/nog-niet-vrij').set('User-Agent', nieuweClient())).status).toBe(200);
  });
});

describe('de uitzondering voor de Authorization-header', () => {
  it('slaat de controle over bij een Bearer-token', async () => {
    // Bewuste keuze: een browser stuurt bij een verzoek vanaf een vreemde site
    // nooit vanzelf een Authorization-header mee. Wie die header kan zetten,
    // kan ook de csrf-header zetten, dus deze uitzondering geeft niets weg.
    const res = await request(app)
      .post('/api/leden')
      .set('User-Agent', nieuweClient())
      .set('Authorization', 'Bearer wat-dan-ook');

    expect(res.status).toBe(200);
  });

  it('slaat de controle niet over bij een andere soort Authorization-header', async () => {
    // Basic-authenticatie stuurt de browser wél vanzelf mee zodra hij de
    // gegevens kent; die mag dus geen vrijbrief zijn.
    for (const kop of ['Basic YWJjOmRlZg==', 'bearer kleine-letters', 'BearerZonderSpatie', 'Token abc']) {
      const res = await request(app).post('/api/leden').set('User-Agent', nieuweClient()).set('Authorization', kop);
      expect(res.status).toBe(403);
    }
  });
});

describe('het token dat wordt uitgedeeld', () => {
  it('is 32 willekeurige bytes in hex', async () => {
    const token = await haalToken(nieuweClient());

    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it('verschilt per client', async () => {
    const eerste = await haalToken(nieuweClient());
    const tweede = await haalToken(nieuweClient());

    expect(eerste).not.toBe(tweede);
  });

  it('blijft hetzelfde voor dezelfde client', async () => {
    const client = nieuweClient();

    expect(await haalToken(client)).toBe(await haalToken(client));
  });

  it('komt als cookie mee met SameSite=Strict en leesbaar voor JavaScript', async () => {
    // SameSite=Strict is de tweede lijn: de browser stuurt de cookie dan sowieso
    // niet mee vanaf een vreemde site. httpOnly staat bewust uit, want de
    // frontend moet de waarde in de header kunnen zetten.
    const res = await request(app).get('/iets').set('User-Agent', nieuweClient());
    const cookie = csrfCookie(res.headers['set-cookie'] as unknown as string[]);

    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).toMatch(/Path=\//);
    expect(cookie).not.toMatch(/HttpOnly/i);
    expect(cookie).not.toMatch(/Secure/i); // buiten productie
  });

  it('zet de cookie in productie op Secure', async () => {
    config.isProduction = true;

    const res = await request(app).get('/iets').set('User-Agent', nieuweClient());
    const cookie = csrfCookie(res.headers['set-cookie'] as unknown as string[]);

    expect(cookie).toMatch(/Secure/i);
  });

  it('maakt via /api/csrf-token een token aan voor een client die er nog geen heeft', async () => {
    // Een SPA die nog niets heeft opgehaald begint hier; dan moet het token ter
    // plekke gemaakt en als cookie meegegeven worden.
    //
    // De losse app is nodig om die tak te raken: staat csrfTokenMiddleware
    // ervoor - zoals in index.ts - dan is het token al gemaakt voordat deze
    // handler aan de beurt is.
    const losseApp = express();
    losseApp.get('/api/csrf-token', getCsrfToken);

    const res = await request(losseApp).get('/api/csrf-token').set('User-Agent', nieuweClient());

    expect(res.body.enabled).toBe(true);
    expect(res.body.csrf).toMatch(/^[0-9a-f]{64}$/);
    expect(csrfCookie(res.headers['set-cookie'] as unknown as string[])).toContain(res.body.csrf);
  });

  it('geeft via /api/csrf-token hetzelfde token als via de header', async () => {
    const client = nieuweClient();
    const viaHeader = await haalToken(client);

    const res = await request(app).get('/api/csrf-token').set('User-Agent', client);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ csrf: viaHeader, enabled: true });
  });
});

describe('met de bescherming uitgeschakeld', () => {
  beforeEach(() => {
    config.csrfEnabled = false;
  });

  it('komt een POST zonder token gewoon door', async () => {
    const res = await request(app).post('/api/leden').set('User-Agent', nieuweClient());

    expect(res.status).toBe(200);
  });

  it('zet csrfTokenMiddleware geen cookie', async () => {
    const res = await request(app).get('/iets').set('User-Agent', nieuweClient());

    expect(res.headers['set-cookie']).toBeUndefined();
    expect(res.headers['x-csrf-token']).toBeUndefined();
  });

  it('zegt /api/csrf-token er eerlijk bij dat hij uitstaat', async () => {
    const res = await request(app).get('/api/csrf-token').set('User-Agent', nieuweClient());

    expect(res.body).toEqual({ csrf: null, enabled: false });
  });
});
