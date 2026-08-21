/**
 * Inloggen via Google of Facebook.
 *
 * 427 regels zonder test. Belangrijk om te weten voordat je deze tests leest:
 * deze route logt niemand in bij een vereniging. Hij kijkt niet in de
 * users-tabel, maakt geen account aan en koppelt niets. Het enige wat hij
 * teruggeeft is een `guest_checkout`-token van dertig minuten, bedoeld om een
 * kaartje af te rekenen zonder eerst een account te maken. Het koppelen van
 * een extern account aan een echt lid gebeurt in microsoft-auth.ts.
 *
 * Dat maakt de vraag "wat gebeurt er bij een onbekend account, of bij een
 * gebruiker die uit dienst is?" hier anders dan bij een gewone login: er
 * bestaat geen verschil tussen die gevallen, want er wordt niets opgezocht.
 * Wat dan wél moet kloppen, en wat deze tests vastleggen:
 *
 * 1. Het gastafrekentoken is geen sessietoken. Het is met hetzelfde
 *    JWT-geheim ondertekend, dus als de authenticatie er niet op let, geeft
 *    een Google-login zonder meer toegang tot de applicatie. Zie 'geeft geen
 *    toegang tot de applicatie'.
 * 2. De state doet zijn werk: eenmalig, per aanbieder, en verlopen is
 *    verlopen. Zonder die drie kan een aanvaller een callback van iemand
 *    anders overnemen.
 * 3. Er gaan geen geheimen terug over de lijn: niet de client secret, en niet
 *    het access token dat we van Google krijgen.
 *
 * De aanroepen naar Google zijn gemockt; een test hoort het netwerk niet op.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import '../setup';
import db from '../../database/connection';
import { errorHandler } from '../../middleware/errorHandler';
import { authenticateToken, AuthRequest } from '../../middleware/auth';
import { createTestEnvironment, TestUser } from '../testUtils';

// De route leest deze waarden één keer bij het inladen van de module, dus ze
// moeten vóór de imports gezet zijn. vi.hoisted draait daar nog voor.
// Facebook laten we bewust ongeconfigureerd: zo zijn in hetzelfde
// testbestand zowel de ingestelde als de niet-ingestelde kant te zien.
const GOOGLE = vi.hoisted(() => {
  process.env.GOOGLE_CLIENT_ID = 'test-google-client-id';
  process.env.GOOGLE_CLIENT_SECRET = 'test-google-client-secret';
  process.env.SOCIAL_AUTH_CALLBACK_URL = 'https://tutti.test';
  process.env.FACEBOOK_APP_ID = '';
  process.env.FACEBOOK_APP_SECRET = '';
  return { clientId: 'test-google-client-id', clientSecret: 'test-google-client-secret' };
});

import socialAuthRoutes, { verifyGuestCheckoutToken } from '../../routes/social-auth';

const app = express();
app.use(express.json());
app.use('/api/auth/social', socialAuthRoutes);
app.use(errorHandler);

// Een minimale beveiligde route, om te kunnen zien wat de authenticatie van
// een gastafrekentoken vindt.
const beveiligdeApp = express();
beveiligdeApp.get('/api/beveiligd', authenticateToken, (req: AuthRequest, res) => {
  res.json({ id: req.user?.id ?? null, associationId: req.user?.associationId ?? null });
});
beveiligdeApp.use(errorHandler);

/** Een antwoord zoals fetch() het teruggeeft. */
function fetchAntwoord(ok: boolean, body: unknown, status = ok ? 200 : 400) {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

const googleProfiel = {
  id: '10987654321',
  email: 'Nieuwe.Bezoeker@Example.com',
  name: 'Nieuwe Bezoeker',
  given_name: 'Nieuwe',
  family_name: 'Bezoeker',
};

describe('inloggen via een externe partij', () => {
  let lid: TestUser;
  let lidToken: string;
  let nepFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    const omgeving = createTestEnvironment();
    lid = omgeving.memberUser;
    lidToken = omgeving.memberToken;

    nepFetch = vi.fn();
    vi.stubGlobal('fetch', nepFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /** Start een Google-login en geef de state terug die de route bedacht. */
  async function haalState(returnUrl?: string): Promise<string> {
    const antwoord = await request(app)
      .get('/api/auth/social/google')
      .query(returnUrl ? { returnUrl } : {});
    expect(antwoord.status).toBe(200);
    return new URL(antwoord.body.authUrl).searchParams.get('state') as string;
  }

  /** Zet de twee aanroepen klaar die de callback bij Google doet. */
  function googleAntwoordtMet(profiel: Record<string, unknown> = googleProfiel) {
    nepFetch
      .mockResolvedValueOnce(fetchAntwoord(true, { access_token: 'google-access-token', id_token: 'google-id-token' }))
      .mockResolvedValueOnce(fetchAntwoord(true, profiel));
  }

  const callback = (state: string, code = 'de-code') =>
    request(app).get('/api/auth/social/google/callback').query({ code, state });

  describe('GET /providers', () => {
    it('meldt per aanbieder of hij aanstaat', async () => {
      const antwoord = await request(app).get('/api/auth/social/providers');

      expect(antwoord.status).toBe(200);
      expect(antwoord.body.providers.google.enabled).toBe(true);
      expect(antwoord.body.providers.facebook.enabled).toBe(false);
    });

    it('geeft geen client id of client secret terug', async () => {
      // Een pagina die vraagt of Google aanstaat hoeft niet te weten waarmee
      // wij ons bij Google melden.
      const antwoord = await request(app).get('/api/auth/social/providers');

      const alsTekst = JSON.stringify(antwoord.body);
      expect(alsTekst).not.toContain(GOOGLE.clientSecret);
      expect(alsTekst).not.toContain(GOOGLE.clientId);
    });

    it('is bereikbaar zonder in te loggen', async () => {
      const antwoord = await request(app).get('/api/auth/social/providers');
      expect(antwoord.status).toBe(200);
    });
  });

  describe('GET /google/enabled en /facebook/enabled', () => {
    it('meldt Google aan', async () => {
      const antwoord = await request(app).get('/api/auth/social/google/enabled');
      expect(antwoord.body).toEqual({ enabled: true });
    });

    it('meldt Facebook af zolang er niets is ingesteld', async () => {
      const antwoord = await request(app).get('/api/auth/social/facebook/enabled');
      expect(antwoord.body).toEqual({ enabled: false });
    });
  });

  describe('GET /google', () => {
    it('stuurt door naar Google met de juiste parameters', async () => {
      const antwoord = await request(app).get('/api/auth/social/google');

      expect(antwoord.status).toBe(200);
      const url = new URL(antwoord.body.authUrl);
      expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
      expect(url.searchParams.get('client_id')).toBe(GOOGLE.clientId);
      expect(url.searchParams.get('redirect_uri')).toBe('https://tutti.test/auth/google/callback');
      expect(url.searchParams.get('response_type')).toBe('code');
    });

    it('zet de client secret niet in de url', async () => {
      // De url gaat via de browser van de bezoeker; alles wat erin staat is
      // openbaar.
      const antwoord = await request(app).get('/api/auth/social/google');
      expect(antwoord.body.authUrl).not.toContain(GOOGLE.clientSecret);
    });

    it('geeft elke aanvraag een eigen onvoorspelbare state', async () => {
      const eerste = await haalState();
      const tweede = await haalState();

      expect(eerste).not.toBe(tweede);
      expect(eerste).toMatch(/^[0-9a-f]{64}$/);
    });

    it('gaat niet het netwerk op', async () => {
      await request(app).get('/api/auth/social/google');
      expect(nepFetch).not.toHaveBeenCalled();
    });
  });

  describe('GET /facebook (niet ingesteld)', () => {
    it('weigert netjes in plaats van met een halve url te komen', async () => {
      const antwoord = await request(app).get('/api/auth/social/facebook');

      expect(antwoord.status).toBe(400);
      expect(antwoord.body.error).toMatch(/niet geconfigureerd/i);
    });

    it('weigert ook de callback', async () => {
      const antwoord = await request(app)
        .get('/api/auth/social/facebook/callback')
        .query({ code: 'de-code', state: 'onbekende-state' });

      expect(antwoord.status).toBe(400);
      expect(nepFetch).not.toHaveBeenCalled();
    });
  });

  describe('GET /google/callback: de state', () => {
    it('weigert een callback zonder code', async () => {
      const state = await haalState();

      const antwoord = await request(app).get('/api/auth/social/google/callback').query({ state });

      expect(antwoord.status).toBe(400);
      expect(nepFetch).not.toHaveBeenCalled();
    });

    it('weigert een callback zonder state', async () => {
      const antwoord = await request(app).get('/api/auth/social/google/callback').query({ code: 'de-code' });

      expect(antwoord.status).toBe(400);
      expect(nepFetch).not.toHaveBeenCalled();
    });

    it('weigert een state die wij nooit hebben uitgegeven', async () => {
      const antwoord = await callback('a'.repeat(64));

      expect(antwoord.status).toBe(400);
      expect(antwoord.body.error).toMatch(/state/i);
      expect(nepFetch).not.toHaveBeenCalled();
    });

    it('weigert een state van Google bij de callback van Facebook', async () => {
      // De state is per aanbieder. Zonder die controle kon een code van de
      // ene aanbieder bij de andere worden ingeleverd.
      const state = await haalState();

      const antwoord = await request(app).get('/api/auth/social/facebook/callback').query({ code: 'de-code', state });

      expect(antwoord.status).toBe(400);
      expect(nepFetch).not.toHaveBeenCalled();
    });

    it('laat dezelfde state geen tweede keer gebruiken', async () => {
      // Een callback-url belandt in de browsergeschiedenis en in logs. Wie
      // hem daarna nog eens afspeelt hoort niets meer te krijgen.
      const state = await haalState();
      googleAntwoordtMet();
      const eerste = await callback(state);
      expect(eerste.status).toBe(200);

      const tweede = await callback(state);

      expect(tweede.status).toBe(400);
      expect(tweede.body.token).toBeUndefined();
    });

    it('weigert een state die ouder is dan tien minuten', async () => {
      const state = await haalState();
      googleAntwoordtMet();
      const elfMinutenLater = Date.now() + 11 * 60 * 1000;
      vi.spyOn(Date, 'now').mockReturnValue(elfMinutenLater);

      const antwoord = await callback(state);

      expect(antwoord.status).toBe(400);
      expect(antwoord.body.token).toBeUndefined();
    });

    it('weigert een afgebroken login van de aanbieder', async () => {
      const state = await haalState();

      const antwoord = await request(app)
        .get('/api/auth/social/google/callback')
        .query({ state, error: 'access_denied' });

      expect(antwoord.status).toBe(400);
      expect(nepFetch).not.toHaveBeenCalled();
    });
  });

  describe('GET /google/callback: het gesprek met Google', () => {
    it('wisselt de code in bij Google en haalt daarna het profiel op', async () => {
      const state = await haalState();
      googleAntwoordtMet();

      await callback(state, 'de-echte-code');

      expect(nepFetch).toHaveBeenCalledTimes(2);
      expect(nepFetch.mock.calls[0][0]).toBe('https://oauth2.googleapis.com/token');
      const body = String(nepFetch.mock.calls[0][1].body);
      expect(body).toContain('code=de-echte-code');
      expect(nepFetch.mock.calls[1][0]).toBe('https://www.googleapis.com/oauth2/v2/userinfo');
      expect(nepFetch.mock.calls[1][1].headers.Authorization).toBe('Bearer google-access-token');
    });

    it('stopt als Google de code niet wil inwisselen', async () => {
      const state = await haalState();
      nepFetch.mockResolvedValueOnce(fetchAntwoord(false, { error: 'invalid_grant' }, 400));

      const antwoord = await callback(state);

      expect(antwoord.status).toBe(400);
      // Het profiel wordt niet meer opgehaald.
      expect(nepFetch).toHaveBeenCalledTimes(1);
    });

    it('stopt als het profiel niet opgehaald kan worden', async () => {
      const state = await haalState();
      nepFetch
        .mockResolvedValueOnce(fetchAntwoord(true, { access_token: 'google-access-token', id_token: 'x' }))
        .mockResolvedValueOnce(fetchAntwoord(false, { error: 'unauthorized' }, 401));

      const antwoord = await callback(state);

      expect(antwoord.status).toBe(400);
      expect(antwoord.body.token).toBeUndefined();
    });

    it('weigert een account zonder e-mailadres', async () => {
      const state = await haalState();
      googleAntwoordtMet({ id: '1', name: 'Zonder Mail' });

      const antwoord = await callback(state);

      expect(antwoord.status).toBe(400);
      expect(antwoord.body.error).toMatch(/e-mailadres/i);
    });

    it('geeft de foutmelding van Google niet door aan de bezoeker', async () => {
      // De ruwe fouttekst van Google kan interne gegevens bevatten; die gaat
      // naar het logboek, niet naar het scherm.
      const state = await haalState();
      nepFetch.mockResolvedValueOnce(fetchAntwoord(false, { error_description: 'client_secret is onjuist' }, 401));

      const antwoord = await callback(state);

      expect(JSON.stringify(antwoord.body)).not.toContain('client_secret is onjuist');
    });
  });

  describe('GET /google/callback: wat de bezoeker terugkrijgt', () => {
    it('geeft een gastafrekentoken met de gegevens van het profiel', async () => {
      const state = await haalState();
      googleAntwoordtMet();

      const antwoord = await callback(state);

      expect(antwoord.status).toBe(200);
      expect(antwoord.body.user).toEqual({
        email: 'nieuwe.bezoeker@example.com',
        name: 'Nieuwe Bezoeker',
        firstName: 'Nieuwe',
        lastName: 'Bezoeker',
        authProvider: 'google',
      });
      expect(typeof antwoord.body.token).toBe('string');
    });

    it('maakt het e-mailadres kleingeschreven', async () => {
      // Elders in de applicatie wordt op kleingeschreven e-mail vergeleken;
      // 'Nieuwe.Bezoeker@Example.com' en 'nieuwe.bezoeker@example.com' horen
      // hetzelfde te zijn.
      const state = await haalState();
      googleAntwoordtMet();

      const antwoord = await callback(state);

      expect(antwoord.body.user.email).toBe('nieuwe.bezoeker@example.com');
    });

    it('valt terug op voor- en achternaam als Google geen naam meestuurt', async () => {
      const state = await haalState();
      googleAntwoordtMet({ id: '1', email: 'a@b.nl', given_name: 'Voor', family_name: 'Achter' });

      const antwoord = await callback(state);

      expect(antwoord.body.user.name).toBe('Voor Achter');
    });

    it('geeft de returnUrl terug die bij het begin van de login is meegegeven', async () => {
      const state = await haalState('/kaartverkoop/concert-123');
      googleAntwoordtMet();

      const antwoord = await callback(state);

      expect(antwoord.body.returnUrl).toBe('/kaartverkoop/concert-123');
    });

    it('geeft het access token van Google niet terug', async () => {
      // Met dat token kan iedereen bij het Google-profiel van de bezoeker.
      const state = await haalState();
      googleAntwoordtMet();

      const antwoord = await callback(state);

      const alsTekst = JSON.stringify(antwoord.body);
      expect(alsTekst).not.toContain('google-access-token');
      expect(alsTekst).not.toContain('google-id-token');
      expect(alsTekst).not.toContain(GOOGLE.clientSecret);
    });
  });

  describe('het gastafrekentoken', () => {
    async function haalGastToken(profiel: Record<string, unknown> = googleProfiel): Promise<string> {
      const state = await haalState();
      googleAntwoordtMet(profiel);
      const antwoord = await callback(state);
      expect(antwoord.status).toBe(200);
      return antwoord.body.token;
    }

    it('draagt geen gebruiker, rol of vereniging met zich mee', async () => {
      const token = await haalGastToken();

      const inhoud = jwt.decode(token) as Record<string, unknown>;
      expect(inhoud.type).toBe('guest_checkout');
      expect(inhoud.id).toBeUndefined();
      expect(inhoud.role).toBeUndefined();
      expect(inhoud.associationId).toBeUndefined();
    });

    it('vervalt binnen een half uur', async () => {
      const token = await haalGastToken();

      const inhoud = jwt.decode(token) as { exp: number };
      const minuten = (inhoud.exp * 1000 - Date.now()) / 60000;
      expect(minuten).toBeGreaterThan(0);
      expect(minuten).toBeLessThanOrEqual(30);
    });

    it('geeft geen toegang tot de applicatie', async () => {
      // Het token is met hetzelfde JWT-geheim ondertekend als een gewoon
      // sessietoken. Als de authenticatie alleen de handtekening zou
      // controleren, was inloggen via Google genoeg om overal binnen te
      // komen - zonder lid te zijn van welke vereniging dan ook.
      const token = await haalGastToken();

      const antwoord = await request(beveiligdeApp).get('/api/beveiligd').set('Authorization', `Bearer ${token}`);

      expect(antwoord.status).toBe(401);
    });

    it('is niet als downloadtoken bruikbaar', async () => {
      const token = await haalGastToken();

      const antwoord = await request(beveiligdeApp).get(`/api/beveiligd?token=${token}`);

      expect(antwoord.status).toBe(401);
    });

    it('laat een echt sessietoken wel door (tegenproef)', async () => {
      const antwoord = await request(beveiligdeApp).get('/api/beveiligd').set('Authorization', `Bearer ${lidToken}`);

      expect(antwoord.status).toBe(200);
      expect(antwoord.body.id).toBe(lid.id);
    });

    it('wordt door verifyGuestCheckoutToken herkend', async () => {
      const token = await haalGastToken();

      const inhoud = verifyGuestCheckoutToken(token);

      expect(inhoud?.email).toBe('nieuwe.bezoeker@example.com');
      expect(inhoud?.authProvider).toBe('google');
    });

    it('verifyGuestCheckoutToken accepteert geen gewoon sessietoken', async () => {
      // Andersom moet het ook niet kunnen: een ingelogd lid mag zijn eigen
      // token niet als gastafrekentoken laten gelden.
      expect(verifyGuestCheckoutToken(lidToken)).toBeNull();
    });

    it('verifyGuestCheckoutToken weigert onzin en geknoei', async () => {
      const token = await haalGastToken();

      expect(verifyGuestCheckoutToken('geen.echt.token')).toBeNull();
      expect(verifyGuestCheckoutToken(token.slice(0, -3) + 'aaa')).toBeNull();
    });
  });

  describe('een oud-lid dat via Google inlogt', () => {
    it('krijgt alleen een gastafrekentoken, geen toegang tot de vereniging', async () => {
      // Deze route zoekt niets op in de users-tabel, dus een uitgeschreven
      // lid krijgt hetzelfde antwoord als een willekeurige bezoeker: een
      // token om een kaartje mee af te rekenen. Dat is wat anders dan
      // inloggen - het token geeft geen toegang, en dat is precies wat deze
      // test bewaakt. Zou de route ooit accounts gaan koppelen, dan moet
      // `status = 'inactive'` hier alsnog geweigerd worden.
      db.prepare("UPDATE users SET status = 'inactive' WHERE id = ?").run(lid.id);
      const state = await haalState();
      googleAntwoordtMet({ id: '5', email: lid.email, name: 'Oud Lid' });

      const antwoord = await callback(state);

      expect(antwoord.status).toBe(200);
      const inhoud = jwt.decode(antwoord.body.token) as Record<string, unknown>;
      expect(inhoud.type).toBe('guest_checkout');
      expect(inhoud.id).toBeUndefined();
      expect(inhoud.associationId).toBeUndefined();

      const toegang = await request(beveiligdeApp)
        .get('/api/beveiligd')
        .set('Authorization', `Bearer ${antwoord.body.token}`);
      expect(toegang.status).toBe(401);
    });

    it('kan er geen sessie mee openen op naam van het bestaande account', async () => {
      // Het e-mailadres van een bestaand lid meesturen levert geen token op
      // dat naar dat lid verwijst.
      const state = await haalState();
      googleAntwoordtMet({ id: '6', email: lid.email, name: 'Naamgenoot' });

      const antwoord = await callback(state);

      expect(JSON.stringify(antwoord.body)).not.toContain(lid.id);
    });
  });
});
