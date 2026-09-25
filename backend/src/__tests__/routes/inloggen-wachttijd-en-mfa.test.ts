/**
 * Mislukte inlogpogingen: een oplopende wachttijd per adres en IP-adres, in
 * plaats van een slot op het account.
 *
 * Het oude slot (users.locked_until) had drie gebreken:
 *
 * 1. Een verkeerde MFA-code telde niet mee. Wie het wachtwoord had, kon de
 *    tweede stap onbeperkt proberen.
 * 2. Een onbekend adres kreeg altijd 401 en een bekend adres na vijf keer 429,
 *    zodat te zien was welke adressen bestaan. Ook de looptijd verschilde:
 *    bij een onbekend adres werd geen wachtwoordhash vergeleken.
 * 3. Iedereen kon het account van een ander - ook van een beheerder - tot een
 *    dag op slot zetten door verkeerde wachtwoorden te proberen.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import bcrypt from 'bcryptjs';
import { generateSecret, generateSync } from 'otplib';
import '../setup';
import authRoutes from '../../routes/auth';
import { errorHandler } from '../../middleware/errorHandler';
import { inlogSleutel, wisMislukkingen, MAX_WACHTTIJD_MS, VRIJE_POGINGEN } from '../../utils/inlogvertraging';
import { createTestEnvironment, createTestUser, TestUser, TestAssociation } from '../testUtils';

// Een eigen app die X-Forwarded-For vertrouwt, zodat een test verzoeken van
// verschillende IP-adressen kan laten komen.
const app = express();
app.set('trust proxy', true);
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use(errorHandler);

const AANVALLER = '203.0.113.5';
const ECHTE_GEBRUIKER = '198.51.100.7';

function inloggen(gegevens: { email: string; password: string; mfaCode?: string }, ip = AANVALLER) {
  return request(app).post('/api/auth/login').set('X-Forwarded-For', ip).send(gegevens);
}

/** Een TOTP-code met genoeg tijd over in zijn tijdvak (zie auth.test.ts). */
async function verseTotpCode(secret: string): Promise<string> {
  const resterend = 30_000 - (Date.now() % 30_000);
  if (resterend < 5_000) {
    await new Promise((klaar) => setTimeout(klaar, resterend + 50));
  }
  return generateSync({ secret });
}

/** Een zescijferige code die zeker niet de huidige is. */
function verkeerdeCode(secret: string): string {
  const goed = generateSync({ secret });
  return goed === '000000' ? '111111' : '000000';
}

