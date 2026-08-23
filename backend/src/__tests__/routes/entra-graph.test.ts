/**
 * De routes die echt met Microsoft Graph praten.
 *
 * entra-sync.test.ts dekt de koppeltabel tussen functietitels en instrumenten
 * af, plus het pad "Microsoft is nog niet ingesteld". Wat daar bewust bleef
 * liggen is alles wat een antwoord van Microsoft nodig heeft: het ophalen van
 * een toegangstoken, de ledenlijst, het importeren, het synchroniseren en de
 * profielfoto's. Dat is ruim tweehonderd onbedekte regels, en juist het deel
 * waar de meeste dingen mis kunnen gaan.
 *
 * Er gaat hier geen enkel verzoek de deur uit: `fetch` is vervangen door een
 * nabootsing die op het adres kijkt welk van de drie Graph-eindpunten wordt
 * aangeroepen. Er zijn geen echte inloggegevens nodig; de vereniging krijgt
 * herkenbaar nepgegevens ('test-client-id' en dergelijke).
 *
 * De nadruk ligt op foutpaden:
 *
 * - Microsoft weigert het toegangstoken (401), begrenst het verkeer (429) of
 *   ligt eruit (500).
 * - Graph geeft 403 terug omdat de rechten ontbreken.
 * - Graph geeft een antwoord dat er niet uitziet zoals verwacht. Daar zaten
 *   twee echte fouten; zie de toelichting bij die tests.
 * - De foto van een lid bestaat niet, of het ophalen ervan klapt eruit. Dat mag
 *   een import nooit laten mislukken.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import rateLimit from 'express-rate-limit';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import config from '../../config';
import entraSyncRoutes from '../../routes/entra-sync';
import { errorHandler } from '../../middleware/errorHandler';
import {
  createTestAssociation,
  createTestEnvironment,
  createTestInstrument,
  createTestOrchestra,
  createTestUser,
  generateTestToken,
  TestAssociation,
  TestUser,
} from '../testUtils';

const app = express();
app.use(express.json());
app.use('/api', rateLimit({ windowMs: 60_000, limit: 10_000 }));
app.use('/api/entra', entraSyncRoutes);
app.use(errorHandler);

/** Zoals Graph een gebruiker teruggeeft. Alle velden mogen ontbreken. */
interface GraphGebruiker {
  id: string;
  displayName?: string | null;
  givenName?: string | null;
  surname?: string | null;
  mail?: string | null;
  userPrincipalName?: string;
  jobTitle?: string | null;
  department?: string | null;
}

interface NagebootstAntwoord {
  status: number;
  body?: unknown;
  binair?: Buffer;
}

/** Wat de nagebootste fetch achtereenvolgens teruggeeft. */
let tokenAntwoord: NagebootstAntwoord;
let gebruikersPaginas: NagebootstAntwoord[];
let fotoAntwoord: NagebootstAntwoord;
let fotoFout: Error | null;
let opgevraagdeAdressen: string[];

function maakAntwoord(a: NagebootstAntwoord) {
  return {
    ok: a.status >= 200 && a.status < 300,
    status: a.status,
    json: async () => a.body,
    text: async () => (typeof a.body === 'string' ? a.body : JSON.stringify(a.body ?? '')),
    arrayBuffer: async () => {
      const buf = a.binair ?? Buffer.alloc(0);
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    },
  };
}

function graafGebruiker(overschrijf: Partial<GraphGebruiker> = {}): GraphGebruiker {
  return {
    id: overschrijf.id || 'entra-1',
    displayName: overschrijf.displayName === undefined ? 'Anna Bakker' : overschrijf.displayName,
    givenName: overschrijf.givenName === undefined ? 'Anna' : overschrijf.givenName,
    surname: overschrijf.surname === undefined ? 'Bakker' : overschrijf.surname,
    mail: overschrijf.mail === undefined ? 'anna@vereniging.nl' : overschrijf.mail,
    userPrincipalName: overschrijf.userPrincipalName ?? 'anna@vereniging.onmicrosoft.com',
    jobTitle: overschrijf.jobTitle ?? null,
    department: overschrijf.department ?? null,
  };
}

/** De ledenlijst die Graph in één pagina teruggeeft. */
function ledenlijst(gebruikers: GraphGebruiker[]): NagebootstAntwoord {
  return { status: 200, body: { value: gebruikers } };
}

