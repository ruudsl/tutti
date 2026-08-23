/**
 * De Microsoft 365-kant van in- en uitschrijven.
 *
 * Dit is veruit het grootste deel van routes/onboarding.ts en het stond
 * helemaal zonder test: een account aanmaken in de tenant, er een licentie op
 * zetten, het in de juiste groepen hangen, de post laten doorsturen naar het
 * priveadres, een foto plaatsen en het bij uitschrijven weer weghalen. Alles
 * wat hier misgaat gaat mis bij een echte vereniging met echte licenties.
 *
 * Wat hier vastligt:
 *
 *  - Elk van die stappen kan los mislukken zonder dat het lokale lid
 *    verdwijnt. De route vangt de fouten op en meldt ze; de test controleert
 *    dat het lid daarna gewoon bestaat en dat de melding klopt met wat er
 *    werkelijk gebeurd is. Melden dat alles gelukt is terwijl de licentie
 *    niet is toegekend, is erger dan een foutmelding.
 *  - De volgorde. Een account in de tenant is niet terug te draaien met een
 *    database-transactie; wat onherstelbaar is moet dus na de controles komen.
 *
 * Er gaat geen enkel verzoek het netwerk op: `fetch` is vervangen door een
 * nagebootste Graph-tenant.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import fs from 'fs';
import '../setup';
import db from '../../database/connection';
import onboardingRoutes from '../../routes/onboarding';
import { errorHandler } from '../../middleware/errorHandler';
import {
  createTestEnvironment,
  createTestAssociation,
  createTestInstrument,
  createTestOrchestra,
  createTestUser,
  generateTestToken,
  TestAssociation,
  TestOrchestra,
  TestUser,
} from '../testUtils';

const app = express();
app.use(express.json());
app.use('/api/onboarding', onboardingRoutes);
app.use(errorHandler);

/** Een antwoord zoals fetch dat teruggeeft. */
function antwoord(status: number, body: unknown) {
  const tekst = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    json: async () => (typeof body === 'string' ? JSON.parse(body) : body),
    text: async () => tekst,
  };
}

/**
 * De nagebootste tenant. Elke stap heeft een eigen antwoord dat een test kan
 * omzetten; standaard lukt alles.
 */
/** Een stap kan ook stuklopen op het netwerk in plaats van te antwoorden. */
type Stap = ReturnType<typeof antwoord> | Error;

const storing = (bericht: string) => new Error(bericht);

interface Tenant {
  token: ReturnType<typeof antwoord>;
  organisatie: ReturnType<typeof antwoord>;
  gebruikerAanmaken: ReturnType<typeof antwoord>;
  licenties: ReturnType<typeof antwoord>;
  licentieToekennen: ReturnType<typeof antwoord>;
  groepZoeken: ReturnType<typeof antwoord>;
  groepToevoegen: Stap;
  overigeAdressen: Stap;
  exchangeDoorsturen: ReturnType<typeof antwoord>;
  postregel: ReturnType<typeof antwoord>[];
  foto: Stap;
  gebruikerVerwijderen: ReturnType<typeof antwoord>;
}

const M365_ID = 'ms-user-0001';
const DOMEIN = 'harmonie.nl';

function standaardTenant(): Tenant {
  return {
    token: antwoord(200, { access_token: 'app-token' }),
    organisatie: antwoord(200, {
      value: [
        {
          verifiedDomains: [
            { name: 'harmonie.onmicrosoft.com', isDefault: false },
            { name: DOMEIN, isDefault: true },
          ],
        },
      ],
    }),
    gebruikerAanmaken: antwoord(201, { id: M365_ID }),
    licenties: antwoord(200, {
      value: [
        {
          skuId: 'sku-basic',
          skuPartNumber: 'MICROSOFT_365_BUSINESS_BASIC',
          consumedUnits: 3,
          prepaidUnits: { enabled: 10 },
        },
      ],
    }),
    licentieToekennen: antwoord(200, { id: M365_ID }),
    groepZoeken: antwoord(200, { value: [{ id: 'groep-1', displayName: 'Harmonie' }] }),
    groepToevoegen: antwoord(204, ''),
    overigeAdressen: antwoord(204, ''),
    exchangeDoorsturen: antwoord(200, {}),
    postregel: [antwoord(201, { id: 'regel-1' })],
    foto: antwoord(200, {}),
    gebruikerVerwijderen: antwoord(204, ''),
  };
}