describe('wachttijd na mislukte inlogpogingen', () => {
  let vereniging: TestAssociation;
  let lid: TestUser;

  beforeEach(() => {
    const omgeving = createTestEnvironment();
    vereniging = omgeving.association;
    lid = omgeving.memberUser;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('de tweede stap (MFA)', () => {
    let secret: string;
    let mfaLid: TestUser;

    beforeEach(() => {
      secret = generateSecret();
      mfaLid = createTestUser(vereniging.id, {
        email: `mfa-${Date.now()}@example.com`,
        mfaEnabled: true,
        mfaSecret: secret,
      });
    });

    it('telt een verkeerde MFA-code mee, zodat de code niet onbeperkt te raden is', async () => {
      for (let i = 0; i < VRIJE_POGINGEN; i++) {
        const antwoord = await inloggen({
          email: mfaLid.email,
          password: mfaLid.password,
          mfaCode: verkeerdeCode(secret),
        });
        expect(antwoord.status).toBe(401);
      }

      // Ook met de goede code: er loopt nu een wachttijd.
      const antwoord = await inloggen({
        email: mfaLid.email,
        password: mfaLid.password,
        mfaCode: await verseTotpCode(secret),
      });
      expect(antwoord.status).toBe(429);
      expect(Number(antwoord.headers['retry-after'])).toBeGreaterThan(0);
    });

    it('remt het raden van de code per account, ook als het IP-adres wisselt', async () => {
      for (let i = 0; i < VRIJE_POGINGEN; i++) {
        await inloggen({ email: mfaLid.email, password: mfaLid.password, mfaCode: verkeerdeCode(secret) });
      }
      // Alsof de aanvaller een nieuw IP-adres neemt: de teller per adres en IP
      // is dan leeg, die per account niet.
      wisMislukkingen(inlogSleutel(mfaLid.email, AANVALLER));

      const antwoord = await inloggen(
        { email: mfaLid.email, password: mfaLid.password, mfaCode: await verseTotpCode(secret) },
        '192.0.2.99',
      );
      expect(antwoord.status).toBe(429);
    });

    it('begint na een geslaagde tweede stap weer bij nul', async () => {
      for (let i = 0; i < VRIJE_POGINGEN - 1; i++) {
        await inloggen({ email: mfaLid.email, password: mfaLid.password, mfaCode: verkeerdeCode(secret) });
      }
      const goed = await inloggen({
        email: mfaLid.email,
        password: mfaLid.password,
        mfaCode: await verseTotpCode(secret),
      });
      expect(goed.status).toBe(200);

      const daarna = await inloggen({ email: mfaLid.email, password: mfaLid.password, mfaCode: verkeerdeCode(secret) });
      expect(daarna.status).toBe(401);
    });
  });

  describe('bestaat het adres?', () => {
    it('geeft een onbekend en een bekend adres hetzelfde antwoord, ook na herhaald mislukken', async () => {
      const antwoorden = async (email: string) => {
        const uitkomst: Array<{ status: number; body: unknown }> = [];
        for (let i = 0; i < VRIJE_POGINGEN + 2; i++) {
          const antwoord = await inloggen({ email, password: 'verkeerd-wachtwoord' });
          uitkomst.push({ status: antwoord.status, body: antwoord.body });
        }
        return uitkomst;
      };

      const bekend = await antwoorden(lid.email);
      const onbekend = await antwoorden('bestaat-niet@example.com');

      expect(onbekend).toEqual(bekend);
      expect(bekend.map((a) => a.status)).toContain(429);
    });

    it('vergelijkt ook bij een onbekend adres een wachtwoordhash, zodat de looptijd niets verraadt', async () => {
      const vergelijk = vi.spyOn(bcrypt, 'compareSync');

      await inloggen({ email: 'bestaat-niet@example.com', password: 'verkeerd-wachtwoord' });

      expect(vergelijk).toHaveBeenCalledTimes(1);
    });
  });

  describe('een derde die raadt', () => {
    it('houdt de echte gebruiker op een ander IP-adres niet buiten', async () => {
      for (let i = 0; i < VRIJE_POGINGEN + 3; i++) {
        await inloggen({ email: lid.email, password: 'verkeerd-wachtwoord' }, AANVALLER);
      }
      expect((await inloggen({ email: lid.email, password: lid.password }, AANVALLER)).status).toBe(429);

      const echt = await inloggen({ email: lid.email, password: lid.password }, ECHTE_GEBRUIKER);
      expect(echt.status).toBe(200);
      expect(echt.body).toHaveProperty('token');
    });

    it('laat de gebruiker op hetzelfde IP-adres weer binnen als de derde stopt, zonder beheerder', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      let nu = Date.now();
      const verder = (ms: number) => {
        nu += ms;
        vi.setSystemTime(nu);
      };

      for (let i = 0; i < VRIJE_POGINGEN; i++) {
        await inloggen({ email: lid.email, password: 'verkeerd-wachtwoord' });
      }
      // De derde houdt vol: telkens zodra het oude slot (15 minuten, daarna
      // steeds het dubbele) voorbij zou zijn, probeert hij het opnieuw. Zo
      // liep dat slot op tot uren, en de echte gebruiker bleef buiten staan.
      for (let stap = 0; stap < 6; stap++) {
        verder(15 * 60 * 1000 * 2 ** stap + 1000);
        await inloggen({ email: lid.email, password: 'verkeerd-wachtwoord' });
      }

      // De derde stopt. Na de langste wachttijd komt de gebruiker weer binnen.
      verder(MAX_WACHTTIJD_MS + 1000);
      const antwoord = await inloggen({ email: lid.email, password: lid.password });
      expect(antwoord.status).toBe(200);
    });
  });
});