describe('synchroniseren met Microsoft Entra', () => {
  let vereniging: TestAssociation;
  let beheerder: TestUser;
  let beheerderToken: string;
  let lidToken: string;
  let instrumentId: string;

  let andereVereniging: TestAssociation;
  let andereBeheerderToken: string;

  const opgeruimdeBestanden: string[] = [];

  beforeEach(() => {
    tokenAntwoord = { status: 200, body: { access_token: 'test-toegangstoken' } };
    gebruikersPaginas = [ledenlijst([])];
    fotoAntwoord = { status: 404 };
    fotoFout = null;
    opgevraagdeAdressen = [];

    vi.stubGlobal(
      'fetch',
      vi.fn(async (adres: string | URL) => {
        const url = String(adres);
        opgevraagdeAdressen.push(url);

        if (url.includes('login.microsoftonline.com')) return maakAntwoord(tokenAntwoord);
        if (url.includes('/photo/$value')) {
          if (fotoFout) throw fotoFout;
          return maakAntwoord(fotoAntwoord);
        }
        // Alles wat overblijft is /v1.0/users, eventueel een vervolgpagina.
        return maakAntwoord(gebruikersPaginas.shift() ?? ledenlijst([]));
      }),
    );

    const omgeving = createTestEnvironment();
    vereniging = omgeving.association;
    beheerder = omgeving.adminUser;
    beheerderToken = omgeving.adminToken;
    lidToken = omgeving.memberToken;
    instrumentId = createTestInstrument({ name: 'Trompet' }).id;

    andereVereniging = createTestAssociation({ name: 'Andere vereniging' });
    andereBeheerderToken = generateTestToken(
      createTestUser(andereVereniging.id, { email: 'beheer@elders.nl', role: 'admin' }),
    );
  });

  afterEach(() => {
    // Foto's worden echt naar de uploadmap geschreven; die weer opruimen zodat
    // de map niet volloopt met testrommel.
    const paden = db.prepare('SELECT profile_photo_path FROM users WHERE profile_photo_path IS NOT NULL').all() as {
      profile_photo_path: string;
    }[];
    for (const p of [...paden.map((r) => r.profile_photo_path), ...opgeruimdeBestanden]) {
      try {
        if (fs.existsSync(p)) fs.unlinkSync(p);
      } catch {
        // Opruimen mag nooit een test laten omvallen.
      }
    }
    opgeruimdeBestanden.length = 0;
    vi.unstubAllGlobals();
  });

  /** De Microsoft-koppeling aanzetten met nadrukkelijk nepgegevens. */
  function zetMicrosoftAan(associationId: string): void {
    db.prepare(
      `UPDATE associations
       SET microsoft_client_id = ?, microsoft_client_secret = ?, microsoft_tenant_id = ?, microsoft_enabled = 1
       WHERE id = ?`,
    ).run('test-client-id', 'test-client-secret-abc', 'test-tenant-id', associationId);
  }

  type Methode = 'get' | 'post' | 'put' | 'delete';
  const als = (token: string, methode: Methode, pad: string) =>
    request(app)[methode](`/api/entra${pad}`).set('Authorization', `Bearer ${token}`);

  const gebruikerMetEmail = (email: string) =>
    db.prepare('SELECT id, first_name, last_name, microsoft_id, role FROM users WHERE email = ?').get(email) as
      { id: string; first_name: string; last_name: string; microsoft_id: string | null; role: string } | undefined;

  // ================================================================
  // De koppeling zelf: half ingevuld telt niet als ingesteld
  // ================================================================
  describe('wanneer de koppeling als ingesteld geldt', () => {
    const HALVE_INSTELLINGEN: Array<[string, Record<string, unknown>]> = [
      ['zonder client id', { microsoft_client_id: null }],
      ['zonder tenant id', { microsoft_tenant_id: null }],
      ['zonder client secret', { microsoft_client_secret: null }],
      ['uitgeschakeld', { microsoft_enabled: 0 }],
    ];

    it.each(HALVE_INSTELLINGEN)('geldt %s niet als ingesteld', async (_naam, aanpassing) => {
      // Half ingevuld is niet ingesteld. Zou de route toch doorlopen, dan gaat
      // er een verzoek met een leeg client id naar Microsoft en krijgt de
      // beheerder een onbegrijpelijke fout in plaats van "stel dit eerst in".
      zetMicrosoftAan(vereniging.id);
      const [kolom, waarde] = Object.entries(aanpassing)[0];
      db.prepare(`UPDATE associations SET ${kolom} = ? WHERE id = ?`).run(waarde, vereniging.id);

      const res = await als(beheerderToken, 'get', '/users');
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Microsoft');
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  // ================================================================
  // Het toegangstoken
  // ================================================================
  describe('het toegangstoken ophalen', () => {
    const TOKENFOUTEN: Array<[string, number]> = [
      ['een afgewezen client secret', 401],
      ['te veel verzoeken', 429],
      ['een storing bij Microsoft', 500],
    ];

    it.each(TOKENFOUTEN)('geeft bij %s een melding die naar de app-instellingen wijst', async (_naam, status) => {
      zetMicrosoftAan(vereniging.id);
      tokenAntwoord = { status, body: { error: 'invalid_client' } };

      const res = await als(beheerderToken, 'get', '/users');
      expect(res.body.error).toContain('Microsoft');
      // Het client secret mag nooit terug de wereld in, ook niet in een
      // foutmelding.
      expect(JSON.stringify(res.body)).not.toContain('test-client-secret-abc');
    });

    it('vraagt het token op bij de ingestelde tenant', async () => {
      zetMicrosoftAan(vereniging.id);
      await als(beheerderToken, 'get', '/users');

      expect(opgevraagdeAdressen[0]).toContain('test-tenant-id');
      expect(opgevraagdeAdressen[0]).toContain('login.microsoftonline.com');
    });

    it('meldt het als Microsoft wel iets teruggeeft maar geen token', async () => {
      // Een 200 zonder access_token: dan wordt Graph bevraagd met "Bearer
      // undefined" en antwoordt die met 401. Dat hoort geen kale 500 met een
      // stacktrace te worden.
      zetMicrosoftAan(vereniging.id);
      tokenAntwoord = { status: 200, body: { token_type: 'Bearer' } };
      gebruikersPaginas = [{ status: 401, body: { error: 'InvalidAuthenticationToken' } }];

      const res = await als(beheerderToken, 'get', '/users');
      expect(res.body.error).toContain('Microsoft');
    });
  });

  // ================================================================
  // GET /entra/users
  // ================================================================
  describe('de ledenlijst ophalen', () => {
    const GRAPHFOUTEN: Array<[string, number]> = [
      ['ontbrekende rechten', 403],
      ['een verlopen token', 401],
      ['te veel verzoeken', 429],
      ['een storing', 500],
    ];

    it.each(GRAPHFOUTEN)('meldt %s met een uitleg over de rechten', async (_naam, status) => {
      zetMicrosoftAan(vereniging.id);
      gebruikersPaginas = [{ status, body: { error: { code: 'Authorization_RequestDenied' } } }];

      const res = await als(beheerderToken, 'get', '/users');
      expect(res.body.error).toContain('User.Read.All');
    });

    it('gaat goed om met een lege lijst', async () => {
      zetMicrosoftAan(vereniging.id);
      gebruikersPaginas = [ledenlijst([])];

      const res = await als(beheerderToken, 'get', '/users');
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.totalCount).toBe(0);
      expect(res.body.users).toEqual([]);
    });

    /**
     * BEWIJS. Draai deze test op de oude routes/entra-sync.ts (kopie in de
     * scratchpad, `git checkout HEAD -- src/routes/entra-sync.ts`, testen,
     * kopie terugzetten) en hij is rood: verwacht 200, ontvangen 500.
     *
     * `value` is in het antwoord van Graph geen gegarandeerd veld. Komt er iets
     * anders terug met status 200 - een foutobject via een proxy, of een
     * gewijzigd antwoordformaat - dan deed `users.push(...data.value)` een
     * spread over undefined, wat een TypeError is. De beheerder kreeg een kale
     * 500 zonder enige aanwijzing waar het aan lag.
     */
    it('meldt een antwoord zonder ledenlijst als een storing bij Microsoft', async () => {
      zetMicrosoftAan(vereniging.id);
      gebruikersPaginas = [{ status: 200, body: { error: { code: 'ServiceUnavailable' } } }];

      const res = await als(beheerderToken, 'get', '/users');
      expect(res.status).toBe(502);
      expect(res.body.error).toContain('Microsoft');
    });

    it("haalt vervolgpagina's op en voegt ze samen", async () => {
      zetMicrosoftAan(vereniging.id);
      gebruikersPaginas = [
        {
          status: 200,
          body: {
            value: [graafGebruiker({ id: 'e1', mail: 'een@vereniging.nl' })],
            '@odata.nextLink': 'https://graph.microsoft.com/v1.0/users?$skiptoken=abc',
          },
        },
        ledenlijst([graafGebruiker({ id: 'e2', mail: 'twee@vereniging.nl' })]),
      ];

      const res = await als(beheerderToken, 'get', '/users');
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.totalCount).toBe(2);
      expect(opgevraagdeAdressen.some((a) => a.includes('skiptoken=abc'))).toBe(true);
    });

    it('laat leden zonder e-mailadres weg', async () => {
      zetMicrosoftAan(vereniging.id);
      gebruikersPaginas = [
        ledenlijst([
          graafGebruiker({ id: 'met', mail: 'met@vereniging.nl' }),
          graafGebruiker({ id: 'zonder', mail: null, userPrincipalName: '' }),
        ]),
      ];

      const res = await als(beheerderToken, 'get', '/users');
      expect(res.body.users.map((u: { id: string }) => u.id)).toEqual(['met']);
    });

    it('valt terug op het userPrincipalName als er geen mail is', async () => {
      zetMicrosoftAan(vereniging.id);
      gebruikersPaginas = [
        ledenlijst([graafGebruiker({ mail: null, userPrincipalName: 'Anna@Vereniging.OnMicrosoft.com' })]),
      ];

      const res = await als(beheerderToken, 'get', '/users');
      expect(res.body.users[0].email).toBe('anna@vereniging.onmicrosoft.com');
    });

    it('merkt bestaande leden aan als al geïmporteerd, op e-mail én op Microsoft-id', async () => {
      zetMicrosoftAan(vereniging.id);
      createTestUser(vereniging.id, { email: 'opemail@vereniging.nl' });
      const opId = createTestUser(vereniging.id, { email: 'anders@vereniging.nl' });
      db.prepare('UPDATE users SET microsoft_id = ? WHERE id = ?').run('entra-op-id', opId.id);

      gebruikersPaginas = [
        ledenlijst([
          graafGebruiker({ id: 'e-mail', mail: 'OpEmail@vereniging.nl' }),
          graafGebruiker({ id: 'entra-op-id', mail: 'weer-iets-anders@vereniging.nl' }),
          graafGebruiker({ id: 'nieuw', mail: 'nieuw@vereniging.nl' }),
        ]),
      ];

      const res = await als(beheerderToken, 'get', '/users');
      const perId = Object.fromEntries(
        res.body.users.map((u: { id: string; isImported: boolean }) => [u.id, u.isImported]),
      );
      expect(perId['e-mail']).toBe(true);
      expect(perId['entra-op-id']).toBe(true);
      expect(perId['nieuw']).toBe(false);
      expect(res.body.importedCount).toBe(2);
    });

    it('toont welke functietitel al een instrument heeft', async () => {
      zetMicrosoftAan(vereniging.id);
      await als(beheerderToken, 'post', '/mappings').send({ jobTitle: 'Trompettist', instrumentId });
      gebruikersPaginas = [
        ledenlijst([
          graafGebruiker({ id: 'met', jobTitle: 'trompettist' }),
          graafGebruiker({ id: 'zonder', mail: 'b@vereniging.nl', jobTitle: 'Hoornist' }),
        ]),
      ];

      const res = await als(beheerderToken, 'get', '/users');
      const perId = Object.fromEntries(
        res.body.users.map((u: { id: string; hasMapping: boolean; mappedInstrumentId: string | null }) => [u.id, u]),
      );
      expect(perId['met'].hasMapping).toBe(true);
      expect(perId['met'].mappedInstrumentId).toBe(instrumentId);
      expect(perId['zonder'].hasMapping).toBe(false);
      expect(res.body.uniqueJobTitles).toEqual(['Hoornist', 'trompettist']);
    });

    it('gebruikt de koppelingen van een andere vereniging niet', async () => {
      zetMicrosoftAan(vereniging.id);
      await als(andereBeheerderToken, 'post', '/mappings').send({ jobTitle: 'Trompettist', instrumentId });
      gebruikersPaginas = [ledenlijst([graafGebruiker({ jobTitle: 'Trompettist' })])];

      const res = await als(beheerderToken, 'get', '/users');
      expect(res.body.users[0].hasMapping).toBe(false);
    });

    it('splitst de afdeling in orkesten en meldt welke er nog niet zijn', async () => {
      zetMicrosoftAan(vereniging.id);
      createTestOrchestra(vereniging.id, { name: 'Harmonieorkest' });
      gebruikersPaginas = [ledenlijst([graafGebruiker({ department: 'harmonieorkest, Slagwerkgroep ,  ' })])];

      const res = await als(beheerderToken, 'get', '/users');
      expect(res.body.users[0].departments).toEqual(['harmonieorkest', 'Slagwerkgroep']);
      // Het bestaande orkest hoort er niet bij: vergelijken gaat
      // hoofdletterongevoelig, anders wordt hetzelfde orkest tweemaal
      // aangemaakt.
      expect(res.body.newDepartments).toEqual(['Slagwerkgroep']);
    });

    /**
     * BEWIJS. Op de oude routes/entra-sync.ts is deze test rood:
     * "expected null to be truthy".
     *
     * displayName is in Graph optioneel en komt bij gast-, service- en pas
     * aangemaakte accounts geregeld leeg terug. De route gaf die null
     * ongewijzigd door en sorteerde er daarna mee via
     * `a.displayName.localeCompare(b.displayName)`.
     *
     * Twee dingen gingen dus mis. In de lijst staat een lid zonder enige naam,
     * waar in het importscherm niets van te herkennen valt - en dat is precies
     * het scherm waarin je aanvinkt wie er geïmporteerd wordt. En de sortering
     * roept een methode aan op null, wat een TypeError is zodra zo'n account in
     * de a-positie van de vergelijking terechtkomt; dan is de complete
     * ledenlijst onbereikbaar met een kale 500 en valt er niemand meer te
     * importeren.
     *
     * Op de terugval naar userPrincipalName wordt hier bewust vastgelegd: dat
     * veld is in Entra verplicht, dus er is altijd iets herkenbaars te tonen.
     */
    it('toont een lid zonder weergavenaam met een herkenbare naam', async () => {
      zetMicrosoftAan(vereniging.id);
      gebruikersPaginas = [
        ledenlijst([
          graafGebruiker({
            id: 'zonder-naam',
            displayName: null,
            givenName: null,
            surname: null,
            mail: 'x@vereniging.nl',
            userPrincipalName: 'x@vereniging.onmicrosoft.com',
          }),
          graafGebruiker({ id: 'gewoon' }),
        ]),
      ];

      const res = await als(beheerderToken, 'get', '/users');
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.totalCount).toBe(2);

      const zonderNaam = res.body.users.find((u: { id: string }) => u.id === 'zonder-naam');
      expect(zonderNaam.displayName).toBeTruthy();
      expect(zonderNaam.displayName).toContain('x@vereniging');
    });

    it('is niet voor een gewoon lid', async () => {
      zetMicrosoftAan(vereniging.id);
      expect((await als(lidToken, 'get', '/users')).status).toBe(403);
    });
  });

  // ================================================================
  // POST /entra/users/import
  // ================================================================
  describe('leden importeren', () => {
    const importeer = (token: string, body: Record<string, unknown>) => als(token, 'post', '/users/import').send(body);

    it('vraagt om een selectie', async () => {
      zetMicrosoftAan(vereniging.id);
      expect((await importeer(beheerderToken, {})).status).toBe(400);
      expect((await importeer(beheerderToken, { userIds: [] })).status).toBe(400);
      expect((await importeer(beheerderToken, { userIds: 'entra-1' })).status).toBe(400);
    });

    it('meldt het als geen van de gekozen leden bij Microsoft bestaat', async () => {
      zetMicrosoftAan(vereniging.id);
      gebruikersPaginas = [ledenlijst([graafGebruiker({ id: 'bestaat-wel' })])];

      const res = await importeer(beheerderToken, { userIds: ['bestaat-niet'] });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('geldige gebruikers');
    });

    it('importeert een lid als gewoon lid met een Microsoft-id', async () => {
      zetMicrosoftAan(vereniging.id);
      gebruikersPaginas = [ledenlijst([graafGebruiker({ id: 'entra-anna', mail: 'Anna@Vereniging.nl' })])];

      const res = await importeer(beheerderToken, { userIds: ['entra-anna'] });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.imported).toBe(1);

      const nieuw = gebruikerMetEmail('anna@vereniging.nl');
      expect(nieuw).toBeTruthy();
      expect(nieuw!.microsoft_id).toBe('entra-anna');
      expect(nieuw!.role).toBe('member');
      expect(nieuw!.first_name).toBe('Anna');
    });

    it('zet geen bruikbaar wachtwoord neer voor een geïmporteerd lid', async () => {
      // Deze mensen melden zich aan via Microsoft. Het wachtwoordveld is
      // verplicht in het schema en wordt gevuld met willekeur; dat mag geen
      // vaste of raadbare waarde zijn.
      zetMicrosoftAan(vereniging.id);
      gebruikersPaginas = [ledenlijst([graafGebruiker({ id: 'e1', mail: 'een@vereniging.nl' })])];
      await importeer(beheerderToken, { userIds: ['e1'] });

      gebruikersPaginas = [ledenlijst([graafGebruiker({ id: 'e2', mail: 'twee@vereniging.nl' })])];
      await importeer(beheerderToken, { userIds: ['e2'] });

      const hashes = db
        .prepare('SELECT password_hash FROM users WHERE email IN (?, ?)')
        .all('een@vereniging.nl', 'twee@vereniging.nl') as { password_hash: string }[];
      expect(hashes).toHaveLength(2);
      expect(hashes[0].password_hash).not.toBe(hashes[1].password_hash);
      expect(hashes[0].password_hash.startsWith('$2')).toBe(true);
    });

    it('slaat een bestaand lid over en vult alleen het Microsoft-id aan', async () => {
      zetMicrosoftAan(vereniging.id);
      const bestaand = createTestUser(vereniging.id, {
        email: 'bestaand@vereniging.nl',
        firstName: 'Eigen',
        lastName: 'Naam',
      });
      gebruikersPaginas = [
        ledenlijst([
          graafGebruiker({ id: 'entra-b', mail: 'bestaand@vereniging.nl', givenName: 'Uit', surname: 'Entra' }),
        ]),
      ];

      const res = await importeer(beheerderToken, { userIds: ['entra-b'] });
      expect(res.body.imported).toBe(0);
      expect(res.body.skipped).toBe(1);

      const na = gebruikerMetEmail('bestaand@vereniging.nl')!;
      expect(na.id).toBe(bestaand.id);
      expect(na.microsoft_id).toBe('entra-b');
      // De naam die in Tutti staat blijft bij een import staan; die overschrijven
      // is het werk van de synchronisatieroute, niet van de import.
      expect(na.first_name).toBe('Eigen');
    });

    it('importeert geen lid zonder e-mailadres en zegt waarom', async () => {
      zetMicrosoftAan(vereniging.id);
      gebruikersPaginas = [
        ledenlijst([graafGebruiker({ id: 'leeg', displayName: 'Geen Adres', mail: null, userPrincipalName: '' })]),
      ];

      const res = await importeer(beheerderToken, { userIds: ['leeg'] });
      expect(res.body.imported).toBe(0);
      expect(res.body.skipped).toBe(1);
      expect(res.body.errors[0]).toContain('Geen Adres');
    });

    it('hangt het instrument aan de functietitel', async () => {
      zetMicrosoftAan(vereniging.id);
      await als(beheerderToken, 'post', '/mappings').send({ jobTitle: 'Trompettist', instrumentId });
      gebruikersPaginas = [
        ledenlijst([graafGebruiker({ id: 'e1', mail: 'a@vereniging.nl', jobTitle: 'TROMPETTIST' })]),
      ];

      await importeer(beheerderToken, { userIds: ['e1'] });

      const nieuw = gebruikerMetEmail('a@vereniging.nl')!;
      const instrumenten = db.prepare('SELECT instrument_id FROM user_instruments WHERE user_id = ?').all(nieuw.id) as {
        instrument_id: string;
      }[];
      expect(instrumenten.map((i) => i.instrument_id)).toEqual([instrumentId]);
    });

    it('maakt ontbrekende orkesten aan vanuit de afdeling en hergebruikt bestaande', async () => {
      // Dit is het pad waar eerder de hele import op strandde: het aanmaken van
      // een orkest gebeurt binnen de transactie van de import.
      zetMicrosoftAan(vereniging.id);
      const bestaandOrkest = createTestOrchestra(vereniging.id, { name: 'Harmonieorkest' });
      gebruikersPaginas = [
        ledenlijst([
          graafGebruiker({ id: 'e1', mail: 'a@vereniging.nl', department: 'harmonieorkest, Slagwerkgroep' }),
        ]),
      ];

      const res = await importeer(beheerderToken, { userIds: ['e1'] });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.imported).toBe(1);

      const nieuw = gebruikerMetEmail('a@vereniging.nl')!;
      const orkesten = db
        .prepare(
          `SELECT o.id, o.name FROM user_orchestras uo JOIN orchestras o ON uo.orchestra_id = o.id
           WHERE uo.user_id = ? ORDER BY o.name`,
        )
        .all(nieuw.id) as { id: string; name: string }[];
      expect(orkesten.map((o) => o.name)).toEqual(['Harmonieorkest', 'Slagwerkgroep']);
      // Hetzelfde orkest, niet een tweede met een andere schrijfwijze.
      expect(orkesten.find((o) => o.name === 'Harmonieorkest')!.id).toBe(bestaandOrkest.id);
    });

    it('maakt het nieuwe orkest bij de eigen vereniging aan', async () => {
      zetMicrosoftAan(vereniging.id);
      gebruikersPaginas = [
        ledenlijst([graafGebruiker({ id: 'e1', mail: 'a@vereniging.nl', department: 'Slagwerkgroep' })]),
      ];

      await importeer(beheerderToken, { userIds: ['e1'] });

      const orkest = db.prepare('SELECT association_id FROM orchestras WHERE name = ?').get('Slagwerkgroep') as {
        association_id: string;
      };
      expect(orkest.association_id).toBe(vereniging.id);
    });

    it('bewaart de profielfoto als Microsoft er een heeft', async () => {
      zetMicrosoftAan(vereniging.id);
      gebruikersPaginas = [ledenlijst([graafGebruiker({ id: 'e1', mail: 'a@vereniging.nl' })])];
      fotoAntwoord = { status: 200, binair: Buffer.from('nagebootste-jpeg-inhoud') };

      await importeer(beheerderToken, { userIds: ['e1'] });

      const rij = db.prepare('SELECT profile_photo_path FROM users WHERE email = ?').get('a@vereniging.nl') as {
        profile_photo_path: string | null;
      };
      expect(rij.profile_photo_path).toBeTruthy();
      expect(fs.existsSync(rij.profile_photo_path!)).toBe(true);
    });

    it('importeert gewoon door als een lid geen foto heeft', async () => {
      zetMicrosoftAan(vereniging.id);
      gebruikersPaginas = [ledenlijst([graafGebruiker({ id: 'e1', mail: 'a@vereniging.nl' })])];
      fotoAntwoord = { status: 404 };

      const res = await importeer(beheerderToken, { userIds: ['e1'] });
      expect(res.body.imported).toBe(1);

      const rij = db.prepare('SELECT profile_photo_path FROM users WHERE email = ?').get('a@vereniging.nl') as {
        profile_photo_path: string | null;
      };
      expect(rij.profile_photo_path).toBeNull();
    });

    it('laat de import niet mislukken als het ophalen van de foto eruit klapt', async () => {
      // Een netwerkfout op een foto mag nooit een geslaagde import terugdraaien;
      // de gebruiker staat er dan al in.
      zetMicrosoftAan(vereniging.id);
      gebruikersPaginas = [ledenlijst([graafGebruiker({ id: 'e1', mail: 'a@vereniging.nl' })])];
      fotoFout = new Error('verbinding verbroken');

      const res = await importeer(beheerderToken, { userIds: ['e1'] });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.imported).toBe(1);
      expect(gebruikerMetEmail('a@vereniging.nl')).toBeTruthy();
    });

    it('importeert niet in een andere vereniging', async () => {
      zetMicrosoftAan(andereVereniging.id);
      gebruikersPaginas = [ledenlijst([graafGebruiker({ id: 'e1', mail: 'a@elders.nl' })])];

      await importeer(andereBeheerderToken, { userIds: ['e1'] });

      const rij = db.prepare('SELECT association_id FROM users WHERE email = ?').get('a@elders.nl') as {
        association_id: string;
      };
      expect(rij.association_id).toBe(andereVereniging.id);
    });

    it('is niet voor een gewoon lid', async () => {
      zetMicrosoftAan(vereniging.id);
      expect((await importeer(lidToken, { userIds: ['e1'] })).status).toBe(403);
    });
  });

  // ================================================================
  // POST /entra/users/sync
  // ================================================================
  describe('bestaande leden bijwerken', () => {
    const synchroniseer = (token: string, body: Record<string, unknown> = {}) =>
      als(token, 'post', '/users/sync').send(body);

    it('werkt de naam van een bestaand lid bij', async () => {
      zetMicrosoftAan(vereniging.id);
      const bestaand = createTestUser(vereniging.id, {
        email: 'kees@vereniging.nl',
        firstName: 'K',
        lastName: 'V',
      });
      gebruikersPaginas = [
        ledenlijst([
          graafGebruiker({ id: 'entra-kees', mail: 'kees@vereniging.nl', givenName: 'Kees', surname: 'de Vries' }),
        ]),
      ];

      const res = await synchroniseer(beheerderToken);
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.updated).toBe(1);
      expect(res.body.created).toBe(0);

      const na = gebruikerMetEmail('kees@vereniging.nl')!;
      expect(na.id).toBe(bestaand.id);
      expect(na.first_name).toBe('Kees');
      expect(na.last_name).toBe('de Vries');
      expect(na.microsoft_id).toBe('entra-kees');
    });

    it('maakt standaard geen nieuwe leden aan', async () => {
      // Zonder deze grens maakt één druk op de knop de hele tenant lid van de
      // vereniging - inclusief iedereen die er niets mee te maken heeft.
      zetMicrosoftAan(vereniging.id);
      gebruikersPaginas = [ledenlijst([graafGebruiker({ id: 'e1', mail: 'onbekend@vereniging.nl' })])];

      const res = await synchroniseer(beheerderToken);
      expect(res.body.created).toBe(0);
      expect(res.body.skipped).toBe(1);
      expect(gebruikerMetEmail('onbekend@vereniging.nl')).toBeUndefined();
    });

    it('maakt wel nieuwe leden aan als daar uitdrukkelijk om wordt gevraagd', async () => {
      zetMicrosoftAan(vereniging.id);
      gebruikersPaginas = [
        ledenlijst([graafGebruiker({ id: 'e1', mail: 'nieuw@vereniging.nl', department: 'Slagwerkgroep' })]),
      ];

      const res = await synchroniseer(beheerderToken, { createNew: true });
      expect(res.body.created).toBe(1);

      const nieuw = gebruikerMetEmail('nieuw@vereniging.nl')!;
      expect(nieuw.role).toBe('member');
      const orkesten = db.prepare('SELECT COUNT(*) as aantal FROM user_orchestras WHERE user_id = ?').get(nieuw.id) as {
        aantal: number;
      };
      expect(orkesten.aantal).toBe(1);
    });

    it('hangt bij een nieuw lid ook het instrument van de functietitel aan', async () => {
      zetMicrosoftAan(vereniging.id);
      await als(beheerderToken, 'post', '/mappings').send({ jobTitle: 'Trompettist', instrumentId });
      gebruikersPaginas = [
        ledenlijst([graafGebruiker({ id: 'e1', mail: 'nieuw@vereniging.nl', jobTitle: 'trompettist' })]),
      ];

      const res = await synchroniseer(beheerderToken, { createNew: true });
      expect(res.body.created).toBe(1);

      const nieuw = gebruikerMetEmail('nieuw@vereniging.nl')!;
      const instrumenten = db.prepare('SELECT instrument_id FROM user_instruments WHERE user_id = ?').all(nieuw.id) as {
        instrument_id: string;
      }[];
      expect(instrumenten.map((i) => i.instrument_id)).toEqual([instrumentId]);
    });

    it('slaat leden zonder e-mailadres over', async () => {
      zetMicrosoftAan(vereniging.id);
      gebruikersPaginas = [ledenlijst([graafGebruiker({ id: 'leeg', mail: null, userPrincipalName: '' })])];

      const res = await synchroniseer(beheerderToken, { createNew: true });
      expect(res.body.skipped).toBe(1);
      expect(res.body.created).toBe(0);
    });

    it('vervangt het instrument door dat van de functietitel', async () => {
      zetMicrosoftAan(vereniging.id);
      const ander = createTestInstrument({ name: 'Hoorn' });
      await als(beheerderToken, 'post', '/mappings').send({ jobTitle: 'Trompettist', instrumentId });
      const bestaand = createTestUser(vereniging.id, { email: 'kees@vereniging.nl' });
      db.prepare('INSERT INTO user_instruments (user_id, instrument_id) VALUES (?, ?)').run(bestaand.id, ander.id);
      gebruikersPaginas = [
        ledenlijst([graafGebruiker({ id: 'e1', mail: 'kees@vereniging.nl', jobTitle: 'Trompettist' })]),
      ];

      await synchroniseer(beheerderToken);

      const instrumenten = db
        .prepare('SELECT instrument_id FROM user_instruments WHERE user_id = ?')
        .all(bestaand.id) as { instrument_id: string }[];
      expect(instrumenten.map((i) => i.instrument_id)).toEqual([instrumentId]);
    });

    it('vervangt de orkesten door die uit de afdeling', async () => {
      zetMicrosoftAan(vereniging.id);
      const oudOrkest = createTestOrchestra(vereniging.id, { name: 'Oud orkest' });
      const bestaand = createTestUser(vereniging.id, { email: 'kees@vereniging.nl' });
      db.prepare('INSERT INTO user_orchestras (user_id, orchestra_id) VALUES (?, ?)').run(bestaand.id, oudOrkest.id);
      gebruikersPaginas = [
        ledenlijst([graafGebruiker({ id: 'e1', mail: 'kees@vereniging.nl', department: 'Slagwerkgroep' })]),
      ];

      await synchroniseer(beheerderToken);

      const orkesten = db
        .prepare(
          'SELECT o.name FROM user_orchestras uo JOIN orchestras o ON uo.orchestra_id = o.id WHERE uo.user_id = ?',
        )
        .all(bestaand.id) as { name: string }[];
      expect(orkesten.map((o) => o.name)).toEqual(['Slagwerkgroep']);
    });

    it('werkt het lid van een andere vereniging niet bij', async () => {
      // De zoekopdracht naar een bestaand lid gaat op microsoft_id óf
      // e-mailadres. Zonder de association_id erbij zou een synchronisatie van
      // de ene vereniging de naam van iemand bij een andere vereniging
      // overschrijven.
      //
      // (e-mailadressen zijn in het schema over alle verenigingen heen uniek,
      // dus dit lid kan er hier niet ook nog bij worden aangemaakt. Vandaar
      // zonder createNew: het gaat om wat er níet wordt bijgewerkt.)
      zetMicrosoftAan(vereniging.id);
      const elders = createTestUser(andereVereniging.id, {
        email: 'zelfde@vereniging.nl',
        firstName: 'Blijft',
        lastName: 'Staan',
      });
      gebruikersPaginas = [
        ledenlijst([graafGebruiker({ id: 'e1', mail: 'zelfde@vereniging.nl', givenName: 'Nieuw', surname: 'Naam' })]),
      ];

      const res = await synchroniseer(beheerderToken);
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.updated).toBe(0);
      expect(res.body.skipped).toBe(1);

      const eldersNa = db.prepare('SELECT first_name, microsoft_id FROM users WHERE id = ?').get(elders.id) as {
        first_name: string;
        microsoft_id: string | null;
      };
      expect(eldersNa.first_name).toBe('Blijft');
      expect(eldersNa.microsoft_id).toBeNull();
    });

    /**
     * BEWIJS. Op de oude routes/entra-sync.ts is deze test rood: verwacht 200,
     * ontvangen 500, en er wordt niemand bijgewerkt.
     *
     * Zelfde oorzaak als bij de ledenlijst, maar hier is het gevolg erger:
     * `entraUser.displayName.split(' ')` staat binnen de withTransaction() van
     * de synchronisatie. Eén account zonder weergavenaam en zonder givenName
     * gooide er een TypeError uit, de transactie werd teruggedraaid en dus
     * werden álle andere leden ook niet bijgewerkt. De knop deed dan gewoon
     * niets, elke keer opnieuw.
     */
    it('werkt de rest bij ook als één lid geen weergavenaam heeft', async () => {
      zetMicrosoftAan(vereniging.id);
      const kees = createTestUser(vereniging.id, { email: 'kees@vereniging.nl', firstName: 'K', lastName: 'V' });
      gebruikersPaginas = [
        ledenlijst([
          graafGebruiker({
            id: 'kapot',
            displayName: null,
            givenName: null,
            surname: null,
            mail: 'raar@vereniging.nl',
          }),
          graafGebruiker({ id: 'e1', mail: 'kees@vereniging.nl', givenName: 'Kees', surname: 'de Vries' }),
        ]),
      ];

      const res = await synchroniseer(beheerderToken, { createNew: true });
      expect(res.status, JSON.stringify(res.body)).toBe(200);

      const na = db.prepare('SELECT first_name FROM users WHERE id = ?').get(kees.id) as { first_name: string };
      expect(na.first_name).toBe('Kees');
    });

    it('is niet voor een gewoon lid', async () => {
      zetMicrosoftAan(vereniging.id);
      expect((await synchroniseer(lidToken)).status).toBe(403);
    });
  });

  // ================================================================
  // POST /entra/sync-photos
  // ================================================================
  describe("profielfoto's synchroniseren", () => {
    const fotos = (token: string) => als(token, 'post', '/sync-photos').send({});

    function lidMetMicrosoftId(email: string, microsoftId: string): TestUser {
      const gebruiker = createTestUser(vereniging.id, { email });
      db.prepare('UPDATE users SET microsoft_id = ? WHERE id = ?').run(microsoftId, gebruiker.id);
      return gebruiker;
    }

    it('legt uit wat er eerst moet gebeuren als niemand een Microsoft-id heeft', async () => {
      zetMicrosoftAan(vereniging.id);

      const res = await fotos(beheerderToken);
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body).toMatchObject({ synced: 0, skipped: 0, failed: 0 });
      expect(res.body.message).toContain('Microsoft ID');
      // Geen enkele foto-oproep: er valt niets op te halen.
      expect(opgevraagdeAdressen.some((a) => a.includes('/photo/'))).toBe(false);
    });

    it('bewaart de foto en onthoudt het pad', async () => {
      zetMicrosoftAan(vereniging.id);
      const gebruiker = lidMetMicrosoftId('kees@vereniging.nl', 'entra-kees');
      fotoAntwoord = { status: 200, binair: Buffer.from('nagebootste-jpeg-inhoud') };

      const res = await fotos(beheerderToken);
      expect(res.body).toMatchObject({ synced: 1, skipped: 0, failed: 0 });

      const rij = db.prepare('SELECT profile_photo_path FROM users WHERE id = ?').get(gebruiker.id) as {
        profile_photo_path: string;
      };
      expect(fs.existsSync(rij.profile_photo_path)).toBe(true);
    });

    it('ruimt de vorige foto op in plaats van bestanden te laten rondslingeren', async () => {
      zetMicrosoftAan(vereniging.id);
      const gebruiker = lidMetMicrosoftId('kees@vereniging.nl', 'entra-kees');
      fotoAntwoord = { status: 200, binair: Buffer.from('eerste-versie') };
      await fotos(beheerderToken);
      const eerstePad = (
        db.prepare('SELECT profile_photo_path FROM users WHERE id = ?').get(gebruiker.id) as {
          profile_photo_path: string;
        }
      ).profile_photo_path;
      opgeruimdeBestanden.push(eerstePad);

      // Een andere inhoud, zodat er zeker een nieuw bestand ontstaat.
      fotoAntwoord = { status: 200, binair: Buffer.from('tweede-versie') };
      await new Promise((r) => setTimeout(r, 5));
      await fotos(beheerderToken);

      const tweedePad = (
        db.prepare('SELECT profile_photo_path FROM users WHERE id = ?').get(gebruiker.id) as {
          profile_photo_path: string;
        }
      ).profile_photo_path;
      expect(fs.existsSync(tweedePad)).toBe(true);
      if (tweedePad !== eerstePad) {
        expect(fs.existsSync(eerstePad)).toBe(false);
      }
    });

    it('telt een lid zonder foto als overgeslagen en niet als mislukt', async () => {
      // 404 betekent "deze persoon heeft geen foto", niet "er ging iets mis".
      // Als dat als mislukking wordt geteld, ziet elke synchronisatie in een
      // organisatie zonder foto's eruit als een storing.
      zetMicrosoftAan(vereniging.id);
      lidMetMicrosoftId('kees@vereniging.nl', 'entra-kees');
      fotoAntwoord = { status: 404 };

      const res = await fotos(beheerderToken);
      expect(res.body).toMatchObject({ synced: 0, skipped: 1, failed: 0 });
    });

    it('slaat een lid over als het ophalen van de foto begrensd wordt', async () => {
      zetMicrosoftAan(vereniging.id);
      lidMetMicrosoftId('kees@vereniging.nl', 'entra-kees');
      fotoAntwoord = { status: 429 };

      const res = await fotos(beheerderToken);
      expect(res.status).toBe(200);
      expect(res.body.synced).toBe(0);
    });

    it('gaat door naar het volgende lid als één foto eruit klapt', async () => {
      zetMicrosoftAan(vereniging.id);
      lidMetMicrosoftId('een@vereniging.nl', 'entra-1');
      lidMetMicrosoftId('twee@vereniging.nl', 'entra-2');
      fotoFout = new Error('verbinding verbroken');

      const res = await fotos(beheerderToken);
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.synced).toBe(0);
    });

    it('telt een onopruimbare oude foto als mislukt en gaat door met de rest', async () => {
      // Het opgeslagen pad wijst niet meer naar een bestand - hier naar de
      // uploadmap zelf. Het verwijderen daarvan mislukt, en dat mag de
      // synchronisatie van de overige leden niet stilzetten.
      zetMicrosoftAan(vereniging.id);
      const stuk = lidMetMicrosoftId('stuk@vereniging.nl', 'entra-stuk');
      const gezond = lidMetMicrosoftId('gezond@vereniging.nl', 'entra-gezond');
      const map = path.resolve(config.uploadDir);
      fs.mkdirSync(map, { recursive: true });
      db.prepare('UPDATE users SET profile_photo_path = ? WHERE id = ?').run(map, stuk.id);
      fotoAntwoord = { status: 200, binair: Buffer.from('nagebootste-jpeg-inhoud') };

      const res = await fotos(beheerderToken);
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.failed).toBe(1);
      expect(res.body.synced).toBe(1);

      const gezondNa = db.prepare('SELECT profile_photo_path FROM users WHERE id = ?').get(gezond.id) as {
        profile_photo_path: string | null;
      };
      expect(gezondNa.profile_photo_path).toBeTruthy();
    });

    it('haalt geen foto op voor een lid van een andere vereniging', async () => {
      zetMicrosoftAan(vereniging.id);
      const elders = createTestUser(andereVereniging.id, { email: 'elders@test.nl' });
      db.prepare('UPDATE users SET microsoft_id = ? WHERE id = ?').run('entra-elders', elders.id);
      fotoAntwoord = { status: 200, binair: Buffer.from('nagebootste-jpeg-inhoud') };

      const res = await fotos(beheerderToken);
      expect(res.body.synced).toBe(0);
      expect(opgevraagdeAdressen.some((a) => a.includes('entra-elders'))).toBe(false);
    });

    it('meldt eerst dat Microsoft niet is ingesteld', async () => {
      const res = await fotos(beheerderToken);
      expect(res.status).toBe(400);
      expect(fetch).not.toHaveBeenCalled();
    });

    it('is niet voor een gewoon lid', async () => {
      zetMicrosoftAan(vereniging.id);
      expect((await fotos(lidToken)).status).toBe(403);
    });

    it('weigert een verzoek zonder token', async () => {
      expect((await request(app).post('/api/entra/sync-photos').send({})).status).toBe(401);
      expect(beheerder.id).toBeTruthy();
    });
  });
});