describe('in- en uitschrijven met Microsoft 365', () => {
  let vereniging: TestAssociation;
  let orkest: TestOrchestra;
  let beheerder: TestUser;
  let beheerderToken: string;
  let lidToken: string;

  let andereVereniging: TestAssociation;
  let anderOrkest: TestOrchestra;

  let tenant: Tenant;
  let nep: ReturnType<typeof vi.fn>;
  let postregelBeurt: number;
  let fotos: string[];

  function zetMicrosoftAan(associationId: string) {
    db.prepare(
      `UPDATE associations
         SET microsoft_client_id = 'client', microsoft_client_secret = 'geheim',
             microsoft_tenant_id = 'tenant-1', microsoft_enabled = 1
       WHERE id = ?`,
    ).run(associationId);
  }

  beforeEach(() => {
    const omgeving = createTestEnvironment();
    vereniging = omgeving.association;
    beheerder = omgeving.adminUser;
    beheerderToken = omgeving.adminToken;
    lidToken = omgeving.memberToken;
    orkest = createTestOrchestra(vereniging.id, { name: 'Harmonieorkest' });

    andereVereniging = createTestAssociation({ name: 'Andere vereniging' });
    anderOrkest = createTestOrchestra(andereVereniging.id, { name: 'Fanfare Elders' });

    zetMicrosoftAan(vereniging.id);

    tenant = standaardTenant();
    postregelBeurt = 0;
    fotos = [];

    nep = vi.fn(async (url: unknown, opties: { method?: string } = {}) => {
      const adres = String(url);
      const methode = (opties.method || 'GET').toUpperCase();

      const geef = (stap: Stap) => {
        if (stap instanceof Error) throw stap;
        return stap;
      };

      if (adres.includes('login.microsoftonline.com')) return tenant.token;
      if (adres.includes('/v1.0/organization')) return tenant.organisatie;
      if (adres.includes('/subscribedSkus')) return tenant.licenties;
      if (adres.includes('/assignLicense')) return tenant.licentieToekennen;
      if (adres.includes('/members/$ref')) return geef(tenant.groepToevoegen);
      if (adres.includes('/v1.0/groups?')) return tenant.groepZoeken;
      if (adres.includes('/photo/$value')) return geef(tenant.foto);
      if (adres.includes('/messageRules')) {
        return tenant.postregel[Math.min(postregelBeurt++, tenant.postregel.length - 1)];
      }
      if (adres.includes('/beta/admin/exchange/mailboxes/')) return tenant.exchangeDoorsturen;
      if (adres.endsWith('/v1.0/users') && methode === 'POST') return tenant.gebruikerAanmaken;
      if (adres.includes('/v1.0/users/') && methode === 'PATCH') return geef(tenant.overigeAdressen);
      if (adres.includes('/v1.0/users/') && methode === 'DELETE') return tenant.gebruikerVerwijderen;

      throw new Error(`Onverwacht adres in de test: ${methode} ${adres}`);
    });
    vi.stubGlobal('fetch', nep);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    for (const pad of fotos) {
      try {
        fs.unlinkSync(pad);
      } catch {
        /* al weg */
      }
    }
  });

  type Methode = 'get' | 'post';
  const als = (token: string, methode: Methode, pad: string) =>
    request(app)[methode](`/api/onboarding${pad}`).set('Authorization', `Bearer ${token}`);

  const nieuwLid = (body: Record<string, unknown> = {}) =>
    als(beheerderToken, 'post', '/member').send({
      firstName: 'Nieuw',
      lastName: 'Lid',
      email: 'nieuw@vereniging.nl',
      createM365Account: true,
      ...body,
    });

  /** De aanvragen die naar Graph gingen, als [methode, adres, body]. */
  function aanroepen(): { methode: string; adres: string; body: any }[] {
    return nep.mock.calls.map(([url, opties]) => {
      const o = (opties || {}) as { method?: string; body?: string };
      let body: any;
      try {
        body = o.body && typeof o.body === 'string' ? JSON.parse(o.body) : null;
      } catch {
        body = null;
      }
      return { methode: (o.method || 'GET').toUpperCase(), adres: String(url), body };
    });
  }

  const gebruikerAangemaaktInTenant = () =>
    aanroepen().some((a) => a.methode === 'POST' && a.adres.endsWith('/v1.0/users'));

  /** Onthoud een lokaal weggeschreven profielfoto zodat afterEach hem opruimt. */
  function onthoudFoto(userId: string) {
    const rij = db.prepare('SELECT profile_photo_path FROM users WHERE id = ?').get(userId) as
      { profile_photo_path: string | null } | undefined;
    if (rij?.profile_photo_path) fotos.push(rij.profile_photo_path);
  }

  // ==========================================================================

  describe('het account in de tenant', () => {
    it('maakt het aan en bewaart het Microsoft-id bij het lid', async () => {
      const res = await nieuwLid();
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      expect(res.body.m365Created).toBe(true);

      const rij = db.prepare('SELECT microsoft_id FROM users WHERE id = ?').get(res.body.userId) as {
        microsoft_id: string;
      };
      expect(rij.microsoft_id).toBe(M365_ID);
    });

    it('gebruikt het opgegeven adres als dat al op het eigen domein staat', async () => {
      await nieuwLid({ email: `nieuw.lid@${DOMEIN}` });
      const aanmaak = aanroepen().find((a) => a.methode === 'POST' && a.adres.endsWith('/v1.0/users'));
      expect(aanmaak!.body.userPrincipalName).toBe(`nieuw.lid@${DOMEIN}`);
    });

    it('bouwt anders een adres op het standaarddomein van de tenant', async () => {
      await nieuwLid({ email: 'thuis@gmail.com', firstName: 'Jan', lastName: 'de Vries' });
      const aanmaak = aanroepen().find((a) => a.methode === 'POST' && a.adres.endsWith('/v1.0/users'));
      expect(aanmaak!.body.userPrincipalName).toBe(`jan.devries@${DOMEIN}`);
      expect(aanmaak!.body.mailNickname).toBe('jandevries');
    });

    it('dwingt af dat het lid zijn wachtwoord bij de eerste keer inloggen wijzigt', async () => {
      const res = await nieuwLid();
      const aanmaak = aanroepen().find((a) => a.methode === 'POST' && a.adres.endsWith('/v1.0/users'));
      expect(aanmaak!.body.passwordProfile.forceChangePasswordNextSignIn).toBe(true);
      expect(aanmaak!.body.passwordProfile.password).toBe(res.body.tempPassword);
    });

    it('zet het prive-adres als nevenadres in de tenant', async () => {
      await nieuwLid({ privateEmail: 'thuis@gmail.com' });
      const aanmaak = aanroepen().find((a) => a.methode === 'POST' && a.adres.endsWith('/v1.0/users'));
      expect(aanmaak!.body.otherMails).toEqual(['thuis@gmail.com']);
    });

    it('zet de orkesten als afdeling', async () => {
      const tweede = createTestOrchestra(vereniging.id, { name: 'Opleidingsorkest' });
      await nieuwLid({ orchestraIds: [orkest.id, tweede.id] });

      const aanmaak = aanroepen().find((a) => a.methode === 'POST' && a.adres.endsWith('/v1.0/users'));
      expect(aanmaak!.body.department).toBe('Harmonieorkest, Opleidingsorkest');
    });

    it('vraagt geen token als Microsoft niet is ingesteld', async () => {
      db.prepare('UPDATE associations SET microsoft_enabled = 0 WHERE id = ?').run(vereniging.id);
      const res = await nieuwLid();

      expect(res.body.m365Error).toBe('Microsoft integratie is niet geconfigureerd');
      expect(nep).not.toHaveBeenCalled();
    });

    it('vraagt ook geen token als het clientgeheim ontbreekt', async () => {
      db.prepare('UPDATE associations SET microsoft_client_secret = NULL WHERE id = ?').run(vereniging.id);
      const res = await nieuwLid();
      expect(res.body.m365Error).toBe('Microsoft integratie is niet geconfigureerd');
    });
  });

  describe('als er bij Microsoft iets misgaat', () => {
    /** Het lid moet er lokaal altijd zijn, hoe de tenant ook antwoordt. */
    async function lidBestaatOndanks(res: request.Response) {
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      const rij = db.prepare('SELECT status FROM users WHERE id = ?').get(res.body.userId) as { status: string };
      expect(rij.status).toBe('active');
    }

    it('meldt een mislukt toegangstoken en maakt het lid toch aan', async () => {
      tenant.token = antwoord(401, { error: 'invalid_client' });
      const res = await nieuwLid();

      expect(res.body.m365Created).toBe(false);
      expect(res.body.m365Error).toMatch(/toegangstoken/);
      await lidBestaatOndanks(res);
    });

    it('meldt het als de organisatiegegevens niet op te halen zijn', async () => {
      tenant.organisatie = antwoord(500, {});
      const res = await nieuwLid();

      expect(res.body.m365Error).toBe('Kan organisatie-informatie niet ophalen');
      await lidBestaatOndanks(res);
    });

    it('meldt het als de tenant geen standaarddomein heeft', async () => {
      tenant.organisatie = antwoord(200, { value: [{ verifiedDomains: [{ name: 'x.nl', isDefault: false }] }] });
      const res = await nieuwLid();

      expect(res.body.m365Error).toBe('Geen default domein gevonden in M365');
      expect(gebruikerAangemaaktInTenant()).toBe(false);
      await lidBestaatOndanks(res);
    });

    it('geeft de melding van Microsoft door als het account niet aangemaakt kan worden', async () => {
      tenant.gebruikerAanmaken = antwoord(400, { error: { message: 'Another object with the same value exists' } });
      const res = await nieuwLid();

      expect(res.body.m365Created).toBe(false);
      expect(res.body.m365Error).toBe('Another object with the same value exists');
      expect(res.body.instructions.join(' ')).toContain('Another object with the same value exists');
      await lidBestaatOndanks(res);
    });

    it('valt terug op een algemene melding als Microsoft er geen geeft', async () => {
      tenant.gebruikerAanmaken = antwoord(400, {});
      const res = await nieuwLid();
      expect(res.body.m365Error).toBe('Kon M365 account niet aanmaken');
    });

    it('vangt een netwerkstoring op', async () => {
      nep.mockRejectedValue(new Error('getaddrinfo ENOTFOUND'));
      const res = await nieuwLid();

      expect(res.body.m365Error).toBe('getaddrinfo ENOTFOUND');
      await lidBestaatOndanks(res);
    });
  });

  describe('de licentie', () => {
    it('kent de eerste ondersteunde licentie met vrije plaatsen toe', async () => {
      const res = await nieuwLid();
      expect(res.body.licenseAssigned).toBe(true);

      const toekenning = aanroepen().find((a) => a.adres.includes('/assignLicense'));
      expect(toekenning!.body.addLicenses).toEqual([{ skuId: 'sku-basic' }]);
    });

    it('slaat een licentie over waarvan alle plaatsen bezet zijn', async () => {
      tenant.licenties = antwoord(200, {
        value: [
          {
            skuId: 'sku-vol',
            skuPartNumber: 'MICROSOFT_365_BUSINESS_BASIC',
            consumedUnits: 10,
            prepaidUnits: { enabled: 10 },
          },
          { skuId: 'sku-vrij', skuPartNumber: 'ENTERPRISEPACK', consumedUnits: 1, prepaidUnits: { enabled: 5 } },
        ],
      });
      await nieuwLid();

      const toekenning = aanroepen().find((a) => a.adres.includes('/assignLicense'));
      expect(toekenning!.body.addLicenses).toEqual([{ skuId: 'sku-vrij' }]);
    });

    it('waarschuwt als er geen enkele plaats vrij is', async () => {
      tenant.licenties = antwoord(200, {
        value: [
          {
            skuId: 'sku-vol',
            skuPartNumber: 'MICROSOFT_365_BUSINESS_BASIC',
            consumedUnits: 10,
            prepaidUnits: { enabled: 10 },
          },
        ],
      });
      const res = await nieuwLid();

      expect(res.body.licenseAssigned).toBe(false);
      expect(res.body.instructions.join(' ')).toContain('Licentie kon NIET worden toegewezen');
    });

    it('waarschuwt als de tenant geen ondersteunde licentie heeft', async () => {
      tenant.licenties = antwoord(200, {
        value: [
          { skuId: 'sku-x', skuPartNumber: 'ONBEKENDE_LICENTIE', consumedUnits: 0, prepaidUnits: { enabled: 5 } },
        ],
      });
      const res = await nieuwLid();

      expect(res.body.licenseAssigned).toBe(false);
      expect(aanroepen().some((a) => a.adres.includes('/assignLicense'))).toBe(false);
    });

    it('waarschuwt als de licentielijst niet op te halen is', async () => {
      tenant.licenties = antwoord(403, {});
      const res = await nieuwLid();
      expect(res.body.licenseAssigned).toBe(false);
    });

    it('waarschuwt als het toekennen zelf mislukt', async () => {
      tenant.licentieToekennen = antwoord(400, { error: { message: 'Geen plaatsen meer' } });
      const res = await nieuwLid();
      expect(res.body.licenseAssigned).toBe(false);
    });

    it('laat het lid ook zonder licentie bestaan', async () => {
      tenant.licentieToekennen = antwoord(400, {});
      const res = await nieuwLid();
      expect(res.body.m365Created).toBe(true);
      expect(db.prepare('SELECT COUNT(*) as n FROM users WHERE id = ?').get(res.body.userId)).toEqual({ n: 1 });
    });
  });

  describe('de groepen', () => {
    function koppelOrkestAanGroep(orchestraId: string, associationId: string, groepsnaam: string) {
      db.prepare(
        `INSERT INTO m365_group_mappings (id, association_id, orchestra_id, group_name, group_type)
         VALUES (?, ?, ?, ?, 'orchestra')`,
      ).run(`map-${groepsnaam}`, associationId, orchestraId, groepsnaam);
    }

    it('zet het lid in de groep die bij zijn orkest hoort', async () => {
      koppelOrkestAanGroep(orkest.id, vereniging.id, 'Harmonie');
      const res = await nieuwLid({ orchestraIds: [orkest.id] });

      expect(res.body.groupsAdded).toEqual(['Harmonie']);
      expect(res.body.instructions.join(' ')).toContain('Toegevoegd aan groepen: Harmonie');
    });

    it('zoekt de groep op naam en ontsnapt een apostrof in die naam', async () => {
      koppelOrkestAanGroep(orkest.id, vereniging.id, "'t Harmonieorkest");
      await nieuwLid({ orchestraIds: [orkest.id] });

      const zoek = aanroepen().find((a) => a.adres.includes('/v1.0/groups?'));
      expect(decodeURIComponent(zoek!.adres)).toContain("displayName eq '''t Harmonieorkest'");
    });

    it('gebruikt geen groep van een andere vereniging', async () => {
      // De mapping van een andere vereniging voor hetzelfde orkest-id mag hier
      // niet meetellen.
      koppelOrkestAanGroep(orkest.id, andereVereniging.id, 'Groep van hun');
      const res = await nieuwLid({ orchestraIds: [orkest.id] });

      expect(res.body.groupsAdded).toEqual([]);
      expect(aanroepen().some((a) => a.adres.includes('/v1.0/groups?'))).toBe(false);
    });

    it('meldt een groep die in de tenant niet bestaat als mislukt', async () => {
      koppelOrkestAanGroep(orkest.id, vereniging.id, 'Bestaatniet');
      tenant.groepZoeken = antwoord(200, { value: [] });
      const res = await nieuwLid({ orchestraIds: [orkest.id] });

      expect(res.body.groupsFailed).toEqual(['Bestaatniet']);
      expect(res.body.instructions.join(' ')).toContain('Kon niet toevoegen aan: Bestaatniet');
    });

    it('meldt het als het zoeken naar de groep mislukt', async () => {
      koppelOrkestAanGroep(orkest.id, vereniging.id, 'Harmonie');
      tenant.groepZoeken = antwoord(403, 'Insufficient privileges');
      const res = await nieuwLid({ orchestraIds: [orkest.id] });

      expect(res.body.groupsFailed).toEqual(['Harmonie']);
    });

    it('meldt het als het toevoegen mislukt', async () => {
      koppelOrkestAanGroep(orkest.id, vereniging.id, 'Harmonie');
      tenant.groepToevoegen = antwoord(500, { error: { code: 'InternalError', message: 'Oeps' } });
      const res = await nieuwLid({ orchestraIds: [orkest.id] });

      expect(res.body.groupsFailed).toEqual(['Harmonie']);
    });

    it('ziet een lid dat al in de groep zit als gelukt', async () => {
      koppelOrkestAanGroep(orkest.id, vereniging.id, 'Harmonie');
      tenant.groepToevoegen = antwoord(400, {
        error: { code: 'Request_BadRequest', message: 'One or more added object references already exist' },
      });
      const res = await nieuwLid({ orchestraIds: [orkest.id] });

      expect(res.body.groupsAdded).toEqual(['Harmonie']);
      expect(res.body.groupsFailed).toEqual([]);
    });

    it('meldt een netwerkstoring bij het toevoegen als mislukte groep', async () => {
      koppelOrkestAanGroep(orkest.id, vereniging.id, 'Harmonie');
      tenant.groepToevoegen = storing('ECONNRESET');
      const res = await nieuwLid({ orchestraIds: [orkest.id] });

      expect(res.status, JSON.stringify(res.body)).toBe(201);
      expect(res.body.groupsFailed).toEqual(['Harmonie']);
      expect(res.body.m365Created).toBe(true);
    });

    it('zet een slagwerker in de slagwerkgroep, ook zonder dat erom gevraagd wordt', async () => {
      const slagwerk = createTestInstrument({ name: 'Slagwerk' });
      db.prepare(
        `INSERT INTO m365_group_mappings (id, association_id, orchestra_id, group_name, group_type)
         VALUES (?, ?, NULL, 'Slagwerkgroep', 'percussion')`,
      ).run('map-slag', vereniging.id);

      const res = await nieuwLid({ instrumentIds: [slagwerk.id] });
      expect(res.body.groupsAdded).toEqual(['Slagwerkgroep']);
    });

    it('doet dat ook op verzoek zonder slagwerkinstrument', async () => {
      db.prepare(
        `INSERT INTO m365_group_mappings (id, association_id, orchestra_id, group_name, group_type)
         VALUES (?, ?, NULL, 'Slagwerkgroep', 'percussion')`,
      ).run('map-slag', vereniging.id);

      const res = await nieuwLid({ addToPercussionGroup: true });
      expect(res.body.groupsAdded).toEqual(['Slagwerkgroep']);
    });

    it('doet niets als er geen slagwerkgroep is ingesteld', async () => {
      const slagwerk = createTestInstrument({ name: 'Pauken' });
      const res = await nieuwLid({ instrumentIds: [slagwerk.id] });
      expect(res.body.groupsAdded).toEqual([]);
    });

    it('zet een trompettist niet in de slagwerkgroep', async () => {
      const trompet = createTestInstrument({ name: 'Trompet' });
      db.prepare(
        `INSERT INTO m365_group_mappings (id, association_id, orchestra_id, group_name, group_type)
         VALUES (?, ?, NULL, 'Slagwerkgroep', 'percussion')`,
      ).run('map-slag', vereniging.id);

      const res = await nieuwLid({ instrumentIds: [trompet.id] });
      expect(res.body.groupsAdded).toEqual([]);
    });
  });

  describe('de functietitel', () => {
    it('komt uit de mapping van de eigen vereniging', async () => {
      const trompet = createTestInstrument({ name: 'Trompet' });
      db.prepare(
        `INSERT INTO instrument_job_title_mappings (id, association_id, instrument_id, job_title)
         VALUES (?, ?, ?, ?)`,
      ).run('t-1', vereniging.id, trompet.id, 'Trompettist');

      const res = await nieuwLid({ instrumentIds: [trompet.id] });
      expect(res.body.jobTitleSet).toBe('Trompettist');

      const aanmaak = aanroepen().find((a) => a.methode === 'POST' && a.adres.endsWith('/v1.0/users'));
      expect(aanmaak!.body.jobTitle).toBe('Trompettist');
    });

    it('gebruikt de mapping van een andere vereniging niet', async () => {
      const trompet = createTestInstrument({ name: 'Trompet' });
      db.prepare(
        `INSERT INTO instrument_job_title_mappings (id, association_id, instrument_id, job_title)
         VALUES (?, ?, ?, ?)`,
      ).run('t-1', andereVereniging.id, trompet.id, 'Titel van hun');

      const res = await nieuwLid({ instrumentIds: [trompet.id] });
      expect(res.body.jobTitleSet).toBeNull();
    });

    it('waarschuwt als er wel een instrument maar geen mapping is', async () => {
      const trompet = createTestInstrument({ name: 'Trompet' });
      const res = await nieuwLid({ instrumentIds: [trompet.id] });
      expect(res.body.instructions.join(' ')).toContain('Functietitel niet ingesteld');
    });

    it('waarschuwt niet als er helemaal geen instrument is opgegeven', async () => {
      const res = await nieuwLid();
      expect(res.body.instructions.join(' ')).not.toContain('Functietitel niet ingesteld');
    });
  });

  describe('de post doorsturen naar het priveadres', () => {
    const metPriveadres = () => nieuwLid({ privateEmail: 'thuis@gmail.com' });

    it('lukt via de Exchange-beheerkant', async () => {
      const res = await metPriveadres();
      expect(res.body.emailForwardingSet).toBe(true);
      expect(aanroepen().some((a) => a.adres.includes('/messageRules'))).toBe(false);
    });

    it('valt terug op een postbusregel als de beheerkant het niet kent', async () => {
      tenant.exchangeDoorsturen = antwoord(404, { error: { code: 'ResourceNotFound' } });
      const res = await metPriveadres();

      expect(res.body.emailForwardingSet).toBe(true);
      const regel = aanroepen().find((a) => a.adres.includes('/messageRules'));
      expect(regel!.body.actions.forwardTo[0].emailAddress.address).toBe('thuis@gmail.com');
    });

    it('valt ook terug bij een andere fout van de beheerkant', async () => {
      tenant.exchangeDoorsturen = antwoord(500, { error: { code: 'InternalServerError', message: 'Oeps' } });
      const res = await metPriveadres();
      expect(res.body.emailForwardingSet).toBe(true);
    });

    it('gaat door als het nevenadres niet gezet kan worden', async () => {
      tenant.overigeAdressen = antwoord(400, { error: { message: 'Kan niet' } });
      const res = await metPriveadres();
      expect(res.body.emailForwardingSet).toBe(true);
    });

    it('meldt het eerlijk als beide manieren mislukken', async () => {
      tenant.exchangeDoorsturen = antwoord(500, { error: { code: 'InternalServerError', message: 'Oeps' } });
      // Een fout die niets met een nog niet ingerichte postbus te maken heeft,
      // zodat de route niet gaat wachten en opnieuw proberen.
      tenant.postregel = [antwoord(403, { error: { code: 'ErrorAccessDenied', message: 'Geen rechten' } })];

      const res = await metPriveadres();
      expect(res.body.emailForwardingSet).toBe(false);
      expect(res.body.instructions.join(' ')).toContain('kon niet direct worden ingesteld');
    });

    it('probeert het opnieuw als de postbus nog niet klaar is', async () => {
      tenant.exchangeDoorsturen = antwoord(404, { error: { code: 'ResourceNotFound' } });
      tenant.postregel = [
        antwoord(404, { error: { code: 'MailboxNotEnabledForRESTAPI', message: 'Mailbox is nog niet klaar' } }),
        antwoord(201, { id: 'regel-1' }),
      ];

      const res = await metPriveadres();
      expect(res.body.emailForwardingSet).toBe(true);
      expect(aanroepen().filter((a) => a.adres.includes('/messageRules'))).toHaveLength(2);
    }, 20000);

    it('zet een openstaande taak klaar als het doorsturen niet lukte', async () => {
      tenant.exchangeDoorsturen = antwoord(500, { error: { code: 'X', message: 'Oeps' } });
      tenant.postregel = [antwoord(403, { error: { code: 'ErrorAccessDenied', message: 'Geen rechten' } })];

      const res = await metPriveadres();
      const taak = db
        .prepare(
          "SELECT status, metadata FROM onboarding_tasks WHERE user_id = ? AND task_type = 'email_forwarding_pending'",
        )
        .get(res.body.userId) as { status: string; metadata: string } | undefined;

      expect(taak?.status).toBe('pending');
      expect(JSON.parse(taak!.metadata).privateEmail).toBe('thuis@gmail.com');
    });

    it('noteert het als afgeronde taak als het wel lukte', async () => {
      const res = await metPriveadres();
      const taak = db
        .prepare("SELECT status FROM onboarding_tasks WHERE user_id = ? AND task_type = 'email_forwarding'")
        .get(res.body.userId) as { status: string } | undefined;
      expect(taak?.status).toBe('completed');
    });

    it('waarschuwt dat de postbus zonder licentie niet bestaat', async () => {
      tenant.licentieToekennen = antwoord(400, {});
      tenant.exchangeDoorsturen = antwoord(500, { error: { code: 'X', message: 'Oeps' } });
      tenant.postregel = [antwoord(403, { error: { code: 'ErrorAccessDenied', message: 'Geen rechten' } })];

      const res = await metPriveadres();
      expect(res.body.instructions.join(' ')).toContain('mailbox niet beschikbaar zonder licentie');
    });

    it('meldt het doorsturen als mislukt bij een netwerkstoring', async () => {
      tenant.overigeAdressen = storing('ECONNRESET');
      const res = await metPriveadres();

      expect(res.status, JSON.stringify(res.body)).toBe(201);
      expect(res.body.emailForwardingSet).toBe(false);
      expect(res.body.m365Created).toBe(true);
    });

    it('doet niets als er geen prive-adres is opgegeven', async () => {
      const res = await nieuwLid();
      expect(res.body.emailForwardingSet).toBe(false);
      expect(aanroepen().some((a) => a.adres.includes('/messageRules'))).toBe(false);
      expect(aanroepen().some((a) => a.adres.includes('/beta/admin/exchange'))).toBe(false);
    });
  });

  describe('de profielfoto', () => {
    const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 1)]);

    const metFoto = (bestandsnaam: string, type: string, inhoud: Buffer) =>
      request(app)
        .post('/api/onboarding/member')
        .set('Authorization', `Bearer ${beheerderToken}`)
        .field('firstName', 'Nieuw')
        .field('lastName', 'Lid')
        .field('email', 'nieuw@vereniging.nl')
        .field('createM365Account', 'true')
        .attach('profilePhoto', inhoud, { filename: bestandsnaam, contentType: type });

    it('zet hem in de tenant en bewaart hem lokaal', async () => {
      const res = await metFoto('foto.jpg', 'image/jpeg', JPEG);
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      onthoudFoto(res.body.userId);

      expect(res.body.photoUploaded).toBe(true);
      expect(res.body.instructions.join(' ')).toContain('Profielfoto is geüpload');

      const rij = db.prepare('SELECT profile_photo_path FROM users WHERE id = ?').get(res.body.userId) as {
        profile_photo_path: string | null;
      };
      expect(rij.profile_photo_path).toBeTruthy();
      expect(fs.existsSync(rij.profile_photo_path!)).toBe(true);
    });

    it('leest de id-lijsten uit een formulier ook als JSON-tekst', async () => {
      const res = await request(app)
        .post('/api/onboarding/member')
        .set('Authorization', `Bearer ${beheerderToken}`)
        .field('firstName', 'Nieuw')
        .field('lastName', 'Lid')
        .field('email', 'nieuw@vereniging.nl')
        .field('orchestraIds', JSON.stringify([orkest.id]))
        .attach('profilePhoto', JPEG, { filename: 'foto.jpg', contentType: 'image/jpeg' });

      expect(res.status, JSON.stringify(res.body)).toBe(201);
      onthoudFoto(res.body.userId);
      const rijen = db.prepare('SELECT orchestra_id FROM user_orchestras WHERE user_id = ?').all(res.body.userId);
      expect(rijen).toHaveLength(1);
    });

    it('meldt het als de tenant de foto weigert, maar houdt het lid', async () => {
      tenant.foto = antwoord(413, 'Payload too large');
      const res = await metFoto('foto.jpg', 'image/jpeg', JPEG);

      expect(res.status).toBe(201);
      onthoudFoto(res.body.userId);
      expect(res.body.photoUploaded).toBe(false);
    });

    it('houdt het lid ook als de foto op een netwerkstoring stukloopt', async () => {
      tenant.foto = storing('ECONNRESET');
      const res = await metFoto('foto.jpg', 'image/jpeg', JPEG);

      expect(res.status, JSON.stringify(res.body)).toBe(201);
      onthoudFoto(res.body.userId);
      expect(res.body.photoUploaded).toBe(false);
    });

    it('weigert een bestand dat geen jpg of png is', async () => {
      const res = await metFoto('stuk.pdf', 'application/pdf', Buffer.from('%PDF-1.4'));
      expect(res.status).toBe(500);
      expect(gebruikerAangemaaktInTenant()).toBe(false);
    });
  });

  describe('de volgorde: wat onherstelbaar is komt na de controles', () => {
    /**
     * ECHTE FOUT - bewezen rood zonder de reparatie.
     *
     * De controle of de gekozen orkesten bij deze vereniging horen stond in de
     * database-transactie, helemaal onderaan. Het M365-account werd daarvoor
     * al aangemaakt en van een licentie voorzien. Bij een orkest-id van een
     * andere vereniging rolde de transactie terug - het lokale lid verdween -
     * maar het account in de tenant bleef staan, mét de licentie die het
     * opgesoupeerd had. De beheerder kreeg een 400 en had geen idee dat er in
     * Microsoft een verweesd account was achtergebleven.
     *
     * Een transactie draait de database terug, niet de buitenwereld. De
     * controle staat daarom nu vooraan.
     *
     * Zonder de reparatie: de POST naar /v1.0/users is wél gedaan. Aangetoond
     * door onboarding.ts terug te zetten op HEAD en deze test te draaien.
     */
    it('maakt geen M365-account aan voor een lid met een orkest van een andere vereniging', async () => {
      const res = await nieuwLid({ orchestraIds: [anderOrkest.id] });

      expect(res.status, JSON.stringify(res.body)).toBe(400);
      expect(gebruikerAangemaaktInTenant()).toBe(false);
    });

    it('laat dan ook geen licentie verbruiken', async () => {
      await nieuwLid({ orchestraIds: [anderOrkest.id] });
      expect(aanroepen().some((a) => a.adres.includes('/assignLicense'))).toBe(false);
    });

    it('laat het lid niet half achter', async () => {
      await nieuwLid({ orchestraIds: [anderOrkest.id] });
      expect(db.prepare('SELECT COUNT(*) as n FROM users WHERE email = ?').get('nieuw@vereniging.nl')).toEqual({
        n: 0,
      });
    });

    it('maakt ook geen M365-account aan voor een adres dat al bestaat', async () => {
      await nieuwLid({ email: beheerder.email });
      expect(gebruikerAangemaaktInTenant()).toBe(false);
    });
  });

  // ==========================================================================

  describe('uitschrijven met verwijdering uit de tenant', () => {
    let lid: TestUser;

    beforeEach(() => {
      lid = createTestUser(vereniging.id, { email: 'weg@vereniging.nl' });
      db.prepare('UPDATE users SET microsoft_id = ? WHERE id = ?').run(M365_ID, lid.id);
    });

    const uitschrijven = (body: Record<string, unknown>) =>
      als(beheerderToken, 'post', `/offboard/${lid.id}`).send(body);

    it('verwijdert het account in de tenant', async () => {
      const res = await uitschrijven({ removeFromM365: true });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.m365Removed).toBe(true);

      const verwijderd = aanroepen().find((a) => a.methode === 'DELETE');
      expect(verwijderd!.adres).toContain(M365_ID);
    });

    it('wist het Microsoft-id bij het lid', async () => {
      await uitschrijven({ removeFromM365: true });
      const rij = db.prepare('SELECT microsoft_id FROM users WHERE id = ?').get(lid.id) as {
        microsoft_id: string | null;
      };
      expect(rij.microsoft_id).toBeNull();
    });

    it('ziet een account dat er al niet meer is ook als verwijderd', async () => {
      tenant.gebruikerVerwijderen = antwoord(404, { error: { message: 'Not found' } });
      const res = await uitschrijven({ removeFromM365: true });
      expect(res.body.m365Removed).toBe(true);
    });

    it('meldt het als het verwijderen mislukt en schrijft het lid toch uit', async () => {
      tenant.gebruikerVerwijderen = antwoord(403, { error: { message: 'Insufficient privileges' } });
      const res = await uitschrijven({ removeFromM365: true });

      expect(res.body.m365Removed).toBe(false);
      expect(res.body.m365Error).toBe('Insufficient privileges');
      expect(res.body.notes.join(' ')).toContain('Insufficient privileges');

      const rij = db.prepare('SELECT status FROM users WHERE id = ?').get(lid.id) as { status: string };
      expect(rij.status).toBe('inactive');
    });

    it('vangt een netwerkstoring bij het verwijderen op', async () => {
      nep.mockRejectedValue(new Error('ECONNRESET'));
      const res = await uitschrijven({ removeFromM365: true });

      expect(res.status).toBe(200);
      expect(res.body.m365Error).toBe('ECONNRESET');
    });

    it('raakt de tenant niet aan als daar niet om gevraagd is', async () => {
      const res = await uitschrijven({});
      expect(res.body.m365Removed).toBe(false);
      expect(nep).not.toHaveBeenCalled();
    });

    it('raakt de tenant niet aan bij een lid zonder M365-account', async () => {
      const zonder = createTestUser(vereniging.id, { email: 'zonder@vereniging.nl' });
      await als(beheerderToken, 'post', `/offboard/${zonder.id}`).send({ removeFromM365: true });
      expect(nep).not.toHaveBeenCalled();
    });

    it('raakt de tenant niet aan als Microsoft niet is ingesteld', async () => {
      db.prepare('UPDATE associations SET microsoft_enabled = 0 WHERE id = ?').run(vereniging.id);
      const res = await uitschrijven({ removeFromM365: true });

      expect(nep).not.toHaveBeenCalled();
      expect(res.body.m365Removed).toBe(false);
    });
  });

  // ==========================================================================

  describe('het doorsturen achteraf opnieuw proberen', () => {
    let lid: TestUser;

    beforeEach(() => {
      lid = createTestUser(vereniging.id, { email: 'weg@vereniging.nl' });
      db.prepare('UPDATE users SET microsoft_id = ?, private_email = ? WHERE id = ?').run(
        M365_ID,
        'thuis@gmail.com',
        lid.id,
      );
    });

    const opnieuw = (userId: string) => als(beheerderToken, 'post', `/retry-email-forwarding/${userId}`).send({});

    it('stelt het doorsturen alsnog in', async () => {
      const res = await opnieuw(lid.id);
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('thuis@gmail.com');
    });

    it('noteert de gelukte poging als afgeronde taak', async () => {
      await opnieuw(lid.id);
      const taak = db
        .prepare("SELECT status FROM onboarding_tasks WHERE user_id = ? AND task_type = 'email_forwarding_retry'")
        .get(lid.id) as { status: string };
      expect(taak.status).toBe('completed');
    });

    it('meldt het als het weer niet lukt', async () => {
      tenant.exchangeDoorsturen = antwoord(500, { error: { code: 'X', message: 'Oeps' } });
      tenant.postregel = [antwoord(403, { error: { code: 'ErrorAccessDenied', message: 'Geen rechten' } })];

      const res = await opnieuw(lid.id);
      expect(res.status).toBe(500);
      expect(res.body.error).toContain('Exchange mailbox');
    });

    it('noteert de mislukte poging als taak', async () => {
      tenant.exchangeDoorsturen = antwoord(500, { error: { code: 'X', message: 'Oeps' } });
      tenant.postregel = [antwoord(403, { error: { code: 'ErrorAccessDenied', message: 'Geen rechten' } })];

      await opnieuw(lid.id);
      const taak = db
        .prepare("SELECT status FROM onboarding_tasks WHERE user_id = ? AND task_type = 'email_forwarding_retry'")
        .get(lid.id) as { status: string };
      expect(taak.status).toBe('failed');
    });

    it('vertelt wanneer de automatische poging gepland staat', async () => {
      tenant.exchangeDoorsturen = antwoord(500, { error: { code: 'X', message: 'Oeps' } });
      tenant.postregel = [antwoord(403, { error: { code: 'ErrorAccessDenied', message: 'Geen rechten' } })];
      db.prepare(
        `INSERT INTO onboarding_tasks (id, user_id, association_id, task_type, status, metadata)
         VALUES (?, ?, ?, 'email_forwarding_pending', 'pending', ?)`,
      ).run(
        'taak-1',
        lid.id,
        vereniging.id,
        JSON.stringify({ nextRetryAfter: new Date(Date.now() + 600000).toISOString() }),
      );

      const res = await opnieuw(lid.id);
      expect(res.body.error).toMatch(/Automatische retry gepland over \d+ minuten/);
    });

    it('valt niet om over een stukgeslagen taak', async () => {
      tenant.exchangeDoorsturen = antwoord(500, { error: { code: 'X', message: 'Oeps' } });
      tenant.postregel = [antwoord(403, { error: { code: 'ErrorAccessDenied', message: 'Geen rechten' } })];
      db.prepare(
        `INSERT INTO onboarding_tasks (id, user_id, association_id, task_type, status, metadata)
         VALUES (?, ?, ?, 'email_forwarding_pending', 'pending', 'geen json')`,
      ).run('taak-1', lid.id, vereniging.id);

      const res = await opnieuw(lid.id);
      expect(res.status).toBe(500);
      expect(res.body.error).not.toContain('Automatische retry gepland');
    });

    it('weigert een lid dat niet bestaat', async () => {
      expect((await opnieuw('11111111-1111-1111-1111-111111111111')).status).toBe(404);
    });

    it('weigert een lid van een andere vereniging', async () => {
      const hunLid = createTestUser(andereVereniging.id, { email: 'lid@elders.nl' });
      db.prepare('UPDATE users SET microsoft_id = ?, private_email = ? WHERE id = ?').run(
        'ms-hun',
        'thuis@elders.nl',
        hunLid.id,
      );

      expect((await opnieuw(hunLid.id)).status).toBe(404);
      expect(nep).not.toHaveBeenCalled();
    });

    it('weigert een lid zonder M365-account', async () => {
      const zonder = createTestUser(vereniging.id, { email: 'zonder@vereniging.nl' });
      const res = await opnieuw(zonder.id);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/geen M365 account/);
    });

    it('weigert een lid zonder prive-adres', async () => {
      db.prepare('UPDATE users SET private_email = NULL WHERE id = ?').run(lid.id);
      const res = await opnieuw(lid.id);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/privé emailadres/);
    });

    it('weigert het als Microsoft niet is ingesteld', async () => {
      db.prepare('UPDATE associations SET microsoft_enabled = 0 WHERE id = ?').run(vereniging.id);
      const res = await opnieuw(lid.id);

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/niet geconfigureerd/);
      expect(nep).not.toHaveBeenCalled();
    });

    it('is niet voor een gewoon lid', async () => {
      expect((await als(lidToken, 'post', `/retry-email-forwarding/${lid.id}`).send({})).status).toBe(403);
    });
  });
});
